/*Developed by @jams2blues with love for the Tezos community
  File: src/utils/toNat.js
  Summary: robust Michelson nat → JS number helper. */

export default function toNat(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (typeof v === 'object') {
    if ('toNumber' in v && typeof v.toNumber === 'function') return v.toNumber();
    if ('int' in v) return Number(v.int);
    if ('toString' in v) return Number(v.toString());
  }
  return null;            // unknown shape
}
