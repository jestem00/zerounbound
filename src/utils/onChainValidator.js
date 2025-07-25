/*──────── src/utils/onChainValidator.js ────────*/
/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/onChainValidator.js
  Rev :    r18    2025‑07‑25
  Summary: tighten bare‑domain regex to avoid matching short
           property names (e.g. `bb.width/2`).  The updated
           REMOTE_BARE_RE now requires each domain segment to
           contain at least three characters, eliminating false
           positives when scanning JavaScript inside SVGs.
──────────────────────────────────────────────────────────────*/
import { asciiPrintable } from '../core/validator.js';

/*──────── regex library ─────────────────────────────────────*/
// Control characters used to detect unprintable sequences.
const RE_CTRL        = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// Remove XML namespace declarations before scanning bodies.
const STRIP_XMLNS_RE = /\s+xmlns(?:[:\w]+)?="[^"]*"/gi;
// Strip CDATA markers; content remains intact.
const STRIP_CDATA_RE = /<!\[CDATA\[|\]\]>/g;
// Mask embedded base64 data URIs to prevent spurious matches.
const MASK_B64_RE    = /data:[^;]+;base64,[A-Za-z0-9+/=]+/gi;

// Scheme‑qualified remote references (HTTP, IPFS, etc.).
const REMOTE_SCHEME_RE =
  /\b(?:https?|ipfs|ipns|ar|ftp):\/\/[^\s"'<>]+/gi;

/*
 * Match bare domain references (without a scheme) to capture
 * links like "example.com/foo".  This regex intentionally does
 * **not** include the case‑insensitive flag.  In earlier
 * revisions, we compiled this pattern with the /i flag which
 * caused false positives on code patterns such as `Math.PI/…`.
 * In this revision we further tighten the pattern to avoid
 * matching short property accesses inside scripts (e.g.
 * `bb.width/2`).  The domain segment must now be at least three
 * characters long to qualify as a bare domain.  See issue #1002
 * for details.
 */
const REMOTE_BARE_RE =
  /\b(?:[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\.)+(?:[a-z]{2,63}|onion)\/[^\s"'<>]*/g;

// CSS @import rules indicate external stylesheets.
const IMPORT_RE      = /@import\s+url\(/i;
/* NOTE: <script> tags no longer affect integrity scoring. */

// URI‑like metadata keys (case‑insensitive).
const URI_KEY_RE     = /(artifact|display|thumbnail|image|extrauri_).*uri$/i;

// MIME types considered textual – used when decoding data URIs.
const TEXTUAL_MIME_RE =
  /^(text\/|application\/(json|javascript|ecmascript|xml)|image\/svg)/i;

/* SAFE remotes – scheme optional so bare “www.w3.org/*” passes.
 * These domains are considered safe and do not contribute to the
 * remote‑reference count.  Do **not** whitelist application
 * domains here; only standards bodies and metadata authorities
 * should be included.  See invariants I24 and I99.
 */
const SAFE_REMOTE_RE =
  /\b(?:https?:\/\/)?(?:creativecommons\.org|schema\.org|purl\.org|www\.w3\.org)[^\s"'<>]*/i;

/*──────── utils ─────────────────────────────────────────────*/
/**
 * Heuristic to detect binary content by sampling the first 512
 * characters and counting characters outside the printable range.
 * Returns true when more than ~35% of the sample is non‑printable.
 *
 * @param {string} str
 * @returns {boolean}
 */
function isLikelyBinary(str = '') {
  const sample = str.slice(0, 512);
  let weird = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const c = sample.charCodeAt(i);
    if (c < 9 || c > 240) weird += 1;
  }
  return weird / (sample.length || 1) > 0.35;
}

/**
 * Decode a data URI when the payload is textual.  Unknown or
 * non‑textual MIME types return an empty string.
 *
 * @param {string} uri
 * @returns {string}
 */
function decodeDataUri(uri = '') {
  if (!uri.startsWith('data:')) return '';
  const [, meta = '', payload = ''] = uri.match(/^data:([^,]*),(.*)$/s) || [];
  if (!TEXTUAL_MIME_RE.test(meta)) return '';
  try {
    return /;base64/i.test(meta) ? atob(payload) : decodeURIComponent(payload);
  } catch { return ''; }
}

/**
 * Extract a body string from metadata by decoding the first URI‑like
 * field that yields textual content.  Returns an empty string when
 * none are found.
 *
 * @param {Object} meta
 * @returns {string}
 */
function deriveBody(meta) {
  for (const [k, v] of Object.entries(meta)) {
    if (URI_KEY_RE.test(k) && typeof v === 'string') {
      const txt = decodeDataUri(v);
      if (txt) return txt;
    }
  }
  return '';
}

/*──────── main entry ───────────────────────────────────────*/
/**
 * Determine whether a token is fully on‑chain, partially on‑chain
 * or unknown by inspecting its metadata and body.  The integrity
 * score is 5 for fully on‑chain and 3 otherwise.  Reasons for
 * degraded status are included in the return value for debugging.
 *
 * @param {Object} meta – decoded token metadata
 * @returns {{ status: string, score: number, reasons: string[] }}
 */
export function checkOnChainIntegrity(meta = {}) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { status: 'unknown', score: 0, reasons: ['metadata missing'] };
  }

  const reasons = new Set();
  let remoteCnt = 0;

  /*── explicit URI fields ─*/
  const scanVal = (val, key) => {
    if (typeof val !== 'string') return;
    const v = val.trim();
    if (!v || v.startsWith('#')) return;       // ignore empty / fragment refs
    if (!v.startsWith('data:')) { remoteCnt += 1; reasons.add(`${key} remote`); }
    /* script flag removed – handled by hazards.js */
  };

  Object.entries(meta).forEach(([k, v]) => {
    if (URI_KEY_RE.test(k)) scanVal(v, k);
  });

  /*── deep scan body ─*/
  const bodyTxt = typeof meta.body === 'string' ? meta.body : deriveBody(meta);
  if (bodyTxt && !isLikelyBinary(bodyTxt)) {
    const txt = bodyTxt
      .replace(STRIP_XMLNS_RE, '')
      .replace(STRIP_CDATA_RE, '')
      .replace(MASK_B64_RE, '');

    const matches = [
      ...(txt.match(REMOTE_SCHEME_RE) || []),
      ...(txt.match(REMOTE_BARE_RE)   || []),
    ];
    const unsafe = matches.filter((u) => !SAFE_REMOTE_RE.test(u));
    if (unsafe.length) { remoteCnt += 1; reasons.add('body remote refs'); }

    if (IMPORT_RE.test(txt)) { remoteCnt += 1; reasons.add('body remote @import'); }
    /* script flag removed – handled by hazards.js */
    if (RE_CTRL.test(txt))   reasons.add('body non‑printable chars');
  }

  /*── printable‑JSON guard ─*/
  const metaSansBody = { ...meta };
  delete metaSansBody.body;
  if (!asciiPrintable(JSON.stringify(metaSansBody))) reasons.add('metadata non‑printable chars');

  /*── verdict ─*/
  const printableOK = ![...reasons].some((r) => r.includes('non‑printable'));
  const status      = remoteCnt === 0 && printableOK ? 'full' : 'partial';

  return { status, score: status === 'full' ? 5 : 3, reasons: [...reasons] };
}

/* What changed & why (r18):
   • Tightened REMOTE_BARE_RE to require domain segments of at least
     three characters, eliminating false positives on property
     accesses like `bb.width/2` inside SVG scripts.
   • Retained the case‑sensitive pattern to avoid matching
     uppercase constants (e.g. `Math.PI`).  These changes ensure
     generative SVGs with embedded JavaScript are correctly
     classified as fully on‑chain when they contain no true remote
     references.                                                  */
