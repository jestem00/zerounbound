/*Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/onChainValidator.js
  Rev :    r3   2025‑07‑24
  Summary: gold‑star logic – no thumbnail required */
import { asciiPrintable } from '../core/validator.js';

/**
 * Return heuristic on‑chain integrity.
 * • status   – 'full' | 'partial' | 'unknown'
 * • score    – 0‑5 scale inspired by onchainchecker.xyz
 * • reasons  – string[] explanations when partial/unknown
 */
export function checkOnChainIntegrity(meta = {}) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || !Object.keys(meta).length) {
    return { status: 'unknown', score: 0, reasons: ['metadata missing'] };
  }

  const reasons = [];
  let remote = 0;

  const URI_KEY = /(artifact|display|thumbnail|image|extrauri_).*uri$/i;

  const scan = (val, key) => {
    if (typeof val !== 'string') return;
    const isData = val.startsWith('data:');
    if (!isData) { remote += 1; reasons.push(`${key} remote`); }
    if (/<script/i.test(val)) reasons.push(`${key} embeds <script>`);
  };

  for (const [k, v] of Object.entries(meta)) {
    if (URI_KEY.test(k)) scan(v, k);
    if (typeof v === 'string' && /<script/i.test(v)) reasons.push(`${k} embeds <script>`);
  }

  if (!asciiPrintable(JSON.stringify(meta))) reasons.push('non‑printable chars');

  /* revised score logic – any remote refs downgrades, otherwise ⭐ */
  const score = remote === 0 ? 5
              : remote < 3    ? 3
              : 1;

  const status = score === 5 ? 'full'
              : score >= 1   ? 'partial'
              : 'unknown';

  return { status, score, reasons };
}
/* What changed & why:
   • Remote‑free metadata now yields score 5 (⭐) even when no thumbnail
     is present – fixes false ⛓️‍💥 negatives on minimal SVG tokens.
   • imageUri included in URI_KEY so it’s scanned consistently.
*/
/* EOF */
