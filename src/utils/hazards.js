/*──────── src/utils/hazards.js ────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/hazards.js
  Rev :    r7     2025‑09‑11
  Summary: formats[].mimeType/uri + smarter svg‑CID detection
──────────────────────────────────────────────────────────────*/
import { mimeFromFilename } from '../constants/mimeTypes.js';

/*──────── regex helpers ─────────────────────────────────────*/
const RE_DATA_HTML_JS =
  /^data:(?:text\/html|text\/javascript|application\/javascript)/i;
const RE_DATA_XML     =
  /^data:(?:application\/xml|text\/xml)/i;
const RE_DATA_SVG     =
  /^data:image\/svg\+xml/i;

const RE_HTML_EXT = /\.(?:html?|js)(?:[\?#]|$)/i;
const RE_XML_EXT  = /\.xml(?:[\?#]|$)/i;
const RE_SVG_EXT  = /\.svg(?:[\?#]|$)/i;

/*──────── helper: collect URIs & mimeTypes ─────────────────*/
function collectUris(meta) {
  const uris = [
    meta.artifactUri,
    meta.displayUri,
    meta.imageUri,
    meta.thumbnailUri,
  ].filter(Boolean).map(String);

  if (Array.isArray(meta.formats)) {
    meta.formats.forEach((f) => {
      if (f && typeof f === 'object') {
        if (f.uri)  uris.push(String(f.uri));
        if (f.url)  uris.push(String(f.url));           /* extra key guard */
      }
    });
  }
  return uris;
}

function collectMimes(meta) {
  const out = [];
  if (meta.mimeType) out.push(String(meta.mimeType).toLowerCase());

  if (Array.isArray(meta.formats)) {
    meta.formats.forEach((f) => {
      if (f && typeof f === 'object' && f.mimeType) {
        out.push(String(f.mimeType).toLowerCase());
      }
    });
  }
  return out;
}

/*──────── main detector ─────────────────────────────────────*/
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

  /* primary flags */
  const nsfwFlag     = tags.includes('nsfw')     || cr.includes('nsfw')   || cr.includes('mature');
  const flashingFlag = tags.includes('flash')    || tags.includes('flashing');

  /*──────────────── script‑risk heuristics ─────────────────*/
  const mimeList = collectMimes(m);

  /* MIME‑level script risk */
  const mimeScript = mimeList.some((mt) =>
    mt === 'text/html'
    || mt === 'application/javascript'
    || mt === 'application/x-directory'
    || mt === 'text/xml'
    || mt === 'application/xml'
    || mt === 'image/svg+xml',
  );

  /* URI‑level script risk */
  const uris = collectUris(m);

  const extScript = uris.some((u) =>
    RE_HTML_EXT.test(u)
    || RE_XML_EXT.test(u)
    || RE_SVG_EXT.test(u),
  );

  const dirScript = uris.some((u) =>
    mimeFromFilename(u) === 'application/x-directory',
  );

  const dataScript = uris.some((u) =>
    RE_DATA_HTML_JS.test(u)
    || RE_DATA_XML.test(u)
    || RE_DATA_SVG.test(u),
  );

  return {
    nsfw    : nsfwFlag,
    flashing: flashingFlag,
    scripts : mimeScript || extScript || dirScript || dataScript,
  };
}
/* EOF */
