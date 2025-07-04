/*──────── src/utils/hazards.js ──────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/hazards.js
  Rev :    r10    2025‑09‑18
  Summary: detects inline‑script SVG data URIs
           • decodes data:image/svg+xml and scans for <script>
           • restores script‑toggle on generative SVG tokens
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

/* decode textual data:URIs (SVG focus) */
function decodeDataUri(uri = '') {
  if (!uri.startsWith('data:')) return '';
  const [, meta = '', payload = ''] = uri.match(/^data:([^,]*),(.*)$/s) || [];
  if (!/image\/svg\+xml/i.test(meta)) return '';
  try {
    return /;base64/i.test(meta) ? atob(payload) : decodeURIComponent(payload);
  } catch {
    return '';
  }
}

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

  /* inline SVG data‑URI script test */
  let svgDataScript = false;
  for (const u of uris) {
    if (u.startsWith('data:image/svg+xml')) {
      const txt = decodeDataUri(u);
      if (txt && RE_SVG_SCRIPT.test(txt)) {
        svgDataScript = true;
        break;
      }
    }
  }

  /* inline <script> inside explicit body */
  const inlineSvgScript = mimeList.includes('image/svg+xml')
    && (m.body && typeof m.body === 'string' && RE_SVG_SCRIPT.test(m.body));

  const scripts = mimeScript || extScript || dataScript
    || ipfsFileScript || inlineSvgScript || svgDataScript;

  return {
    nsfw    : nsfwFlag,
    flashing: flashingFlag,
    scripts,
  };
}
/* What changed & why (r10):
   • Added `svgDataScript` detection — decodes data:image/svg+xml URIs
     and flags when an inline <script> tag is found.
   • Restores script‑toggle visibility on generative SVG assets while
     keeping static SVGs script‑free. */
