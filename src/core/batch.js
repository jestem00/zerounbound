/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/batch.js
  Rev :    r871   2025-07-13
  Summary: single-op mode; dynamic sliceBytes
──────────────────────────────────────────────────────────────*/
import { OpKind } from '@taquito/taquito';
import { HARD_STORAGE_LIMIT } from './feeEstimator.js';

/*────────────────── public constants ──────────────────*/
export const SLICE_SAFE_BYTES  = 20_000;   /* default safe */
export const PACKED_SAFE_BYTES = 31_000;   /* bytes per op-pack */
const SLICE_OVERHEAD = 512;                /* Michelson/encoding padding */
const OP_SIZE_OVERHEAD = 200;              /* forged bytes per op */

/*────────────────── slice helper ───────────────────────*/
export function sliceHex (hx = '', sliceBytes = SLICE_SAFE_BYTES) {
  if (!hx.startsWith('0x')) throw new Error('hex must start with 0x');
  const body = hx.slice(2);
  const step = sliceBytes * 2;
  const out  = [];
  for (let i = 0; i < body.length; i += step) {
    out.push('0x' + body.slice(i, i + step));
  }
  return out;
}

/*─────────────── sliceTail – diff helper ───────────────*/
/**
 * sliceTail(origHex, fullHex, sliceBytes?, byteOffset=0)
 * Detects the missing tail bytes of `fullHex` relative to `origHex`.
 *
 * Returns { tail[], conflict:boolean, origLonger?:boolean, totalBytes:number }.
 *  • tail      – array of `0x…` slice strings to append from offset.
 *  • conflict  – true when bytes mismatch before diff section.
 *  • origLonger– true when on‑chain hex is already longer than uploaded
 *                file (common when a slice was accidentally duplicated).
 *  • totalBytes– total appended bytes for resume.
 *
 * Invariant I60 compatible: legacy callers ignoring the new field remain
 * untouched – `origLonger` is additive.
 */
export function sliceTail (origHex = '0x', fullHex = '0x', sliceBytes = SLICE_SAFE_BYTES, byteOffset = 0) {
  if (!origHex.startsWith('0x') || !fullHex.startsWith('0x')) {
    throw new Error('hex must start with 0x');
  }
  const orig = origHex.slice(2);
  const full = fullHex.slice(2);
  if (orig.length > full.length) {
    return { tail: [], conflict: true, origLonger: true, totalBytes: 0 };
  }
  if (full.startsWith(orig)) {
    let diff = full.slice(orig.length);
    if (byteOffset > 0) diff = diff.slice(byteOffset * 2);
    const safeBytes = Math.min(sliceBytes, HARD_STORAGE_LIMIT - SLICE_OVERHEAD);
    const tail = diff ? sliceHex('0x' + diff, safeBytes) : [];
    const totalBytes = tail.reduce((sum, hx) => sum + (hx.length - 2) / 2, 0);
    return { tail, conflict: false, totalBytes };
  }
  return { tail: [], conflict: true, totalBytes: 0 };
}

/*────────────────── packed splitter ────────────────────*/
export async function splitPacked (toolkit, flat, limit = PACKED_SAFE_BYTES, singleOp = false) {
  if (singleOp) return flat.map((p) => [p]);
  const batches = [];
  let current   = [];
  for (const p of flat) {
    current.push(p);
    let forged = current.reduce((t, q) => t + extractParamBytes(q) / 2 + OP_SIZE_OVERHEAD, 0);
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

function extractParamBytes(p) {
  if (!p.parameter) return 0;
  return JSON.stringify(p.parameter).length; // rough byte est
}

/*──────── op-kind sugar ───────*/
export const tx = (p) => ({ kind: OpKind.TRANSACTION, ...p });

/*──────────── append helper (generic) ────────────*/
export async function buildAppendTokenMetaCalls (
  toolkit,
  contractAddr,
  key,
  tokenId,
  slices = [],
) {
  if (!toolkit)      throw new Error('Toolkit required');
  if (!contractAddr) throw new Error('contractAddr required');
  if (!slices.length) return [];

  const c = await toolkit.wallet.at(contractAddr);
  return slices.map((hx) => ({
    kind: OpKind.TRANSACTION,
    ...(c.methods.append_token_metadata(
      key,
      tokenId,
      hx.startsWith('0x') ? hx : `0x${hx}`,
    ).toTransferParams()),
  }));
}
/* What changed & why:
   • Added singleOp param to force single-op batches.
   • Rev-bump r871; Compile-Guard passed.
*/
/* EOF */