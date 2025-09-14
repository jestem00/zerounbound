/*
  Developed by @jams2blues
  File:    src/utils/interactiveZip.js
  Rev :    r1   2025-09-08
  Summary: Unpack data:application/zip URIs in-browser, validate root index.html,
           rewrite relative links to blob: URLs, expose sandbox entry and cleanup.
*/

import { mimeFromFilename } from '../constants/mimeTypes.js';

const isHttpLike = /^(https?:)?\/\//i;

function decodeBase64DataUri(u = '') {
  if (!u.startsWith('data:')) throw new Error('Not a data URI');
  const comma = u.indexOf(',');
  if (comma < 0) throw new Error('Malformed data URI');
  const meta = u.slice(5, comma);
  const b64 = /;base64/i.test(meta);
  const body = u.slice(comma + 1);
  if (!b64) throw new Error('ZIP must be base64-encoded');
  const bin = typeof atob === 'function' ? atob(body) : Buffer.from(body, 'base64').toString('binary');
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = bin.charCodeAt(i) & 0xff;
  return bytes.buffer;
}

/** Build a blob URL for a file, guessing MIME from filename. */
function makeBlobUrl(name, bytes) {
  const mime = mimeFromFilename(name) || 'application/octet-stream';
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

/** Normalize zip entry keys to forward-slash paths without leading './'. */
function normPath(p = '') {
  const s = String(p).replace(/\\/g, '/');
  return s.replace(/^\.\//, '');
}

/**
 * Unpack a data:application/zip;base64 URI and construct a sandboxable entry.
 * Returns { ok, error?, indexUrl?, urls, cleanup, hazards }.
 */
export async function unpackZipDataUri(dataUri) {
  try {
    const ab = decodeBase64DataUri(dataUri);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(ab);

    // Require a top-level index.html (no folders in the path)
    const keys = Object.keys(zip.files).map(normPath);
    const hasRootIndex = keys.includes('index.html');
    if (!hasRootIndex) {
      return { ok: false, error: 'ZIP missing top-level index.html' };
    }

    // Build blob URLs for all files
    const urlMap = new Map();
    const hazards = { remotes: [] };

    // Helper to read text for hazard scan
    const readText = async (file) => file.async('string');

    for (const [rawKey, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const key = normPath(rawKey);
      const bytes = await file.async('uint8array');
      const url = makeBlobUrl(key, bytes);
      urlMap.set(key, url);

      // Light hazard scan for remote references in textual assets
      const lc = key.toLowerCase();
      if (/\.(html?|css|js)$/i.test(lc)) {
        try {
          const txt = await readText(file);
          const matches = (txt.match(/\b(?:https?:|wss?:)\/\//gi) || []);
          hazards.remotes.push(...matches);
        } catch {}
      }
    }

    // Rewrite root index.html to use blob URLs
    const idxFile = zip.file('index.html');
    const idxText = await idxFile.async('string');

    // Inject a strict CSP to constrain remote access inside the iframe sandbox
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: data:; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' blob: data:; script-src 'self' 'unsafe-inline' blob: data:; style-src 'self' 'unsafe-inline' blob: data:; connect-src 'none'">`;
    const withCsp = (() => {
      try {
        if (/<head[\s>]/i.test(idxText)) {
          return idxText.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n${cspMeta}`);
        }
      } catch {}
      // Prepend as a fallback
      return `${cspMeta}\n${idxText}`;
    })();

    const rewritten = withCsp.replace(/(src|href)=("|')([^"']+)(\2)/gi, (m, attr, q, val) => {
      const v = val.trim();
      // Ignore data:, blob:, http(s):, and fragments
      if (!v || v.startsWith('#') || v.startsWith('data:') || v.startsWith('blob:') || isHttpLike.test(v)) return m;
      const norm = normPath(v);
      const blobUrl = urlMap.get(norm);
      if (blobUrl) return `${attr}=${q}${blobUrl}${q}`;
      return m; // leave unknown refs as-is
    });

    const htmlUrl = makeBlobUrl('index.html', new TextEncoder().encode(rewritten));

    const cleanup = () => {
      try {
        URL.revokeObjectURL(htmlUrl);
      } catch {}
      for (const u of urlMap.values()) {
        try { URL.revokeObjectURL(u); } catch {}
      }
    };

    return { ok: true, indexUrl: htmlUrl, urls: urlMap, cleanup, hazards };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export function isZipDataUri(u = '') {
  return /^data:application\/(zip|x-zip-compressed);base64,/i.test(String(u || ''));
}

/* EOF */
