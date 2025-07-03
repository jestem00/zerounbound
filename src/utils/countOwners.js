/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/countOwners.js
  Rev :    r1     2025‑08‑18
  Summary: fast distinct‑owner counter with 30 s TTL
──────────────────────────────────────────────────────────────*/
import { jFetch } from '../core/net.js';

const BURN_ADDR = 'tz1burnburnburnburnburnburnburjAYjjX';
const TTL_MS    = 30_000;
const PAGE      = 10_000;

/**
 * Returns the number of distinct wallet addresses that hold ≥ 1 token.
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
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await jFetch(
      `${api}/tokens/balances`
        + `?token.contract=${contract}`
        + '&balance.gt=0'
        + '&select=account.address'
        + `&limit=${PAGE}`
        + (offset ? `&offset=${offset}` : ''),
    ).catch(() => []);
    rows.forEach((r) => {
      const addr = r['account.address'];
      if (addr && addr !== BURN_ADDR) owners.add(addr);
    });
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const n = owners.size;
  try {
    sessionStorage?.setItem(KEY, JSON.stringify({ n, ts: Date.now() }));
  } catch { /* ignore */ }
  return n;
}
/* What changed & why:
   • Initial implementation – paginated scan of balances endpoint,
     distinct address counting, 30 s session cache, burn‑address skip. */
/* EOF */
