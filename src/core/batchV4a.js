/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/batchV4a.js
  Rev :    r819   2025-07-12 T09:02 UTC
  Summary: dynamic storageLimit per slice – prevents overflow
─────────────────────────────────────────────────────────────*/
import { OpKind } from '@taquito/taquito';

/*──────── slice limits ─────*/
export const SLICE_SAFE_BYTES = 20_000;          // Beacon hard-cap
export const HEADROOM_BYTES   = 1_024;           // gas/stack overhead
export const SLICE_BYTES_SOFT = SLICE_SAFE_BYTES - HEADROOM_BYTES;

/*──────── static defaults (retain) ─────*/
const FEE_MUTEZ  = 1_800;        /* ≈0.0018ꜩ flat fee                      */
const GAS_LIMIT  = 180_000;      /* generous, covers worst-case Δ big-map   */
const EXTRA_PAD  = 128;          /* storage head-room bytes per slice       */

/*──────── helpers ─────────*/
const strip0x = (h = '') => (h.startsWith('0x') ? h.slice(2) : h);

/** Split a *hex* string (with / without 0x) into byte-safe chunks. */
export function sliceHex (hexStr = '', maxBytes = SLICE_BYTES_SOFT) {
  const hex  = strip0x(hexStr);
  const step = maxBytes * 2;           // 2 hex chars == 1 byte
  const out  = [];
  for (let i = 0; i < hex.length; i += step) out.push(hex.slice(i, i + step));
  return out;
}

/*──────── append_token_metadata builder ─────────*/
/**
 * Build append_token_metadata operations with per-slice storageLimit
 * sized to its payload (+ EXTRA_PAD safety).  Eliminates
 * “wrote more bytes than the operation said it would” error.
 *
 * • key is always **extrauri_<idx>** (no collisions).
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

  /* derive starting index from optional “extrauri_X” legacy param */
  let base = 0;
  if (/^extrauri_\d+$/i.test(keyOrIdx)) base = parseInt(keyOrIdx.split('_')[1] || '0', 10);

  const c = await toolkit.wallet.at(contractAddr);

  return slices.map((hexStr, idx) => {
    const bodyHex     = strip0x(hexStr);
    const sliceBytes  = bodyHex.length / 2;
    const storageNeed = sliceBytes + EXTRA_PAD;      // bytes added to big-map

    return {
      kind: OpKind.TRANSACTION,
      ...(c.methods.append_token_metadata(
        `extrauri_${base + idx}`,
        tokenId,
        `0x${bodyHex}`,
      ).toTransferParams()),
      fee         : FEE_MUTEZ,
      gasLimit    : GAS_LIMIT,
      storageLimit: storageNeed,                    // dynamic!
    };
  });
}
/* What changed & why:
   • storageLimit now computed per slice: payload bytes + 128 pad.
   • Removes fixed 550 byte cap that overflowed on large chunks.
   • Rest logic & API unchanged – callers need no modification.
*/
/* EOF */
