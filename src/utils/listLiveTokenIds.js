/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/listLiveTokenIds.js
  Rev :    r684   2025-06-25
  Summary: optional name fetch
           • third param `withNames` returns [{ id,name }]
           • MEM_NAMES cache (30 s) mirrors id list cache
──────────────────────────────────────────────────────────────*/
import { jFetch }   from '../core/net.js';
import { TZKT_API } from '../config/deployTarget.js';

const MEM        = new Map();                   /* ids only */
const MEM_NAMES  = new Map();                   /* [{id,name}] */
const BURN_ADDR  = 'tz1burnburnburnburnburnburnburjAYjjX';
const TTL_MS     = 30_000;

/**
 * List of live token-ids (and optional names) for a contract.
 *
 * @param {string}  contract   KT1-address
 * @param {string=} net        ghostnet | mainnet  (auto from TZKT_API)
 * @param {boolean=} withNames if true returns objects { id, name }
 */
export default async function listLiveTokenIds(
  contract = '',
  net = (TZKT_API.includes('ghostnet') ? 'ghostnet' : 'mainnet'),
  withNames = false,
) {
  if (!contract) return [];

  /*──────────────── ids only (cached) ────────────────*/
  const key = `${net}_${contract}`;
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS && !withNames) return hit.ids;

  const base = net === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';

  const cand = new Map();                        /* id → hasNonBurnHolder */

  const scanBalances = async (sel) => {
    const qs = sel
      ? '&select=token.tokenId,account.address,balance'
      : '';
    const rows = await jFetch(
      `${base}/tokens/balances?token.contract=${contract}`
      + '&balance.gt=0'
      + qs
      + '&limit=10000',
    ).catch(() => []);
    rows.forEach((r) => {
      const id = +(
        r['token.tokenId'] ?? r.token?.tokenId ?? r.token_id ?? NaN
      );
      const addr =
        r['account.address'] ?? r.account?.address ?? '';
      if (!Number.isFinite(id)) return;
      const prev = cand.get(id) || false;
      cand.set(id, prev || (addr && addr !== BURN_ADDR));
    });
  };

  await scanBalances(true);
  if (!cand.size) await scanBalances(false);

  let ids = [];
  if (cand.size) {
    ids = [...cand.entries()]
      .filter(([, ok]) => ok)
      .map(([id]) => id);
    if (ids.length) {
      try {
        const rows = await jFetch(
          `${base}/tokens?contract=${contract}`
          + `&tokenId.in=${ids.join(',')}`
          + '&select=tokenId,totalSupply&limit=10000',
        ).catch(() => []);
        const live = new Set(
          rows.filter((r) => Number(r.totalSupply) > 0)
              .map((r) => +r.tokenId),
        );
        ids = ids.filter((id) => live.has(id)).sort((a, b) => a - b);
      } catch {/* ignore */}
    }
  }
  MEM.set(key, { ids, ts: Date.now() });

  if (!withNames) return ids;

  /*──────────────── id + name (cached) ───────────────*/
  const h2 = MEM_NAMES.get(key);
  if (h2 && Date.now() - h2.ts < TTL_MS) return h2.list;

  let list = ids.map((id) => ({ id, name:`Token ${id}` }));
  if (ids.length) {
    try {
      const rows = await jFetch(
        `${base}/tokens?contract=${contract}`
        + `&tokenId.in=${ids.slice(0,100).join(',')}`   // safe cap
        + '&limit=100',
      ).catch(() => []);
      const nameMap = new Map(
        rows.map((r) => {
          const n = r.metadata?.name || r.metadata?.tokenName || '';
          return [+r.tokenId, n];
        }),
      );
      list = ids.map((id) => ({
        id,
        name: (nameMap.get(id) || '').slice(0, 40) || `Token ${id}`,
      }));
    } catch {/* fallback keeps placeholders */}
  }
  MEM_NAMES.set(key, { list, ts: Date.now() });
  return list;
}
/* EOF */
