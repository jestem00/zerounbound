/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/feeEstimator.js
  Rev :    r744   2025-09-05
  Summary: clamp gas limit; added MIN_GAS constant
──────────────────────────────────────────────────────────────*/
import { OpKind } from '@taquito/taquito';
import { Buffer } from 'buffer';
import { planHead, buildAppendCalls } from './slicing.js';

/*──────── chain‑wide constants ─────────────────────────────*/
export const MINIMAL_FEE_MUTEZ         = 100;     /* base per op */
export const MINIMAL_MUTEZ_PER_MILLIGAS = 0.1;    /* per milligas */
export const MINIMAL_MUTEZ_PER_BYTE     = 1;      /* per op byte */

export const μBASE_TX_FEE         = 150;      /* mutez – per op (actual avg) */
export const MUTEZ_PER_BYTE       = 250;      /* mutez / raw byte (Paris) */
export const GAS_PER_BYTE         = 1.8;      /* milligas per concat byte */
export const BASE_GAS_OVERHEAD    = 12000;    /* fixed gas per append op */
const STORAGE_BYTE_OVERHEAD       = 150;      /* fixed storage bytes overhead */
export const HARD_GAS_LIMIT       = 1_040_000;/* milligas per op */
export const HARD_STORAGE_LIMIT   = 60_000;   /* bytes increase per op */
export const HIGH_GAS_THRESHOLD   = 150_000;  /* bytes for high-gas */
export const MIN_GAS             = 10_000;   /* gas floor */
const BURN_FACTOR                 = 1.1;      /* over-est for safety */
const OP_BURN_OVERHEAD            = 1000;     /* mutez fixed per op */
export const MAX_OP_DATA_BYTES    = 32_768;   /* max param length */
const OP_SIZE_OVERHEAD            = 200;      /* forged bytes per op */
const PACKING_OVERHEAD            = 50;       /* per-batch packing est */

/*──────── unit helpers ─────────────────────────────────────*/
export const toTez = (m = 0) => (m / 1_000_000).toFixed(6);

/*──────── slice counter ─────────────────────────────────────*/
export function countSlices(dataUri = '') {
  const { remainingHex } = planHead(dataUri);
  const calls = buildAppendCalls({ contract: '', tokenId: 0, tailHex: remainingHex });
  const total = 1 + calls.length;
  return { expectedSlices: total, expectedSignatures: total };
}

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
  return Math.max(
    MIN_GAS,
    Math.min(
      HARD_GAS_LIMIT,
      Math.ceil(BASE_GAS_OVERHEAD + total * GAS_PER_BYTE),
    ),
  );
}
export function calcStorageByteLimit(appendedBytes = 0) {
  return Math.min(HARD_STORAGE_LIMIT, appendedBytes + STORAGE_BYTE_OVERHEAD);
}

/*──────── recursive bytes extractor ────────────────────────*/
function extractBytesSize(value) {
  if (typeof value === 'string') {
    if (value.startsWith('0x')) return (value.length - 2) / 2;
    if (/^[0-9a-fA-F]+$/.test(value)) return value.length / 2;
    return Buffer.byteLength(value, 'utf8');
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

/*──────── sim timeout detector ─────────────────────────────*/
export function isSimTimeout(e) {
  const msg = e?.message || String(e);
  return msg.includes('script') && msg.includes('took more time than the operation said');
}

/*──────── fast heuristic / RPC estimator ───────────────────*/
/**
 * estimateChunked(toolkit, flatParams[], chunkSize = 8, skipRpc = false, currentBytes=[])
 * Attempts RPC batch estimate; graceful heuristic fallback.
 * skipRpc forces heuristic (fast for large payloads).
 * Returns { ..., retrySmaller?:boolean } on sim timeout.
 */
export async function estimateChunked(toolkit, flat = [], chunkSize = 5, skipRpc = false, currentBytes = []) {
  if (!flat.length) return { fee: 0, burn: 0 };

  if (skipRpc) {
    // Direct heuristic
    let feeMutez = 0;
    let burnMutez = 0;
    flat.forEach((p, i) => {
      const paramBytes = extractBytesSize(p.parameter?.value || 0);
      const gas = calcGasLimit(paramBytes, currentBytes[i] || 0);
      const opSize = JSON.stringify(p).length + OP_SIZE_OVERHEAD + PACKING_OVERHEAD; // rough forged size
      feeMutez += MINIMAL_FEE_MUTEZ + gas * MINIMAL_MUTEZ_PER_MILLIGAS + opSize * MINIMAL_MUTEZ_PER_BYTE;
      burnMutez += (paramBytes + STORAGE_BYTE_OVERHEAD) * MUTEZ_PER_BYTE + OP_BURN_OVERHEAD;
    });
    feeMutez *= 1.2; // safety over-est
    burnMutez *= BURN_FACTOR;
    return { fee: Math.ceil(feeMutez), burn: Math.ceil(burnMutez) };
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
  } catch (e) {
    if (isSimTimeout(e)) {
      return { fee: 0, burn: 0, retrySmaller: true };
    }
    /* heuristic fallback */
    return estimateChunked(toolkit, flat, chunkSize, true, currentBytes);
  }
}
/* What changed & why:
   • Increased BURN_FACTOR to 1.1 for better safety.
   • Added PACKING_OVERHEAD=50 per op for batch encoding.
   • Rev-bump r743; Compile-Guard passed.
*/
/* EOF */