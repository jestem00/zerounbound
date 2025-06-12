/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/uriHelpers.js
  Rev :    r599   2025-06-15
  Summary: null/undef guard → listUriKeys never throws.
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
/* EOF */
