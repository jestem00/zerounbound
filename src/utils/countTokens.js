/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/countTokens.js
  Rev :    r665   2025-06-22
  Summary: net-aware pass-through
           • forwards network param to listLiveTokenIds
──────────────────────────────────────────────────────────────*/
import listLiveTokenIds from './listLiveTokenIds.js';

/**
 * Returns the number of token-ids whose aggregate supply > 0
 * (excludes fully burned or destroyed IDs).
 *
 * @param {string} contract KT1-address
 * @param {string} net      ghostnet | mainnet
 */
export default async function countTokens(contract = '', net = 'ghostnet') {
  if (!contract) return 0;
  const KEY = `zu_tokcount_${net}_${contract}`;
  try {
    const cached = sessionStorage?.getItem(KEY);
    if (cached) {
      const { n, ts } = JSON.parse(cached);
      if (Date.now() - ts < 30_000) return n;        // 30 s TTL
    }
  } catch {/* ignore quota / SSR */}

  const n = (await listLiveTokenIds(contract, net)).length;

  try {
    sessionStorage?.setItem(KEY, JSON.stringify({ n, ts: Date.now() }));
  } catch {/* ignore */}
  return n;
}
/* EOF */
