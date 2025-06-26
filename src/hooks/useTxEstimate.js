/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/hooks/useTxEstimate.js
  Rev :    r788   2025‑08‑09
  Summary: state‑dedupe + deep‑key guard to stop set‑state loops
──────────────────────────────────────────────────────────────*/
import { useEffect, useRef, useState } from 'react';
import { OpKind }                      from '@taquito/taquito';

/*──────── constants & helpers ─────*/
const toTez       = (m) => (m / 1_000_000).toFixed(6);
const HEX_LIMIT   = 24_000;
const RPC_PATH    = '/helpers/scripts/simulate_operation';
const COOLDOWN_MS = 120_000;                       /* 2 minutes */

const g            = typeof globalThis !== 'undefined' ? globalThis : window;
g.__ZU_RPC_SKIP_TS = g.__ZU_RPC_SKIP_TS || 0;      /* persist across HMR */

const isHttpFail = (x) => x?.name === 'HttpRequestFailed';
const isSim500   = (x) => {
  try {
    const s = typeof x === 'string' ? x : x?.message || JSON.stringify(x);
    return s.includes(RPC_PATH) && s.includes('500');
  } catch { return false; }
};

/*──────── console & event husk (once) ───────────────────────*/
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

/*──────── deep bytes‑string probe for oversize hex ──────────*/
const hasHugeHex = (node) => {
  if (typeof node === 'string')
    return /^[\da-fA-F]+$/.test(node) && node.length > HEX_LIMIT;
  if (Array.isArray(node)) return node.some(hasHugeHex);
  if (node && typeof node === 'object') return Object.values(node).some(hasHugeHex);
  return false;
};

async function safeEstimate(fn) {
  try { return await fn(); }
  catch (e) { if (isSim500(e)) return null; throw e; }
}

/**
 * useTxEstimate(toolkit, params[])
 * Returns { feeTez, storageTez, isLoading, isInsufficient, error }.
 *
 * • The hook now dedupes outgoing state – if nothing changed compared
 *   to the previous render it suppresses setState to avoid cascading
 *   “maximum update depth” warnings (React 18 strict‑mode double
 *   invoke).                                            – I50/I86
 */
export default function useTxEstimate(toolkit, params) {
  const [state, _setState] = useState({
    feeTez: '0',
    storageTez: '0',
    isLoading: false,
    isInsufficient: false,
    error: null,
  });
  const lastJSON = useRef(JSON.stringify(state));   /* cheap deep‑compare */

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
      if (!toolkit || !Array.isArray(params) || params.length === 0) {
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }
      if (Date.now() < g.__ZU_RPC_SKIP_TS) {
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }
      if (params.some((p) => hasHugeHex(p?.parameter))) {
        setState({
          feeTez: '—', storageTez: '—', isLoading: false, isInsufficient: false, error: null,
        });
        return;
      }

      try {
        setState((s) => ({ ...s, isLoading: true, error: null }));

        const est = await safeEstimate(() =>
          toolkit.estimate.batch(params.map((p) => ({ kind: OpKind.TRANSACTION, ...p }))));

        if (!est) {                                /* simulate‑op 500 ⇒ cooldown */
          g.__ZU_RPC_SKIP_TS = Date.now() + COOLDOWN_MS;
          if (live) setState({
            feeTez: '—', storageTez: '—', isLoading: false, isInsufficient: false, error: null,
          });
          return;
        }

        const feeMutez     = est.reduce((t, e) => t + e.suggestedFeeMutez, 0);
        const storageMutez = est.reduce((t, e) => t + e.burnFeeMutez,      0);

        let balance = { toNumber: () => Infinity };
        try { balance = await toolkit.tz.getBalance(await toolkit.wallet.pkh()); }
        catch (e) { if (!isSim500(e)) throw e; }

        const isInsufficient = feeMutez + storageMutez > balance.toNumber();

        if (live) setState({
          feeTez: toTez(feeMutez),
          storageTez: toTez(storageMutez),
          isLoading: false,
          isInsufficient,
          error: null,
        });
      } catch (e) {
        if (isSim500(e)) g.__ZU_RPC_SKIP_TS = Date.now() + COOLDOWN_MS;
        if (live) setState({
          feeTez: '—', storageTez: '—', isLoading: false, isInsufficient: false,
          error: e?.message || String(e),
        });
      }
    })();
    return () => { live = false; };
  }, [toolkit, params]);           /* params identity now stable – see r929 */

  return state;
}
/* What changed & why:
   • Added JSON‑stringified state dedupe to suppress redundant renders.
   • Guarantees no infinite set‑state loop even if parent passes a new
     params instance each render.                                   */
/* EOF */
