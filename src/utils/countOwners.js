/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/countOwners.js
  Rev :    r2     2025‑09‑16
  Summary: fix 0‑owner bug – parse nested account.address
──────────────────────────────────────────────────────────────*/
import { jFetch } from '../core/net.js';

const BURN_ADDR = 'tz1burnburnburnburnburnburnburjAYjjX';
const TTL_MS    = 30_000;
const PAGE      = 10_000;

/**
 * Returns the number of distinct wallet addresses that hold ≥ 1 token
 * (excluding the canonical burn address).
 *
 * Caches result in sessionStorage for 30 s to avoid rate‑limit hits.
 *
 * @param {string} contract KT1‑address
 * @param {string} net      ghostnet | mainnet
 * @returns {Promise<number>}
 */
export default async function countOwners(contract = '', net = 'ghostnet') {
  if (!contract) return 0;

  const KEY = `zu_ownercount_${net}_${contract}`;
  try {
    const cached = sessionStorage?.getItem(KEY);
    if (cached) {
      const { n, ts } = JSON.parse(cached);
      if (Date.now() - ts < TTL_MS) return n;
    }
  } catch { /* ignore quota / SSR */ }

  const api = net === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';

  const owners = new Set();
  let offset   = 0;

  /* full pagination – 10 k rows per request */
  /* eslint-disable no-constant-condition */
  while (true) {
    const rows = await jFetch(
      `${api}/tokens/balances`
        + `?token.contract=${contract}`
        + '&balance.gt=0'
        + `&limit=${PAGE}`
        + (offset ? `&offset=${offset}` : ''),
    ).catch(() => []);

    rows.forEach((r) => {
      const addr = r?.account?.address;
      if (addr && addr !== BURN_ADDR) owners.add(addr);
    });

    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  /* eslint-enable no-constant-condition */

  const n = owners.size;
  try {
    sessionStorage?.setItem(KEY, JSON.stringify({ n, ts: Date.now() }));
  } catch { /* ignore */ }

  return n;
}

/* What changed & why:
   • Dropped `select=account.address` flatten – TzKT returns nested objects.
     We now read `r.account.address`, fixing false‑zero owner counts.
   • Fully preserves TTL cache + burn address exclusion. */
/* EOF */
