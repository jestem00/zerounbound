/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/batchV4a.js
  Rev :    r860   2025‑08‑16 UTC
  Summary: parity with v4 slice utilities – adds diff helpers,
           packed splitter, PACKED_SAFE_BYTES, origLonger flag.
──────────────────────────────────────────────────────────────*/
import { OpKind } from '@taquito/taquito';

/*──────── public constants ───────────────────────────*/
export const SLICE_SAFE_BYTES  = 20_000;          // Beacon hard‑cap
export const HEADROOM_BYTES    = 1_024;           // gas / stack overhead
export const SLICE_BYTES_SOFT  = SLICE_SAFE_BYTES - HEADROOM_BYTES;
export const PACKED_SAFE_BYTES = 31_000;          // ≤ Beacon 32 k envelope

/*──────── static defaults ───────────────────────────*/
const FEE_MUTEZ  = 1_800;     // ≈ 0.0018ꜩ flat
const GAS_LIMIT  = 180_000;   // generous safety‑margin
const EXTRA_PAD  = 128;       // storage head‑room bytes per slice

/*──────── helpers ───────────────────────────────────*/
const strip0x = (h = '') => (h.startsWith('0x') ? h.slice(2) : h);

/** Split a *hex* string (with / without 0x) into byte‑safe chunks. */
export function sliceHex (hexStr = '', maxBytes = SLICE_BYTES_SOFT) {
  const hex  = strip0x(hexStr);
  const step = maxBytes * 2;                      // 2 hex chars = 1 byte
  const out  = [];
  for (let i = 0; i < hex.length; i += step) out.push(hex.slice(i, i + step));
  return out;
}

/*──────── diff helper – sliceTail ───────────────────*/
/**
 * Detect missing tail bytes of `fullHex` relative to `origHex`.
 * Returns { tail[], conflict:boolean, origLonger?:boolean }.
 */
export function sliceTail (origHex = '0x', fullHex = '0x') {
  if (!origHex.startsWith('0x') || !fullHex.startsWith('0x')) {
    throw new Error('hex must start with 0x');
  }
  const orig = origHex.slice(2);
  const full = fullHex.slice(2);

  if (orig.length > full.length) {
    return { tail: [], conflict: true, origLonger: true };
  }
  if (full.startsWith(orig)) {
    const diff = full.slice(orig.length);
    return diff
      ? { tail: sliceHex(diff).map((h) => `0x${h}`), conflict: false }
      : { tail: [], conflict: false };
  }
  return { tail: [], conflict: true };
}

/*──────── packed splitter ───────────────────────────*/
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

/*──────── append_token_metadata builder ─────────────*/
/**
 * Build append_token_metadata ops with per‑slice storageLimit.
 * `key` may be 'artifactUri' or 'extrauri_<idx>'.
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

  let base = 0;
  let label = key;
  if (/^extrauri_\d+$/i.test(key)) {
    const [, idxStr] = key.split('_');
    label = 'extrauri_';
    base  = parseInt(idxStr || '0', 10);
  }

  const c = await toolkit.wallet.at(contractAddr);

  return slices.map((hexStr, idx) => {
    const bodyHex     = strip0x(hexStr);
    const sliceBytes  = bodyHex.length / 2;
    const storageNeed = sliceBytes + EXTRA_PAD;

    return {
      kind: OpKind.TRANSACTION,
      ...(c.methods.append_token_metadata(
        label === 'extrauri_' ? `${label}${base + idx}` : label,
        tokenId,
        `0x${bodyHex}`,
      ).toTransferParams()),
      fee         : FEE_MUTEZ,
      gasLimit    : GAS_LIMIT,
      storageLimit: storageNeed,
    };
  });
}
/* EOF */
