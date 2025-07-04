/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/decodeHexFields.js
  Rev :    r3     2025‑09‑06
  Summary: decodeHexJson() now accepts bare‑hex (no “0x”) values
──────────────────────────────────────────────────────────────*/
const RE_HEX_WITH_0x = /^0x[0-9a-f]+$/i;
const RE_HEX_BARE    = /^[0-9a-f]+$/i;          /* new – bare hex support */

/** hex → UTF‑8 helper — safe on malformed input */
function hexToUtf8(hex = '') {
  try {
    const clean = hex.replace(/^0x/, '');
    if (!RE_HEX_BARE.test(clean) || clean.length % 2) return hex;
    const bytes = new Uint8Array(clean.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
    return new TextDecoder().decode(bytes).replace(/[\u0000-\u001F\u007F]/g, '');
  } catch {
    return hex;
  }
}

/**
 * Recursively walks an object/array and converts any hex‑encoded
 * string value (0x… **or bare‑hex**) into printable UTF‑8.
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
  if (typeof v === 'string' && (RE_HEX_WITH_0x.test(v) || RE_HEX_BARE.test(v))) {
    return hexToUtf8(v);
  }
  return v;
}

/**
 * decodeHexJson()
 * Accepts a raw Michelson hex JSON‑blob – **with or without** the “0x”
 * prefix – or a plain JSON string, returns parsed object or null.
 *
 * @param {string} val big‑map value
 * @returns {object|null}
 */
export function decodeHexJson(val = '') {
  try {
    if (typeof val !== 'string') return null;
    const s = val.trim();
    if (s.startsWith('{') && s.endsWith('}'))   return JSON.parse(s);
    if (RE_HEX_WITH_0x.test(s) || RE_HEX_BARE.test(s))
      return JSON.parse(hexToUtf8(s));
  } catch { /* fall‑through */ }
  return null;
}
/* What changed & why (r3):
   • Added RE_HEX_BARE to recognise hex blobs lacking “0x” prefix.
   • hexToUtf8() & main converters now use RE_HEX_BARE for validation.
   • decodeHexJson() decodes bare‑hex as well, fixing ContractPage meta
     resolution and restoring name/description/preview rendering.
*/
/* EOF */
