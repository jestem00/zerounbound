/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/workers/originate.worker.js
  Rev :    r11   2025‑07‑20
  Summary: robust metadata builder for origination.  This worker
           now treats authors, authoraddress and creators as either
           arrays or single strings, trimming and filtering each
           entry.  It also accepts `authorAddresses` as an alias
           for `authoraddress` for backwards compatibility.  The
           `views` pointer uses a plain string when `fast` is true
           and the parsed views array otherwise.  Supports progress
           callbacks and outputs a 0x‑prefixed hex string.
──────────────────────────────────────────────────────────────*/

import viewsHex from '../constants/views.hex.js';

/*──────── helpers ─────*/
const uniqInterfaces = (src = []) => {
  const base = ['TZIP-012', 'TZIP-016'];
  const map  = new Map();
  [...src, ...base].forEach((i) => {
    const k = String(i ?? '').trim();
    if (k) map.set(k.toUpperCase(), k);
  });
  return Array.from(map.values());
};

const hexToString = (hex) => {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  let str = '';
  for (let i = 0; i < h.length; i += 2) {
    str += String.fromCharCode(parseInt(h.substr(i, 2), 16));
  }
  return str;
};

// Parse the off‑chain views JSON once.  When fast is false, this
// array is embedded in the metadata; otherwise a string pointer
// ('0x00') is used as a placeholder to satisfy TZIP‑16.
const viewsObj   = JSON.parse(hexToString(viewsHex));
const fullViews  = viewsObj.views;

/* fast table for byte→hex */
const b2h = new Array(256);
for (let i = 0; i < 256; i++) b2h[i] = i.toString(16).padStart(2, '0');

/**
 * Convert a UTF‑8 string into a 0x‑prefixed hex string.  While
 * converting, progress updates are posted back to the main thread.
 * @param {string} str The string to encode
 * @param {string|number} taskId A task identifier for progress messages
 * @returns {string} 0x‑prefixed hex representation of the UTF‑8 input
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

/*──────── worker message ─────*/
self.onmessage = ({ data }) => {
  const { meta, taskId, fast } = data;
  try {
    const ordered = {
      name        : meta?.name?.trim(),
      symbol      : meta?.symbol?.trim(),
      description : meta?.description?.trim(),
      version     : 'ZeroContractV4',
      license     : meta?.license?.trim(),
      // Convert authors into a trimmed array.  Accept a single string
      // or an array; filter out empty entries.
      authors      : Array.isArray(meta?.authors)
        ? meta.authors.map((a) => String(a).trim()).filter(Boolean)
        : meta?.authors ? [String(meta.authors).trim()] : undefined,
      homepage    : meta?.homepage?.trim() || undefined,
      // Accept both `authoraddress` and `authorAddresses` as aliases.
      authoraddress: (() => {
        const addr = meta?.authoraddress ?? meta?.authorAddresses;
        if (Array.isArray(addr)) {
          return addr.map((a) => String(a).trim()).filter(Boolean);
        }
        if (addr) {
          const s = String(addr).trim();
          return s ? [s] : undefined;
        }
        return undefined;
      })(),
      // Convert creators into a trimmed array.  Accept a single string
      // or an array; filter out empty entries.
      creators    : Array.isArray(meta?.creators)
        ? meta.creators.map((c) => String(c).trim()).filter(Boolean)
        : meta?.creators ? [String(meta.creators).trim()] : undefined,
      type        : meta?.type?.trim(),
      interfaces  : uniqInterfaces(meta?.interfaces),
      imageUri    : meta?.imageUri?.trim() || undefined,
      // Use a string placeholder ('0x00') when fast flag is true; otherwise
      // embed the full views array parsed from views.hex.js.
      views       : fast ? '0x00' : fullViews,
    };
    // Remove undefined properties and empty arrays
    Object.keys(ordered).forEach((k) => {
      const v = ordered[k];
      if (v === undefined || (Array.isArray(v) && v.length === 0)) {
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
   • Created new file at r11 replacing the previous r10.  Introduced
     robust handling of authors, authoraddress and creators fields,
     allowing for both array and string inputs and filtering blank
     entries.  Accepts `authorAddresses` as an alias to maintain
     backwards compatibility with the form’s field names.
   • Parsed views JSON once and stored as fullViews; views pointer
     now uses '0x00' when `fast` is true and the actual array when
     false, matching TZIP‑16 conventions.
   • Added comprehensive comments and JSDoc for utf8ToHex to aid
     maintainers.  Trimmed inputs and removed undefined or empty
     properties from the metadata object.
   • Updated revision and summary to reflect the improved metadata
     builder and compatibility changes.
*/
