/*─────────────────────────────────────────────────────────────
  Developed by @jestemzero – ZeroContract Studio
  File:    src/core/mintEstimator.js
  Rev :    r1   2026-04-29
  Summary: Pure-math fee estimation for mint and repair pipelines.
           No RPC calls. Reusable across Mint.jsx, Repair.jsx, etc.
           Based on Paris protocol storage constants from feeEstimator.js.
──────────────────────────────────────────────────────────────*/

import {
  μBASE_TX_FEE,
  MUTEZ_PER_BYTE,
  OP_BURN_OVERHEAD,
  BURN_FACTOR,
  toTez,
} from './feeEstimator.js';

import { SLICE_MAX_BYTES, HEADROOM_BYTES } from './slicing.js';

/*──────── constants ─────────────────────────────────────────*/
const META_PAD_BYTES   = 1_000;   /* head-room for metadata overhead */
const MINT_OP_OVERHEAD = 360;     /* Michelson frame bytes per mint op */

/**
 * estimateMintCost(metaBytes, appendSlices, editions)
 *
 * Pure math estimate for a mint + optional append pipeline.
 * No RPC calls. Safe upper bound. Reusable for repair.
 *
 * @param {number}   metaBytes     - raw metadata bytes (before hex encoding)
 * @param {string[]} appendSlices  - array of 0x-prefixed hex slices for append
 * @param {number}   editions      - number of editions being minted
 *
 * @returns {{
 *   feeTez:     string,   // estimated network fee in tez
 *   storageTez: string,   // estimated storage burn in tez
 *   opCount:    number,   // total operations (1 mint + N appends)
 *   feeMutez:   number,
 *   burnMutez:  number,
 * }}
 */
export function estimateMintCost(
  metaBytes  = 0,
  appendSlices = [],
  editions   = 1,
) {
  const appendCount = Array.isArray(appendSlices) ? appendSlices.length : 0;
  const opCount     = 1 + appendCount;   // 1 mint + N appends

  // Fee: conservative flat rate per operation
  const feeMutez = opCount * μBASE_TX_FEE;

  // Storage burn: metadata bytes + per-slice bytes + per-op overhead
  const paddedMetaBytes  = (metaBytes + META_PAD_BYTES + MINT_OP_OVERHEAD);
  const appendBytes      = appendSlices.reduce(
    (sum, hx) => sum + Math.max(0, (hx.length - 2) / 2),   // strip 0x prefix
    0,
  );
  const totalStorageBytes = paddedMetaBytes + appendBytes;
  const burnMutez = Math.ceil(
    (totalStorageBytes * MUTEZ_PER_BYTE + appendCount * OP_BURN_OVERHEAD) * BURN_FACTOR,
  );

  return {
    feeTez    : toTez(feeMutez),
    storageTez: toTez(burnMutez),
    opCount,
    feeMutez,
    burnMutez,
  };
}

/**
 * estimateRepairCost(appendSlices)
 *
 * Estimate for a repair-only append pipeline (no mint op).
 * Used when resuming an interrupted upload.
 *
 * @param {string[]} appendSlices  - remaining 0x-prefixed hex slices to append
 *
 * @returns {{
 *   feeTez:     string,
 *   storageTez: string,
 *   opCount:    number,
 *   feeMutez:   number,
 *   burnMutez:  number,
 * }}
 */
export function estimateRepairCost(appendSlices = []) {
  const opCount = Array.isArray(appendSlices) ? appendSlices.length : 0;
  if (!opCount) return { feeTez: '0.000000', storageTez: '0.000000', opCount: 0, feeMutez: 0, burnMutez: 0 };

  const feeMutez  = opCount * μBASE_TX_FEE;
  const appendBytes = appendSlices.reduce(
    (sum, hx) => sum + Math.max(0, (hx.length - 2) / 2),
    0,
  );
  const burnMutez = Math.ceil(
    (appendBytes * MUTEZ_PER_BYTE + opCount * OP_BURN_OVERHEAD) * BURN_FACTOR,
  );

  return {
    feeTez    : toTez(feeMutez),
    storageTez: toTez(burnMutez),
    opCount,
    feeMutez,
    burnMutez,
  };
}

/**
 * countAppendOps(artifactHex)
 *
 * Count how many append_artifact_uri operations a given artifact hex
 * will require, given the current SLICE_MAX_BYTES constant.
 * Useful for displaying "~N signatures required" before the user commits.
 *
 * @param {string} artifactHex  - full 0x-prefixed hex of the artifact
 * @returns {number}
 */
export function countAppendOps(artifactHex = '0x') {
  const body = artifactHex.startsWith('0x') ? artifactHex.slice(2) : artifactHex;
  const usableBytes = SLICE_MAX_BYTES - HEADROOM_BYTES;
  return Math.ceil(body.length / 2 / usableBytes);
}

/* EOF */
