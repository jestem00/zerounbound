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