/*─────────────────────────────────────────────────────────────
      Developed by @jams2blues – ZeroContract Studio
      File:    src/pages/deploy.js
      Rev :    r1103   2025‑07‑21
      Summary: single‑stage origination for collections.  Builds
               full metadata up front and forges the contract and
               metadata in one transaction without requiring a second
               patch.  Retrieves the wallet publicKey to allow the
               backend to insert a reveal operation when necessary and
               falls back to local forging/injection on failure.  This
               revision retains the CRTFrame/PixHeading layout and
               updates forging calls to pass the publicKey to both
               forgeViaBackend() and forgeOrigination(), enabling
               reveal insertion and storage encoding via net.js r1102.
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
import { TZKT_API } from '../config/deployTarget.js';
import {
  jFetch,
  sleep,
  forgeOrigination,
  sigHexWithTag,
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

/*──────── component ───────────────────────────────────────*/
export default function DeployPage() {
  const { toolkit, address, connect, wallet } = useWallet();

  const rafRef = useRef(0);
  const [step, setStep]   = useState(-1);
  const [pct, setPct]     = useState(0);
  const [label, setLabel] = useState('');
  const [kt1, setKt1]     = useState('');
  const [opHash, setOpHash] = useState('');
  const [err, setErr]       = useState('');
  // Single-stage origination does not require resumable metadata

  /* clear and reset state */
  const reset = () => {
    setStep(-1);
    setPct(0);
    setLabel('');
    setKt1('');
    setOpHash('');
    setErr('');
    // resumeMeta unused in single-stage mode
    // Clear persisted origination state (unused for single-stage origination)
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('zu_deploy_kt1');
        localStorage.removeItem('zu_deploy_meta');
      } catch {}
    }
    cancelAnimationFrame(rafRef.current);
  };

  /* load resume state if stage2 incomplete */
  useEffect(() => {
    // In single-stage mode we do not support resumable patching
    return;
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
   * This helper trims and filters array fields and uses the full
   * off‑chain views array from viewsHex.  It does not mutate
   * the original meta object.
   */
  async function buildFullMeta(meta) {
    const ordered = {
      name        : meta.name.trim(),
      symbol      : meta.symbol.trim(),
      description : meta.description.trim(),
      version     : 'ZeroContractV4',
      license     : meta.license.trim(),
      // authors/authoraddress/creators may arrive as arrays from the form;
      // preserve them as arrays and trim individual entries when possible.
      authors      : Array.isArray(meta.authors)
        ? meta.authors.map((a) => String(a).trim()).filter(Boolean)
        : meta.authors ? [String(meta.authors).trim()] : undefined,
      homepage    : meta.homepage?.trim() || undefined,
      authoraddress: Array.isArray(meta.authoraddress)
        ? meta.authoraddress.map((a) => String(a).trim()).filter(Boolean)
        : meta.authoraddress ? [String(meta.authoraddress).trim()] : undefined,
      creators    : Array.isArray(meta.creators)
        ? meta.creators.map((c) => String(c).trim()).filter(Boolean)
        : meta.creators ? [String(meta.creators).trim()] : undefined,
      type        : meta.type,
      interfaces  : uniqInterfaces(meta.interfaces),
      imageUri    : meta.imageUri,
      views       : JSON.parse(hexToString(viewsHex)),
    };
    // Remove undefined or empty array properties
    Object.keys(ordered).forEach((k) => {
      const v = ordered[k];
      if (v === undefined) delete ordered[k];
      else if (Array.isArray(v) && v.length === 0) delete ordered[k];
    });
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
      // Clear persisted state on success (legacy resume keys)
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem('zu_deploy_kt1');
          localStorage.removeItem('zu_deploy_meta');
        } catch {}
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
    // Build full metadata JSON and storage in one step
    let headerBytes;
    let bodyHex;
    try {
      // Generate the full metadata JSON using the helper and include all fields
      const fullJson = await buildFullMeta(meta);
      headerBytes = '0x' + char2Bytes('tezos-storage:content');
      // Hex‑encode the full metadata and update the progress bar during encoding
      bodyHex = utf8ToHex(fullJson, (p) => setPct((p * 0.25) / 100));
    } catch (e) {
      setErr(`Metadata compression failed: ${e.message || String(e)}`);
      return;
    }
    // Construct the %metadata big‑map with header and body
    const md = new MichelsonMap();
    md.set('', headerBytes);
    md.set('content', bodyHex);
    // Build the initial storage for the contract
    const storage = { ...STORAGE_TEMPLATE, admin: address, metadata: md };
    // Step 1: forging preparation
    setStep(1);
    setLabel('Preparing origination');
    setPct(0.25);
    try {
      // Attempt remote forging via backend first; on failure fall back to local
      let forgedBytes;
      try {
        // Retrieve publicKey from the active account and pass to the backend so
        // that the backend may insert a reveal operation when necessary.
        const activeAccount = await wallet.client.getActiveAccount();
        const publicKey     = activeAccount?.publicKey;
        forgedBytes = await forgeViaBackend(contractCode, storage, address, publicKey);
      } catch (remoteErr) {
        // Fall back to local forging when the backend fails.  Pass
        // publicKey so that forgeOrigination() can prepend a reveal
        // operation and encode storage appropriately.
        const activeAccount = await wallet.client.getActiveAccount();
        const publicKey     = activeAccount?.publicKey;
        const { forgedBytes: localBytes } = await forgeOrigination(
          toolkit,
          address,
          contractCode,
          storage,
          publicKey,
        );
        forgedBytes = localBytes;
      }
      setStep(2);
      setLabel('Waiting for wallet signature');
      setPct(0.4);
      // ask the wallet to sign the forged bytes
      const signResp = await wallet.client.requestSignPayload({
        signingType: SigningType.OPERATION,
        payload: '03' + forgedBytes,
        sourceAddress: address,
      });
      const sigHex = sigHexWithTag(signResp.signature);
      const signedBytes = forgedBytes + sigHex;
      setStep(3);
      setLabel('Injecting origination');
      setPct(0.5);
      // Attempt remote injection via backend first; fallback to local RPC
      let hash;
      try {
        hash = await injectViaBackend(signedBytes);
      } catch (e) {
        hash = await injectSigned(toolkit, signedBytes);
      }
      setOpHash(hash);
      // Step 4: waiting for confirmation
      setStep(4);
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
      // Set the contract address and finalise progress
      setKt1(contractAddr);
      setPct(1);
      setStep(5);
      setLabel('Origination confirmed');
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
      {/* Main container wrapped in CRTFrame to center content */}
      <CRTFrame>
        {/* Page heading using PixelHeading; keep simple title like original */}
        <PixelHeading>Deploy New Collection</PixelHeading>
        {/* Form for entering collection metadata; uses onDeploy callback */}
        <DeployCollectionForm onDeploy={originate} />
      </CRTFrame>
      {/* Overlay for progress and errors; uses original prop names */}
      {(step !== -1 || err) && (
        <OperationOverlay
          status={label}
          progress={pct}
          error={err}
          kt1={kt1}
          opHash={opHash}
          current={step}
          total={1}
          onRetry={reset}
          onCancel={reset}
        />
      )}
    </>
  );
}

/* What changed & why:
   • Bumped revision to r1103 and refined the deploy workflow.  The UI
     remains aligned with r1032 (CRTFrame + PixelHeading), but the
     forging phase now passes the wallet publicKey to both
     forgeViaBackend() and forgeOrigination(), allowing the backend and
     local helpers to prepend reveal operations and encode storage as
     needed.  This change complements net.js r1102.
   • Kept sigHexWithTag() for signature tagging and restored the
     OperationOverlay props to status/progress/error with onRetry/onCancel.
*/