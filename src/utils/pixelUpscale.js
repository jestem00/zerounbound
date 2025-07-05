/*──────── src/utils/pixelUpscale.js ────────*/
/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/pixelUpscale.js
  Rev :    r4     2025‑09‑24
  Summary: vector‑aware; skips pixelation for SVG/HTML
──────────────────────────────────────────────────────────────*/
/**
 * Produce inline style for crisp nearest‑neighbour scaling on
 * raster media, while leaving vector / HTML content untouched.
 *
 * @param {number} factor – scale multiplier (≥ 0.01)
 * @param {string} mime   – MIME type hint
 * @returns {object}
 */
export function pixelUpscaleStyle(factor = 1, mime = '') {
  const f = Math.max(0.01, Number(factor));

  const style = {
    transform       : `scale(${f})`,
    transformOrigin : 'center center',
    backfaceVisibility : 'hidden',
  };

  /* Only raster formats benefit from `pixelated`. */
  const isVectorish = /^image\/svg\+xml$|^text\/html$/.test(mime);
  if (!isVectorish) {
    style.imageRendering = 'pixelated';
  }
  return style;
}
/* What changed & why:
   • Accepts optional `mime`; omits `image-rendering: pixelated`
     for SVG / HTML to avoid unwanted smoothing artefacts.
   • Rev bumped to r4. */
/* EOF */
