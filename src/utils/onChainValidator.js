/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/onChainValidator.js
  Rev :    r10   2025-07-27
  Summary: whitelist regex fixed – JS-compatible single line
──────────────────────────────────────────────────────────────*/
import { asciiPrintable } from '../core/validator.js';

/*──────────────── helper regexes ────────────────────────────*/
const RE_CTRL          = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;     // C0 only – C1 allowed
const STRIP_XMLNS_RE   = /\s+xmlns(?:[:\w]+)?="[^"]*"/gi;
const STRIP_CDATA_RE   = /<!\[CDATA\[|\]\]>/g;
const MASK_B64_RE      = /data:[^;]+;base64,[A-Za-z0-9+/=]+/gi;
const REMOTE_RE        = /\b(?:https?|ipfs|ipns|ar):\/\/[^\s"'<>]+/gi;
const IMPORT_RE        = /@import\s+url\(/i;
const SCRIPT_RE        = /<script/i;

const URI_KEY_RE       = /(artifact|display|thumbnail|image|extrauri_).*uri$/i;
const TEXTUAL_MIME_RE  = /^(text\/|application\/(json|javascript|ecmascript|xml)|image\/svg)/i;

/*──────────────── whitelisted remote URL fragments ─────────*/
/**
 * URLs that are safe to embed as plain‑text references inside
 * on‑chain SVG/RDF metadata. These are not dereferenced by the
 * renderer and therefore do not break the FOC invariant.
 * Add patterns conservatively.
 */
const SAFE_REMOTE_RE = /\bhttps?:\/\/(?:creativecommons\.org|schema\.org|purl\.org|www\.w3\.org)[^\s"'<>]*/i;

/*──────────────── low‑level utils ──────────────────────────*/
/** quick heuristic: ≥ 35 % bytes < 9 or > 240 in first 512 B ⇒ binary */
function isLikelyBinary(str = '') {
  const sample = str.slice(0, 512);
  let weird = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const c = sample.charCodeAt(i);
    if (c < 9 || c > 240) weird += 1;
  }
  return weird / (sample.length || 1) > 0.35;
}

/** decode textual data:URI → string; returns '' when not decodable */
function decodeDataUri(uri = '') {
  if (!uri.startsWith('data:')) return '';
  const [, meta = '', payload = ''] = uri.match(/^data:([^,]*),(.*)$/s) || [];
  if (!TEXTUAL_MIME_RE.test(meta)) return '';
  try {
    return /;base64/i.test(meta) ? atob(payload) : decodeURIComponent(payload);
  } catch {
    return '';
  }
}

/** fallback: derive decodable body from first textual *Uri field */
function deriveBody(meta) {
  for (const [k, v] of Object.entries(meta)) {
    if (URI_KEY_RE.test(k) && typeof v === 'string') {
      const txt = decodeDataUri(v);
      if (txt) return txt;
    }
  }
  return '';
}

/*──────────────── main entry ───────────────────────────────*/
/**
 * Heuristic fully‑ / partially‑on‑chain detector.
 * @param {Record<string, any>} meta NFT/collection metadata
 * @returns {{status:'full'|'partial'|'unknown', score:number, reasons:string[]}}
 */
export function checkOnChainIntegrity(meta = {}) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { status: 'unknown', score: 0, reasons: ['metadata missing'] };
  }

  const reasons   = [];
  let   remoteCnt = 0;

  /*──── 1 · scan explicit URI fields ────*/
  const scanVal = (val, key) => {
    if (typeof val !== 'string') return;
    if (!val.startsWith('data:')) { remoteCnt += 1; reasons.push(`${key} remote`); }
    if (SCRIPT_RE.test(val))      reasons.push(`${key} embeds <script>`);
  };

  for (const [k, v] of Object.entries(meta)) {
    if (URI_KEY_RE.test(k)) scanVal(v, k);
    if (typeof v === 'string' && SCRIPT_RE.test(v)) reasons.push(`${k} embeds <script>`);
  }

  /*──── 2 · deep‑scan body (decoded from data:URIs when missing) ────*/
  let bodyTxt = typeof meta.body === 'string' ? meta.body : deriveBody(meta);

  if (bodyTxt && !isLikelyBinary(bodyTxt)) {
    const txt = bodyTxt
      .replace(STRIP_XMLNS_RE, '')
      .replace(STRIP_CDATA_RE, '')
      .replace(MASK_B64_RE, '');

    /* remote refs: flag only those NOT on the safe list */
    const matches = txt.match(REMOTE_RE) || [];
    const unsafe  = matches.filter((u) => !SAFE_REMOTE_RE.test(u));
    if (unsafe.length) {
      remoteCnt += 1;
      reasons.push('body remote refs');
    }

    if (IMPORT_RE.test(txt)) { remoteCnt += 1; reasons.push('body remote @import'); }
    if (SCRIPT_RE.test(txt))  reasons.push('body embeds <script>');
    if (RE_CTRL.test(txt))    reasons.push('body non‑printable chars');
  }

  /*──── 3 · printable‑JSON guard (body removed) ────*/
  const { body, ...metaSansBody } = meta;
  if (!asciiPrintable(JSON.stringify(metaSansBody))) {
    reasons.push('metadata non-printable chars');
  }

  /*──── 4 · final verdict ────*/
  const status = remoteCnt === 0 && !reasons.some((r) => r.includes('non‑printable'))
    ? 'full'
    : 'partial';

  return { status, score: status === 'full' ? 5 : 3, reasons };
}

/* What changed & why (r10):
   • Replaced multi‑line regex with single‑line SAFE_REMOTE_RE — valid in JS.
   • Removed unsupported /x flag & inline whitespace → TypeScript errors solved.
   • No logic changes; lint‑clean.                                          */
/* EOF */
