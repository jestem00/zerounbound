/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/onChainValidator.js
  Rev :    r11     2025‑07‑29
  Summary: dedup reasons; stronger URI decode; safer verdict
──────────────────────────────────────────────────────────────*/
import { asciiPrintable } from '../core/validator.js';

/*──────── regex library ─────────────────────────────────────*/
const RE_CTRL          = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;      // C0 only
const STRIP_XMLNS_RE   = /\s+xmlns(?:[:\w]+)?="[^"]*"/gi;
const STRIP_CDATA_RE   = /<!\[CDATA\[|\]\]>/g;
const MASK_B64_RE      = /data:[^;]+;base64,[A-Za-z0-9+/=]+/gi;
const REMOTE_RE        = /\b(?:https?|ipfs|ipns|ar):\/\/[^\s"'<>]+/gi;
const IMPORT_RE        = /@import\s+url\(/i;
const SCRIPT_RE        = /<script/i;

const URI_KEY_RE       = /(artifact|display|thumbnail|image|extrauri_).*uri$/i;
const TEXTUAL_MIME_RE  = /^(text\/|application\/(json|javascript|ecmascript|xml)|image\/svg)/i;

/* safe, static knowledge bases – white‑list conservative */
const SAFE_REMOTE_RE =
  /\bhttps?:\/\/(?:creativecommons\.org|schema\.org|purl\.org|www\.w3\.org)[^\s"'<>]*/i;

/*──────── utils ─────────────────────────────────────────────*/
/** ≥ 35 % bytes < 9 or > 240 in first 512 B ⇒ binary‑ish */
function isLikelyBinary(str = '') {
  const sample = str.slice(0, 512);
  let weird = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const c = sample.charCodeAt(i);
    if (c < 9 || c > 240) weird += 1;
  }
  return weird / (sample.length || 1) > 0.35;
}

/** robust textual data:URI decoder – returns '' when undecodable */
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

/** derive decodable body from first textual *Uri field (fallback) */
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
 * Heuristic fully‑ / partially‑on‑chain detector.
 * @param {Record<string, any>} meta NFT/collection metadata
 * @returns {{status:'full'|'partial'|'unknown', score:number, reasons:string[]}}
 */
export function checkOnChainIntegrity(meta = {}) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { status: 'unknown', score: 0, reasons: ['metadata missing'] };
  }

  const reasons = new Set();
  let remoteCnt = 0;

  /*── 1 · explicit URI fields ─────────────────────────────*/
  const scanVal = (val, key) => {
    if (typeof val !== 'string') return;
    if (!val.startsWith('data:')) {
      remoteCnt += 1;
      reasons.add(`${key} remote`);
    }
    if (SCRIPT_RE.test(val)) reasons.add(`${key} embeds <script>`);
  };

  Object.entries(meta).forEach(([k, v]) => {
    if (URI_KEY_RE.test(k)) scanVal(v, k);
    if (typeof v === 'string' && SCRIPT_RE.test(v)) reasons.add(`${k} embeds <script>`);
  });

  /*── 2 · deep‑scan body ─────────────────────────────────*/
  const bodyTxt =
    typeof meta.body === 'string' ? meta.body : deriveBody(meta);

  if (bodyTxt && !isLikelyBinary(bodyTxt)) {
    const txt = bodyTxt
      .replace(STRIP_XMLNS_RE, '')
      .replace(STRIP_CDATA_RE, '')
      .replace(MASK_B64_RE, '');

    const matches = txt.match(REMOTE_RE) || [];
    const unsafe  = matches.filter((u) => !SAFE_REMOTE_RE.test(u));
    if (unsafe.length) {
      remoteCnt += 1;
      reasons.add('body remote refs');
    }

    if (IMPORT_RE.test(txt))  { remoteCnt += 1; reasons.add('body remote @import'); }
    if (SCRIPT_RE.test(txt))  reasons.add('body embeds <script>');
    if (RE_CTRL.test(txt))    reasons.add('body non‑printable chars');
  }

  /*── 3 · printable‑JSON guard ───────────────────────────*/
  const {...metaSansBody } = meta;
  if (!asciiPrintable(JSON.stringify(metaSansBody))) {
    reasons.add('metadata non‑printable chars');
  }

  /*── 4 · verdict ────────────────────────────────────────*/
  const reasonArr = [...reasons];
  const printableOK = !reasonArr.some((r) => r.includes('non‑printable'));
  const status = remoteCnt === 0 && printableOK ? 'full' : 'partial';

  return { status, score: status === 'full' ? 5 : 3, reasons: reasonArr };
}

/* What changed & why (r11):
   • reasons deduped via Set → cleaner output.
   • decodeDataUri hardened (percent‑decode fallback).
   • verdict logic clarified; remote/@import each bump remoteCnt once.
   • Prop‑safe, lint‑clean; no functional regressions.                    */
/* EOF */
