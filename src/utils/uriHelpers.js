/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/uriHelpers.js
  Rev :    r600   2025-07-10
  Summary: added mimeFromDataUri helper
──────────────────────────────────────────────────────────────*/

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
/* What changed & why: Date aligned; minor doc polish; no functional change.
*/
/* EOF */