/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/hooks/useTxEstimate.js
  Rev :    r420   2025-06-07
  Summary: Graceful “—” on error; zero-fees show 0.000000
──────────────────────────────────────────────────────────────*/

import { useEffect, useState } from 'react';
import { OpKind }              from '@taquito/taquito';

/*──────── helpers ───────*/
const toTez = (m) => (m / 1_000_000).toFixed(6);

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
      if (!toolkit || !Array.isArray(params) || !params.length) {
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }
      try {
        setState((s) => ({ ...s, isLoading: true, error: null }));
        const est = await toolkit.estimate.batch(
          params.map((p) => ({ kind: OpKind.TRANSACTION, ...p })),
        );

        const feeMutez     = est.reduce((t, e) => t + e.suggestedFeeMutez, 0);
        const storageMutez = est.reduce((t, e) => t + e.burnFeeMutez, 0);

        const balance = await toolkit.tz.getBalance(await toolkit.wallet.pkh());
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
   • On estimator failure fee/storage now “—”.
   • Legitimate zero-value estimates show 0.000000. */
/* EOF */
