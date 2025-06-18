/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/hooks/useTxEstimate.js
  Rev :    r782   2025-07-05
  Summary: remove global disable flag, lazy retry, no pre-mount RPC
──────────────────────────────────────────────────────────────*/
import { useEffect, useState } from 'react';
import { OpKind }              from '@taquito/taquito';

/*──────── constants & helpers ─────*/
const toTez     = (m) => (m / 1_000_000).toFixed(6);
const HEX_LIMIT = 24_000;
const RPC_PATH  = '/helpers/scripts/simulate_operation';

/** recognise “simulate_operation 500” flavour regardless of shape */
const isSim500 = (x) => {
  try {
    const s = typeof x === 'string' ? x : x?.message || JSON.stringify(x);
    return s.includes(RPC_PATH) && s.includes('500');
  } catch { return false; }
};

/*──────── console & event husk once ─────────────────────────*/
if (typeof window !== 'undefined' && !window.__ZU_RPC_HUSH) {
  window.__ZU_RPC_HUSH = true;

  /* capture-phase swallow so DevTools doesn’t spam red overlay */
  const hushEvent = (ev) => {
    if (isSim500(ev.message) || isSim500(ev.reason)) {
      ev.preventDefault?.();
      return false;
    }
  };
  window.addEventListener('error',              hushEvent, true);
  window.addEventListener('unhandledrejection', hushEvent, true);

  /* mute console.error/warn lines originating from 500 */
  ['error', 'warn'].forEach((k) => {
    const orig = console[k].bind(console);
    console[k] = (...args) => { if (!args.some(isSim500)) orig(...args); };
  });
}

/*──────── deep bytes-string probe for oversize hex ──────────*/
const hasHugeHex = (node) => {
  if (typeof node === 'string') {
    return /^[\da-fA-F]+$/.test(node) && node.length > HEX_LIMIT;
  }
  if (Array.isArray(node))        return node.some(hasHugeHex);
  if (node && typeof node === 'object')
                                 return Object.values(node).some(hasHugeHex);
  return false;
};

/*──────── attempt estimator, hush 500, allow retry ─────────*/
async function safeEstimate(fn) {
  try { return await fn(); }
  catch (e) { if (isSim500(e)) return null; throw e; }
}

/**
 * useTxEstimate(toolkit, paramsArray)
 * Returns { feeTez, storageTez, isLoading, isInsufficient, error }.
 */
export default function useTxEstimate(toolkit, params) {
  const [state, setState] = useState({
    feeTez: '0',
    storageTez: '0',
    isLoading: false,
    isInsufficient: false,
    error: null,
  });

  useEffect(() => {
    let live = true;
    (async () => {
      if (!toolkit || !Array.isArray(params) || params.length === 0) {
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }

      /* oversize skip – avoids protocol 32 768 B breach */
      if (params.some((p) => hasHugeHex(p?.parameter))) {
        setState({
          feeTez: '—',
          storageTez: '—',
          isLoading: false,
          isInsufficient: false,
          error: null,
        });
        return;
      }

      try {
        setState((s) => ({ ...s, isLoading: true, error: null }));

        const est = await safeEstimate(() =>
          toolkit.estimate.batch(
            params.map((p) => ({ kind: OpKind.TRANSACTION, ...p })),
          ),
        );

        /* null ⇒ node 500’d; fall back to placeholders, allow next try */
        if (!est) {
          if (live) {
            setState({
              feeTez: '—',
              storageTez: '—',
              isLoading: false,
              isInsufficient: false,
              error: null,
            });
          }
          return;
        }

        const feeMutez     = est.reduce((t, e) => t + e.suggestedFeeMutez, 0);
        const storageMutez = est.reduce((t, e) => t + e.burnFeeMutez,      0);
        const balance      = await toolkit.tz.getBalance(await toolkit.wallet.pkh());
        const isInsufficient = feeMutez + storageMutez > balance.toNumber();

        if (live) {
          setState({
            feeTez: toTez(feeMutez),
            storageTez: toTez(storageMutez),
            isLoading: false,
            isInsufficient,
            error: null,
          });
        }
      } catch (e) {
        if (live) {
          setState({
            feeTez: '—',
            storageTez: '—',
            isLoading: false,
            isInsufficient: false,
            error: e?.message || String(e),
          });
        }
      }
    })();
    return () => { live = false; };
  }, [toolkit, params]);

  return state;
}
/* What changed & why:
   • Removed session-wide disable flag – estimator now retries next call.
   • Hush logic unchanged for console & global events.
   • Early-return on oversize unchanged.
   • safeEstimate() returns `null` on 500 so UI falls back to "—" yet
     subsequent attempts may still succeed.
*/
/* EOF */
