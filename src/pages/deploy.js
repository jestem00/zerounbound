/*─────────────────────────────────────────────────────────────
      Developed by @jams2blues – ZeroContract Studio
      File:    src/pages/deploy.js
      Rev :    r1023   2025‑07‑19
      Summary: two‑stage collection origination with resume
               support.  Attempts to offload forging and
               injection via forgeViaBackend/injectViaBackend
               before falling back to local forging and
               injection.  Handles dual‑stage metadata patch
               when FAST_ORIGIN is enabled.
    ─────────────────────────────────────────────────────────────*/

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { MichelsonMap } from '@taquito/michelson-encoder';
import { char2Bytes } from '@taquito/utils';
import { SigningType } from '@airgap/beacon-sdk';

import DeployCollectionForm from '../ui/DeployCollectionForm.jsx';
import PixelHeading from '../ui/PixelHeading.jsx';
import CRTFrame from '../ui/CRTFrame.jsx';
import OperationOverlay from '../ui/OperationOverlay.jsx';
import { useWallet } from '../contexts/WalletContext.js';
import { TZKT_API, FAST_ORIGIN } from '../config/deployTarget.js';
import {
  jFetch,
  sleep,
  forgeOrigination,
  sigToHex,
  injectSigned,
  forgeViaBackend,
  injectViaBackend,
} from '../core/net.js';
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
      authoraddress: meta.authoraddress?.trim() || undefined,
      creators    : meta.creators,
      type        : meta.type,
      interfaces  : uniqInterfaces(meta.interfaces),
      imageUri    : meta.imageUri,
      views       : JSON.parse(hexToString(viewsHex)),
    };
    // Remove undefined properties for cleanliness
    Object.keys(ordered).forEach((k) => ordered[k] === undefined && delete ordered[k]);
    return JSON.stringify(ordered);
  }

  /**
   * Patch the contract metadata after the initial origination.  This runs
   * stage 2 of the dual‑stage origination when FAST_ORIGIN is enabled.  It
   * compresses and hex‑wraps the full JSON, estimates gas/fee, and calls
   * `edit_contract_metadata`.  Progress persists across page reloads via
   * localStorage.
   */
  async function patchMetadata(json, contractAddr) {
    setStep(4);
    setLabel('Compressing metadata (2/2)');
    setPct(0.87);
    try {
      // hex encode the full JSON and compress progress bar
      const bodyHex = utf8ToHex(json, (p) => setPct(0.87 + (p * 0.08) / 100));
      // Build the Michelson map for %metadata big‑map
      const md = new MichelsonMap();
      md.set('', bodyHex);
      md.set('content', bodyHex);
      // Build call parameters for edit_contract_metadata
      const contract = await toolkit.contract.at(contractAddr);
      const op = await contract.methods.edit_contract_metadata(md).send();
      setLabel('Waiting for metadata patch');
      setPct(0.96);
      await op.confirmation(1);
      setLabel('Metadata patch confirmed');
      setPct(1);
      setStep(5);
      // Clear resume state on success
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LS_KT1);
        localStorage.removeItem(LS_META);
      }
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  /**
   * Originate a new contract.  This function orchestrates stage 1
   * (origination) and triggers stage 2 via patchMetadata() once the
   * contract address is known.  It attempts to forge and inject using
   * the remote forge service first; on failure it falls back to local
   * forging/injection.  Resume support ensures that users can reload
   * the page without losing progress.
   */
  async function originate(meta) {
    // Ensure wallet connection
    if (!address) {
      await retryConnect();
      if (!address) return;
    }
    // Reset state for a fresh deploy
    setErr('');
    setStep(0);
    setPct(0.1);
    setLabel('Preparing storage');
    // Build minimal metadata and storage
    let headerBytes;
    let bodyMin;
    try {
      // Build minimal metadata JSON: omit homepage and use placeholder views & image
      const minimal = {
        name    : meta.name.trim(),
        symbol  : meta.symbol.trim(),
        description: meta.description.trim(),
        version : 'ZeroContractV4',
        license : meta.license.trim(),
        authors : meta.authors,
        authoraddress: meta.authoraddress?.trim() || undefined,
        creators: meta.creators,
        type    : meta.type,
        interfaces: uniqInterfaces(meta.interfaces),
        imageUri: meta.imageUriPlaceholder || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAP+Ke1cQAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=',
        views: FAST_ORIGIN ? '0x00' : JSON.parse(hexToString(viewsHex)),
      };
      // Remove undefined properties
      Object.keys(minimal).forEach((k) => minimal[k] === undefined && delete minimal[k]);
      // Encode header and body separately
      const metaStr = JSON.stringify(minimal);
      headerBytes = '0x' + char2Bytes('tezos-storage:content');
      if (FAST_ORIGIN) {
        // Write only header on fast path; body will be patched in stage 2
        bodyMin = '0x00';
      } else {
        // Hex‑encode minimal metadata and compress progress bar
        bodyMin = utf8ToHex(metaStr, (p) => setPct((p * 0.25) / 100));
      }
    } catch (e) {
      setErr(`Metadata compression failed: ${e.message || String(e)}`);
      return;
    }
    // prepare storage with minimal metadata
    const md = new MichelsonMap();
    md.set('', headerBytes);
    md.set('content', bodyMin);
    const storage = { ...STORAGE_TEMPLATE, admin: address, metadata: md };
    setStep(1);
    setLabel('Preparing origination (1/2)');
    setPct(0.25);
    try {
      // Attempt remote forging via backend first; on failure fall back to local
      let forgedBytes;
      try {
        forgedBytes = await forgeViaBackend(contractCode, storage, address);
      } catch (remoteErr) {
        const { forgedBytes: localBytes } = await forgeOrigination(
          toolkit,
          address,
          contractCode,
          storage,
        );
        forgedBytes = localBytes;
      }
      setStep(2);
      setLabel('Waiting for wallet signature (1/2)');
      setPct(0.4);
      // ask the wallet to sign the forged bytes
      const signResp = await wallet.client.requestSignPayload({
        signingType: SigningType.OPERATION,
        payload: '03' + forgedBytes,
        sourceAddress: address,
      });
      const sigHex = sigToHex(signResp.signature);
      const signedBytes = forgedBytes + sigHex;
      setStep(3);
      setLabel('Injecting origination');
      setPct(0.5);
      let hash;
      try {
        hash = await injectViaBackend(signedBytes);
      } catch (e) {
        // Fallback: inject via Taquito RPC
        hash = await injectSigned(toolkit, signedBytes);
      }
      setOpHash(hash);
      setStep(3);
      setLabel('Confirming origination');
      setPct(0.6);
      // poll TzKT (optional) for final confirmation and KT address
      let contractAddr = '';
      for (let i = 0; i < 20; i++) {
        await sleep(3000);
        try {
          const ops = await jFetch(`${TZKT_API}/v1/operations/${hash}`);
          const opInfo = ops.find((o) => o.hash === hash && o.status === 'applied');
          if (opInfo?.originatedContracts?.length) {
            contractAddr = opInfo.originatedContracts[0].address;
            break;
          }
        } catch {}
      }
      // fallback: attempt to fetch contract from toolkit if not found
      if (!contractAddr) {
        try {
          const block = await toolkit.rpc.getBlock();
          // search internal operations for origination
          for (const opGroup of block.operations.flat()) {
            if (opGroup.hash === hash) {
              const result = opGroup.contents.find((c) => c.kind === 'origination');
              if (result?.metadata?.operation_result?.originated_contracts?.length) {
                contractAddr = result.metadata.operation_result.originated_contracts[0];
                break;
              }
            }
          }
        } catch {}
      }
      if (!contractAddr) {
        setErr('Could not resolve contract address after origination.');
        return;
      }
      setKt1(contractAddr);
      setPct(0.8);
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
      <PixelHeading as="h1">Deploy New Collection</PixelHeading>
      <CRTFrame>
        <DeployCollectionForm onDeploy={originate} />
      </CRTFrame>
      {(step !== -1 || err) && (
        <OperationOverlay
          status={label}
          progress={pct}
          error={err}
          kt1={kt1}
          opHash={opHash}
          step={step}
          total={8}
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
   • Reintroduced remote forging and injection using forgeViaBackend and
     injectViaBackend imported from net.js.  The originate() function
     now attempts to call the external forge service first and falls
     back to local forgeOrigination/injectSigned when that fails.
   • Updated the minimal metadata builder to set placeholder imageUri
     and to respect FAST_ORIGIN by writing only the header or full
     metadata on first operation.  Stage 2 now hex‑wraps and writes
     both keys for %metadata as required by TZIP‑16.
   • Added revision line r1023 and updated summary to reflect these
     changes.
*/