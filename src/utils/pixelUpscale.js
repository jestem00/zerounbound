/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/pixelUpscale.js
  Rev :    r1     2025‑09‑16
  Summary: reusable CSS helpers for pixel‑art upscaling
──────────────────────────────────────────────────────────────*/
/**
 * Return inline‑style object that up‑scales an element with crisp,
 * nearest‑neighbour pixels.  Pass to the root media wrapper.
 *
 * @param {number} factor – integer scale ≥ 1
 * @returns {object}
 */
export function pixelUpscaleStyle(factor = 1) {
  const f = Math.max(1, Math.round(factor));
  return {
    transform        : `scale(${f})`,
    transformOrigin  : 'top left',
    imageRendering   : 'pixelated',
    /* Safari‑mobile fix */
    backfaceVisibility: 'hidden',
  };
}
/* EOF */
