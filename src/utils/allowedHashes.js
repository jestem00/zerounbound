/*Developed by @jams2blues
  File: src/utils/allowedHashes.js
  Rev: r24
  Summary: Allowed typeHash set and version resolver (hashMatrix.json). */

import hashMatrix from '../data/hashMatrix.json' assert { type: 'json' };

/**
 * hashMatrix is a map like:
 *   { "153042321": "v1", "153042999": "v2a", "…": "v4d" }
 * We expose helpers to:
 *  • getAllowedTypeHashSet(): Set<number>
 *  • getAllowedTypeHashList(): number[]
 *  • typeHashToVersion(h): "v?"|"V1"|"V2"|… (UI-friendly)
 */

const ENTRIES = Object.entries(hashMatrix || {});
const ALLOWED_NUMS = ENTRIES
  .map(([k]) => Number(k))
  .filter((n) => Number.isFinite(n));

const ALLOWED_SET = new Set(ALLOWED_NUMS);

export function getAllowedTypeHashSet() { return new Set(ALLOWED_SET); }
export function getAllowedTypeHashList() { return [...ALLOWED_SET]; }

export function typeHashToVersion(h) {
  const key = String(h ?? '');
  const raw = hashMatrix?.[key];
  if (!raw) return 'v?';
  // collapse “v3c” → “v3”, keep suffix if you want
  // For UI we keep the given value (already v1, v2, v3, v4X etc.)
  return String(raw).toUpperCase();
}

export const ALLOWED_HASHES = getAllowedTypeHashList();

export default { getAllowedTypeHashSet, getAllowedTypeHashList, typeHashToVersion, ALLOWED_HASHES };

/* What changed & why:
   • Deterministic helpers; no external coupling. */ // EOF
