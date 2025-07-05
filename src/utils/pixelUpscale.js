/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/pixelUpscale.js
  Rev :    r4     2025‑09‑24
  Summary: MIME‑aware scaling; skip pixelation for non‑raster
──────────────────────────────────────────────────────────────*/
/**
 * Produce inline style for crisp (nearest‑neighbour) scaling.
 * Pixel‑doubling is applied **only** when it makes visual sense
 * (raster images).  Vector / HTML / audio, etc. are left intact.
 *
 * @param {number} factor – scale multiplier (≥ 0.01)
 * @param {string} mime   – detected MIME (optional)
 * @returns {object}
 */
export function pixelUpscaleStyle(factor = 1, mime = '') {
  const f = Math.max(0.01, Number(factor));

  /* base transform */
  const style = {
    transform           : `scale(${f})`,
    transformOrigin     : 'center center',
    backfaceVisibility  : 'hidden',
  };

  /* raster‑only pixelation & only when actually enlarged   */
  const isRaster = mime.startsWith('image/')
                 && mime !== 'image/svg+xml'
                 && mime !== 'image/apng';
  if (isRaster && f > 1.01) style.imageRendering = 'pixelated';

  return style;
}
/* What changed & why:
   • Added optional `mime` param → enables MIME‑aware styling.
   • Pixel‑doubling (image‑rendering: pixelated) now applies
     **only** to enlarged raster images.
   • Vector formats & unscaled content stay fidelity‑perfect. */
/* EOF */
