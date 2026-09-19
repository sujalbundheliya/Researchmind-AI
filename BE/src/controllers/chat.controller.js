const axios = require('axios');
const db = require('../config/db');
const { detectInjection, KIND_REFUSAL } = require('../utils/promptGuard');

exports.createSession = async (req, res) => {
  try {
    const { title, mode, document_ids, workspace_id } = req.body;

    if (workspace_id) {
      const memberCheck = await db.query(
        'SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
        [workspace_id, req.user.id]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: true, message: 'Not a member of this workspace' });
      }
    }

    if (document_ids && document_ids.length > 0) {
      const placeholders = document_ids.map((_, i) => `$${i + 2}`).join(',');
      // A doc is accessible if the requester owns it personally, or is a member
      // of the workspace it belongs to (mirrors getDocument/listDocuments).
      const check = await db.query(
        `SELECT d.id FROM documents d
         WHERE d.id IN (${placeholders})
           AND (
             d.user_id = $1
             OR EXISTS (
               SELECT 1 FROM workspace_members wm
               WHERE wm.workspace_id = d.workspace_id AND wm.user_id = $1
             )
           )`,
        [req.user.id, ...document_ids]
      );
      if (check.rows.length !== document_ids.length) {
        return res.status(403).json({ error: true, message: 'Document access denied' });
      }
    }

    const result = await db.query(
      `INSERT INTO chat_sessions (user_id, workspace_id, title, mode, document_ids, is_private)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING *`,
      [req.user.id, workspace_id || null, title || 'New Chat', mode || 'multi', document_ids || []]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('createSession error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.listSessions = async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || null;
    let result;

    if (workspaceId) {
      // Workspace sessions: visible to all members except others' private sessions
      const memberCheck = await db.query(
        'SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
        [workspaceId, req.user.id]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: true, message: 'Not a member of this workspace' });
      }
      result = await db.query(
        `SELECT cs.id, cs.title, cs.mode, cs.document_ids, cs.workspace_id, cs.is_private, cs.created_at,
                COUNT(m.id)::int AS message_count
         FROM chat_sessions cs
         LEFT JOIN messages m ON m.session_id = cs.id
         WHERE cs.workspace_id = $1
           AND (cs.is_private = false OR cs.user_id = $2)
         GROUP BY cs.id
         ORDER BY cs.created_at DESC`,
        [workspaceId, req.user.id]
      );
    } else {
      result = await db.query(
        `SELECT cs.id, cs.title, cs.mode, cs.document_ids, cs.created_at,
                COUNT(m.id)::int AS message_count
         FROM chat_sessions cs
         LEFT JOIN messages m ON m.session_id = cs.id
         WHERE cs.user_id = $1 AND cs.workspace_id IS NULL
         GROUP BY cs.id
         ORDER BY cs.created_at DESC`,
        [req.user.id]
      );
    }
    return res.json(result.rows);
  } catch (err) {
    console.error('listSessions error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.getSession = async (req, res) => {
  try {
    const sessionResult = await db.query(
      'SELECT * FROM chat_sessions WHERE id = $1',
      [req.params.id]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Session not found' });
    }
    const sess = sessionResult.rows[0];

    // Access check: personal session (user must own it) OR workspace session (user must be member, not private unless owner)
    if (!sess.workspace_id) {
      if (sess.user_id !== req.user.id) {
        return res.status(404).json({ error: true, message: 'Session not found' });
      }
    } else {
      const memberCheck = await db.query(
        'SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
        [sess.workspace_id, req.user.id]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(404).json({ error: true, message: 'Session not found' });
      }
      if (sess.is_private && sess.user_id !== req.user.id) {
        return res.status(404).json({ error: true, message: 'Session not found' });
      }
    }

    const messagesResult = await db.query(
      'SELECT id, session_id, role, content, sources, created_at FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    return res.json({ ...sessionResult.rows[0], messages: messagesResult.rows });
  } catch (err) {
    console.error('getSession error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { question, document_ids } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: true, message: 'Question is required', code: 'VALIDATION_ERROR' });
    }
    if (question.trim().length > 2000) {
      return res.status(400).json({ error: true, message: 'Question must be 2000 characters or fewer', code: 'VALIDATION_ERROR' });
    }

    const sessionResult = await db.query(
      'SELECT * FROM chat_sessions WHERE id = $1',
      [req.params.id]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Session not found' });
    }
    const session = sessionResult.rows[0];

    // Access check for sendMessage
    if (!session.workspace_id) {
      if (session.user_id !== req.user.id) {
        return res.status(404).json({ error: true, message: 'Session not found' });
      }
    } else {
      const memberCheck = await db.query(
        'SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
        [session.workspace_id, req.user.id]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(404).json({ error: true, message: 'Session not found' });
      }
    }

    const historyResult = await db.query(
      'SELECT role, content FROM messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 5',
      [req.params.id]
    );
    const chatHistory = historyResult.rows.reverse();

    const userMsgResult = await db.query(
      'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, 'user', question.trim()]
    );
    const userMessage = userMsgResult.rows[0];

    // Direct jailbreak / prompt-extraction attempt → warm refusal, skip the AI call.
    if (detectInjection(question)) {
      const refusalResult = await db.query(
        'INSERT INTO messages (session_id, role, content, sources) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.params.id, 'assistant', KIND_REFUSAL, JSON.stringify([])]
      );
      return res.json({
        user_message: userMessage,
        assistant_message: refusalResult.rows[0],
      });
    }

    const docIds = (document_ids && document_ids.length > 0)
      ? document_ids
      : (session.document_ids || []);

    const queryResponse = await axios.post(`${process.env.FASTAPI_URL}/query`, {
      question: question.trim(),
      user_id: req.user.id,
      session_id: req.params.id,
      document_ids: docIds.length > 0 ? docIds : null,
      workspace_ids: session.workspace_id ? [session.workspace_id] : null,
      chat_history: chatHistory,
    }, { timeout: 60000 });

    const { answer, sources } = queryResponse.data;

    const assistantMsgResult = await db.query(
      'INSERT INTO messages (session_id, role, content, sources) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.id, 'assistant', answer, JSON.stringify(sources)]
    );

    return res.json({
      user_message: userMessage,
      assistant_message: assistantMsgResult.rows[0],
    });
  } catch (err) {
    console.error('sendMessage error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.deleteSession = async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Session not found' });
    }
    return res.json({ message: 'Session deleted' });
  } catch (err) {
    console.error('deleteSession error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.extractFindings = async (req, res) => {
  try {
    const docResult = await db.query(
      "SELECT id FROM documents WHERE id = $1 AND user_id = $2 AND status = 'ready'",
      [req.params.docId, req.user.id]
    );
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Document not found or not ready' });
    }

    const response = await axios.post(
      `${process.env.FASTAPI_URL}/extract-findings`,
      { document_id: req.params.docId, user_id: req.user.id },
      { timeout: 60000 }
    );

    return res.json(response.data);
  } catch (err) {
    console.error('extractFindings error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.researchGaps = async (req, res) => {
  try {
    const { document_ids } = req.body;

    if (!document_ids || document_ids.length < 2) {
      return res.status(400).json({ error: true, message: 'Minimum 2 documents required to identify research gaps' });
    }

    const uniqueIds = [...new Set(document_ids)];
    const placeholders = uniqueIds.map((_, i) => `$${i + 2}`).join(',');
    const check = await db.query(
      `SELECT id FROM documents WHERE id IN (${placeholders}) AND user_id = $1`,
      [req.user.id, ...uniqueIds]
    );
    if (check.rows.length !== uniqueIds.length) {
      return res.status(403).json({ error: true, message: 'Document access denied' });
    }

    const refresh = req.query.refresh === 'true' || req.body.refresh === true;
    const response = await axios.post(
      `${process.env.FASTAPI_URL}/research-gaps`,
      { user_id: req.user.id, document_ids, refresh },
      { timeout: 90000 }
    );

    return res.json(response.data);
  } catch (err) {
    console.error('researchGaps error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.summarizeDoc = async (req, res) => {
  try {
    const docResult = await db.query(
      "SELECT id, user_id, workspace_id, status FROM documents WHERE id = $1",
      [req.params.docId]
    );
    if (docResult.rows.length === 0 || docResult.rows[0].status !== 'ready') {
      return res.status(404).json({ error: true, message: 'Document not found or not ready' });
    }
    const doc = docResult.rows[0];

    // Access: the personal owner, or any member of the doc's workspace.
    if (doc.workspace_id) {
      const member = await db.query(
        'SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
        [doc.workspace_id, req.user.id]
      );
      if (member.rows.length === 0) {
        return res.status(404).json({ error: true, message: 'Document not found or not ready' });
      }
    } else if (doc.user_id !== req.user.id) {
      return res.status(404).json({ error: true, message: 'Document not found or not ready' });
    }

    // Chunks are keyed by (document_id, uploader user_id). Pass the uploader's
    // id so a workspace member's request still matches the stored chunks.
    const summarizeResponse = await axios.post(
      `${process.env.FASTAPI_URL}/summarize`,
      { document_id: req.params.docId, user_id: doc.user_id },
      { timeout: 60000 }
    );

    return res.json(summarizeResponse.data);
  } catch (err) {
    console.error('summarizeDoc error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};
