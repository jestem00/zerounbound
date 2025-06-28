/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/batch.js
  Rev :    r859   2025‑08‑11 T03:44 UTC
  Summary: sliceTail now reports `origLonger` flag for
           safer diff‑repair diagnostics (I60 hardening)
─────────────────────────────────────────────────────────────*/
import { OpKind } from '@taquito/taquito';

/*────────────────── public constants ──────────────────*/
export const SLICE_SAFE_BYTES  = 22_000;   /* bytes per slice   */
export const PACKED_SAFE_BYTES = 31_000;   /* bytes per op-pack */

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
 * sliceTail(origHex, fullHex)
 * Detects the missing tail bytes of `fullHex` relative to `origHex`.
 *
 * Returns { tail[], conflict:boolean, origLonger?:boolean }.
 *  • tail      – array of `0x…` slice strings to append.
 *  • conflict  – true when bytes mismatch before diff section.
 *  • origLonger– true when on‑chain hex is already longer than uploaded
 *                file (common when a slice was accidentally duplicated).
 *
 * Invariant I60 compatible: legacy callers ignoring the new field remain
 * untouched – `origLonger` is additive.
 */
export function sliceTail (origHex = '0x', fullHex = '0x') {
  if (!origHex.startsWith('0x') || !fullHex.startsWith('0x')) {
    throw new Error('hex must start with 0x');
  }
  const orig = origHex.slice(2);
  const full = fullHex.slice(2);

  if (orig.length > full.length) {
    /* on‑chain data already longer – cannot self‑heal via append */
    return { tail: [], conflict: true, origLonger: true };
  }
  if (full.startsWith(orig)) {
    const diff = full.slice(orig.length);
    return diff
      ? { tail: sliceHex('0x' + diff), conflict: false }
      : { tail: [], conflict: false };
  }
  return { tail: [], conflict: true };
}

/*────────────────── packed splitter ────────────────────*/
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
   • Added `origLonger` flag to sliceTail for clearer diagnostics when
     on‑chain data already exceeds the uploaded file (duplicate slice
     scenario); head‑room logic untouched – full back‑compat. */
/* EOF */
