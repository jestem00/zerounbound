/*──────── src/utils/pixelUpscale.js ────────*/
/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/pixelUpscale.js
  Rev :    r4     2025‑09‑24
  Summary: mime‑aware pixelation toggle
──────────────────────────────────────────────────────────────*/
/**
 * Produce inline style for crisp nearest‑neighbour scaling.
 *
 * @param {number} factor – scale multiplier (≥ 0.01)
 * @param {string} mime   – optional mime‑type
 * @returns {object}
 */
export function pixelUpscaleStyle(factor = 1, mime = '') {
  const f = Math.max(0.01, Number(factor));
  const style = {
    transform       : `scale(${f})`,
    transformOrigin : 'center center',
    backfaceVisibility: 'hidden',
  };

  /* pixelation only for raster images */
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') {
    style.imageRendering = 'pixelated';
  }

  return style;
}
/* What changed & why:
   • Accepts optional `mime`; omits `imageRendering: pixelated`
     for SVG, HTML, audio, etc.                                              */
/* EOF */
