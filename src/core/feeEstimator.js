/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/feeEstimator.js
  Rev :    r729   2025-07-12
  Summary: renamed calcStorageBurnMutez to calcStorageMutez
──────────────────────────────────────────────────────────────*/
/*──────── chain-wide constants ─────────────────────────────*/
export const μBASE_TX_FEE         = 100;      /* mutez – minimal per op */
export const MUTEZ_PER_BYTE       = 0.25;     /* mutez / raw byte (≈ 0.25ꜩ / kB) */
export const GAS_PER_BYTE = 0.6;              /* milligas per CONCAT byte (heavy pad) */
export const BASE_GAS_OVERHEAD = 3000;        /* fixed gas per append op (padded) */
const STORAGE_BYTE_OVERHEAD = 128;            /* fixed storage bytes overhead (padded) */
export const HARD_GAS_LIMIT = 1040000;        /* milligas per op (ghostnet) */
export const HARD_STORAGE_LIMIT = 60000;      /* bytes increase per op */

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
  return Math.ceil(totalBytes * MUTEZ_PER_BYTE * 1.2); // extra inflation
}

/*──────── per-op gas limit heuristic ───────────────────────*/
/**
 * calcGasLimit(appendedBytes, currentBytes = 0) → gas units for single append op.
 * Accounts for total CONCAT size (existing + appended).
 * No throw; caller checks vs HARD_GAS_LIMIT.
 */
export function calcGasLimit(appendedBytes = 0, currentBytes = 0) {
  const total = currentBytes + appendedBytes;
  return Math.min(HARD_GAS_LIMIT, Math.ceil(BASE_GAS_OVERHEAD + (total * GAS_PER_BYTE)));
}

/*──────── per-op storage byte limit heuristic ───────────────────*/
/**
 * calcStorageByteLimit(appendedBytes) → bytes for single append op.
 * No throw; caller checks vs HARD_STORAGE_LIMIT & caps.
 */
export function calcStorageByteLimit(appendedBytes = 0) {
  return Math.min(HARD_STORAGE_LIMIT, appendedBytes + STORAGE_BYTE_OVERHEAD);
}

/*──────── fast heuristic estimator ─────────────────────────*/
/**
 * estimateChunked(toolkit, flatParams[], chunkSize=8)
 * Attempts RPC batch estimate; falls back to heuristic on fail.
 * Inflated for safety; no throw.
 */
export async function estimateChunked(toolkit, flat = [], chunkSize = 8) {
  if (!flat.length) return { fee: 0, burn: 0 };

  try {
    let feeMutez = 0;
    let burnMutez = 0;
    for (let i = 0; i < flat.length; i += chunkSize) {
      const chunk = flat.slice(i, i + chunkSize).map((p) => ({ kind: OpKind.TRANSACTION, ...p }));
      const est = await toolkit.estimate.batch(chunk);
      feeMutez += est.reduce((t, e) => t + e.suggestedFeeMutez, 0);
      burnMutez += est.reduce((t, e) => t + e.burnFeeMutez, 0);
    }
    return { fee: feeMutez, burn: burnMutez };
  } catch {
    // Heuristic fallback
    let totalBytes = 0;
    flat.forEach((p) => {
      const bytesField = p.parameter?.value?.bytes ||
                         (typeof p.parameter?.value === 'string' && p.parameter.value.startsWith('0x')
                          ? p.parameter.value : '');
      if (bytesField.startsWith('0x')) {
        totalBytes += (bytesField.length - 2) / 2;
      }
    });
    const burn = Math.ceil(totalBytes * MUTEZ_PER_BYTE * 1.2); // inflated
    const fee = flat.length * μBASE_TX_FEE * 1.5; // inflated
    return { fee, burn };
  }
}
/* What changed & why: Renamed calcStorageBurnMutez to calcStorageMutez for consistency; fixes TypeError in callers; Compile-Guard passed.
 */
/* EOF */