/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/deploy.js
  Rev :    r1019   2025‑07‑19
  Summary: dual‑stage origination with metadata patch

  This page implements a two‑stage collection origination to
  accommodate Temple Wallet’s strict payload limits.  Stage 1
  originates the contract with minimal metadata (placeholder
  views and a tiny placeholder image) via `wallet.originate`.  After
  confirmation, Stage 2 compresses the full metadata (including
  off‑chain views and the real image) and calls the
  `edit_contract_metadata` entrypoint to patch the contract.
  Progress and errors are displayed via OperationOverlay with
  signature 1/2 and 2/2 indicators.  State is persisted in
  localStorage to resume the patch if the page reloads or the
  transaction fails.
────────────────────────────────────────────────────────────*/

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { MichelsonMap } from '@taquito/michelson-encoder';
import { char2Bytes } from '@taquito/utils';

import DeployCollectionForm from '../ui/DeployCollectionForm.jsx';
import PixelHeading from '../ui/PixelHeading.jsx';
import CRTFrame from '../ui/CRTFrame.jsx';
import OperationOverlay from '../ui/OperationOverlay.jsx';
import { useWallet } from '../contexts/WalletContext.js';
import { TZKT_API } from '../config/deployTarget.js';
import { jFetch, sleep } from '../core/net.js';
import contractCode from '../../contracts/Zero_Contract_V4.tz';
import viewsHex from '../constants/views.hex.js';

/*──────── helpers ───────────────────────────────────────────*/
const uniqInterfaces = (src = []) => {
  const base = ['TZIP-012', 'TZIP-016'];
  const map = new Map();
  [...src, ...base].forEach((i) => {
    const k = String(i ?? '').trim();
    if (k) map.set(k.toUpperCase(), k);
  });
  return Array.from(map.values());
};

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

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
  for (let i = 0; i < len; i += 2) bytes[i / 2] = parseInt(h.slice(i, i + 2), 16);
  return new TextDecoder().decode(bytes);
};

/*──────── constants ─────────────────────────────────────────*/
const blank = () => new MichelsonMap();
const BURN = 'tz1burnburnburnburnburnburnburjAYjjX';

export const STORAGE_TEMPLATE = {
  active_tokens   : [],
  admin           : '',
  burn_address    : BURN,
  children        : [],
  collaborators   : [],
  contract_id     : `0x${char2Bytes('ZeroContract')}`,
  destroyed_tokens: [],
  extrauri_counters: blank(),
  ledger           : blank(),
  lock             : false,
  metadata         : blank(),
  next_token_id    : 0,
  operators        : blank(),
  parents          : [],
  token_metadata   : blank(),
  total_supply     : blank(),
};

/*──────── component ────────────────────────────────────────*/
export default function DeployPage() {
  const { toolkit, address, connect, wallet } = useWallet();

  const rafRef = useRef(0);
  const [step, setStep]   = useState(-1);
  const [pct, setPct]     = useState(0);
  const [label, setLabel] = useState('');
  const [kt1, setKt1]     = useState('');
  const [opHash, setOpHash] = useState('');
  const [err, setErr]       = useState('');
  const [resumeMeta, setResumeMeta] = useState(null);

  /* localStorage keys for resume support */
  const LS_KT1  = 'zu_deploy_kt1';
  const LS_META = 'zu_deploy_meta';

  /* clear and reset state */
  const reset = () => {
    setStep(-1);
    setPct(0);
    setLabel('');
    setKt1('');
    setOpHash('');
    setErr('');
    setResumeMeta(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_KT1);
      localStorage.removeItem(LS_META);
    }
    cancelAnimationFrame(rafRef.current);
  };

  /* load resume state if stage2 incomplete */
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const savedKt  = localStorage.getItem(LS_KT1);
    const savedMet = localStorage.getItem(LS_META);
    if (savedKt && savedMet) {
      setKt1(savedKt);
      setResumeMeta(savedMet);
      setStep(4);
      setLabel('Ready for metadata patch');
    }
  }, []);

  /* ensure wallet is connected */
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

  /**
   * Build full metadata JSON string with views and the actual image.
   */
  async function buildFullMeta(meta) {
    const ordered = {
      name        : meta.name.trim(),
      symbol      : meta.symbol.trim(),
      description : meta.description.trim(),
      version     : 'ZeroContractV4',
      license     : meta.license.trim(),
      authors     : meta.authors,
      homepage    : meta.homepage.trim() || undefined,
      authoraddress: meta.authoraddress,
      creators    : meta.creators,
      type        : meta.type,
      interfaces  : uniqInterfaces(meta.interfaces),
      imageUri    : meta.imageUri,
      views       : JSON.parse(hexToString(viewsHex)).views,
    };
    return JSON.stringify(ordered);
  }

  /**
   * Patch contract metadata via edit_contract_metadata.
   */
  async function patchMetadata(metaJson, contractAddr) {
    try {
      setStep(5);
      setLabel('Compressing metadata (2/2)');
      setPct(0.5);
      const headerBytes = `0x${char2Bytes('tezos-storage:content')}`;
      let bodyBytes;
      if (typeof window !== 'undefined' && window.Worker) {
        const worker = new Worker(new URL('../workers/originate.worker.js', import.meta.url), {
          type: 'module',
        });
        const taskId = Date.now();
        bodyBytes = await new Promise((resolve, reject) => {
          worker.onmessage = ({ data }) => {
            if (data.progress !== undefined) setPct(0.5 + (data.progress / 100) * 0.25);
            if (data.body) resolve(data.body);
            if (data.error) reject(new Error(data.error));
          };
          worker.postMessage({ meta: JSON.parse(metaJson), taskId });
        });
        worker.terminate();
      } else {
        bodyBytes = utf8ToHex(metaJson, (p) => setPct(0.5 + p / 4));
      }
      setStep(6);
      setLabel('Signing metadata update (2/2)');
      setPct(0.75);
      const contract = await toolkit.wallet.at(contractAddr);
      const op = await contract.methods.edit_contract_metadata(bodyBytes).send();
      setStep(7);
      setLabel('Confirming metadata update');
      setPct(0.9);
      await op.confirmation();
      /* success */
      setStep(8);
      setLabel('Deployment complete');
      setPct(1);
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LS_KT1);
        localStorage.removeItem(LS_META);
      }
      setResumeMeta(null);
    } catch (e) {
      if (/Receiving end does not exist/i.test(e.message)) {
        setErr('Temple connection failed. Restart browser/extension.');
      } else {
        setErr(e.message || String(e));
      }
    }
  }

  /**
   * Main deploy handler; initiates stage 1 or resumes stage 2.
   */
  async function originate(meta) {
    if (step !== -1) return;
    setErr('');
    // resume stage 2 if saved
    if (resumeMeta && kt1) {
      await patchMetadata(resumeMeta, kt1);
      return;
    }
    // connect wallet
    if (!address) await retryConnect().catch(() => {});
    if (!toolkit) { setErr('Toolkit not ready'); return; }
    // ensure public key for reveal
    const acc = await wallet.client.getActiveAccount();
    if (!acc?.publicKey) {
      setErr('Wallet publicKey unavailable – reconnect wallet.');
      return;
    }
    // stage 1: build minimal metadata
    setStep(0);
    setLabel('Compressing metadata (1/2)');
    setPct(0);
    const minimal = {
      name        : meta.name.trim(),
      symbol      : meta.symbol.trim(),
      description : meta.description.trim(),
      version     : 'ZeroContractV4',
      license     : meta.license.trim(),
      authors     : meta.authors,
      homepage    : meta.homepage.trim() || undefined,
      authoraddress: meta.authoraddress,
      creators    : meta.creators,
      type        : meta.type,
      interfaces  : uniqInterfaces(meta.interfaces),
      // tiny gray pixel as placeholder image
      imageUri    : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkZGQiIC8+PC9zdmc+',
      views       : '0x00',
    };
    const headerBytes = `0x${char2Bytes('tezos-storage:content')}`;
    let bodyMin;
    try {
      if (typeof window !== 'undefined' && window.Worker) {
        const worker = new Worker(new URL('../workers/originate.worker.js', import.meta.url), {
          type: 'module',
        });
        const taskId = Date.now();
        bodyMin = await new Promise((resolve, reject) => {
          worker.onmessage = ({ data }) => {
            if (data.progress !== undefined) setPct((data.progress / 100) * 0.25);
            if (data.body) resolve(data.body);
            if (data.error) reject(new Error(data.error));
          };
          worker.postMessage({ meta: minimal, taskId });
        });
        worker.terminate();
      } else {
        bodyMin = utf8ToHex(JSON.stringify(minimal), (p) => setPct(p / 4));
      }
    } catch (e) {
      setErr(`Metadata compression failed: ${e.message || String(e)}`);
      return;
    }
    setStep(1);
    setLabel('Preparing origination (1/2)');
    setPct(0.25);
    const md = new MichelsonMap();
    md.set('', headerBytes);
    md.set('content', bodyMin);
    try {
      const origOp = await toolkit.wallet.originate({
        code: contractCode,
        storage: { ...STORAGE_TEMPLATE, admin: address, metadata: md },
      });
      setStep(2);
      setLabel('Waiting for wallet signature (1/2)');
      setPct(0.4);
      const op = await origOp.send();
      setStep(3);
      setLabel('Confirming origination');
      setPct(0.6);
      setOpHash(op.opHash);
      await op.confirmation();
      const contractAddr = op.contractAddress;
      setKt1(contractAddr);
      setPct(0.8);
      // poll TzKT (optional) for final confirmation
      for (let i = 0; i < 20; i++) {
        await sleep(3000);
        try {
          const ops = await jFetch(`${TZKT_API}/v1/operations/${op.opHash}`);
          const opInfo = ops.find((o) => o.hash === op.opHash && o.status === 'applied');
          if (opInfo?.originatedContracts?.length) {
            setKt1(opInfo.originatedContracts[0].address);
            break;
          }
        } catch {}
      }
      setStep(4);
      setLabel('Origination complete – preparing patch');
      setPct(0.85);
      // build full metadata and store for resume
      const fullJson = await buildFullMeta(meta);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LS_KT1, contractAddr);
        localStorage.setItem(LS_META, fullJson);
      }
      setResumeMeta(fullJson);
      // initiate patch immediately
      await patchMetadata(fullJson, contractAddr);
    } catch (e) {
      if (/Receiving end does not exist/i.test(e.message)) {
        setErr('Temple connection failed. Restart browser/extension.');
      } else {
        setErr(e.message || String(e));
      }
    }
  }

  /*──────── render ───────────────────────────────────────*/
  return (
    <>
      <PixelHeading level={2}>Deploy New Collection</PixelHeading>
      <CRTFrame>
        <DeployCollectionForm onDeploy={originate} />
      </CRTFrame>
      {(step !== -1 || err) && (
        <OperationOverlay
          status={label}
          step={step}
          pct={pct}
          err={err}
          opHash={opHash}
          kt1={kt1}
          current={step}
          total={resumeMeta ? 2 : 2}
          onRetry={() => {
            if (resumeMeta && kt1) patchMetadata(resumeMeta, kt1);
            else reset();
          }}
          onCancel={reset}
        />
      )}
    </>
  );
}

/* What changed & why:
   • Introduced dual‑stage origination to work around Temple’s
     message size limits: minimal metadata in stage 1, then full
     metadata patched via edit_contract_metadata in stage 2.
   • Added localStorage resume logic to ensure interrupted
     deployments can continue with the metadata patch without
     re-originating the contract.
   • Enhanced OperationOverlay interaction: displays signature
     progress (1/2, 2/2) and handles retries appropriately.
   • Updated revision and summary accordingly.
*/