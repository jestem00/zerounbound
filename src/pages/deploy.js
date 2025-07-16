/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/deploy.js
  Rev :    r751   2025‑07‑15
  Summary: add 30s worker timeout; check mismatch after connect
──────────────────────────────────────────────────────────────*/
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { MichelsonMap }                                     from '@taquito/michelson-encoder';
import { char2Bytes }                                       from '@taquito/utils';

import DeployCollectionForm from '../ui/DeployCollectionForm.jsx';
import PixelHeading         from '../ui/PixelHeading.jsx';
import CRTFrame             from '../ui/CRTFrame.jsx';
import OperationOverlay     from '../ui/OperationOverlay.jsx';
import { useWallet }        from '../contexts/WalletContext.js';
import contractCode         from '../../contracts/Zero_Contract_V4.tz';

/*──────── worker integration ─────*/
const worker = typeof window !== 'undefined' ? new Worker(new URL('../workers/originate.worker.js', import.meta.url)) : null;

/*──────── helpers ─────*/
const uniqInterfaces = (src = []) => {
  const base = ['TZIP-012', 'TZIP-016'];
  const map  = new Map();
  [...src, ...base].forEach((i) => {
    const k = String(i ?? '').trim();
    if (k) map.set(k.toUpperCase(), k);
  });
  return Array.from(map.values());
};

/*──────── constants ─────*/
const blank = () => new MichelsonMap();
const BURN  = 'tz1burnburnburnburnburnburnburjAYjjX';

export const STORAGE_TEMPLATE = {
  active_tokens: [], admin: '', burn_address: BURN,
  children: [], collaborators: [],
  contract_id: `0x${char2Bytes('ZeroContract')}`,
  destroyed_tokens: [], extrauri_counters: blank(),
  ledger: blank(), lock: false, metadata: blank(), next_token_id: 0,
  operators: blank(), parents: [], token_metadata: blank(), total_supply: blank(),
};

/*──────── component ─────*/
export default function DeployPage() {
  const { toolkit, address, connect, networkMismatch } = useWallet();

  const [step, setStep]   = useState(-1);
  const [pct, setPct]     = useState(0);
  const [label, setLabel] = useState('');
  const [kt1, setKt1]     = useState('');
  const [err, setErr]     = useState('');

  const reset = () => {
    setStep(-1); setPct(0); setLabel(''); setKt1(''); setErr('');
  };

  useEffect(() => {
    return () => worker?.terminate();
  }, []);

  const originate = useCallback(async (meta) => {
    if (step !== -1) return;
    await connect();
    if (!address) { setErr('Wallet not connected'); return; }
    if (networkMismatch) { setErr('Network mismatch - disconnect wallet and retry'); return; }
    if (!toolkit) { setErr('Toolkit not ready'); return; }
    if (!worker) { setErr('Worker unavailable'); return; }

    /* stage‑0 pack in worker */
    setStep(0); setLabel('Compressing metadata'); setPct(0);

    const taskId = Date.now().toString();
    const timeoutId = setTimeout(() => {
      setErr('Metadata compression timeout');
      worker.terminate();
      reset();
    }, 30000);

    const onMessage = (e) => {
      const d = e.data;
      if (d.taskId !== taskId) return;
      clearTimeout(timeoutId);
      if (d.progress) {
        setPct(d.progress / 400);  // 0-0.25 range
        return;
      }
      worker.removeEventListener('message', onMessage);
      handleWorkerResponse(d);
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ meta, taskId });
  }, [address, toolkit, connect, step, networkMismatch]);

  async function handleWorkerResponse({ header, body, error: wErr }) {
    if (wErr) {
      setErr(wErr);
      return;
    }

    /* stage‑1 wallet */
    setStep(1); setLabel('Check wallet & sign'); setPct(0.25);

    const md = new MichelsonMap();
    md.set('', header);
    md.set('content', body);

    try {
      const op = await toolkit.wallet.originate({
        code: contractCode,
        storage: { ...STORAGE_TEMPLATE, admin: address, metadata: md },
      }).send();

      setStep(2); setLabel('Forging & injecting'); setPct(0.5);

      await op.confirmation(2);
      setStep(3); setLabel('Confirming on-chain'); setPct(0.75);

      const adr =
        op.contractAddress ||
        (await op.contract())?.address ||
        op.results?.[0]?.metadata?.operation_result?.originated_contracts?.[0];
      if (!adr) throw new Error('Originated KT1 not found');

      setKt1(adr);
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  /* page content flows normally -- Main provides scrolling */
  return (
    <div style={{ width: '100%', padding: '1rem', boxSizing: 'border-box' }}>
      <CRTFrame style={{ maxWidth: 900, margin: '0 auto' }}>
        <PixelHeading>Create Collection</PixelHeading>
        <DeployCollectionForm onDeploy={originate} />
        {(step !== -1 || err) && (
          <OperationOverlay
            status={label}
            progress={pct}
            kt1={kt1}
            error={err}
            onRetry={reset}
            onCancel={reset}
          />
        )}
      </CRTFrame>
    </div>
  );
}
/* What changed & why: Added 30s timeout for worker response; check networkMismatch after connect; rev r751; Compile-Guard passed. */
/* EOF */