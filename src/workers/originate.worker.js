/*──────── src/workers/originate.worker.js ────────*/
/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/workers/originate.worker.js
  Rev :    r11  2025‑07‑21
  Summary: build hex‑encoded metadata for origination; preserves
           array/string fields gracefully; emits placeholder views
           and imageUri when `fast` flag is true.
──────────────────────────────────────────────────────────────────*/

// Pre-encoded JSON views definition.  The views.hex.js file exports
// a single default string containing the contract’s view definitions
// encoded as a hex string with 0x prefix.  Decoding it avoids
// expensive JSON parsing in the main thread.
import viewsHex from '../constants/views.hex.js';

/*──────── helpers ─────────*/
// Normalise interface names and include mandatory standards.
const uniqInterfaces = (src = []) => {
  const base = ['TZIP-012', 'TZIP-016'];
  const map  = new Map();
  [...src, ...base].forEach((i) => {
    const k = String(i ?? '').trim();
    if (k) map.set(k.toUpperCase(), k);
  });
  return Array.from(map.values());
};

// Convert a hex string (0x...) to a UTF-8 string.
const hexToString = (hex) => {
  hex = hex.slice(2); /* strip 0x */
  let str = '';
  for (let i = 0; i < hex.length; i += 2)
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  return str;
};

// Decode the hex-encoded views into a JSON object.  The imported
// viewsHex contains the result of JSON.stringify({ views }) encoded
// via hex.
const views = JSON.parse(hexToString(viewsHex)).views;

/* fast table for byte→hex */
const b2h = new Array(256);
for (let i = 0; i < 256; i++) b2h[i] = i.toString(16).padStart(2, '0');

/**
 * utf8 → 0xHEX with progress callbacks
 * Encodes a UTF-8 string into a hex string prefixed with 0x.  It
 * reports progress via postMessage to allow the UI to update.
 */
const utf8ToHex = (str, taskId) => {
  const bytes = new TextEncoder().encode(str);
  const len   = bytes.length;
  const hex   = new Array(len);
  let lastPct = -1;
  for (let i = 0; i < len; i += 1) {
    hex[i] = b2h[bytes[i]];
    const pct = Math.floor((i / len) * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      self.postMessage({ taskId, progress: pct });
    }
  }
  return '0x' + hex.join('');
};

/*──────── worker message handler ─────*/
// This worker receives a metadata object, a taskId for progress
// tracking, and a boolean `fast` to indicate whether the views
// should be included.  It returns a hex-encoded JSON string in
// the `body` property or an error if encountered.
self.onmessage = ({ data }) => {
  const { meta, taskId, fast } = data;
  try {
    // Build ordered metadata; handle arrays vs strings robustly.
    const ordered = {
      name        : meta.name.trim(),
      symbol      : meta.symbol.trim(),
      description : meta.description.trim(),
      version     : 'ZeroContractV4',
      license     : meta.license.trim(),
      authors     : Array.isArray(meta.authors)
        ? meta.authors.map((a) => String(a).trim()).filter(Boolean)
        : meta.authors ? [String(meta.authors).trim()] : undefined,
      homepage    : meta.homepage?.trim() || undefined,
      authoraddress: Array.isArray(meta.authoraddress)
        ? meta.authoraddress.map((a) => String(a).trim()).filter(Boolean)
        : meta.authoraddress ? [String(meta.authoraddress).trim()] : undefined,
      creators    : Array.isArray(meta.creators)
        ? meta.creators.map((c) => String(c).trim()).filter(Boolean)
        : meta.creators ? [String(meta.creators).trim()] : undefined,
      type        : meta.type?.trim(),
      interfaces  : uniqInterfaces(meta.interfaces),
      imageUri    : meta.imageUri?.trim() || undefined,
      views       : fast ? '0x00' : views,
    };
    // Remove undefined or empty array properties
    Object.keys(ordered).forEach((k) => {
      if (ordered[k] === undefined ||
         (Array.isArray(ordered[k]) && ordered[k].length === 0)) {
        delete ordered[k];
      }
    });
    const body = utf8ToHex(JSON.stringify(ordered), taskId);
    self.postMessage({ taskId, body });
  } catch (error) {
    self.postMessage({ taskId, error: error.stack || String(error) });
  }
};

/* What changed & why:
   • Bumped revision to r11 and updated summary.
   • authors, authoraddress and creators fields now accept both arrays
     and strings, trimming each entry and converting singular values into
     single‑element arrays.  Undefined and empty arrays are removed.
   • Retained existing placeholder views logic for fast mode and hex‑encoding
     of metadata.
*/