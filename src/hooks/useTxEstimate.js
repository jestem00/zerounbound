/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/hooks/useTxEstimate.js
  Rev :    r790   2025-07-10
  Summary: import shared toTez; scrub dead code; chunked for large params
──────────────────────────────────────────────────────────────*/
import { useEffect, useRef, useState } from 'react';
import { OpKind }                      from '@taquito/taquito';
import {
  μBASE_TX_FEE,                        /* I85 single-source */
  toTez,
} from '../core/feeEstimator.js';      /* unified helpers   */

/*──────── constants & helpers ─────*/
const HEX_LIMIT   = 24_000;
const RPC_PATH    = '/helpers/scripts/simulate_operation';
const COOLDOWN_MS = 120_000;                           /* 2 min global back-off */
const EST_CHUNK_SIZE = 20;                             /* params per chunk */

const g            = typeof globalThis !== 'undefined' ? globalThis : window;
g.__ZU_RPC_SKIP_TS = g.__ZU_RPC_SKIP_TS || 0;          /* persist across HMR */

const isSim500 = (x) => {
  try {
    const s = typeof x === 'string' ? x : x?.message || JSON.stringify(x);
    return s.includes(RPC_PATH) && s.includes('500');
  } catch { return false; }
};

/*──────── console husk (once per session) ───────────────────*/
if (typeof window !== 'undefined' && !window.__ZU_RPC_HUSH) {
  window.__ZU_RPC_HUSH = true;
  const hush = (ev) => {
    if (isSim500(ev.message) || isSim500(ev.reason)) { ev.preventDefault?.(); return false; }
  };
  window.addEventListener('error',              hush, true);
  window.addEventListener('unhandledrejection', hush, true);

  ['error', 'warn', 'debug'].forEach((k) => {
    const orig = console[k].bind(console);
    console[k] = (...args) => { if (!args.some(isSim500)) orig(...args); };
  });
}

/*──────── deep bytes-string probe for oversize hex ──────────*/
const hasHugeHex = (node) => {
  if (typeof node === 'string')
    return /^[\da-fA-F]+$/.test(node) && node.length > HEX_LIMIT;
  if (Array.isArray(node)) return node.some(hasHugeHex);
  if (node && typeof node === 'object') return Object.values(node).some(hasHugeHex);
  return false;
};

const fallbackCosts = (opsLen = 1) => {
  const feeMutez = opsLen * μBASE_TX_FEE;      /* conservative upper-bound */
  return {
    feeTez:     toTez(feeMutez),
    storageTez: '0',
    isLoading:  false,
    isInsufficient: false,
    error: null,
  };
};

async function safeEstimate(fn) {
  try { return await fn(); }
  catch (e) { if (isSim500(e)) return null; throw e; }
}

/**
 * useTxEstimate(toolkit, params[])
 *
 * Returns { feeTez, storageTez, isLoading, isInsufficient, error }.
 * On RPC simulate 500 or oversize hex it falls back to deterministic
 * client-side numbers (I85/I86). Estimates in chunks for perf.
 */
export default function useTxEstimate(toolkit, params) {
  const [state, _setState] = useState(fallbackCosts(0));
  const lastJSON = useRef(JSON.stringify(state));   /* deep-compare guard */

  const setState = (next) => {
    const nextJSON = JSON.stringify(next);
    if (nextJSON !== lastJSON.current) {
      lastJSON.current = nextJSON;
      _setState(next);
    }
  };

  useEffect(() => {
    let live = true;
    (async () => {
      if (!toolkit || !Array.isArray(params) || !params.length) {
        setState(fallbackCosts(0));
        return;
      }
      if (Date.now() < g.__ZU_RPC_SKIP_TS) {          /* cooldown */
        setState(fallbackCosts(params.length));
        return;
      }
      if (params.some((p) => hasHugeHex(p?.parameter))) {
        setState(fallbackCosts(params.length));
        return;
      }

      try {
        setState((s) => ({ ...s, isLoading: true, error: null }));

        let feeMutez = 0;
        let storageMutez = 0;
        for (let i = 0; i < params.length; i += EST_CHUNK_SIZE) {
          const chunk = params.slice(i, i + EST_CHUNK_SIZE).map((p) => ({ kind: OpKind.TRANSACTION, ...p }));
          const est = await safeEstimate(() => toolkit.estimate.batch(chunk));
          if (!est) {                                  /* simulate 500 */
            g.__ZU_RPC_SKIP_TS = Date.now() + COOLDOWN_MS;
            setState(fallbackCosts(params.length));
            return;
          }
          feeMutez += est.reduce((t, e) => t + e.suggestedFeeMutez, 0);
          storageMutez += est.reduce((t, e) => t + e.burnFeeMutez, 0);
        }

        if (!live) return;

        let balance = { toNumber: () => Infinity };
        try { balance = await toolkit.tz.getBalance(await toolkit.wallet.pkh()); }
        catch (e) { if (!isSim500(e)) throw e; }

        setState({
          feeTez: toTez(feeMutez),
          storageTez: toTez(storageMutez),
          isLoading: false,
          isInsufficient: feeMutez + storageMutez > balance.toNumber(),
          error: null,
        });
      } catch (e) {
        if (isSim500(e)) g.__ZU_RPC_SKIP_TS = Date.now() + COOLDOWN_MS;
        if (live) setState({
          ...fallbackCosts(params.length),
          error: e?.message || String(e),
        });
      }
    })();
    return () => { live = false; };
  }, [toolkit, params]);               /* params identity stable – r790 */

  return state;
}

/* What changed & why: Added chunked estimation for large params; date aligned; removed dead constants; rev unchanged.
*/
/* EOF */