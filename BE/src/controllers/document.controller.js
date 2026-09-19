const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const aiService = require('../services/ai.service');
const { isValidUUID } = require('../utils/validate');
const { normalizeTitle } = require('../utils/title');
const { getPlan } = require('../config/plans');
const { fetchPdfToDisk, UrlFetchError } = require('../services/urlFetch');

function isPdf(filePath) {
  try {
    const buf = Buffer.alloc(5);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 5, 0);
    fs.closeSync(fd);
    return buf.toString('ascii') === '%PDF-';
  } catch {
    return false;
  }
}

/**
 * Whether `userId` may delete/rename the given document row.
 * - Personal doc (no workspace): only its owner.
 * - Workspace doc: the original uploader, or a workspace owner/editor. Viewers
 *   (and non-members) may not mutate.
 * Returns `{ ok: true }` or `{ ok: false, status, message }`. Non-members get a
 * 404 (don't leak existence); a member who lacks the role gets a 403.
 */
async function authorizeDocMutation(doc, userId) {
  if (!doc.workspace_id) {
    return doc.user_id === userId
      ? { ok: true }
      : { ok: false, status: 404, message: 'Document not found' };
  }
  if (doc.user_id === userId) return { ok: true };
  const r = await db.query(
    'SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
    [doc.workspace_id, userId]
  );
  if (r.rows.length === 0) return { ok: false, status: 404, message: 'Document not found' };
  if (['owner', 'editor'].includes(r.rows[0].role)) return { ok: true };
  return { ok: false, status: 403, message: 'You do not have permission to modify this document' };
}

/**
 * Find a metadata-only Zotero stub that this upload is the missing PDF for.
 *
 * The Zotero importer already matches in the other direction (bib entry ->
 * existing document, see AI/app/routers/zotero.py), so importing AFTER
 * uploading links correctly. Without this lookup the reverse order — import the
 * .bib first, upload the PDF later — produced two rows: a `pending_pdf` stub
 * holding the citation with no text, and a `ready` document with chunks but no
 * citation. Both directions now use the same normalized-title comparison.
 *
 * Scope is deliberately narrow: personal uploads only. Zotero stubs are always
 * created with `workspace_id = NULL`, so adopting one for a workspace upload
 * would silently move a user's personal document into a shared workspace.
 *
 * Returns the stub's id, or null.
 */
async function findPendingStub(userId, originalName) {
  const key = normalizeTitle(originalName);
  if (!key) return null;

  const stubs = await db.query(
    `SELECT id, original_name FROM documents
     WHERE user_id = $1 AND workspace_id IS NULL AND status = 'pending_pdf'`,
    [userId]
  );

  const match = stubs.rows.find((row) => normalizeTitle(row.original_name) === key);
  return match ? match.id : null;
}

/**
 * Shared tail for BOTH ingestion paths — multipart file upload and URL fetch.
 *
 * Owns membership checks, the Free-tier lifetime upload cap, storage quotas,
 * the `documents` row and kicking off ingestion. Every new way of getting a PDF
 * into the system MUST route through here: the plan gate lives in this function,
 * so a second path that inlined its own INSERT would silently bypass billing.
 *
 * Returns `{ ok: true, doc }`, or `{ ok: false, status, body }` — the caller is
 * responsible for unlinking the file when `ok` is false.
 */
async function persistUpload(req, { filePath, originalName, size, workspaceId, sourceUrl = null }) {
  const storedName = path.basename(filePath);

  if (workspaceId) {
    // Workspace upload: membership + editor role + the workspace's own quota
    const memberCheck = await db.query(
      'SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
      [workspaceId, req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return { ok: false, status: 403, body: { error: true, message: 'Not a member of this workspace' } };
    }
    if (memberCheck.rows[0].role === 'viewer') {
      return { ok: false, status: 403, body: { error: true, message: 'Viewers cannot upload documents' } };
    }

    const wsResult = await db.query(
      'SELECT storage_used_bytes, storage_limit_bytes FROM workspaces WHERE id=$1',
      [workspaceId]
    );
    const ws = wsResult.rows[0];
    if (!ws) {
      return { ok: false, status: 404, body: { error: true, message: 'Workspace not found' } };
    }
    if (parseInt(ws.storage_used_bytes) + size > parseInt(ws.storage_limit_bytes)) {
      return { ok: false, status: 413, body: { error: true, message: 'Workspace storage quota exceeded' } };
    }

    const docResult = await db.query(
      `INSERT INTO documents (user_id, workspace_id, filename, original_name, file_size_bytes, file_path, status, source_url)
       VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7)
       RETURNING id, original_name, filename, file_size_bytes, status, created_at, workspace_id, source_url`,
      [req.user.id, workspaceId, storedName, originalName, size, filePath, sourceUrl]
    );
    const doc = docResult.rows[0];

    await db.query(
      'UPDATE workspaces SET storage_used_bytes = storage_used_bytes + $1 WHERE id = $2',
      [size, workspaceId]
    );

    aiService.triggerIngest(doc.id, filePath, req.user.id, workspaceId, {
      filename: storedName,
      originalName,
      fileSizeBytes: size,
    });
    return { ok: true, doc };
  }

  // Personal upload
  const userResult = await db.query(
    'SELECT role, plan, lifetime_uploads, storage_used_bytes, storage_limit_bytes FROM users WHERE id = $1',
    [req.user.id]
  );
  const user = userResult.rows[0];

  // Free-tier PDF cap: a hard lifetime limit — deleting a document does NOT
  // refund it (lifetime_uploads is monotonic). Super admins bypass.
  const uploadLimit = getPlan(user.plan).maxLifetimeUploads;
  if (user.role !== 'super_admin' && user.lifetime_uploads >= uploadLimit) {
    return {
      ok: false,
      status: 403,
      body: {
        error: true,
        code: 'UPGRADE_REQUIRED',
        message: `Your ${getPlan(user.plan).name} plan is limited to ${uploadLimit} PDF uploads. Upgrade for more.`,
      },
    };
  }

  if (parseInt(user.storage_used_bytes) + size > parseInt(user.storage_limit_bytes)) {
    return { ok: false, status: 413, body: { error: true, message: 'Storage quota exceeded' } };
  }

  // Reuse a Zotero stub for this same paper if one is waiting, instead of
  // creating a second row. The stub's citation row is left untouched — it came
  // from the user's reference manager and outranks anything we'd derive from
  // the PDF. `AND status = 'pending_pdf'` in the UPDATE makes the adoption
  // atomic: if two uploads race for the same stub, the loser gets rowCount 0
  // and falls through to a normal INSERT.
  const stubId = await findPendingStub(req.user.id, originalName);
  let doc = null;

  if (stubId) {
    const adopted = await db.query(
      `UPDATE documents
       SET filename = $1, original_name = $2, file_size_bytes = $3, file_path = $4,
           status = 'processing', source_url = $5
       WHERE id = $6 AND status = 'pending_pdf'
       RETURNING id, original_name, filename, file_size_bytes, status, created_at, source_url`,
      [storedName, originalName, size, filePath, sourceUrl, stubId]
    );
    if (adopted.rows.length > 0) {
      doc = adopted.rows[0];
    }
  }

  if (!doc) {
    const docResult = await db.query(
      `INSERT INTO documents (user_id, workspace_id, filename, original_name, file_size_bytes, file_path, status, source_url)
       VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7)
       RETURNING id, original_name, filename, file_size_bytes, status, created_at, source_url`,
      [req.user.id, null, storedName, originalName, size, filePath, sourceUrl]
    );
    doc = docResult.rows[0];
  }

  await db.query(
    'UPDATE users SET storage_used_bytes = storage_used_bytes + $1, lifetime_uploads = lifetime_uploads + 1 WHERE id = $2',
    [size, req.user.id]
  );

  aiService.triggerIngest(doc.id, filePath, req.user.id, null, {
    filename: storedName,
    originalName,
    fileSizeBytes: size,
  });
  return { ok: true, doc };
}

exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: true, message: 'No file uploaded' });
    }

    if (!isPdf(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: true, message: 'Uploaded file is not a valid PDF', code: 'INVALID_PDF' });
    }

    const result = await persistUpload(req, {
      filePath: req.file.path,
      originalName: req.file.originalname,
      size: req.file.size,
      workspaceId: req.body.workspace_id || null,
    });

    if (!result.ok) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(result.status).json(result.body);
    }
    return res.status(201).json(result.doc);
  } catch (err) {
    console.error('uploadDocument error:', err);
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

/**
 * POST /api/documents/upload-url  { url, workspace_id? }
 *
 * Downloads a PDF from a link instead of a local file. The SSRF hardening and
 * streaming size/magic-byte checks live in services/urlFetch.js; once the file
 * is on disk it goes through the exact same persistUpload path as a manual
 * upload, so quotas and billing behave identically.
 */
exports.uploadFromUrl = async (req, res) => {
  let downloaded = null;
  try {
    const { url, workspace_id: workspaceId } = req.body;
    if (!url || !String(url).trim()) {
      return res.status(400).json({ error: true, message: 'A link is required.' });
    }
    if (String(url).length > 2000) {
      return res.status(400).json({ error: true, message: 'That link is too long.' });
    }

    const maxBytes = (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 20) * 1024 * 1024;
    downloaded = await fetchPdfToDisk(String(url).trim(), req.user.id, maxBytes);

    // Belt and braces: fetchPdfToDisk checks the magic bytes mid-stream, this
    // re-checks what actually landed on disk.
    if (!isPdf(downloaded.filePath)) {
      try { fs.unlinkSync(downloaded.filePath); } catch {}
      return res.status(400).json({ error: true, message: 'That link did not return a valid PDF.', code: 'INVALID_PDF' });
    }

    const result = await persistUpload(req, {
      filePath: downloaded.filePath,
      originalName: downloaded.originalName,
      size: downloaded.size,
      workspaceId: workspaceId || null,
      sourceUrl: downloaded.sourceUrl,
    });

    if (!result.ok) {
      try { fs.unlinkSync(downloaded.filePath); } catch {}
      return res.status(result.status).json(result.body);
    }
    return res.status(201).json(result.doc);
  } catch (err) {
    if (downloaded?.filePath) {
      try { fs.unlinkSync(downloaded.filePath); } catch {}
    }
    if (err instanceof UrlFetchError) {
      return res.status(err.status).json({ error: true, message: err.message, code: 'URL_FETCH_FAILED' });
    }
    console.error('uploadFromUrl error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.listDocuments = async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || null;

    let result;
    if (workspaceId) {
      // Workspace doc listing: verify membership first
      const memberCheck = await db.query(
        'SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
        [workspaceId, req.user.id]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: true, message: 'Not a member of this workspace' });
      }
      result = await db.query(
        `SELECT id, original_name, filename, file_size_bytes, status, page_count, created_at, workspace_id, source_url
         FROM documents WHERE workspace_id = $1 AND status <> 'failed'
         ORDER BY created_at DESC`,
        [workspaceId]
      );
    } else {
      // Personal docs only — workspace_id MUST be null (strict isolation)
      result = await db.query(
        `SELECT id, original_name, filename, file_size_bytes, status, page_count, created_at, source_url
         FROM documents WHERE user_id = $1 AND workspace_id IS NULL AND status <> 'failed'
         ORDER BY created_at DESC`,
        [req.user.id]
      );
    }
    return res.json(result.rows);
  } catch (err) {
    console.error('listDocuments error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.getDocument = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ error: true, message: 'Invalid document ID', code: 'INVALID_UUID' });
    }
    const result = await db.query(
      'SELECT id, original_name, filename, file_size_bytes, status, page_count, created_at, user_id, workspace_id, source_url FROM documents WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Document not found' });
    }
    const doc = result.rows[0];
    // Readable by the personal owner, or by ANY member of the doc's workspace.
    if (doc.workspace_id) {
      const member = await db.query(
        'SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
        [doc.workspace_id, req.user.id]
      );
      if (member.rows.length === 0) {
        return res.status(404).json({ error: true, message: 'Document not found' });
      }
    } else if (doc.user_id !== req.user.id) {
      return res.status(404).json({ error: true, message: 'Document not found' });
    }
    const { user_id, ...pub } = doc; // don't expose the uploader's raw id
    return res.json(pub);
  } catch (err) {
    console.error('getDocument error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

/**
 * GET /api/documents/:id/file — stream the original PDF bytes.
 *
 * Powers the in-app PDF viewer (evidence highlighting on review screenings and
 * extraction cells). Notes on the three non-obvious requirements:
 *
 *  - Range requests: pdf.js fetches byte ranges rather than the whole file, so
 *    206 support is required, not a nicety.
 *  - CORP: helmet() defaults to `Cross-Origin-Resource-Policy: same-origin`,
 *    and the frontend (:3010) is a different origin from this API (:5010), so
 *    the header is relaxed for this route only.
 *  - Read access mirrors getDocument exactly: personal owner, or any member of
 *    the document's workspace. Non-members get 404, never 403, so the endpoint
 *    can't be used to probe which document ids exist.
 */
exports.getDocumentFile = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ error: true, message: 'Invalid document ID', code: 'INVALID_UUID' });
    }

    const result = await db.query(
      'SELECT id, original_name, file_path, user_id, workspace_id FROM documents WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Document not found' });
    }
    const doc = result.rows[0];

    if (doc.workspace_id) {
      const member = await db.query(
        'SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
        [doc.workspace_id, req.user.id]
      );
      if (member.rows.length === 0) {
        return res.status(404).json({ error: true, message: 'Document not found' });
      }
    } else if (doc.user_id !== req.user.id) {
      return res.status(404).json({ error: true, message: 'Document not found' });
    }

    // The row can outlive the file — e.g. the uploads volume was reset while the
    // database persisted. Report it clearly so the viewer can fall back.
    let stat;
    try {
      stat = fs.statSync(doc.file_path);
    } catch {
      return res.status(404).json({
        error: true,
        code: 'FILE_MISSING',
        message: 'The original file is no longer available on the server.',
      });
    }

    const filename = (doc.original_name || 'document.pdf').replace(/"/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.setHeader('Content-Range', `bytes */${stat.size}`);
        return res.status(416).end();
      }
      // Either bound may be omitted: "bytes=500-" (open end) or "bytes=-500"
      // (final 500 bytes). pdf.js uses the first form.
      const hasStart = match[1] !== '';
      const start = hasStart ? parseInt(match[1], 10) : stat.size - parseInt(match[2], 10);
      const end = hasStart && match[2] !== '' ? parseInt(match[2], 10) : stat.size - 1;

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= stat.size) {
        res.setHeader('Content-Range', `bytes */${stat.size}`);
        return res.status(416).end();
      }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      return fs.createReadStream(doc.file_path, { start, end }).pipe(res);
    }

    res.setHeader('Content-Length', stat.size);
    return fs.createReadStream(doc.file_path).pipe(res);
  } catch (err) {
    console.error('getDocumentFile error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ error: true, message: 'Invalid document ID', code: 'INVALID_UUID' });
    }
    const result = await db.query(
      'SELECT id, file_path, file_size_bytes, user_id, workspace_id FROM documents WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Document not found' });
    }
    const doc = result.rows[0];

    const authz = await authorizeDocMutation(doc, req.user.id);
    if (!authz.ok) {
      return res.status(authz.status).json({ error: true, message: authz.message });
    }

    try { fs.unlinkSync(doc.file_path); } catch {}

    await db.query('DELETE FROM documents WHERE id = $1', [doc.id]);

    // Refund storage to whichever account was charged on upload: the workspace
    // for workspace docs, otherwise the personal owner.
    if (doc.workspace_id) {
      await db.query(
        'UPDATE workspaces SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1) WHERE id = $2',
        [doc.file_size_bytes, doc.workspace_id]
      );
    } else {
      await db.query(
        'UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1) WHERE id = $2',
        [doc.file_size_bytes, doc.user_id]
      );
    }

    return res.json({ message: 'Document deleted' });
  } catch (err) {
    console.error('deleteDocument error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.renameDocument = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ error: true, message: 'Invalid document ID', code: 'INVALID_UUID' });
    }
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: true, message: 'Name is required' });
    }
    const found = await db.query(
      'SELECT id, user_id, workspace_id FROM documents WHERE id = $1',
      [req.params.id]
    );
    if (found.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Document not found' });
    }
    const authz = await authorizeDocMutation(found.rows[0], req.user.id);
    if (!authz.ok) {
      return res.status(authz.status).json({ error: true, message: authz.message });
    }
    const result = await db.query(
      'UPDATE documents SET original_name = $1 WHERE id = $2 RETURNING id, original_name',
      [name.trim(), req.params.id]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('renameDocument error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};
