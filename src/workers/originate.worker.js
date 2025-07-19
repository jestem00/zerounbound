/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/workers/originate.worker.js
  Rev :    r10   2025-07-19
  Summary: build hex‑encoded metadata for origination; emits
           placeholder views and imageUri when the `fast` flag is
           true.  Used in dual‑stage origination and backend
           forging flows.  Supports progress callbacks.
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
  hex = hex.slice(2);  /* strip 0x */
  let str = '';
  for (let i = 0; i < hex.length; i += 2)
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  return str;
};

const views = JSON.parse(hexToString(viewsHex)).views;

/* fast table for byte→hex */
const b2h = new Array(256);
for (let i = 0; i < 256; i++) b2h[i] = i.toString(16).padStart(2, '0');

/**
 * utf8 → 0xHEX with progress callbacks
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
      name         : meta.name.trim(),
      symbol       : meta.symbol.trim(),
      description  : meta.description.trim(),
      version      : 'ZeroContractV4',
      license      : meta.license.trim(),
      authors      : meta.authors.map(a => a.trim()).filter(Boolean),
      homepage     : meta.homepage?.trim() || undefined,
      authoraddress: meta.authoraddress?.map(a => a.trim()).filter(Boolean) || undefined,
      creators     : meta.creators.map(c => c.trim()).filter(Boolean),
      type         : meta.type.trim(),
      interfaces   : uniqInterfaces(meta.interfaces),
      imageUri     : meta.imageUri?.trim() || undefined,
      views        : fast ? '0x00' : views,
    };
    Object.keys(ordered).forEach(k => {
      if (ordered[k] === undefined || (Array.isArray(ordered[k]) && !ordered[k].length)) delete ordered[k];
    });

    const body = utf8ToHex(JSON.stringify(ordered), taskId);
    self.postMessage({ taskId, body });
  } catch (error) {
    self.postMessage({ taskId, error: error.stack || String(error) });
  }
};
/* EOF */