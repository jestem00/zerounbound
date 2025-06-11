/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/uriHelpers.js
  Rev :    r429   2025-06-07
  Summary: Shared helpers to identify URI-type metadata keys
──────────────────────────────────────────────────────────────*/

/** Regex matching metadata keys that store media/data URIs. */
export const URI_KEY_REGEX = /^(artifactUri|displayUri|thumbnailUri|extrauri_)/i;

/**
 * Return sorted list of URI-type keys present in a token_metadata map.
 * @param {Object} meta – token metadata object (decoded values).
 * @returns {string[]}
 */
export function listUriKeys(meta = {}) {
  return Object.keys(meta)
    .filter((k) => URI_KEY_REGEX.test(k))
    .sort((a, b) => a.localeCompare(b));
}
/* EOF */
