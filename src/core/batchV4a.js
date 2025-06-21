/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/batchV4a.js
  Rev :    r816   2025-07-12 T05:02 UTC
  Summary: key-less slice builder → always extrauri_N,
           back-compat preserved, no dup keys
─────────────────────────────────────────────────────────────*/
import { OpKind } from '@taquito/taquito';

/*──────── slice limits ─────*/
export const SLICE_SAFE_BYTES = 16_384;          // Beacon hard-cap
export const HEADROOM_BYTES   = 1_024;           // gas/stack overhead
export const SLICE_BYTES_SOFT = SLICE_SAFE_BYTES - HEADROOM_BYTES;

/*──────── static simulation-skip limits (I85) ─────────*/
const FEE_MUTEZ     = 1_800;     /* ≈0.0018ꜩ */
const GAS_LIMIT     = 180_000;
const STORAGE_LIMIT = 550;

/*──────── helpers ─────────*/
const strip0x = (h = '') => (h.startsWith('0x') ? h.slice(2) : h);

/** Split a *hex* string (with / without 0x) into byte-safe chunks. */
export function sliceHex (hexStr = '', maxBytes = SLICE_BYTES_SOFT) {
  const hex  = strip0x(hexStr);
  const step = maxBytes * 2;            // 2 hex chars == 1 byte
  const out  = [];
  for (let i = 0; i < hex.length; i += step) out.push(hex.slice(i, i + step));
  return out;
}

/*──────── append_token_metadata builder ─────────*/
/**
 * Build append_token_metadata operations with fixed fee/gas/storage.
 * • `toolkit`       – Taquito toolkit instance (wallet API)
 * • `contractAddr`  – KT1-collection address
 * • `keyOrIdx`      – *legacy* param (ignored unless “extrauri_<n>”)
 * • `tokenId`       – nat
 * • `slices`        – array of HEX strings (no 0x needed)
 *
 * Every slice is mapped to **extrauri_<idx>**, guaranteeing monotonic,
 * non-colliding keys required by the v4a contract.
 */
export async function buildAppendTokenMetaCalls (
  toolkit,
  contractAddr,
  keyOrIdx = 'artifactUri',
  tokenId,
  slices  = [],
) {
  if (!toolkit)      throw new Error('Toolkit required');
  if (!contractAddr) throw new Error('contractAddr required');
  if (!slices.length) return [];

  /* derive base index from optional “extrauri_X” arg for b/c */
  let base = 0;
  if (/^extrauri_\d+$/i.test(keyOrIdx)) {
    base = parseInt(keyOrIdx.split('_')[1] || '0', 10);
  }

  const c = await toolkit.wallet.at(contractAddr);

  return slices.map((hexStr, idx) => ({
    kind: OpKind.TRANSACTION,
    ...(c.methods.append_token_metadata(
      `extrauri_${base + idx}`,
      tokenId,
      hexStr.startsWith('0x') ? hexStr : `0x${hexStr}`,
    ).toTransferParams()),
    fee         : FEE_MUTEZ,
    gasLimit    : GAS_LIMIT,
    storageLimit: STORAGE_LIMIT,
  }));
}
/* What changed & why:
   • Removed conditional key logic – each call now writes
     extrauri_<n> (0-based) to prevent duplicate “artifactUri”.
   • Retained 4-arg signature; parses legacy “extrauri_X” to allow
     custom base offsets if ever needed.
*/
/* EOF */
