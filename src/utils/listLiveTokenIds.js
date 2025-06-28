/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/listLiveTokenIds.js
  Rev :    r712   2025‑08‑11 T16:02 UTC
  Summary: TzKT balance‑scan now paginates past 10 k rows to
           support ultra‑large collections (≥ 10 k ids)
──────────────────────────────────────────────────────────────*/
import { jFetch }   from '../core/net.js';
import { TZKT_API } from '../config/deployTarget.js';

const MEM       = new Map();                       /* ids only            */
const MEM_NAMES = new Map();                       /* [{id,name}]         */
const BURN_ADDR = 'tz1burnburnburnburnburnburnburjAYjjX';
const TTL_MS    = 30_000;
const CHUNK     = 80;                              /* per‑metadata chunk  */
const PAGE      = 10_000;                          /* TzKT hard‑cap       */

/*──────── helpers ───────────────────────────────────────────*/
const baseURL = (net = 'ghostnet') =>
  net === 'mainnet' ? 'https://api.tzkt.io/v1'
                    : 'https://api.ghostnet.tzkt.io/v1';

const chunk = (arr, n = CHUNK) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, n + i));
  return out;
};

/**
 * listLiveTokenIds()
 * Light‑weight live token‑id fetcher with optional names.
 *
 * • Fully paginates `/tokens/balances` to overcome the 10 000‑row limit
 *   imposed by TzKT (offset‑based).
 * • Always filters burned / destroyed ids.
 * • Caches both ids‑only and id+name flavours separately.
 * • When withNames === true, queries only metadata.name to avoid
 *   100 kB+ JSON blobs that were causing `ERR_CONNECTION_RESET`.
 *
 * @param {string}  contract   KT1‑address
 * @param {string=} net        ghostnet | mainnet
 * @param {boolean=} withNames if true returns [{ id, name }]
 * @returns {Promise<number[]|{id:number,name:string}[]>}
 */
export default async function listLiveTokenIds(
  contract = '',
  net = (TZKT_API.includes('ghostnet') ? 'ghostnet' : 'mainnet'),
  withNames = false,
) {
  if (!contract) return [];

  /*── ids‑only cache ───────────────────────────────────────*/
  const key = `${net}_${contract}`;
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS && !withNames) return hit.ids;

  const api  = baseURL(net);
  const cand = new Map();                          /* id → present?       */

  /*──────── balance scan (fully paginated) ────────────────*/
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    /*  limit=max‑PAGE (10 k) keeps single call within TzKT envelope   */
    const rows = await jFetch(
      `${api}/tokens/balances`
        + `?token.contract=${contract}`
        + '&balance.gt=0'
        + '&select=token.tokenId,account.address'
        + `&limit=${PAGE}`
        + (offset ? `&offset=${offset}` : ''),
    ).catch(() => []);

    rows.forEach((r) => {
      const id   = +(r['token.tokenId'] ?? NaN);
      const addr = r['account.address'] || '';
      if (!Number.isFinite(id)) return;
      const prev = cand.get(id) || false;
      cand.set(id, prev || (addr && addr !== BURN_ADDR));
    });

    if (rows.length < PAGE) break;                 /* last page reached  */
    offset += PAGE;
  }

  let ids = [...cand.entries()]
    .filter(([, ok]) => ok)
    .map(([id]) => id);

  /*──────── live‑supply guard (per‑chunk, unchanged) ──────*/
  if (ids.length) {
    const alive = new Set();
    for (const grp of chunk(ids)) {
      const liveRows = await jFetch(
        `${api}/tokens`
          + `?contract=${contract}`
          + `&tokenId.in=${grp.join(',')}`
          + '&select=tokenId,totalSupply'
          + `&limit=${grp.length}`,
      ).catch(() => []);
      liveRows.forEach((r) => {
        if (Number(r.totalSupply) > 0) alive.add(+r.tokenId);
      });
    }
    ids = ids.filter((id) => alive.has(id)).sort((a, b) => a - b);
  }

  MEM.set(key, { ids, ts: Date.now() });
  if (!withNames) return ids;

  /*── ids+names cache ─────────────────────────────────────*/
  const hit2 = MEM_NAMES.get(key);
  if (hit2 && Date.now() - hit2.ts < TTL_MS) return hit2.list;

  const nameMap = new Map();
  if (ids.length) {
    for (const grp of chunk(ids)) {
      const nameRows = await jFetch(
        `${api}/tokens`
          + `?contract=${contract}`
          + `&tokenId.in=${grp.join(',')}`
          + '&select=tokenId,metadata.name'
          + `&limit=${grp.length}`,
      ).catch(() => []);
      nameRows.forEach((r) => {
        const id  = +r.tokenId;
        const nm  = r['metadata.name'] ?? '';
        if (nm) nameMap.set(id, nm);
      });
    }
  }

  const list = ids.map((id) => ({
    id,
    name: (nameMap.get(id) || `Token ${id}`).slice(0, 40),
  }));

  MEM_NAMES.set(key, { list, ts: Date.now() });
  return list;
}
/* What changed & why:
   • Replaced single 10 k balance scan with offset‑based while‑loop –
     now consumes every page until `< 10 k` rows, thus handling
     arbitrarily large collections.
   • Added constant PAGE = 10 000 for clarity; all query limits
     remain within TzKT envelope.
   • Existing chunked supply/name logic left intact for stability.
   • Rev bumped to r712. */
/* EOF */
