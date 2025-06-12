/*Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/countTokens.js
  Rev :    r573   2025-06-14
  Summary: fixes “undefined” fetch; primary /tokens/count
           endpoint; safe-guard when addr falsy. */

import { jFetch }   from '../core/net.js';
import { TZKT_API } from '../config/deployTarget.js';

/**
 * Return total circulating tokens for ANY FA-2 collection.
 * Strategy (fast → slow):
 *   1) /tokens/count?contract=KT1…  (constant-time)
 *   2) length(active_tokens | total_supply | next_token_id) from storage
 *
 * @param {string} addr valid KT1…
 * @param {string} net  'ghostnet' | 'mainnet'
 */
export default async function countTokens (addr, net = 'ghostnet') {
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return 0;

  const API = net === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';

  /*---------- 1 · `/tokens/count` (fast, 500-safe) ----------*/
  try {
    const n = Number(
      await (await fetch(`${API}/tokens/count?contract=${addr}`)).json(),
    );
    if (Number.isFinite(n)) return n;
  } catch { /* fall through */ }

  /*---------- 2 · storage probe ----------*/
  try {
    const st  = await jFetch(`${API}/contracts/${addr}/storage`);
    const len = (v) =>
      Array.isArray(v)           ? v.length
        : typeof v?.forEach==='function' ? [...v].length
        : typeof v==='number'    ? v
        : typeof v?.int==='string' ? parseInt(v.int, 10)
        : null;

    return (
      len(st.active_tokens) ||       // v4 live set
      len(st.total_supply)  ||       // v1-v3 counter
      len(st.next_token_id) || 0     // fresh v4
    );
  } catch { return 0; }
}
/* EOF */
