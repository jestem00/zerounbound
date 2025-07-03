/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/hazards.js
  Rev :    r3     2025‑08‑23
  Summary: broader script heuristics incl. *.html & x‑directory
──────────────────────────────────────────────────────────────*/
import { mimeFromFilename } from '../constants/mimeTypes.js';

/**
 * Inspect metadata to flag content hazards.
 * Accepts null / malformed input safely.
 *
 * @param {object|null|undefined} meta tzmetadata or contract metadata obj
 * @returns {{nsfw:boolean, flashing:boolean, scripts:boolean}}
 */
export default function detectHazards(meta) {
  const m = meta && typeof meta === 'object' ? meta : {};

  /* normalise tags/content rating */
  const tags = Array.isArray(m.tags)
    ? m.tags.map((t) => String(t).toLowerCase())
    : [];

  const cr   = String(m.contentRating || '').toLowerCase();
  const mime = String(m.mimeType || '').toLowerCase();

  /* heuristic script detection */
  const likelyHtmlMime =
    mime === 'text/html' ||
    mime === 'application/javascript' ||
    mime === 'application/x-directory';

  /* inspect URI extensions when mime absent */
  const uris = [
    m.artifactUri,
    m.displayUri,
    m.imageUri,
    m.thumbnailUri,
  ].filter(Boolean).map(String);

  const htmlExt = uris.some((u) => /\.(html?|htm)([\?#]|$)/i.test(u));
  const dirMime = uris.some((u) => mimeFromFilename(u) === 'application/x-directory');

  return {
    nsfw:
      tags.includes('nsfw') ||
      cr.includes('nsfw')   ||
      cr.includes('mature'),
    flashing: tags.includes('flash') || tags.includes('flashing'),
    scripts : likelyHtmlMime || htmlExt || dirMime,
  };
}
/* What changed & why (r3):
   • Flags scripts when mime is “application/x-directory” or URI ends
     in .html/htm — restores consent overlay for interactive tokens.
   • Reused mimeFromFilename to keep single‑source extension logic. */
