/*Developed by @jams2blues with love for the Tezos community
  File: src/config/networkConfig.js
  Summary: Thin compatibility-shim that re-exports the active network
           constants drawn from deployTarget.js. It now exposes an
           up-to-date, fully featured RPC list (tzkt.io proxy removed). */

import {
  NETWORK_KEY,
  NETWORK_TYPE,
  NETWORK_LABEL,
  RPC_URLS,
} from './deployTarget.js';

/*──────────────────────── constants ─────────────────────────*/
export const DEFAULT_NETWORK = NETWORK_KEY;

/** Back-compat NETWORKS map (kept for legacy imports) */
export const NETWORKS = {
  [NETWORK_KEY]: {
    name:    NETWORK_LABEL.toLowerCase(),   // 'ghostnet' | 'mainnet'
    type:    NETWORK_TYPE,
    rpcUrls: RPC_URLS.slice(),              // copy to avoid mutation
  },
};

/*──────────────────── helper utilities ─────────────────────*/

/** Return the ordered RPC list for the current net */
export const getRpcList = () => RPC_URLS.slice();

/**
 * Simple fastest-node pick (first that responds to /chain_id).
 * Used by WalletContext bootstrap.
 */
export async function selectFastestRpc(timeoutMs = 3000) {
  for (const url of RPC_URLS) {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res   = await fetch(`${url}/chains/main/chain_id`, {
        mode: 'cors',
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) return url;
    } catch { /* silence & try next */ }
  }
  throw new Error('No reachable RPC endpoint');
}

/* What changed & why:
   • No more tzkt.io ghostnet proxy — list now mirrors deployTarget.js,
     ensuring all endpoints expose /context/contracts/... calls.
*/
