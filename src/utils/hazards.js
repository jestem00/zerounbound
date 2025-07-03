/*──────────────── src/utils/hazards.js ────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/hazards.js
  Rev :    r4     2025‑08‑25
  Summary: data‑URI script detection + stricter HTML heuristics
──────────────────────────────────────────────────────────────*/
import { mimeFromFilename } from '../constants/mimeTypes.js';

/*──────── regex helpers ─────────────────────────────────────*/
const RE_DATA_HTML_JS =
  /^data:(?:text\/html|text\/javascript|application\/javascript)/i;
const RE_HTML_EXT = /\.(?:html?|js)(?:[\?#]|$)/i;

/**
 * Inspect metadata to flag content hazards.
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
  const mime = String(m.mimeType       || '').toLowerCase();

  /* quick flags */
  const nsfwFlag     = tags.includes('nsfw')     || cr.includes('nsfw')   || cr.includes('mature');
  const flashingFlag = tags.includes('flash')    || tags.includes('flashing');

  /* MIME‑level script risk */
  const mimeScript =
    mime === 'text/html'
    || mime === 'application/javascript'
    || mime === 'application/x-directory';

  /* URI‑level script risk */
  const uris = [
    m.artifactUri,
    m.displayUri,
    m.imageUri,
    m.thumbnailUri,
  ].filter(Boolean).map(String);

  const extScript  = uris.some((u) => RE_HTML_EXT.test(u));
  const dirScript  = uris.some((u) => mimeFromFilename(u) === 'application/x-directory');
  const dataScript = uris.some((u) => RE_DATA_HTML_JS.test(u));

  return {
    nsfw    : nsfwFlag,
    flashing: flashingFlag,
    scripts : mimeScript || extScript || dirScript || dataScript,
  };
}
/* What changed & why (r4):
   • Added RE_DATA_HTML_JS to flag data:text/html|javascript URIs.
   • Extended extScript check to .js files.
   • Consolidated boolean logic for clarity and zero false‑negatives. */
/* EOF */
