/*Developed by @jams2blues with love for the Tezos community
  File: src/workers/originate.worker.js
  Rev : r6   2025-07-15
  Summary: import views from hex.js; progress min 1%; error details */
import { char2Bytes } from '@taquito/utils';

import viewsHex from "../constants/views.hex.js";

/*──────── helpers ─────*/
const uniqInterfaces = src => {
  const base = ['TZIP-012', 'TZIP-016'];
  const map  = new Map();
  [...(src || []), ...base].forEach(i => {
    const k = String(i ?? '').trim();
    if (!k) return;
    map.set(k.toUpperCase(), k);
  });
  return Array.from(map.values());
};

const hexToString = (hex) => {
  hex = hex.slice(2);
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return str;
};

const views = JSON.parse(hexToString(viewsHex)).views;

const byteToHex = new Array(256);
for (let i = 0; i < 256; i++) {
  byteToHex[i] = i.toString(16).padStart(2, '0');
}

const utf8ToHex = (str, taskId) => {
  const bytes = new TextEncoder().encode(str);
  const length = bytes.length;
  const hexArr = new Array(length);
  let lastProgress = -1;
  for (let i = 0; i < length; i++) {
    hexArr[i] = byteToHex[bytes[i]];
    const progress = Math.floor((i / length) * 100);
    if (progress >= lastProgress + 1) {  // min 1% increments
      self.postMessage({ taskId, progress });
      lastProgress = progress;
    }
  }
  return '0x' + hexArr.join('');
};

/*──────── worker ───────*/
self.onmessage = ({ data }) => {
  const { meta, taskId } = data;

  try {
    const ordered = {
      name:          meta.name.trim(),
      symbol:        meta.symbol.trim(),
      description:   meta.description.trim(),
      version:       'ZeroContractV4',
      license:       meta.license,
      authors:       meta.authors,
      homepage:      meta.homepage || undefined,
      authoraddress: meta.authoraddress || undefined,
      creators:      meta.creators,
      type:          meta.type,
      interfaces:    uniqInterfaces(meta.interfaces),
      imageUri:      meta.imageUri || undefined,
      views,
    };
    Object.keys(ordered).forEach(k => ordered[k] === undefined && delete ordered[k]);

    const header = '0x' + char2Bytes('tezos-storage:content');
    const body   = utf8ToHex(JSON.stringify(ordered), taskId);

    self.postMessage({ taskId, header, body });
  } catch (error) {
    self.postMessage({ taskId, error: error.stack || error.message });
  }
};

/* What changed & why: Switch back to views.hex.js import; progress min 1%; error stack; rev r6b. */
/* EOF */