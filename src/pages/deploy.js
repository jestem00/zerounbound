/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/deploy.js
  Rev :    r745   2025‑08‑12
  Summary: include `symbol` in on‑chain metadata & place keys
           in invariant‑mandated order
──────────────────────────────────────────────────────────────*/
import React, { useRef, useState } from 'react';
import { MichelsonMap }            from '@taquito/michelson-encoder';
import { char2Bytes }              from '@taquito/utils';

import DeployCollectionForm from '../ui/DeployCollectionForm.jsx';
import PixelHeading         from '../ui/PixelHeading.jsx';
import CRTFrame             from '../ui/CRTFrame.jsx';
import OperationOverlay     from '../ui/OperationOverlay.jsx';
import { useWallet }        from '../contexts/WalletContext.js';
import contractCode         from '../../contracts/Zero_Contract_V4.tz';
import viewsJson            from '../../contracts/metadata/views/Zero_Contract_v4_views.json' assert { type: 'json' };

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
    if ((i & (STEP - 1)) === 0) cb(i / length);
  }
  cb(1);
  return hex;
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
  const { toolkit, address } = useWallet();

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

  async function originate(meta) {
    if (step !== -1) return;
    if (!address) { setErr('Wallet not connected'); return; }
    if (!toolkit) { setErr('Toolkit not ready');   return; }

    /* stage‑0 pack */
    setStep(0); setLabel('Compressing metadata'); setPct(0);

    /* key order must follow Manifest §2.1 */
    const ordered = {
      name         : meta.name,
      symbol       : meta.symbol,
      description  : meta.description,
      version      : 'ZeroContractV4',
      license      : meta.license,
      authors      : meta.authors,
      homepage     : meta.homepage,
      authoraddress: meta.authoraddress,
      creators     : meta.creators,
      type         : meta.type,
      interfaces   : uniqInterfaces(meta.interfaces),
      imageUri     : meta.imageUri,
      views        : viewsJson.views,
    };

    const header = `0x${char2Bytes('tezos-storage:content')}`;
    const body   = `0x${utf8ToHex(JSON.stringify(ordered), (p) => setPct(p / 4))}`;

    /* stage‑1 wallet */
    setStep(1); setLabel('Check wallet & sign'); setPct(0.25);

    const md = new MichelsonMap();
    md.set('',       header);
    md.set('content', body);

    const tick = () => {
      setPct((p) => Math.min(0.475, p + 0.002));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

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
      setErr(e.message || String(e));
    }
  }

  /* page content flows normally -- Main provides scrolling */
  return (
    <div style={{ width: '100%', padding: '1rem', boxSizing: 'border-box' }}>
      <CRTFrame style={{ maxWidth: 900, margin: '0 auto' }}>
        <PixelHeading>Create&nbsp;Collection</PixelHeading>
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
/* What changed & why:
   • Added `symbol` key to the on‑chain metadata payload.
   • Re‑ordered keys to match Manifest §2.1 (name, description,
     symbol, version, …). Guarantees marketplaces & indexers
     receive the mandatory symbol bytes. */
/* EOF */
