/*─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: src/utils/generativeSeed.js
Rev:  r3   2025‑09‑08 UTC
Summary: Deterministic 128‑bit seed + helpers (xmur3 → sfc32).
──────────────────────────────────────────────────────────────────*/

export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++)
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353), h = (h << 13) | (h >>> 19);
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    d = (d + 1) | 0;
    t = (t + d) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** 128‑bit hex seed from tuple; stable across platforms. */
export function deriveSeedHex(contract, tokenId, recipient = '', projectSalt = '') {
  const input = `${contract}|${tokenId}|${recipient}|${projectSalt}`;
  const h = xmur3(input);
  const a = h(), b = h(), c = h(), d = h();
  return [a, b, c, d].map((n) => n.toString(16).padStart(8, '0')).join('');
}

export function seed32FromHex(hex128) {
  const parts = (hex128 || '0'.repeat(32)).match(/.{1,8}/g).map((h) => parseInt(h, 16) >>> 0);
  return parts.reduce((acc, n) => (acc ^ n) >>> 0, 0) >>> 0;
}

const api = { xmur3, sfc32, deriveSeedHex, seed32FromHex };
export default api;

// CommonJS fallback for environments that require() this module directly.
// eslint-disable-next-line no-undef
if (typeof module !== 'undefined') {
  module.exports = api;
}

/* What changed & why: stable seed derivation & fold‑to‑32 for p5. */
