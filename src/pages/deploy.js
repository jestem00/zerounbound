/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/deploy.js
  Rev :    r1006   2025‑08‑02
  Summary: fully‑expanded file; syncs with net.js r1002
─────────────────────────────────────────────────────────────*/
import React, {
  useRef, useState, useCallback,
}                           from 'react';
import { MichelsonMap }     from '@taquito/michelson-encoder';
import {
  char2Bytes, b58cdecode, prefix, buf2hex,
}                           from '@taquito/utils';
import { InMemorySigner }   from '@taquito/signer';

import DeployCollectionForm from '../ui/DeployCollectionForm.jsx';
import PixelHeading         from '../ui/PixelHeading.jsx';
import CRTFrame             from '../ui/CRTFrame.jsx';
import OperationOverlay     from '../ui/OperationOverlay.jsx';
import { useWallet }        from '../contexts/WalletContext.js';
import { TZKT_API }         from '../config/deployTarget.js';
import { jFetch, sleep }    from '../core/net.js';
import contractCode         from '../../contracts/Zero_Contract_V4.tz';
import viewsHex             from '../constants/views.hex.js';
import {
  forgeOrigination,
  injectSigned,
}                           from '../core/net.js';

/*──────── helpers ───────────────────────────────────────────*/
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
    if (i % STEP === 0) cb((i / length) * 100);
  }
  cb(100);
  return `0x${hex}`;
};

const hexToString = (hex) => {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const len = h.length;
  const bytes = new Uint8Array(len / 2);
  for (let i = 0; i < len; i += 2)
    bytes[i / 2] = parseInt(h.slice(i, i + 2), 16);
  return new TextDecoder().decode(bytes);
};

/* add 1‑byte curve tag */
const sigHexWithTag = (sig) => {
  if (sig.startsWith('edsig')) return `${buf2hex(b58cdecode(sig, prefix.edsig))}00`;
  if (sig.startsWith('spsig')) return `${buf2hex(b58cdecode(sig, prefix.spsig))}01`;
  if (sig.startsWith('p2sig')) return `${buf2hex(b58cdecode(sig, prefix.p2sig))}02`;
  throw new Error('Unknown signature prefix');
};

/*──────── constants ─────────────────────────────────────────*/
const blank = () => new MichelsonMap();
const BURN  = 'tz1burnburnburnburnburnburnburjAYjjX';
const OP_WATERMARK = '03';

export const STORAGE_TEMPLATE = {
  active_tokens     : [],
  admin             : '',
  burn_address      : BURN,
  children          : [],
  collaborators     : [],
  contract_id       : `0x${char2Bytes('ZeroContract')}`,
  destroyed_tokens  : [],
  extrauri_counters : blank(),
  ledger            : blank(),
  lock              : false,
  metadata          : blank(),
  next_token_id     : 0,
  operators         : blank(),
  parents           : [],
  token_metadata    : blank(),
  total_supply      : blank(),
};

/*════════ component ════════════════════════════════════════*/
export default function DeployPage() {
  const {
    toolkit, address, connect, wallet,
  } = useWallet();

  const rafRef        = useRef(0);
  const [step, setStep]       = useState(-1);
  const [pct,  setPct]        = useState(0);
  const [label, setLabel]     = useState('');
  const [kt1,   setKt1]       = useState('');
  const [opHash, setOpHash]   = useState('');
  const [err,   setErr]       = useState('');

  const reset = () => {
    setStep(-1); setPct(0); setLabel('');
    setKt1(''); setOpHash(''); setErr('');
    cancelAnimationFrame(rafRef.current);
  };

  const retryConnect = useCallback(async () => {
    try { await connect(); }
    catch (e) {
      if (/Receiving end does not exist/i.test(e.message))
        setErr('Temple extension not responding. Restart browser and try again.');
      else setErr(e.message);
    }
  }, [connect]);

  /*──────── origination handler ───────────────────────────*/
  async function originate(meta) {
    if (step !== -1) return;

    /*── decide signer (secret‑key vs wallet) ─────────────*/
    const secretKey = meta.secretKey?.trim() || '';
    let publicKey, sourceAddr, signer, useSecret = false;

    if (secretKey) {
      useSecret = true;
      try { signer = await InMemorySigner.fromSecretKey(secretKey); }
      catch (e) { setErr(`Invalid secret key: ${e.message}`); return; }
      publicKey  = await signer.publicKey();
      sourceAddr = await signer.publicKeyHash();
    } else {
      if (!address) await retryConnect().catch(() => {});
      if (!toolkit) { setErr('Toolkit not ready'); return; }
      const acc = await wallet.client.getActiveAccount();
      if (!acc?.publicKey) { setErr('Wallet publicKey unavailable – reconnect wallet.'); return; }
      publicKey  = acc.publicKey;
      sourceAddr = address;
    }

    /*── build metadata (compress) ───────────────────────*/
    setStep(0); setLabel('Compressing metadata'); setPct(0);

    const orderedMeta = {
      name        : meta.name.trim(),
      symbol      : meta.symbol.trim(),
      description : meta.description.trim(),
      version     : 'ZeroContractV4',
      license     : meta.license.trim(),
      authors     : meta.authors,
      homepage    : meta.homepage.trim(),
      authoraddress: meta.authoraddress,
      creators    : meta.creators,
      type        : meta.type,
      interfaces  : uniqInterfaces(meta.interfaces),
      imageUri    : meta.imageUri,
      views       : JSON.parse(hexToString(viewsHex)).views,
    };

    const headerBytes = `0x${char2Bytes('tezos-storage:content')}`;
    let bodyBytes;
    try {
      if (window.Worker) {
        const worker = new Worker(new URL('../workers/originate.worker.js', import.meta.url), { type:'module' });
        const id = Date.now();
        bodyBytes = await new Promise((resolve, reject) => {
          worker.onmessage = ({ data }) => {
            if (data.progress !== undefined) setPct((data.progress / 100) * 0.25);
            if (data.body)  resolve(data.body);
            if (data.error) reject(new Error(data.error));
          };
          worker.postMessage({ meta: orderedMeta, taskId: id });
        });
        worker.terminate();
      } else {
        bodyBytes = utf8ToHex(JSON.stringify(orderedMeta), p => setPct(p / 4));
      }
    } catch (e) {
      setErr(`Metadata compression failed: ${e.message}`); return;
    }

    /*── forge ───────────────────────────────────────────*/
    setStep(1); setLabel('Check wallet & sign'); setPct(0.25);

    const md = new MichelsonMap();
    md.set('', headerBytes);
    md.set('content', bodyBytes);

    let opBytes;
    try {
      opBytes = await forgeOrigination(
        contractCode,
        { ...STORAGE_TEMPLATE, admin: sourceAddr, metadata: md },
        sourceAddr,
        publicKey,
      );
    } catch (e) { setErr(e.message); return; }

    /*── sign ────────────────────────────────────────────*/
    cancelAnimationFrame(rafRef.current);
    setStep(2); setLabel('Signing bytes'); setPct(0.5);

    const payloadHex = `${OP_WATERMARK}${opBytes}`;
    let signature;
    try {
      if (useSecret) {
        signature = (await signer.sign(payloadHex)).prefixSig;
      } else {
        const res = await wallet.client.requestSignPayload({
          signingType:'operation', payload:payloadHex, sourceAddress:sourceAddr,
        });
        signature = res.signature;
      }
    } catch (e) { setErr(`Signing failed: ${e.message}`); return; }

    /*── inject ──────────────────────────────────────────*/
    setStep(3); setLabel('Injecting'); setPct(0.75);

    const signedBytes = `${opBytes}${sigHexWithTag(signature)}`;
    let opHashVal;
    try { opHashVal = await injectSigned(signedBytes); }
    catch (e) { setErr(e.message); return; }

    /*── confirm ─────────────────────────────────────────*/
    setStep(4); setLabel('Confirming on-chain'); setPct(1); setOpHash(opHashVal);

    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      try {
        const ops = await jFetch(`${TZKT_API}/v1/operations/${opHashVal}`);
        const op  = ops.find(o => o.hash === opHashVal && o.status === 'applied');
        if (op?.originatedContracts?.length) { setKt1(op.originatedContracts[0].address); break; }
      } catch { /* ignore polling errors */ }
    }
  }

  /*──────── render ───────────────────────────────────────*/
  return (
    <>
      <PixelHeading level={2}>Deploy New Collection</PixelHeading>
      <CRTFrame><DeployCollectionForm onDeploy={originate} /></CRTFrame>
      {(step !== -1 || err) && (
        <OperationOverlay
          status={label} step={step} pct={pct} err={err}
          opHash={opHash} kt1={kt1} onRetry={reset} onCancel={reset}
        />
      )}
    </>
  );
}
/* EOF */