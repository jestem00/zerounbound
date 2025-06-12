/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/listLiveTokenIds.js
  Rev :    r670   2025-06-22
  Summary: burn-address scrub
           • Token id kept **only if** at least one
             balance holder ≠ official burn addr.
           • Works with both ?select and full-row formats.
──────────────────────────────────────────────────────────────*/
import { jFetch }   from '../core/net.js';
import { TZKT_API } from '../config/deployTarget.js';

const MEM        = new Map();                   /* 30 s session cache */
const BURN_ADDR  = 'tz1burnburnburnburnburnburnburjAYjjX';
const TTL_MS     = 30_000;

/**
 * Ascending array of token-ids whose current supply > 0 **and**
 * that are held by at least one address other than the canonical
 * burn sink (`tz1burn…`). Works on every ZeroContract version and
 * most FA2 forks.
 */
export default async function listLiveTokenIds(
  contract = '',
  net = (TZKT_API.includes('ghostnet') ? 'ghostnet' : 'mainnet'),
) {
  if (!contract) return [];

  /*── memo hits ───────────────────────────────────────────*/
  const key = `${net}_${contract}`;
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.ids;

  const base = net === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';

  /*── candidate map id → hasNonBurnHolder ────────────────*/
  const cand = new Map();

  const scanBalances = async (sel) => {
    const qs = sel
      ? '&select=token.tokenId,account.address,balance'
      : '';                                  /* full rows fallback */
    const rows = await jFetch(
      `${base}/tokens/balances?token.contract=${contract}`
      + '&balance.gt=0'
      + qs
      + '&limit=10000',
    ).catch(() => []);
    rows.forEach((r) => {
      const id   = +(
        r['token.tokenId']          /* ?select shape            */
        ?? r.token?.tokenId         /* full row shape           */
        ?? r.token_id               /* legacy col               */
        ?? NaN
      );
      const addr =
        r['account.address']        /* ?select shape            */
        ?? r.account?.address       /* full row shape           */
        ?? '';
      if (!Number.isFinite(id)) return;

      /* remember we've seen the id at all                        */
      const prev = cand.get(id) || false;
      const nonBurn = prev || (addr && addr !== BURN_ADDR);
      cand.set(id, nonBurn);
    });
  };

  /* quick pass with projection → fallback to full rows */
  await scanBalances(true);
  if (!cand.size) await scanBalances(false);

  /*── supply verification – removes ids whose supply == 0 ───*/
  if (cand.size) {
    /* hits with non-burn holders only */
    const ids = [...cand.entries()]
      .filter(([, nonBurn]) => nonBurn)
      .map(([id]) => id);

    if (ids.length) {
      try {
        const rows = await jFetch(
          `${base}/tokens?contract=${contract}`
          + `&tokenId.in=${ids.join(',')}`
          + '&select=tokenId,totalSupply&limit=10000',
        ).catch(() => []);
        const liveSet = new Set(
          rows
            .filter((r) => Number(r.totalSupply) > 0)
            .map((r) => +r.tokenId),
        );
        const out = ids.filter((id) => liveSet.has(id)).sort((a, b) => a - b);
        MEM.set(key, { ids: out, ts: Date.now() });
        return out;
      } catch {/* fall-through */}
    }
  }

  /* nothing matched – cache & return empty */
  MEM.set(key, { ids: [], ts: Date.now() });
  return [];
}
/* EOF */
