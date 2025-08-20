/*─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: src/utils/attributesIndex.js
Rev:  r2   2025‑08‑20 UTC
Summary: Compute attribute frequency index from token metadata arrays.
──────────────────────────────────────────────────────────────────*/

export function buildAttributesIndex(tokenMetas = []) {
  const counts = new Map(); let total = 0;
  for (const tm of tokenMetas) {
    const attrs = Array.isArray(tm?.attributes) ? tm.attributes : [];
    const seen = new Set();
    for (const { name, value } of attrs) {
      if (!name) continue;
      const key = `${name}:::${value}`;
      if (seen.has(key)) continue;
      seen.add(key); total++;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const out = [];
  for (const [key, count] of counts.entries()) {
    const [name, value] = key.split(':::');
    out.push({ name, value, count, pct: total ? (count / total) : 0 });
  }
  out.sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
  return out;
}

/* What changed & why: rarity support for contract/token pages (flagged UI can consume this). */
