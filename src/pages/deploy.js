/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/deploy.js
  Rev :    r747   2025-08-12
  Summary: handle Temple-specific errors; add retry logic
──────────────────────────────────────────────────────────────*/
import React, { useRef, useState, useCallback } from 'react';
import { MichelsonMap }            from '@taquito/michelson-encoder';
import { char2Bytes }              from '@taquito/utils';

import DeployCollectionForm from '../ui/DeployCollectionForm.jsx';
import PixelHeading         from '../ui/PixelHeading.jsx';
import CRTFrame             from '../ui/CRTFrame.jsx';
import OperationOverlay     from '../ui/OperationOverlay.jsx';
import { useWallet }        from '../contexts/WalletContext.js';
import contractCode         from '../../contracts/Zero_Contract_V4.tz';
import viewsHex             from '../constants/views.hex.js';

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

const HEX = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0'),
);
const utf8ToHex = (str, cb) => {
  const bytes = new TextEncoder().encode(str);
  const { length } = bytes;
  let hex = '';
  const STEP = 4096;
  for (let i = 0; i < length; i += 1) {
    hex += HEX[bytes[i]];
    if (i % STEP === 0) cb(i / length * 100);
  }
  cb(100);
  return '0x' + hex;
};

/*──────── constants ─────*/
const blank = () => new MichelsonMap();
const BURN  = 'tz1burnburnburnburnburnburnburjAYjjX';

export const STORAGE_TEMPLATE = {
  active_tokens: [], admin: '', burn_address: BURN,
  children: [], collaborators: [],
  contract_id: '0x' + char2Bytes('ZeroContract'),
  destroyed_tokens: [], extrauri_counters: blank(),
  ledger: blank(), lock: false, metadata: blank(), next_token_id: 0,
  operators: blank(), parents: [], token_metadata: blank(), total_supply: blank(),
};

/*──────── component ─────*/
export default function DeployPage() {
  const { toolkit, address, connect } = useWallet();

  const rafRef        = useRef(0);
  const [step, setStep]   = useState(-1);
  const [pct, setPct]     = useState(0);
  const [label, setLabel] = useState('');
  const [kt1, setKt1]     = useState('');
  const [err, setErr]     = useState('');

  const reset = () => {
    setStep(-1); setPct(0); setLabel(''); setKt1(''); setErr('');
    cancelAnimationFrame(rafRef.current);
  };

  const retryConnect = useCallback(async () => {
    try {
      await connect();
    } catch (e) {
      if (/Receiving end does not exist/i.test(e.message)) {
        setErr('Temple extension not responding. Restart browser and try again.');
      } else {
        setErr(e.message);
      }
    }
  }, [connect]);

  async function originate(meta) {
    if (step !== -1) return;
    if (!address) {
      try {
        await retryConnect();
      } catch {
        return;
      }
    }
    if (!toolkit) { setErr('Toolkit not ready');   return; }

    setStep(0); setLabel('Compressing metadata'); setPct(0);

    /* key order must follow Manifest §2.1 */
    const ordered = {
      name         : meta.name.trim(),
      symbol       : meta.symbol.trim(),
      description  : meta.description.trim(),
      version      : 'ZeroContractV4',
      license      : meta.license.trim(),
      authors      : meta.authors,
      homepage     : meta.homepage.trim(),
      authoraddress: meta.authoraddress,
      creators     : meta.creators,
      type         : meta.type,
      interfaces   : uniqInterfaces(meta.interfaces),
      imageUri     : meta.imageUri,
      views        : JSON.parse(hexToString(viewsHex)).views,
    };

    const headerBytes = '0x' + char2Bytes('tezos-storage:content');
    let bodyBytes;
    try {
      if (window.Worker) {
        const worker = new Worker(new URL('../workers/originate.worker.js', import.meta.url));
        const taskId = Date.now();
        bodyBytes = await new Promise((resolve, reject) => {
          worker.onmessage = ({ data }) => {
            if (data.progress !== undefined) {
              setPct(data.progress / 100 * 0.25);
            }
            if (data.body) {
              resolve(data.body);
            }
            if (data.error) {
              reject(new Error(data.error));
            }
          };
          worker.postMessage({ meta: ordered, taskId });
        });
        worker.terminate();
      } else {
        bodyBytes = '0x' + utf8ToHex(JSON.stringify(ordered), p => setPct(p / 4));
      }
    } catch (e) {
      setErr('Metadata compression failed: ' + (e.message || String(e)));
      return;
    }

    setStep(1); setLabel('Check wallet & sign'); setPct(0.25);

    const md = new MichelsonMap();
    md.set('', headerBytes);
    md.set('content', bodyBytes);

    const tick = () => {
      setPct(p => Math.min(0.475, p + 0.002));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    try {
      const op = await toolkit.wallet.originate({
        code: contractCode,
        storage: { ...STORAGE_TEMPLATE, admin: address, metadata: md },
      }).send();

      cancelAnimationFrame(rafRef.current);
      setStep(2); setLabel('Forging & injecting'); setPct(0.5);

      await op.confirmation(2);
      setStep(3); setLabel('Confirming on-chain'); setPct(1);

      const adr =
        op.contractAddress ||
        (await op.contract())?.address ||
        op.results?.[0]?.metadata?.operation_result?.originated_contracts?.[0];
      if (!adr) throw new Error('Originated KT1 not found');
      setKt1(adr);
    } catch (e) {
      cancelAnimationFrame(rafRef.current);
      if (/Receiving end does not exist/i.test(e.message)) {
        setErr('Temple connection failed. Restart browser/extension.');
      } else {
        setErr(e.message || String(e));
      }
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
/* What changed & why: Added retryConnect for Temple errors; specific err msg for connection issues; rev r747; Compile-Guard passed. */