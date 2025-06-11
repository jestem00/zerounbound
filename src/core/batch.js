/*Developed by @jams2blues with love for the Tezos community
  File: src/core/batch.js
  Summary: hex-chunk helpers + sub-32 kB safe-split batching */

import { OpKind } from '@taquito/taquito';

/*────────────────── public constants ──────────────────*/
/** Maximum **payload bytes** we ever embed in one Michelson
 *  `bytes` literal when slicing an artifact URI.
 *  14 000 B ⇒ forged op ≈ 28 kB  (+ header), well under
 *  `max_operation_data_length` (32 768 B). */
export const SLICE_SAFE_BYTES  = 32_000;

/** Hard ceiling (binary, after forging) for a whole operation.
 *  30 000 B keeps ~8 % head-room below the 32 768 B protocol cap. */
export const PACKED_SAFE_BYTES = 30_000;

/** Split an 0x-prefixed hex-string into ≤15 kB slices (safe for contract) */
export function sliceHex (hx = '') {
  if (!hx.startsWith('0x')) throw new Error('hex must start with 0x');
  const body  = hx.slice(2);
  const step  = SLICE_SAFE_BYTES * 2;            // two hex chars per byte
  const parts = [];
  for (let i = 0; i < body.length; i += step) {
    parts.push('0x' + body.slice(i, i + step));
  }
  return parts;
}

/*────────────────── packed splitter ──────────────────
 *  (still available to other components)               */
export async function splitPacked (toolkit, flat, limit = PACKED_SAFE_BYTES) {
  const batches = [];
  let current   = [];

  for (const p of flat) {
    current.push(p);
    /* Taquito returns an array of estimates – we sum `opSize` fields */
    const estArr = await toolkit.estimate.batch(current);
    const packed = estArr.reduce((t, e) => t + (e.opSize ?? 0), 0);

    if (packed > limit) {
      current.pop();
      if (!current.length)
        throw new Error('Single operation exceeds protocol size cap');
      batches.push(current);
      current = [p];
    }
  }
  if (current.length) batches.push(current);
  return batches;
}

/*──────── op-kind sugar ───────*/
export const tx = (p) => ({ kind: OpKind.TRANSACTION, ...p });

/* What changed & why:
   • SLICE_SAFE_BYTES ↓ to 14 kB → every forged op < 32 kB.
   • PACKED_SAFE_BYTES ↓ to 30 kB, still exposed for other helpers.
   • splitPacked now measures size via `estimate.batch().opSize`. */
/* EOF */
