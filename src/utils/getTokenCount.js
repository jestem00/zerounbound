/*Developed by @jams2blues – ZeroContract Studio
  File: src/utils/getTokenCount.js
  Rev : r563   2025-06-13
  Summary: TzKT /tokens/count helper + 24 h cache */
  
import { TZKT_API } from '../config/deployTarget.js';

const TTL   = 86_400_000;                // 24 h
const KEY   = 'zu_tokcount_v1';

const read  = () => {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
};
const write = (o) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(o));
};

/**
 * Return live **total tokens ever minted (minus burn/destroy)**
 * for any FA2 contract using TzKT `/tokens/count`.
 */
export default async function getTokenCount (kt1, net = 'ghostnet') {
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(kt1)) return 0;
  const store = read();
  const hit   = store[kt1];
  if (hit && Date.now() - hit.ts < TTL) return hit.val;

  try {
    const url   = `${TZKT_API}/v1/tokens/count?contract=${kt1}`;
    const total = Number(await (await fetch(url)).json()) || 0;
    store[kt1]  = { val: total, ts: Date.now() }; write(store);
    return total;
  } catch { return 0; }
}
/* EOF */
