/*Developed by @jams2blues
  File: src/utils/countTokens.js
  Rev:  r8
  Summary: Accurate live token count that EXCLUDES burn-held supply.
           Primary path scans /tokens/balances (account.ne=burn),
           dedupes tokenIds, caches 5 min; safe fallback retained. */

import { jFetch } from '../core/net.js';

/* ── Constants & Cache (5 min) ───────────────────────────── */
const CACHE_KEY = 'zu_token_count_cache_v3';        // bump to invalidate stale r7 results
const TTL       = 5 * 60 * 1000;                    // 5 min
const PAGE_SIZE = 10_000;                            // TzKT page upper bound
const BURN_ADDR = 'tz1burnburnburnburnburnburnburjAYjjX';

function readCache() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
  catch { return {}; }
}
function writeCache(all) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(all)); }
  catch { /* ignore quota */ }
}
function getCached(addr, net) {
  const key = `${(net || '').toLowerCase()}_${addr}`;
  const hit = readCache()[key];
  return hit && Date.now() - hit.ts < TTL ? hit.total : null;
}
function setCached(addr, net, total) {
  const key = `${(net || '').toLowerCase()}_${addr}`;
  const all = readCache();
  all[key] = { total, ts: Date.now() };
  writeCache(all);
}

function baseFor(net = 'ghostnet') {
  const n = (net || '').toLowerCase();
  return n === 'mainnet' ? 'https://api.tzkt.io/v1' : 'https://api.ghostnet.tzkt.io/v1';
}

/**
 * Scan balances to count DISTINCT tokenIds that have a positive balance
 * at any account OTHER than the canonical burn address.
 * This yields the true number of "live" tokens in a collection.
 *
 * @param {string} base  TzKT /v1 base
 * @param {string} addr  KT1 contract address
 * @returns {Promise<number>} distinct tokenIds with balance>0 excluding burn
 */
async function countByBalancesExcludingBurn(base, addr) {
  const seen = new Set();
  let offset = 0;

  // We ask TzKT to return only the lightweight field (token.tokenId).
  // Even if the server returns objects, we normalize defensively.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url =
      `${base}/tokens/balances`
      + `?token.contract=${addr}`
      + `&balance.gt=0`
      + `&account.ne=${BURN_ADDR}`
      + `&select=token.tokenId`
      + `&limit=${PAGE_SIZE}`
      + (offset ? `&offset=${offset}` : '');

    const rows = await jFetch(url).catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const r of rows) {
      // rows can be: [123, 456, ...] or [{token:{tokenId:123}}, ...]
      const id = (typeof r === 'number' || typeof r === 'string')
        ? Number(r)
        : Number(r?.token?.tokenId ?? r?.tokenId ?? r?.id);
      if (Number.isFinite(id)) seen.add(id);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += rows.length;
  }

  return seen.size;
}

/**
 * Count *live* tokens for a collection (excludes supply stranded at burn):
 *  1) Primary: /tokens/balances scan (account.ne=burn, balance.gt=0)
 *     → DISTINCT tokenIds set size.
 *  2) Fallback: /tokens/count?contract=…&holdersCount.gt=0
 *     (NOTE: may overcount if API degrades; cached briefly).
 *
 * @param {string} addr KT1 address
 * @param {'mainnet'|'ghostnet'|string} net
 * @returns {Promise<number>}
 */
export default async function countTokens(addr = '', net = 'ghostnet') {
  if (!addr) return 0;

  const cached = getCached(addr, net);
  if (cached !== null) return cached;

  const base = baseFor(net);

  // ── Primary: balances scan EXCLUDING burn ─────────────────
  try {
    const total = await countByBalancesExcludingBurn(base, addr);
    setCached(addr, net, total);
    return total;
  } catch {
    // fall through to secondary path
  }

  // ── Fallback (rare): holdersCount>0 (may include burn) ────
  let total = 0;
  const cnt = await jFetch(
    `${base}/tokens/count?contract=${addr}&holdersCount.gt=0`,
  ).catch(() => null);

  if (Number.isFinite(cnt)) total = Number(cnt);

  setCached(addr, net, total);
  return total;
}

/* What changed & why (r8):
   • Fixed ghost counts: primary method now counts distinct tokenIds
     from /tokens/balances with account.ne=burn (true “live” supply).
   • Cache key bumped → v3 to flush stale r7 results.
   • Normalized net handling; robust parsing of select results. */
