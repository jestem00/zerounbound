/*Developed by @jams2blues – ZeroContract Studio
  File:    src/core/batch.js
  Rev :    r702   2025-06-28 T04:12 UTC
  Summary: add sliceTail helper for repair-flows */

import { OpKind } from '@taquito/taquito';

/*────────────────── public constants ──────────────────*/
export const SLICE_SAFE_BYTES  = 30_000;   /* bytes per slice   */
export const PACKED_SAFE_BYTES = 31_000;   /* bytes per op-pack */

/*────────────────── slice helper ─────────────────────────────*/
export function sliceHex (hx = '', sliceBytes = SLICE_SAFE_BYTES) {
  if (!hx.startsWith('0x')) throw new Error('hex must start with 0x');
  const body = hx.slice(2);
  const step = sliceBytes * 2;                 /* two hex chars / byte */
  const out  = [];
  for (let i = 0; i < body.length; i += step) {
    out.push('0x' + body.slice(i, i + step));
  }
  return out;
}

/*─────────────── sliceTail – diff helper ─────────────────────*/
/**
 * Compare original vs full payload and return missing tail slices.
 * @param {string} origHex "0x…"   – on-chain hex
 * @param {string} fullHex "0x…"   – full file hex
 * @returns {{tail:string[], conflict:boolean}}
 */
export function sliceTail (origHex = '0x', fullHex = '0x') {
  if (!origHex.startsWith('0x') || !fullHex.startsWith('0x')) {
    throw new Error('hex must start with 0x');
  }
  const orig = origHex.slice(2);
  const full = fullHex.slice(2);

  /* original longer ⇒ cannot repair */
  if (orig.length > full.length) return { tail: [], conflict: true };

  if (full.startsWith(orig)) {
    const diff = full.slice(orig.length);
    return diff
      ? { tail: sliceHex('0x' + diff), conflict: false }
      : { tail: [], conflict: false };
  }
  return { tail: [], conflict: true };
}

/*────────────────── packed splitter ──────────────────*/
export async function splitPacked (toolkit, flat, limit = PACKED_SAFE_BYTES) {
  const batches = [];
  let current   = [];

  for (const p of flat) {
    current.push(p);

    const estArr = await toolkit.estimate.batch(
      current.map((q) => ({ kind: OpKind.TRANSACTION, ...q })),
    );
    const forged = estArr.reduce((t, e) => t + (e.opSize ?? 0), 0);

    if (forged > limit) {
      current.pop();
      if (!current.length) throw new Error('Single operation exceeds size cap');
      batches.push(current);
      current = [p];
    }
  }
  if (current.length) batches.push(current);
  return batches;
}

/*──────── op-kind sugar ───────*/
export const tx = (p) => ({ kind: OpKind.TRANSACTION, ...p });

/* EOF */
