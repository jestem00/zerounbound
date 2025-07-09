/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/onChainValidator.js
  Rev :    r13     2025‑10‑11
  Summary: tighten bare‑URL detection (no slash → no hit) to
           avoid false positives such as “Math.imul”; logic,
           safety & FOC guarantees unchanged.
──────────────────────────────────────────────────────────────*/
import { asciiPrintable } from '../core/validator.js';

/*──────── regex library ─────────────────────────────────────*/
/* unchanged — see r12 for detail */
const RE_CTRL        = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const STRIP_XMLNS_RE = /\s+xmlns(?:[:\w]+)?="[^"]*"/gi;
const STRIP_CDATA_RE = /<!\[CDATA\[|\]\]>/g;
const MASK_B64_RE    = /data:[^;]+;base64,[A-Za-z0-9+/=]+/gi;

/* absolute URL schemes */
const REMOTE_SCHEME_RE =
  /\b(?:https?|ipfs|ipns|ar|ftp):\/\/[^\s"'<>]+/gi;

/* bare domains ‑ NOW **requires a trailing slash** to qualify,
   preventing matches on JS property names like “Math.imul”      */
const REMOTE_BARE_RE =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|onion)\/[^\s"'<>]*/gi;

const IMPORT_RE      = /@import\s+url\(/i;
const SCRIPT_RE      = /<script/i;

const URI_KEY_RE     = /(artifact|display|thumbnail|image|extrauri_).*uri$/i;

const TEXTUAL_MIME_RE =
  /^(text\/|application\/(json|javascript|ecmascript|xml)|image\/svg)/i;

const SAFE_REMOTE_RE =
  /\bhttps?:\/\/(?:creativecommons\.org|schema\.org|purl\.org|www\.w3\.org)[^\s"'<>]*/i;

/*──────── utils ─────────────────────────────────────────────*/
function isLikelyBinary(str = '') {
  const sample = str.slice(0, 512);
  let weird = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const c = sample.charCodeAt(i);
    if (c < 9 || c > 240) weird += 1;
  }
  return weird / (sample.length || 1) > 0.35;
}

function decodeDataUri(uri = '') {
  if (!uri.startsWith('data:')) return '';
  const [, meta = '', payload = ''] = uri.match(/^data:([^,]*),(.*)$/s) || [];
  if (!TEXTUAL_MIME_RE.test(meta)) return '';
  try {
    return /;base64/i.test(meta) ? atob(payload) : decodeURIComponent(payload);
  } catch { return ''; }
}

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
export function checkOnChainIntegrity(meta = {}) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { status: 'unknown', score: 0, reasons: ['metadata missing'] };
  }

  const reasons = new Set();
  let remoteCnt = 0;

  /* explicit URI fields */
  const scanVal = (val, key) => {
    if (typeof val !== 'string') return;
    if (!val.startsWith('data:')) { remoteCnt += 1; reasons.add(`${key} remote`); }
    if (SCRIPT_RE.test(val))      reasons.add(`${key} embeds <script>`);
  };

  Object.entries(meta).forEach(([k, v]) => {
    if (URI_KEY_RE.test(k)) scanVal(v, k);
    if (typeof v === 'string' && SCRIPT_RE.test(v)) reasons.add(`${k} embeds <script>`);
  });

  /* deep scan */
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
    if (SCRIPT_RE.test(txt)) reasons.add('body embeds <script>');
    if (RE_CTRL.test(txt))   reasons.add('body non‑printable chars');
  }

  /* printable‑JSON guard */
  const { body, ...metaSansBody } = meta;
  if (!asciiPrintable(JSON.stringify(metaSansBody))) reasons.add('metadata non‑printable chars');

  /* verdict */
  const printableOK = ![...reasons].some((r) => r.includes('non‑printable'));
  const status      = remoteCnt === 0 && printableOK ? 'full' : 'partial';

  return { status, score: status === 'full' ? 5 : 3, reasons: [...reasons] };
}
/* EOF */
