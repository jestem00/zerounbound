/*──────── src/utils/hazards.js ──────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/hazards.js
  Rev :    r9     2025‑09‑13
  Summary: tightened script heuristics – removed blanket SVG flag
──────────────────────────────────────────────────────────────*/
import { mimeFromFilename } from '../constants/mimeTypes.js';

/*──────── regex helpers ─────────────────────────────────────*/
const RE_DATA_HTML_JS =
  /^data:(?:text\/html|text\/javascript|application\/javascript)/i;
const RE_DATA_XML     =
  /^data:(?:application\/xml|text\/xml)/i;

const RE_HTML_EXT = /\.(?:html?|js)(?:[\?#]|$)/i;
const RE_XML_EXT  = /\.xml(?:[\?#]|$)/i;
const RE_SVG_SCRIPT = /<script[\s>]/i;              /* inline <script> test */
const RE_IPFS_FILENAME = /filename=([^&]+)/i;

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
        if (f.uri) uris.push(String(f.uri));
        if (f.url) uris.push(String(f.url));
      }
    });
  }
  return uris;
}

function collectMimes(meta) {
  const list = [];
  if (meta.mimeType) list.push(String(meta.mimeType).toLowerCase());

  if (Array.isArray(meta.formats)) {
    meta.formats.forEach((f) => {
      if (f && typeof f === 'object' && f.mimeType) {
        list.push(String(f.mimeType).toLowerCase());
      }
    });
  }
  return list;
}

function extFromIpfsFilename(uri = '') {
  try {
    const [, fn] = uri.match(RE_IPFS_FILENAME) || [];
    if (!fn) return '';
    return mimeFromFilename(decodeURIComponent(fn));
  } catch {
    return '';
  }
}

/*──────── main detector ───────────────────────────────────*/
export default function detectHazards(meta) {
  const m = meta && typeof meta === 'object' ? meta : {};

  const tags = Array.isArray(m.tags)
    ? m.tags.map((t) => String(t).toLowerCase())
    : [];

  const cr = String(m.contentRating || '').toLowerCase();

  const nsfwFlag     = tags.includes('nsfw')  || cr.includes('mature');
  const flashingFlag = tags.includes('flash') || tags.includes('flashing');

  /*── refined script‑risk heuristics ───────────────────────*/
  const mimeList = collectMimes(m);
  const uris     = collectUris(m);

  const mimeScript = mimeList.some((mt) =>
    mt === 'text/html'
    || mt === 'application/javascript'
    || mt === 'application/x-directory',
  );

  const extScript = uris.some((u) =>
    RE_HTML_EXT.test(u) || RE_XML_EXT.test(u),
  );

  const dataScript = uris.some((u) =>
    RE_DATA_HTML_JS.test(u) || RE_DATA_XML.test(u),
  );

  /* ipfs?filename= sniff */
  const ipfsFileScript = uris.some((u) => {
    const guess = extFromIpfsFilename(u);
    return guess === 'text/html';
  });

  /* inline <script> inside exposed textual payload */
  const inlineSvgScript = mimeList.includes('image/svg+xml')
    && (m.body && typeof m.body === 'string' && RE_SVG_SCRIPT.test(m.body));

  const scripts = mimeScript || extScript || dataScript
    || ipfsFileScript || inlineSvgScript;

  return {
    nsfw    : nsfwFlag,
    flashing: flashingFlag,
    scripts,
  };
}
/* What changed & why (r9):
   • Removed overly broad “blindSvg” rule – avoids false script flags.
   • Inline SVG script detection now checks for actual <script> tags.
*/
