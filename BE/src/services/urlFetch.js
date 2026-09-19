/**
 * Fetch a PDF from a user-supplied URL.
 *
 * Fetching an arbitrary URL server-side is an SSRF sink: without checks, a user
 * could point us at internal services or the cloud metadata endpoint and have
 * the backend read them on their behalf. Defences here:
 *
 *   1. http/https only, ports 80/443 only.
 *   2. Every hostname is DNS-resolved and every resulting IP checked against
 *      private/loopback/link-local ranges BEFORE we connect.
 *   3. Redirects are followed manually (max 3) and each hop re-validated — a
 *      public URL 302-ing to 169.254.169.254 is the classic bypass.
 *   4. Size is enforced while streaming, not just from Content-Length (which
 *      can be absent or lie).
 *   5. The body must actually be a PDF (%PDF- magic bytes), regardless of the
 *      Content-Type the server claims.
 */
const dns = require('dns').promises;
const net = require('net');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 30000;

class UrlFetchError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** True for addresses that must never be reachable from a user-supplied URL. */
function isBlockedIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 127) return true;                    // loopback
    if (a === 10) return true;                     // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true;       // private
    if (a === 169 && b === 254) return true;       // link-local + cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true;                      // "this network"
    if (a >= 224) return true;                     // multicast + reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;         // loopback / unspecified
    if (lower.startsWith('fe80')) return true;                  // link-local
    if (/^f[cd]/.test(lower)) return true;                      // unique local
    // IPv4-mapped (::ffff:10.0.0.1) — re-check the embedded v4 address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }
  return true; // unparseable — refuse
}

/**
 * Validate a URL's scheme/port and confirm every IP its host resolves to is
 * publicly routable. Throws UrlFetchError when anything looks unsafe.
 */
async function assertSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UrlFetchError('That does not look like a valid URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new UrlFetchError('Only http and https links are supported.');
  }
  const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
  if (![80, 443].includes(port)) {
    throw new UrlFetchError('Only standard web ports (80 and 443) are supported.');
  }

  // A bare IP in the URL skips DNS but still needs checking.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new UrlFetchError('That address is not reachable.');
    return parsed;
  }

  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new UrlFetchError('Could not resolve that domain. Check the link and try again.');
  }
  if (addresses.length === 0) throw new UrlFetchError('Could not resolve that domain.');
  if (addresses.some((a) => isBlockedIp(a.address))) {
    throw new UrlFetchError('That address is not reachable.');
  }
  return parsed;
}

/**
 * Rewrite common "landing page" URLs to their direct PDF equivalent, so users
 * can paste the link they actually have in front of them.
 */
function normalizeUrl(rawUrl) {
  let url = rawUrl.trim();

  // arXiv abstract page → PDF (the DATA/ corpus is all arXiv, so this is the
  // link people will paste most often).
  const arxiv = url.match(/^https?:\/\/(?:www\.)?arxiv\.org\/abs\/(.+?)\/?$/i);
  if (arxiv) return `https://arxiv.org/pdf/${arxiv[1]}`;

  // bioRxiv / medRxiv content pages expose the PDF at .../full.pdf
  const biorxiv = url.match(/^(https?:\/\/(?:www\.)?(?:bio|med)rxiv\.org\/content\/[^?#]+?)(?:\.full)?\/?$/i);
  if (biorxiv && !/\.pdf$/i.test(url)) return `${biorxiv[1]}.full.pdf`;

  // Google Drive share links → direct download. Handles the "/file/d/<id>/view"
  // link copied from the Drive UI, plus the older "open?id=" / "uc?id=" forms.
  // The pasted link opens an HTML viewer; the download host streams the file
  // itself. Our 20MB cap stays under Drive's large-file virus-scan interstitial,
  // so shared files come back directly as application/octet-stream.
  if (/^https?:\/\/(?:drive|docs)\.google\.com\//i.test(url)) {
    const id = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i)?.[1]
      || url.match(/[?&]id=([a-zA-Z0-9_-]+)/i)?.[1];
    if (id) return `https://drive.usercontent.google.com/download?id=${id}&export=download`;
  }

  return url;
}

/** Derive a safe on-disk basename, mirroring the multer upload path's rules. */
function deriveFilename(parsedUrl, contentDisposition) {
  let name = '';

  if (contentDisposition) {
    const star = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    const plain = contentDisposition.match(/filename="?([^";]+)"?/i);
    if (star) { try { name = decodeURIComponent(star[1]); } catch { /* fall through */ } }
    if (!name && plain) name = plain[1];
  }

  if (!name) {
    const seg = decodeURIComponent(parsedUrl.pathname).split('/').filter(Boolean).pop() || '';
    if (seg && seg !== 'pdf') name = seg;
  }
  if (!name) name = `${parsedUrl.hostname}-${Date.now()}`;

  name = name.replace(/\.pdf$/i, '');
  const safeBase = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'document';
  return { originalName: `${name.slice(0, 120)}.pdf`, storedName: `${uuidv4()}-${safeBase}.pdf` };
}

/**
 * Download a PDF to the user's upload directory.
 * Returns { filePath, originalName, size, sourceUrl }.
 */
async function fetchPdfToDisk(rawUrl, userId, maxBytes) {
  let current = normalizeUrl(rawUrl);
  let response = null;
  let parsed = null;

  // Manual redirect loop — each hop is re-validated before we connect to it.
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    parsed = await assertSafeUrl(current);
    let res;
    try {
      res = await axios.get(current, {
        responseType: 'stream',
        timeout: FETCH_TIMEOUT_MS,
        maxRedirects: 0,
        validateStatus: (s) => (s >= 200 && s < 300) || (s >= 300 && s < 400),
        headers: {
          // Some publishers 403 unknown agents outright.
          'User-Agent': 'Mozilla/5.0 (compatible; ResearchMindAI/1.0; +https://researchmind.ai)',
          Accept: 'application/pdf,*/*',
        },
      });
    } catch (err) {
      if (err.code === 'ECONNABORTED') throw new UrlFetchError('The download timed out. Try a different link.');
      const status = err.response?.status;
      if (status === 403) throw new UrlFetchError('That site refused the download (403). It may require a login.');
      if (status === 404) throw new UrlFetchError('No file found at that link (404).');
      throw new UrlFetchError('Could not download from that link.');
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.location;
      res.data.destroy();
      if (!location) throw new UrlFetchError('That link redirected somewhere invalid.');
      if (hop === MAX_REDIRECTS) throw new UrlFetchError('That link redirected too many times.');
      current = new URL(location, current).toString();
      continue;
    }

    response = res;
    break;
  }

  if (!response) throw new UrlFetchError('Could not download from that link.');

  // Reject oversized downloads before reading a byte, when the server tells us.
  const declared = parseInt(response.headers['content-length'], 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    response.data.destroy();
    throw new UrlFetchError(`That file is ${(declared / 1024 / 1024).toFixed(1)}MB — the limit is ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  }

  const contentType = String(response.headers['content-type'] || '').toLowerCase();
  // A landing page rather than a file — catch it early with a useful message
  // instead of failing the magic-byte check further down.
  if (contentType.includes('text/html')) {
    response.data.destroy();
    // A Drive link that lands on an HTML page is almost always a private file
    // bouncing to a Google sign-in — point the user at the real fix.
    if (/(^|\.)google\.com$/i.test(parsed.hostname)) {
      throw new UrlFetchError('That Google Drive file isn’t public. Set its sharing to “Anyone with the link”, then try again.');
    }
    throw new UrlFetchError('That link points to a web page, not a PDF file. Try the direct PDF link.');
  }

  const dir = path.resolve(process.env.STORAGE_PATH || './uploads', userId);
  fs.mkdirSync(dir, { recursive: true });
  const { originalName, storedName } = deriveFilename(parsed, response.headers['content-disposition']);
  const filePath = path.join(dir, storedName);

  let size = 0;
  let headChecked = false;
  let aborted = null;

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filePath);

    const fail = (err) => {
      aborted = err;
      response.data.destroy();
      out.destroy();
      reject(err);
    };

    response.data.on('data', (chunk) => {
      // Verify the magic bytes on the first chunk so we abandon non-PDFs after
      // a few bytes instead of downloading the whole thing.
      if (!headChecked) {
        headChecked = true;
        if (chunk.length >= 5 && chunk.slice(0, 5).toString('ascii') !== '%PDF-') {
          return fail(new UrlFetchError('That link did not return a PDF file.'));
        }
      }
      size += chunk.length;
      // Content-Length may be missing or wrong — this is the real enforcement.
      if (size > maxBytes) {
        return fail(new UrlFetchError(`That file exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`));
      }
    });

    response.data.on('error', () => fail(new UrlFetchError('The download failed partway through.')));
    out.on('error', () => fail(new UrlFetchError('Could not save the downloaded file.')));
    out.on('finish', () => { if (!aborted) resolve(); });

    response.data.pipe(out);
  }).catch((err) => {
    try { fs.unlinkSync(filePath); } catch { /* nothing to clean up */ }
    throw err;
  });

  if (size === 0) {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    throw new UrlFetchError('That link returned an empty file.');
  }

  return { filePath, originalName, size, sourceUrl: current };
}

module.exports = { fetchPdfToDisk, assertSafeUrl, normalizeUrl, isBlockedIp, UrlFetchError };
