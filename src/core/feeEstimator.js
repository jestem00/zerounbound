/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/feeEstimator.js
  Rev :    r739   2025-07-13
  Summary: added calcExactOverhead for mint limit push
──────────────────────────────────────────────────────────────*/
import { OpKind } from '@taquito/taquito';

/*──────── chain‑wide constants ─────────────────────────────*/
export const μBASE_TX_FEE         = 150;      /* mutez – per op (actual avg) */
export const MUTEZ_PER_BYTE       = 0.257;    /* mutez / raw byte (exact) */
export const GAS_PER_BYTE         = 1.8;      /* milligas per concat byte */
export const BASE_GAS_OVERHEAD    = 12000;    /* fixed gas per append op */
const STORAGE_BYTE_OVERHEAD       = 150;      /* fixed storage bytes overhead */
export const HARD_GAS_LIMIT       = 1_040_000;/* milligas per op */
export const HARD_STORAGE_LIMIT   = 60_000;   /* bytes increase per op */
export const HIGH_GAS_THRESHOLD   = 150_000;  /* bytes for high-gas */
const BURN_FACTOR                 = 1.05;     /* slight over-est */
const OP_BURN_OVERHEAD            = 1000;     /* mutez fixed per op */
export const MAX_OP_DATA_BYTES    = 32_768;   /* max param length */

/*──────── unit helpers ─────────────────────────────────────*/
export const toTez = (m = 0) => (m / 1_000_000).toFixed(6);

/*──────── storage‑burn calculator ──────────────────────────*/
/**
 * calcStorageBurnMutez(metaBytes, appendSlices[], editions = 1)
 *   → mutez to pre‑deposit for storage burn.
 */
export function calcStorageBurnMutez(
  metaBytes = 0, appendSlices = [], editions = 1,
) {
  const sliceBytes = appendSlices.reduce(
    (t, hx) => t + ((hx.length - 2) >> 1), 0,
  );
  const totalBytes = (metaBytes + sliceBytes) * Math.max(1, editions);
  return Math.ceil((totalBytes * MUTEZ_PER_BYTE + appendSlices.length * OP_BURN_OVERHEAD) * BURN_FACTOR);
}

/* Back‑compat alias (v1‑v3 entrypoints still import this) */
export function calcStorageMutez(
  metaBytes = 0, appendSlices = [], editions = 1,
) {
  return calcStorageBurnMutez(metaBytes, appendSlices, editions);
}

/*──────── per‑op gas & storage heuristics ──────────────────*/
export function calcGasLimit(appendedBytes = 0, currentBytes = 0) {
  const total = currentBytes + appendedBytes;
  if (total > HIGH_GAS_THRESHOLD) return HARD_GAS_LIMIT;
  return Math.min(
    HARD_GAS_LIMIT,
    Math.ceil(BASE_GAS_OVERHEAD + total * GAS_PER_BYTE),
  );
}
export function calcStorageByteLimit(appendedBytes = 0) {
  return Math.min(HARD_STORAGE_LIMIT, appendedBytes + STORAGE_BYTE_OVERHEAD);
}

/*──────── recursive bytes extractor ────────────────────────*/
function extractBytesSize(value) {
  if (typeof value === 'string' && value.startsWith('0x')) {
    return (value.length - 2) / 2;
  }
  if (Array.isArray(value)) {
    return value.reduce((sum, v) => sum + extractBytesSize(v), 0);
  }
  if (value && typeof value === 'object') {
    if (value.prim === 'Bytes' && typeof value.bytes === 'string') {
      return value.bytes.length / 2;
    }
    if (value.int || value.string || value.bytes) {
      return extractBytesSize(value.bytes || value.string || String(value.int));
    }
    return Object.values(value).reduce((sum, v) => sum + extractBytesSize(v), 0);
  }
  return 0;
}

/*──────── exact overhead for mint limit ────────────────────*/
export function calcExactOverhead(metaMap) {
  let overhead = 360; // base frame
  for (const [k, v] of metaMap.entries()) {
    overhead += k.length + (v.length - 2) / 2 + 32; // key + value + map entry
  }
  return overhead;
}

/*──────── fast heuristic / RPC estimator ───────────────────*/
/**
 * estimateChunked(toolkit, flatParams[], chunkSize = 8, skipRpc = false)
 * Attempts RPC batch estimate; graceful heuristic fallback.
 * skipRpc forces heuristic (fast for large payloads).
 */
export async function estimateChunked(toolkit, flat = [], chunkSize = 5, skipRpc = false) {
  if (!flat.length) return { fee: 0, burn: 0 };

  if (skipRpc) {
    // Direct heuristic
    let totalBytes = 0;
    flat.forEach((p) => {
      if (p.parameter?.value) {
        totalBytes += extractBytesSize(p.parameter.value) + STORAGE_BYTE_OVERHEAD;
      }
    });
    const burn = Math.ceil((totalBytes * MUTEZ_PER_BYTE + flat.length * OP_BURN_OVERHEAD) * BURN_FACTOR);
    const fee  = flat.length * μBASE_TX_FEE * 1.2;
    return { fee, burn };
  }

  try {
    let feeMutez = 0;
    let burnMutez = 0;
    for (let i = 0; i < flat.length; i += chunkSize) {
      const chunk = flat.slice(i, i + chunkSize)
        .map((p) => ({ kind: OpKind.TRANSACTION, ...p }));
      const est = await toolkit.estimate.batch(chunk);
      feeMutez  += est.reduce((t, e) => t + e.suggestedFeeMutez, 0);
      burnMutez += est.reduce((t, e) => t + e.burnFeeMutez, 0);
    }
    return { fee: feeMutez, burn: burnMutez };
  } catch {
    /* heuristic fallback */
    return estimateChunked(toolkit, flat, chunkSize, true);
  }
}
/* What changed & why:
   • Added calcExactOverhead to precisely compute mint meta overhead.
   • Added MAX_OP_DATA_BYTES = 32_768.
   • Rev-bump r739; Compile-Guard passed.
*/
/* EOF */