/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/listLiveTokenIds.js
  Rev :    r709   2025‑08‑06
  Summary: resilient chunked queries + stricter URL caps
           • live‑supply + name look‑ups split in ≤ 80‑id batches
           • keeps r684 feature‑set & MEM caches, fixes 413/ECONNRESET
──────────────────────────────────────────────────────────────*/
import { jFetch }   from '../core/net.js';
import { TZKT_API } from '../config/deployTarget.js';

const MEM       = new Map();                       /* ids only */
const MEM_NAMES = new Map();                       /* [{id,name}] */
const BURN_ADDR = 'tz1burnburnburnburnburnburnburjAYjjX';
const TTL_MS    = 30_000;
const CHUNK     = 80;                              /* safe head‑room */

/*──────── helpers ───────────────────────────────────────────*/
const baseURL = (net = 'ghostnet') =>
  net === 'mainnet' ? 'https://api.tzkt.io/v1'
                    : 'https://api.ghostnet.tzkt.io/v1';

const chunk = (arr, n = CHUNK) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n)
    out.push(arr.slice(i, i + n));
  return out;
};

/**
 * List of live token‑ids (and optional names) for a contract.
 *
 * @param {string}  contract   KT1‑address
 * @param {string=} net        ghostnet | mainnet  (auto from TZKT_API)
 * @param {boolean=} withNames if true returns objects { id, name }
 * @returns {Promise<number[]|{id:number,name:string}[]>}
 */
export default async function listLiveTokenIds(
  contract = '',
  net = (TZKT_API.includes('ghostnet') ? 'ghostnet' : 'mainnet'),
  withNames = false,
) {
  if (!contract) return [];

  /*── ids‑only cache ───────────────────────────────*/
  const key = `${net}_${contract}`;
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS && !withNames) return hit.ids;

  const api  = baseURL(net);
  const cand = new Map();                          /* id → true|false */

  /* balance scan (one call, 10 k cap) */
  const rows = await jFetch(
    `${api}/tokens/balances?token.contract=${contract}`
      + '&balance.gt=0'
      + '&select=token.tokenId,account.address'
      + '&limit=10000',
  ).catch(() => []);

  rows.forEach((r) => {
    const id   = +(r['token.tokenId'] ?? NaN);
    const addr = r['account.address'] || '';
    if (!Number.isFinite(id)) return;
    const prev = cand.get(id) || false;
    cand.set(id, prev || (addr && addr !== BURN_ADDR));
  });

  let ids = [...cand.entries()]
    .filter(([, ok]) => ok)
    .map(([id]) => id);

  /* live‑supply guard: chunk to avoid 413/ECONNRESET */
  if (ids.length) {
    const alive = new Set();
    for (const grp of chunk(ids)) {
      const liveRows = await jFetch(
        `${api}/tokens?contract=${contract}`
          + `&tokenId.in=${grp.join(',')}`
          + '&select=tokenId,totalSupply'
          + '&limit=10000',
      ).catch(() => []);
      liveRows.forEach((r) => {
        if (Number(r.totalSupply) > 0) alive.add(+r.tokenId);
      });
    }
    ids = ids.filter((id) => alive.has(id)).sort((a, b) => a - b);
  }

  MEM.set(key, { ids, ts: Date.now() });
  if (!withNames) return ids;

  /*── id+name cache ────────────────────────────────*/
  const hit2 = MEM_NAMES.get(key);
  if (hit2 && Date.now() - hit2.ts < TTL_MS) return hit2.list;

  const list = [];
  if (ids.length) {
    /* multiple small queries to keep URL short */
    const nameMap = new Map();
    for (const grp of chunk(ids)) {
      const nameRows = await jFetch(
        `${api}/tokens?contract=${contract}`
          + `&tokenId.in=${grp.join(',')}`
          + '&select=tokenId,metadata'
          + '&limit=10000',
      ).catch(() => []);
      nameRows.forEach((r) => {
        const id  = +r.tokenId;
        const nm  = r.metadata?.name || r.metadata?.tokenName || '';
        if (nm) nameMap.set(id, nm);
      });
    }
    ids.forEach((id) => {
      const nm = (nameMap.get(id) || '').slice(0, 40);
      list.push({ id, name: nm || `Token ${id}` });
    });
  }
  MEM_NAMES.set(key, { list, ts: Date.now() });
  return list;
}
/* EOF */
