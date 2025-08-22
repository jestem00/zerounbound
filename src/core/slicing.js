/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/slicing.js
  Rev :    r1 2025-09-07
  Summary: canonical head/tail slicer and diff helpers
──────────────────────────────────────────────────────────────*/
import { bytes2Char } from '@taquito/utils';

/*──────── constants ─────*/
export const SLICE_MAX_BYTES   = 20_000;         /* optimistic default */
export const SLICE_MIN_BYTES   = 1_024;          /* minimum slice bytes */
export const PACKED_SAFE_BYTES = 31_000;         /* safe pack size */
export const HEADROOM_BYTES    = 512;            /* overhead headroom */

/*──────── helpers ─────*/
const bufFrom = (str='') => Buffer.from(str, 'utf8');
const hexOf   = (buf)   => buf.toString('hex');

/**
 * planHead(dataUri)
 * Splits a data URI into an initial head (utf8 string) that fits within
 * SLICE_MAX_BYTES while leaving HEADROOM_BYTES for Michelson overhead.
 */
export function planHead(dataUri='') {
  const fullBuf   = bufFrom(dataUri);
  const totalBytes= fullBuf.length;
  const headBytes = Math.min(totalBytes, SLICE_MAX_BYTES - HEADROOM_BYTES);
  const headBuf   = fullBuf.slice(0, headBytes);
  const tailBuf   = fullBuf.slice(headBytes);
  return {
    headStr: headBuf.toString('utf8'),
    headBytes,
    headHex: hexOf(headBuf),
    remainingHex: hexOf(tailBuf),
    totalBytes,
  };
}

/**
 * computeOnChainPrefix({ tzktBase, contract, tokenId })
 * Fetches current artifactUri from TzKT and returns as a string.
 */
export async function computeOnChainPrefix({ tzktBase, contract, tokenId }) {
  const url = `${tzktBase}/tokens?contract=${contract}&tokenId=${tokenId}&limit=1`;
  try {
    const rows = await (await fetch(url)).json();
    let art = rows?.[0]?.metadata?.artifactUri || '';
    if (art && /^0x[0-9a-fA-F]+$/.test(art)) art = bytes2Char(art);
    return String(art || '');
  } catch {
    return '';
  }
}

/**
 * cutTail({ fullStr, onChainPrefixStr })
 * Returns hex tail from first differing byte. Throws on mismatch.
 */
export function cutTail({ fullStr='', onChainPrefixStr='' }) {
  const fullBuf   = bufFrom(fullStr);
  const prefixBuf = bufFrom(onChainPrefixStr);
  const len = Math.min(fullBuf.length, prefixBuf.length);
  let i = 0;
  for (; i < len && fullBuf[i] === prefixBuf[i]; i++);
  if (i < prefixBuf.length && prefixBuf.slice(0, i).length !== prefixBuf.length) {
    throw new Error('on-chain prefix mismatch');
  }
  const tail = fullBuf.slice(prefixBuf.length);
  return tail.length ? hexOf(tail) : '';
}

/**
 * buildAppendCalls({ contract, tokenId, tailHex, packBudget })
 * Splits tailHex into <= SLICE_MAX_BYTES slices and returns call objects
 * for append_artifact_uri.
 */
export function buildAppendCalls({ contract, tokenId, tailHex='', packBudget = PACKED_SAFE_BYTES }) {
  void packBudget; // reserved for future packing heuristics
  const hx = tailHex.startsWith('0x') ? tailHex.slice(2) : tailHex;
  const out = [];
  const step = SLICE_MAX_BYTES * 2;
  for (let i = 0; i < hx.length; i += step) {
    const slice = hx.slice(i, i + step);
    out.push({ method: 'append_artifact_uri', args: [tokenId, `0x${slice}`], contract });
  }
  return out;
}

/* EOF */