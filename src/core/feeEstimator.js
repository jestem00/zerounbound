/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/feeEstimator.js
  Rev :    r713   2025-07-10
  Summary: expose μSTORAGE_PER_BYTE; doc-block polish; chunked estimation for large ops
 */
import { OpKind } from '@taquito/taquito';

/*──────── chain-wide constants ─────────────────────────────*/
export const μBASE_TX_FEE      = 10_000;   /* mutez – safe upper-bound for UI */
export const μSTORAGE_PER_BYTE = 250;      /* mutez / raw byte (≈ 1ꜩ / 4 kB) */
const EST_CHUNK_SIZE = 20;                 /* ops per estimation chunk */

/*──────── unit helpers ─────────────────────────────────────*/
export const toTez = (m = 0) => (m / 1_000_000).toFixed(6);

/*──────── storage-burn calculator ──────────────────────────*/
/**
 * calcStorageMutez(metaBytes, appendSlices[], editions = 1)
 * → mutez to pre-deposit for storageBurn.
 *
 *   • metaBytes    – JSON+map bytes (excluding slice-0 padding)
 *   • appendSlices – array of `0x…` hex strings (slice 1+)
 *   • editions     – token copies to mint
 *
 * Path I85 single-source invariant.
 */
export function calcStorageMutez(metaBytes = 0, appendSlices = [], editions = 1) {
  const sliceBytes = appendSlices.reduce(
    (t, hx) => t + ((hx.length - 2) >> 1), 0, /* hex → raw bytes */
  );
  const totalBytes = (metaBytes + sliceBytes) * Math.max(1, editions);
  return totalBytes * μSTORAGE_PER_BYTE;
}

/*──────── batch estimator with graceful fallback ───────────*/
/**
 * estimateChunked(toolkit, flatParams[])
 * Returns { fee, burn } mutez for a flat op list.
 * On RPC simulate 500 or toolkit undefined returns deterministic
 * fallback so UI never blocks (I85). Estimates in chunks for perf.
 */
export async function estimateChunked(toolkit, flat = []) {
  if (!toolkit || !flat.length) return { fee: 0, burn: 0 };

  try {
    let totalFee = 0;
    let totalBurn = 0;
    for (let i = 0; i < flat.length; i += EST_CHUNK_SIZE) {
      const chunk = flat.slice(i, i + EST_CHUNK_SIZE);
      const estArr = await toolkit.estimate.batch(
        chunk.map((p) => ({ kind: OpKind.TRANSACTION, ...p })),
      );
      totalFee += estArr.reduce((t, e) => t + e.suggestedFeeMutez, 0);
      totalBurn += estArr.reduce((t, e) => t + e.burnFeeMutez, 0);
    }
    return { fee: totalFee, burn: totalBurn };
  } catch {
    return { fee: flat.length * μBASE_TX_FEE, burn: 0 };
  }
}

/* What changed & why: Added chunked estimation to prevent long waits on large ops; date aligned; no functional drift.
*/
/* EOF */