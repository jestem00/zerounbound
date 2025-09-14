/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/uriHelpers.js
  Rev :    r601   2025-09-07
  Summary: add data-URI validators and normaliser
──────────────────────────────────────────────────────────────*/
import { Buffer } from 'buffer';

/** Regex matching metadata keys that store media/data URIs. */
export const URI_KEY_REGEX = /^(artifactUri|displayUri|thumbnailUri|extrauri_)/i;

/**
 * Return sorted list of URI-type keys present in a token_metadata map.
 * @param {Object|null|undefined} meta – token metadata object (decoded).
 * @returns {string[]} empty array when meta is falsy or non-object.
 */
export function listUriKeys(meta) {
  if (!meta || typeof meta !== 'object') return [];
  return Object.keys(meta)
    .filter((k) => URI_KEY_REGEX.test(k))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Extract MIME type from data: URI prefix.
 * Returns empty string on failure.
 */
export function mimeFromDataUri(u = '') {
  return u.startsWith('data:') ? (u.slice(5).split(/[;,]/)[0] || '') : '';
}

export function isValidDataUri(u = '') {
  return /^data:[^,]+,.+/.test(u);
}

export function isLikelySvg(s = '') {
  return /<svg[\s>]/i.test(s);
}

/**
 * Decode a data URI body to bytes when base64 encoded. Returns Uint8Array or null.
 */
export function dataUriToBytes(u = '') {
  try {
    if (!/^data:[^,]+,.+$/s.test(u)) return null;
    const [, meta = '', payload = ''] = u.match(/^data:([^,]*),(.*)$/s) || [];
    if (!/;base64/i.test(meta)) return null;
    const bin = typeof atob === 'function' ? atob(payload) : Buffer.from(payload, 'base64').toString('binary');
    const len = bin.length;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  } catch { return null; }
}

/** True if first two bytes match gzip magic. */
export function isGzipBytes(bytes) {
  try { return bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b; } catch { return false; }
}

/** Quick test for svg data URIs (ignores encoding). */
export function isSvgDataUri(u = '') {
  return /^data:image\/svg\+xml/i.test(String(u || ''));
}

/**
 * Detect gzipped SVG data: URIs. We consider it gzip when the payload is
 * base64 and starts with the gzip magic header. Returns boolean.
 */
export function isSvgzDataUri(u = '') {
  if (!isSvgDataUri(u)) return false;
  const bytes = dataUriToBytes(u);
  return !!(bytes && isGzipBytes(bytes));
}

/**
 * Attempt to normalise gzipped SVG data URIs by decompressing to UTF-8 text.
 * Returns a Promise that resolves to a normalised data URI (utf8) when
 * successful, otherwise returns the original.
 */
export async function normalizeSvgDataUri(u = '') {
  try {
    if (!isSvgDataUri(u)) return u;
    const bytes = dataUriToBytes(u);
    if (!bytes || !isGzipBytes(bytes)) return ensureDataUri(u);
    // Try native DecompressionStream first
    let out = null;
    try {
      if (typeof DecompressionStream !== 'undefined') {
        const rs = new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
        const ds = new DecompressionStream('gzip');
        const ab = await new Response(rs.pipeThrough(ds)).arrayBuffer();
        out = new Uint8Array(ab);
      }
    } catch {}
    // Fallback to pako if available
    if (!out) {
      try {
        const mod = await import('pako');
        const pako = mod && (mod.default || mod);
        if (pako && typeof pako.ungzip === 'function') {
          out = pako.ungzip(bytes);
        }
      } catch {}
    }
    if (!out) return ensureDataUri(u);
    const text = new TextDecoder('utf-8').decode(out);
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    return `data:image/svg+xml;base64,${b64}`; // ensureDataUri will convert to ;utf8 for SVG if needed
  } catch {
    return ensureDataUri(u);
  }
}

export function ensureDataUri(u = '') {
  if (!isValidDataUri(u)) throw new Error('Invalid data URI');
  const [meta, body] = u.slice(5).split(',', 2);
  const parts = meta.split(';');
  const mime = parts[0].toLowerCase();
  const isBase64 = parts.includes('base64');
  if (mime === 'image/svg+xml' && isBase64) {
    const decoded = Buffer.from(body, 'base64').toString('utf8');
    return `data:${mime};utf8,${decoded}`;
  }
  return `data:${mime}${isBase64 ? ';base64' : ';utf8'},${body}`;
}
/* What changed & why: Date aligned; minor doc polish; no functional change.
*/
/* EOF */
