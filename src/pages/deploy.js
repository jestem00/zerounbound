/*Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/deploy.js
  Rev :    r1107   2025‑07‑21
  Summary: Deploy page with adaptive origination.  Full metadata
           is always constructed on the client.  For wallets
           capable of signing large payloads (e.g. Kukai/Umami),
           the contract is originated via `wallet.originate()` in
           a single operation.  For Temple wallet users, the
           deployment falls back to the remote forge service to
           minimise payload size while retaining a single‑stage
           origination.  Off‑chain views are imported from JSON
           to ensure indexers recognise them.
─────────────────────────────────────────────────────────────*/
import React, { useRef, useState, useCallback } from 'react';
import { MichelsonMap } from '@taquito/michelson-encoder';
import { char2Bytes } from '@taquito/utils';

// UI components
import DeployCollectionForm from '../ui/DeployCollectionForm.jsx';
import PixelHeading         from '../ui/PixelHeading.jsx';
import CRTFrame             from '../ui/CRTFrame.jsx';
import OperationOverlay     from '../ui/OperationOverlay.jsx';

// Wallet context
import { useWallet } from '../contexts/WalletContext.js';

// Contract source and view definitions
import contractCode from '../../contracts/Zero_Contract_V4.tz';
import viewsJson    from '../../contracts/metadata/views/Zero_Contract_v4_views.json' assert { type: 'json' };

// Network helpers for forging via backend or locally
import {
  forgeViaBackend,
  injectViaBackend,
  sigHexWithTag,
  injectSigned,
  sleep,
} from '../core/net.js';
// Signing type constant from Beacon
import { SigningType } from '@airgap/beacon-sdk';

/*──────── helpers ───────────────────────────────────────────*/
/**
 * Normalise and deduplicate interface strings.  Always includes
 * TZIP‑012 and TZIP‑016, trimming user‑supplied values and
 * upper‑casing for canonical ordering.
 *
 * @param {string[]} src User‑supplied interface list
 * @returns {string[]} Normalised interface list
 */
const uniqInterfaces = (src = []) => {
  const base = ['TZIP-012', 'TZIP-016'];
  const map  = new Map();
  [...src, ...base].forEach((i) => {
    const k = String(i ?? '').trim();
    if (k) map.set(k.toUpperCase(), k);
  });
  return Array.from(map.values());
};

// Precompute hex table for fast string encoding
const HEX = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0'),
);

/**
 * Encode a UTF‑8 string into a hex string with a 0x prefix.  A
 * callback receives progress percentage (0–100) at coarse steps,
 * allowing the UI to update while large payloads are encoded.
 *
 * @param {string} str The string to encode
 * @param {function} cb Progress callback
 * @returns {string} Hex representation prefixed with 0x
 */
const utf8ToHex = (str, cb) => {
  const bytes = new TextEncoder().encode(str);
  const { length } = bytes;
  let hex = '';
  const STEP = 4096;
  for (let i = 0; i < length; i += 1) {
    hex += HEX[bytes[i]];
    if ((i & (STEP - 1)) === 0) cb((i / length) * 100);
  }
  cb(100);
  return `0x${hex}`;
};

/*──────── constants ─────────────────────────────────────────*/
// Burn address constant used by the ZeroContract storage
const BURN = 'tz1burnburnburnburnburnburnburjAYjjX';
// Template for initial storage fields; metadata and admin will be set
export const STORAGE_TEMPLATE = {
  active_tokens    : [],
  admin            : '',
  burn_address     : BURN,
  children         : [],
  collaborators    : [],
  contract_id      : `0x${char2Bytes('ZeroContract')}`,
  destroyed_tokens : [],
  extrauri_counters: new MichelsonMap(),
  ledger           : new MichelsonMap(),
  lock             : false,
  metadata         : new MichelsonMap(),
  next_token_id    : 0,
  operators        : new MichelsonMap(),
  parents          : [],
  token_metadata   : new MichelsonMap(),
  total_supply     : new MichelsonMap(),
};

/*──────── component ───────────────────────────────────────*/
/**
 * DeployPage orchestrates the origination of a new ZeroContract
 * collection.  It selects the origination path based on the
 * connected wallet: Temple users use the remote forge service to
 * minimise payload size, while other wallets originate directly via
 * Taquito’s wallet API.  Progress and error states are reported via
 * an overlay.
 */
export default function DeployPage() {
  const { toolkit, address, connect, wallet } = useWallet();

  // Refs and state for progress tracking
  const rafRef    = useRef(0);
  const [step, setStep]   = useState(-1);
  const [pct, setPct]     = useState(0);
  const [label, setLabel] = useState('');
  const [kt1, setKt1]     = useState('');
  const [err, setErr]     = useState('');

  /**
   * Reset the component state to its initial values.  Cancels
   * any ongoing animation frame used for progress increments.
   */
  const reset = () => {
    setStep(-1);
    setPct(0);
    setLabel('');
    setKt1('');
    setErr('');
    cancelAnimationFrame(rafRef.current);
  };

  /**
   * Attempt to connect the wallet.  Captures common errors and
   * reports them to the user.  Retries can be performed by the UI.
   */
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
   * Build the full metadata object for the collection.  This
   * function trims array values, assigns default interfaces, and
   * embeds the off‑chain views.  It returns a plain object which
   * will later be stringified and encoded for on‑chain storage.
   *
   * @param {Object} meta Raw form data from DeployCollectionForm
   * @returns {Object} Ordered metadata object ready for JSON.stringify
   */
  function buildMetaObject(meta) {
    const ordered = {
      name        : meta.name.trim(),
      symbol      : meta.symbol.trim(),
      description : meta.description.trim(),
      version     : 'ZeroContractV4',
      license     : meta.license.trim(),
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
      views       : viewsJson.views,
    };
    Object.keys(ordered).forEach((k) => {
      const v = ordered[k];
      if (v === undefined) delete ordered[k];
      else if (Array.isArray(v) && v.length === 0) delete ordered[k];
    });
    return ordered;
  }

  /**
   * Single‑stage origination.  Builds the full metadata JSON and
   * encodes it into a big‑map, then calls wallet.originate() to
   * originate the contract.  This path should be used only when the
   * wallet can handle large payloads (e.g. Kukai, Umami).  Progress
   * and error states are updated via setStep, setLabel, setPct.
   *
   * @param {Object} meta Raw metadata from form
   */
  async function originateSingleStage(meta) {
    // Ensure wallet connection before starting
    if (!address) {
      await retryConnect();
      if (!address) return;
    }
    if (!toolkit) {
      setErr('Toolkit not ready');
      return;
    }
    setErr('');

    // Stage 0: compress full metadata
    setStep(0);
    setLabel('Compressing metadata');
    setPct(0);
    let header;
    let body;
    try {
      const metaObj = buildMetaObject(meta);
      header = `0x${char2Bytes('tezos-storage:content')}`;
      body   = utf8ToHex(JSON.stringify(metaObj), (p) => setPct(p * 0.25 / 100));
    } catch (e) {
      setErr(`Metadata compression failed: ${e.message || String(e)}`);
      return;
    }

    // Construct the metadata big‑map
    const md = new MichelsonMap();
    md.set('',       header);
    md.set('content', body);

    // Stage 1: wait for wallet signature & origination
    setStep(1);
    setLabel('Check wallet & sign');
    setPct(0.25);

    // Animate progress while the wallet modal is open
    const tick = () => {
      setPct((p) => Math.min(0.45, p + 0.002));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    try {
      const op = await toolkit.wallet.originate({
        code   : contractCode,
        storage: { ...STORAGE_TEMPLATE, admin: address, metadata: md },
        balance: '0',
      }).send();
      // Stop the progress animation and update stage
      cancelAnimationFrame(rafRef.current);
      setStep(2);
      setLabel('Forging & injecting');
      setPct(0.5);
      // Wait for at least two confirmations
      await op.confirmation(2);
      setStep(3);
      setLabel('Confirming on-chain');
      setPct(0.9);
      // Resolve contract address
      let adr = op.contractAddress;
      if (!adr) {
        try {
          const c = await op.contract();
          adr = c?.address;
        } catch {}
      }
      if (!adr && op.results?.length) {
        adr = op.results[0]?.metadata?.operation_result?.originated_contracts?.[0];
      }
      if (!adr) {
      setErr('Originated contract address not found');
        return;
      }
      setKt1(adr);
      setPct(1);
      setLabel('Origination confirmed');
      setStep(4);
    } catch (e) {
      cancelAnimationFrame(rafRef.current);
      if (/Receiving end does not exist/i.test(e.message)) {
        setErr('Temple connection failed. Restart browser/extension.');
      } else {
        setErr(e.message || String(e));
      }
    }
  }

  /**
   * Originate a new contract using the remote forge service.  This path
   * is used when the connected wallet (e.g. Temple) cannot handle
   * large payloads.  The metadata is fully included in the
   * origination, but forging and injection are handled by the
   * backend to reduce the payload size seen by the wallet.
   *
   * @param {Object} meta Raw metadata from form
   */
  async function originateViaForgeService(meta) {
    // Ensure wallet connection
    if (!address) {
      await retryConnect();
      if (!address) return;
    }
    if (!toolkit) {
      setErr('Toolkit not ready');
      return;
    }
    setErr('');

    // Step 0: build and encode full metadata
    setStep(0);
    setLabel('Preparing metadata');
    setPct(0);
    let headerBytes;
    let bodyHex;
    try {
      const metaObj = buildMetaObject(meta);
      headerBytes = '0x' + char2Bytes('tezos-storage:content');
      bodyHex = utf8ToHex(JSON.stringify(metaObj), (p) => setPct((p * 0.25) / 100));
    } catch (e) {
      setErr(`Metadata encoding failed: ${e.message || String(e)}`);
      return;
    }
    // Build metadata big‑map
    const md = new MichelsonMap();
    md.set('', headerBytes);
    md.set('content', bodyHex);
    // Build storage object
    const storage = { ...STORAGE_TEMPLATE, admin: address, metadata: md };
    // Step 1: forge via backend
    setStep(1);
    setLabel('Forging operation');
    setPct(0.25);
    let forgedBytes;
    try {
      // Retrieve public key for reveal support
      const activeAcc = await wallet.client.getActiveAccount();
      const publicKey = activeAcc?.publicKey;
      forgedBytes = await forgeViaBackend(contractCode, storage, address, publicKey);
    } catch (e) {
      setErr(e.message || String(e));
      return;
    }
    // Step 2: request wallet signature
    setStep(2);
    setLabel('Waiting for wallet signature');
    setPct(0.40);
    try {
      const signResp = await wallet.client.requestSignPayload({
        signingType: SigningType.OPERATION,
        payload    : '03' + forgedBytes,
        sourceAddress: address,
      });
      const sigHex = sigHexWithTag(signResp.signature);
      const signedBytes = forgedBytes + sigHex;
      // Step 3: inject via backend
      setStep(3);
      setLabel('Injecting operation');
      setPct(0.55);
      let opHash;
      try {
        opHash = await injectViaBackend(signedBytes);
      } catch (injErr) {
        // fallback to local injection if backend fails
        opHash = await injectSigned(toolkit, signedBytes);
      }
      // Step 4: confirmation
      setStep(4);
      setLabel('Confirming origination');
      setPct(0.70);
      // Attempt to resolve contract address via toolkit RPC
      let contractAddr = '';
      // Poll until contract address is available or timeout
      for (let i = 0; i < 15; i++) {
        await sleep(3000);
        try {
          const block = await toolkit.rpc.getBlock();
          for (const opGroup of block.operations.flat()) {
            if (opGroup.hash === opHash) {
              const result = opGroup.contents.find((c) => c.kind === 'origination');
              if (result?.metadata?.operation_result?.originated_contracts?.length) {
                contractAddr = result.metadata.operation_result.originated_contracts[0];
                break;
              }
            }
          }
        } catch {}
        if (contractAddr) break;
      }
      if (!contractAddr) {
        setErr('Could not resolve contract address after origination.');
        return;
      }
      setKt1(contractAddr);
      setPct(1);
      setStep(5);
      setLabel('Origination confirmed');
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  /**
   * Originate a new contract.  Chooses between the remote forge
   * service and direct wallet origination based on the connected
   * wallet’s capabilities.  Temple wallet users will use the
   * backend forge to reduce payload size; others will originate
   * directly via Taquito’s wallet API.
   *
   * @param {Object} meta Metadata from form
   */
  async function originate(meta) {
    // Attempt to detect the wallet name via Beacon.  If Temple is
    // detected, use the backend forge service; otherwise, use
    // single‑stage origination via wallet.originate().
    let useBackend = false;
    try {
      const info = await wallet.client.getWalletInfo();
      const name = (info?.name || '').toLowerCase();
      if (name.includes('temple')) {
        useBackend = true;
      }
    } catch {}
    if (useBackend) {
      await originateViaForgeService(meta);
    } else {
      await originateSingleStage(meta);
    }
  }

  /*──────── render ─────────────────────────────────────────*/
  return (
    <>
      <CRTFrame>
        <PixelHeading>Deploy&nbsp;New&nbsp;Collection</PixelHeading>
        <DeployCollectionForm onDeploy={originate} />
      </CRTFrame>
      {(step !== -1 || err) && (
        <OperationOverlay
          status={label}
          progress={pct}
          error={err}
          kt1={kt1}
          opHash={''}
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
   • r1107 removes the dual‑stage pipeline and introduces adaptive
     origination.  Wallets are detected via Beacon, and Temple users
     automatically use the remote forge service to minimise payload
     size while maintaining a single‑stage origination.  Other
     wallets originate directly via Taquito’s wallet API.  Remote
     forging leverages sigHexWithTag(), forgeViaBackend() and
     injectViaBackend() to handle reveal and injection.  The views
     import remains JSON‑based to ensure indexers show the views
     tab.
*/
