/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/deploy.js
  Rev :    r1017   2025‑07‑19
  Summary: use wallet.originate; remove manual forge/inject flows

  This page now performs contract origination exclusively via the
  Beacon wallet.  It compresses metadata, builds the Michelson
  storage map and then invokes `toolkit.wallet.originate`.  The
  wallet handles estimation, forging, signing and injection,
  eliminating Temple/Kukai injection failures.  Secret‑key
  override support has been removed.  Progress steps and error
  handling remain consistent with prior versions.
────────────────────────────────────────────────────────────*/

import React, { useRef, useState, useCallback } from 'react';
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

/*──────── constants ─────────────────────────────────────────*/
const blank = () => new MichelsonMap();
const BURN = 'tz1burnburnburnburnburnburnburjAYjjX';

export const STORAGE_TEMPLATE = {
  active_tokens: [],
  admin: '',
  burn_address: BURN,
  children: [],
  collaborators: [],
  contract_id: `0x${char2Bytes('ZeroContract')}`,
  destroyed_tokens: [],
  extrauri_counters: blank(),
  ledger: blank(),
  lock: false,
  metadata: blank(),
  next_token_id: 0,
  operators: blank(),
  parents: [],
  token_metadata: blank(),
  total_supply: blank(),
};

/*════════ component ════════════════════════════════════════*/
export default function DeployPage() {
  const {
    toolkit,
    address,
    connect,
  } = useWallet();

  const rafRef = useRef(0);
  const [step, setStep] = useState(-1);
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState('');
  const [kt1, setKt1] = useState('');
  const [opHash, setOpHash] = useState('');
  const [err, setErr] = useState('');

  const reset = () => {
    setStep(-1);
    setPct(0);
    setLabel('');
    setKt1('');
    setOpHash('');
    setErr('');
    cancelAnimationFrame(rafRef.current);
  };

  /*──────── origination handler ───────────────────────────*/
  async function originate(meta) {
    if (step !== -1) return;
    setErr('');

    try {
      // Ensure wallet connected
      if (!address) {
        await connect();
      }
      if (!toolkit) {
        setErr('Toolkit not ready');
        return;
      }

      /* build metadata (compress) */
      setStep(0);
      setLabel('Compressing metadata');
      setPct(0);

      const orderedMeta = {
        name: meta.name.trim(),
        symbol: meta.symbol.trim(),
        description: meta.description.trim(),
        version: 'ZeroContractV4',
        license: meta.license.trim(),
        authors: meta.authors,
        homepage: meta.homepage?.trim() || undefined,
        authoraddress: meta.authoraddress,
        creators: meta.creators,
        type: meta.type,
        interfaces: uniqInterfaces(meta.interfaces),
        imageUri: meta.imageUri,
        views: JSON.parse(hexToString(viewsHex)).views,
      };

      const headerBytes = `0x${char2Bytes('tezos-storage:content')}`;
      let bodyBytes;
      try {
        if (typeof window !== 'undefined' && window.Worker) {
          const worker = new Worker(new URL('../workers/originate.worker.js', import.meta.url), {
            type: 'module',
          });
          const taskId = Date.now();
          bodyBytes = await new Promise((resolve, reject) => {
            worker.onmessage = ({ data }) => {
              if (data.progress !== undefined) setPct((data.progress / 100) * 0.25);
              if (data.body) resolve(data.body);
              if (data.error) reject(new Error(data.error));
            };
            worker.postMessage({ meta: orderedMeta, taskId });
          });
          worker.terminate();
        } else {
          bodyBytes = utf8ToHex(JSON.stringify(orderedMeta), (p) => setPct(p / 4));
        }
      } catch (e) {
        setErr(`Metadata compression failed: ${e.message || String(e)}`);
        return;
      }

      /* forge storage */
      setStep(1);
      setLabel('Preparing wallet origination');
      setPct(0.25);

      const md = new MichelsonMap();
      md.set('', headerBytes);
      md.set('content', bodyBytes);

      // Originate via wallet
      const origOp = await toolkit.wallet.originate({
        code: contractCode,
        storage: { ...STORAGE_TEMPLATE, admin: address, metadata: md },
      });

      setStep(2);
      setLabel('Waiting for wallet signature');
      setPct(0.4);

      const op = await origOp.send();

      setStep(3);
      setLabel('Confirming on-chain');
      setPct(0.6);
      setOpHash(op.opHash);

      // Wait for confirmation
      await op.confirmation();

      // The wallet provides contractAddress immediately after confirmation
      const contractAddr = op.contractAddress;
      setKt1(contractAddr);
      setPct(0.9);

      // Optional: poll TzKT for deeper info
      for (let i = 0; i < 20; i++) {
        await sleep(3000);
        try {
          const ops = await jFetch(`${TZKT_API}/v1/operations/${op.opHash}`);
          const opInfo = ops.find((o) => o.hash === op.opHash && o.status === 'applied');
          if (opInfo?.originatedContracts?.length) {
            setKt1(opInfo.originatedContracts[0].address);
            break;
          }
        } catch {
          /* ignore polling errors */
        }
      }

      setStep(4);
      setLabel('Deployment complete');
      setPct(1);
    } catch (e) {
      setErr(e.message || String(e));
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
          onRetry={reset}
          onCancel={reset}
        />
      )}
    </>
  );
}

/* What changed & why:
   • Replaced forge/inject logic with `toolkit.wallet.originate`.
   • Removed secret-key override and associated helpers/imports.
   • Added metadata compression step and progress indicators.
   • The wallet now handles estimation, forging, signing and injection,
     resolving Temple/Kukai injection failures.
*/