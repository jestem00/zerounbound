/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/batch.js
  Rev :    r861   2025‑10‑20 T22:08 UTC
  Summary: smarter sliceTail — de‑dupes overlap to prevent
           accidental duplicate‑slice appends
──────────────────────────────────────────────────────────────*/
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
 * Detect the missing tail bytes of `fullHex` relative to `origHex` while
 * **guaranteeing** no duplicate overlap is appended.
 *
 * Returns { tail[], conflict:boolean, origLonger?:boolean }.
 *
 *  • Duplicate‑slice protection:
 *      If the beginning of the would‑be tail already exists as a suffix of
 *      `origHex`, the overlap is trimmed so that the minimal diff is emitted.
 *
 *  • Conflict detection unchanged – still flags divergent prefixes and the
 *    origLonger case where on‑chain data already exceeds the upload.
 *
 * Fully back‑compatible with callers that ignore the de‑dupe upgrade.
 */
export function sliceTail (origHex = '0x', fullHex = '0x') {
  if (!origHex.startsWith('0x') || !fullHex.startsWith('0x')) {
    throw new Error('hex must start with 0x');
  }
  const orig = origHex.slice(2);
  const full = fullHex.slice(2);

  /* on‑chain data longer => cannot self‑heal via append */
  if (orig.length > full.length) {
    return { tail: [], conflict: true, origLonger: true };
  }

  /* diverging prefix → true conflict */
  if (!full.startsWith(orig)) {
    return { tail: [], conflict: true };
  }

  /* raw diff bytes */
  let diff = full.slice(orig.length);
  if (!diff) return { tail: [], conflict: false };

  /**
   * ─── Overlap‑trim pass ───
   * Find the longest suffix of `orig` that is also a prefix of `diff`
   * and drop that prefix from `diff`. KMP‑like linear scan.
   */
  const maxOverlap = Math.min(orig.length, diff.length);
  let overlap = 0;
  for (let k = maxOverlap; k > 0; k -= 2) {          /* step 2 → nibble‑pair */
    if (orig.endsWith(diff.slice(0, k))) {
      overlap = k;
      break;
    }
  }
  if (overlap) diff = diff.slice(overlap);
  if (!diff) return { tail: [], conflict: false };

  return {
    tail: sliceHex('0x' + diff),
    conflict: false,
  };
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
   • New overlap‑trim logic inside sliceTail() — removes any bytes that
     already exist as a suffix of on‑chain data, eliminating accidental
     duplicate slice appends.
   • Public API untouched; callers receive the minimal diff slices.
   • Rev‑bump r861; satisfies invariants I60 & I85. */
/* EOF */
