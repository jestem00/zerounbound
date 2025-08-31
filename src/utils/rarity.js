/* Developed by @jams2blues – ZeroContract Studio
   File: src/utils/rarity.js
   Rev : r1
   Summary: compute attribute frequencies and rarity ranks per collection */

import decodeHexFields from './decodeHexFields.js';
import { jFetch } from '../core/net.js';

const cache = new Map();

export async function getCollectionRarity(apiBase, addr) {
  if (!apiBase || !addr) return null;
  if (cache.has(addr)) return cache.get(addr);

  const total = await jFetch(`${apiBase}/tokens/count?contract=${addr}`).catch(() => 0);
  const limit = 1000;
  let offset = 0;
  const rows = [];
  while (offset < total) {
    const batch = await jFetch(`${apiBase}/tokens?contract=${addr}&select=tokenId,metadata&limit=${limit}&offset=${offset}`).catch(() => []);
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    offset += batch.length;
  }

  const counts = Object.create(null);
  const tokenAttrs = Object.create(null);
  rows.forEach((row) => {
    const meta = decodeHexFields(row.metadata || {});
    const attrs = Array.isArray(meta.attributes) ? meta.attributes : [];
    tokenAttrs[row.tokenId] = attrs;
    attrs.forEach(({ name, value }) => {
      const key = `${name}:::${value}`;
      counts[key] = (counts[key] || 0) + 1;
    });
  });

  const scores = {};
  Object.entries(tokenAttrs).forEach(([tid, attrs]) => {
    let score = 0;
    attrs.forEach(({ name, value }) => {
      const key = `${name}:::${value}`;
      const freq = counts[key] || 1;
      score += 1 / (freq / total);
    });
    scores[tid] = score;
  });

  const rankMap = {};
  Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tid], idx) => { rankMap[tid] = idx + 1; });

  const res = { total, counts, tokenAttrs, rankMap };
  cache.set(addr, res);
  return res;
}

export function buildTokenRarity(collectionData, tokenId) {
  if (!collectionData || !tokenId) return null;
  const { total, counts, tokenAttrs, rankMap } = collectionData;
  const attrs = tokenAttrs[tokenId] || [];
  const traits = attrs.map(({ name, value }) => {
    const key = `${name}:::${value}`;
    const cnt = counts[key] || 0;
    return { name, value, pct: (cnt / total) * 100 };
  });
  return { rank: rankMap[tokenId], total, traits };
}

// EOF