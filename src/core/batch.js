/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/batch.js
  Rev :    r707   2025‑06‑21 T02:18 UTC
  Summary: Revert v4a‑specific fee injection — restores
           original multi‑version batch helper for v1‑v4
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
export function sliceTail (origHex = '0x', fullHex = '0x') {
  if (!origHex.startsWith('0x') || !fullHex.startsWith('0x')) {
    throw new Error('hex must start with 0x');
  }
  const orig = origHex.slice(2);
  const full = fullHex.slice(2);
  if (orig.length > full.length) return { tail: [], conflict: true };
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
/**
 * Generic append helper kept for back‑compat.  **Do not**
 * inject static fee/gas/storage here — v4 contracts will
 * refuse unknown entry‑points and other versions are
 * unaffected.  v4a logic lives in batchV4a.js.
 */
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
   • Rolled back static fee/gas/storage injection so
     batch.js remains version‑agnostic (v1–v4). */
/* EOF */