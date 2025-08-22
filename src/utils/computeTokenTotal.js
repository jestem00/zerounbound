/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/computeTokenTotal.js
  Rev:     r1  2025-08-21 UTC
  Summary: Version‑aware token counter used by UI & meta fetchers.
           Precedence:
             1) storage.active_tokens (size or big‑map keys count)
             2) live scan via countTokens(addr, net)
             3) last‑resort fallbacks: storage.all_tokens | total_supply | next_token_id
──────────────────────────────────────────────────────────────────*/

import { jFetch } from '../core/net.js';
import countTokens from './countTokens.js';

function tzktBaseFromNet(net = 'mainnet') {
  const n = (net || '').toLowerCase();
  return n === 'mainnet' ? 'https://api.tzkt.io/v1'
       : n === 'ghostnet' ? 'https://api.ghostnet.tzkt.io/v1'
       : `https://api.${n}.tzkt.io/v1`;
}

const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const sizeOf = (x) => {
  if (!x) return 0;
  if (Array.isArray(x)) return x.length;
  if (typeof x === 'object') return Object.keys(x).length;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

async function countBigmapKeys(base, bigmapId) {
  if (!Number.isFinite(Number(bigmapId))) return 0;
  const url = `${base}/bigmaps/${bigmapId}/keys/count`;
  const n = await jFetch(url).catch(() => 0);
  return Number.isFinite(n) ? Number(n) : 0;
}

/**
 * Compute token total with correct precedence and burn exclusion.
 * @param {string} addr  KT1 address
 * @param {string} net   'mainnet' | 'ghostnet' | custom
 * @param {object} st    TzKT /contracts/<addr>/storage (optional but recommended)
 * @returns {Promise<number>}
 */
export default async function computeTokenTotal(addr, net = 'ghostnet', st = null) {
  const base = tzktBaseFromNet(net);

  // 1) Prefer explicit active set (already excludes destroyed/burned in v4/v4e).
  if (st && has(st, 'active_tokens')) {
    const v = st.active_tokens;
    // If it's a big‑map id number, count its keys; if object/array, size it.
    const active = (typeof v === 'number' || typeof v === 'string')
      ? await countBigmapKeys(base, v)
      : sizeOf(v);
    // If computed active is non‑zero, return it immediately.
    if (active) return active;
    // If zero, continue to live scan (covers unexpected shapes).
  }

  // 2) Canonical live count (excludes burn) when storage shape doesn't help.
  try {
    const live = await countTokens(addr, net);
    if (Number.isFinite(live)) return live;
  } catch { /* soft‑fail */ }

  // 3) Gentle degradation (may include destroyed tokens on some legacy v4s).
  if (st && has(st, 'all_tokens'))   return sizeOf(st.all_tokens);
  if (st && has(st, 'total_supply')) return sizeOf(st.total_supply);
  if (st && has(st, 'next_token_id'))return sizeOf(st.next_token_id);

  return 0;
}

/* What changed & why (r1):
   • Centralized precedence so every surface (carousels, panels, headers)
     reports the same number.
   • Correctly handles big‑map ids for active_tokens via /bigmaps/<id>/keys/count.
   • Falls back to live scan (burn‑exclusive) and then last‑resort storage fields. */
