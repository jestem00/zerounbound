/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/decodeHexFields.js
  Rev :    r2     2025‑08‑26
  Summary: add decodeHexJson() util + re‑export
──────────────────────────────────────────────────────────────*/
const RE_HEX = /^0x[0-9a-f]+$/i;

/** hex → UTF‑8 helper — safe on malformed input */
function hexToUtf8(hex = '') {
  try {
    const clean = hex.replace(/^0x/, '');
    if (!clean || clean.length % 2 || !/^[0-9a-f]+$/i.test(clean)) return hex;
    const bytes = new Uint8Array(clean.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
    return new TextDecoder().decode(bytes).replace(/[\u0000-\u001F\u007F]/g, '');
  } catch {
    return hex;
  }
}

/**
 * Recursively walks an object/array and converts any hex‑encoded
 * string value (0x… pattern) into printable UTF‑8.
 * Non‑string primitives are returned untouched.
 *
 * @param {*} v any JSON‑serialisable value
 * @returns {*} value with deep hex decoding applied
 */
export default function decodeHexFields(v) {
  if (Array.isArray(v))     return v.map(decodeHexFields);
  if (v && typeof v === 'object') {
    const out = {};
    Object.entries(v).forEach(([k, val]) => { out[k] = decodeHexFields(val); });
    return out;
  }
  if (typeof v === 'string' && RE_HEX.test(v)) return hexToUtf8(v);
  return v;
}

/**
 * decodeHexJson()
 * Accepts a raw Michelson `0x…` JSON‑blob or a plain JSON string,
 * returns parsed object or null on failure.
 *
 * @param {string} val big‑map value
 * @returns {object|null}
 */
export function decodeHexJson(val = '') {
  try {
    if (typeof val !== 'string') return null;
    const s = val.trim();
    if (s.startsWith('{') && s.endsWith('}')) return JSON.parse(s);
    if (RE_HEX.test(s))       return JSON.parse(hexToUtf8(s));
  } catch {}
  return null;
}
/* What changed & why (r2):
   • Added export decodeHexJson() to centralise hex‑JSON decode.
   • Other util unchanged.
*/
/* EOF */
