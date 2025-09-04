/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/listLiveTokenIds.js
  Rev :    r735   2025‑08‑15
  Summary: optional creator‑filter + name/creator fetch merged
           – dropdowns now show *only* tokens minted by wallet
──────────────────────────────────────────────────────────────*/
import { jFetch }   from '../core/net.js';
import { TZKT_API } from '../config/deployTarget.js';

const MEM        = new Map();                       /* ids only              */
const MEM_NAMES  = new Map();                       /* [{id,name}]           */
const BURN_ADDR  = 'tz1burnburnburnburnburnburnburjAYjjX';
const TTL_MS     = 60_000;
const CHUNK      = 80;                              /* per‑metadata chunk    */
const PAGE       = 10_000;                          /* TzKT hard‑cap         */

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
 * Light‑weight live token‑id fetcher with optional names and creator filter.
 *
 * @param {string}  contract      KT1‑address
 * @param {string=} net           ghostnet | mainnet
 * @param {boolean=} withNames    if true returns [{ id, name }]
 * @param {string=} creatorAddr   tz1…|tz2… wallet address — when supplied,
 *                                list is limited to tokens whose metadata
 *                                `creators` array includes this address
 * @returns {Promise<number[]|{id:number,name:string}[]>}
 */
export default async function listLiveTokenIds(
  contract = '',
  net = (TZKT_API.includes('ghostnet') ? 'ghostnet' : 'mainnet'),
  withNames = false,
  creatorAddr = '',
) {
  if (!contract) return [];

  /*── ids‑only cache (creator‑agnostic) ─────────────────────*/
  const key     = `${net}_${contract}`;
  if (!withNames && !creatorAddr) {
    const hit = MEM.get(key);
    if (hit && Date.now() - hit.ts < TTL_MS) return hit.ids;
  }

  const api  = baseURL(net);
  const cand = new Map();                          /* id → present?         */

  /*──────── balance scan (fully paginated) ────────────────*/
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
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

    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  let ids = [...cand.entries()]
    .filter(([, ok]) => ok)
    .map(([id]) => id);

  /* live‑supply guard */
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
  if (!withNames && !creatorAddr) return ids;

  /*── ids+names (and creators) cache ───────────────────────*/
  const hit2 = MEM_NAMES.get(key);
  let list   = null;
  if (hit2 && Date.now() - hit2.ts < TTL_MS) list = hit2.list;

  if (!list) {
    const nameMap     = new Map();
    const creatorMap  = new Map();                /* id → [creators]       */
    if (ids.length) {
      for (const grp of chunk(ids)) {
        const nameRows = await jFetch(
          `${api}/tokens`
            + `?contract=${contract}`
            + `&tokenId.in=${grp.join(',')}`
            + '&select=tokenId,metadata.name,metadata.creators'
            + `&limit=${grp.length}`,
        ).catch(() => []);

        nameRows.forEach((r) => {
          const id     = +r.tokenId;
          const nmRaw  = r['metadata.name'] ?? '';
          const nm     = (typeof nmRaw === 'string' ? nmRaw : JSON.stringify(nmRaw)).slice(0, 40);
          let cr       = r['metadata.creators'];
          if (typeof cr === 'string') {
            try { cr = JSON.parse(cr); } catch {/* leave as‑is */ }
          }
          if (!Array.isArray(cr)) cr = [];
          nameMap.set(id, nm);
          creatorMap.set(id, cr.map((s) => String(s).toLowerCase()));
        });
      }
    }

    list = ids.map((id) => ({
      id,
      name: nameMap.get(id) || `Token ${id}`,
      creators: creatorMap.get(id) || [],
    }));
    MEM_NAMES.set(key, { list, ts: Date.now() });
  }

  /*── creator filter ───────────────────────────────────────*/
  const out = creatorAddr
    ? list.filter((t) => t.creators.includes(creatorAddr.toLowerCase()))
    : list;

  return withNames
    ? out.map(({ id, name }) => ({ id, name }))
    : out.map(({ id }) => id);
}
/* EOF */
