/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/feeEstimator.js
  Rev :    r002   2025-07-07
  Summary: expose CHUNK_DEFAULT; doc tweaks
──────────────────────────────────────────────────────────────*/

/* µꜩ constants */
export const μPER_BYTE      = 250;     /* storage burn                  */
export const μBASE_TX_FEE   = 1_500;   /* conservative per-tx fee       */
export const CHUNK_DEFAULT  = 2;       /* default ops per sim           */

/*──────── helpers ───────────────────────────────────────────*/
export const toTez = (μ) => (μ / 1_000_000).toFixed(6);
export const calcSliceBytes = (hx = '0x') => (hx.length - 2) / 2;

/**
 * Deterministic storage-burn calculator.
 * @param {number}   metaBytes   plain-text metadata bytes
 * @param {string[]} tailSlices  extra hex slices (“0x…”)
 * @param {number}   editions    mint amount (≥ 1)
 */
export function calcStorageMutez(metaBytes = 0, tailSlices = [], editions = 1) {
  const tailBytes = tailSlices.reduce((t, s) => t + calcSliceBytes(s), 0);
  return (metaBytes + tailBytes) * editions * μPER_BYTE;
}

/**
 * RPC-safe estimator — splits `ops` into ≤`chunk` groups so
 * simulate_operation never hits the forge size or 10-op cap.
 * Falls back to μBASE_TX_FEE × ops on total RPC failure.
 */
export async function estimateChunked(toolkit, ops = [], chunk = CHUNK_DEFAULT) {
  let fee = 0; let burn = 0;
  for (let i = 0; i < ops.length; i += chunk) {
    const part = ops.slice(i, i + chunk);
    try {
      const est = await toolkit.estimate.batch(part);
      fee  += est.reduce((t, e) => t + e.suggestedFeeMutez, 0);
      burn += est.reduce((t, e) => t + e.burnFeeMutez,      0);
    } catch {                            /* entire sim failed */
      return { fee: ops.length * μBASE_TX_FEE, burn: 0 };
    }
  }
  return { fee, burn };
}
/* What changed & why:
   • Exposed CHUNK_DEFAULT for callers.
   • JSDoc clarified fallback logic & invariants (I85).
*/
/* EOF */
