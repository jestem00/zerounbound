/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/countTokens.js
  Rev:     r7   2025-09-16 UTC
  Summary: Count only live tokens for a contract (totalSupply>0).
           Uses fast /tokens/count first; falls back to filtering.
──────────────────────────────────────────────────────────────────*/

import { jFetch }    from '../core/net.js';
import { tzktBase }  from './tzkt.js';
import listLiveTokenIds from './listLiveTokenIds.js';

/**
 * Returns the number of live tokens (distinct tokenId with totalSupply>0)
 * for a FA2 contract. Prefer the lightweight TzKT `/tokens/count` with
 * `totalSupply.gt=0`, and fall back to client-side filtering if necessary.
 */
export default async function countTokens(address = '', network = 'mainnet') {
  if (!address) return 0;
  const base = tzktBase(network);

  // 1) Fast path: server-side count of live tokens, with verification
  try {
    const fast = await jFetch(
      `${base}/tokens/count?contract=${encodeURIComponent(address)}&totalSupply.gt=0`,
      1,
    );
    const n = Number(fast);
    if (Number.isFinite(n)) {
      if (n <= 0) return 0;
      // Verify against token rows to avoid rare count inconsistencies
      try {
        const rows = await jFetch(
          `${base}/tokens?contract=${encodeURIComponent(address)}&select=tokenId,totalSupply&limit=10000`,
          1,
        );
        if (Array.isArray(rows)) {
          const anyLive = rows.some((r) => Number(r?.totalSupply ?? r?.total_supply ?? 0) > 0);
          return anyLive ? n : 0;
        }
      } catch { /* ignore; fall back below */ }
    }
  } catch { /* fall through */ }

  // 2) Fallback: fetch ids + totalSupply and count on client
  try {
    const rows = await jFetch(
      `${base}/tokens?contract=${encodeURIComponent(address)}&select=tokenId,totalSupply&limit=10000`,
      1,
    );
    if (Array.isArray(rows)) {
      let live = 0;
      for (const r of rows) if (Number(r?.totalSupply ?? r?.total_supply ?? 0) > 0) live += 1;
      return live;
    }
  } catch { /* fall through */ }

  // 3) Last-resort: reuse the live-id scanner (cached) and return its length
  try {
    const ids = await listLiveTokenIds(address, /ghostnet/i.test(base) ? 'ghostnet' : 'mainnet');
    return Array.isArray(ids) ? ids.length : 0;
  } catch { return 0; }
}

/* What changed & why (r7):
   • Only counts tokens with live supply (totalSupply>0) to avoid showing
     burned-out collections as non-empty.
   • Prefer `/tokens/count` for speed; added robust fallbacks.
*/
// EOF
