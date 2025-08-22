/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/countTokens.js
  Rev:     r4   2025-08-21 UTC
  Summary: Count distinct token IDs for a contract via TzKT.
           Fixes bad import path so computeTokenTotal() stays reliable.
──────────────────────────────────────────────────────────────────*/

import { jFetch }  from '../core/net.js';
import { tzktBase } from './tzkt.js';

/**
 * Returns the number of tokens (distinct tokenId) for a FA2 contract.
 * Notes:
 * • Uses a generous limit (10k). If you ever exceed that, we can page.
 * • This is a fallback used by computeTokenTotal() when storage hints fail.
 */
export default async function countTokens(address = '', network = 'mainnet') {
  if (!address) return 0;
  const base = tzktBase(network);
  const url  = `${base}/tokens?contract=${encodeURIComponent(address)}&select=tokenId&limit=10000`;
  try {
    const arr = await jFetch(url, 1);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

/* What changed & why (r4):
   • Corrected import path: '../core/net.js' (not './core/net.js').
   • Kept simple distinct tokenId counting as computeTokenTotal fallback. */
// EOF
