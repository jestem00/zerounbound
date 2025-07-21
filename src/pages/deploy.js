/*──────── src/pages/deploy.js ────────*/
/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/deploy.js
  Rev :    r1114   2025‑07‑21
  Summary: Normalize contract code line endings before forging to
           avoid CRLF‑related misaligned expression errors.  Kept
           view removal and debug logging for Temple, and retained
           fallback to local forging.  Kukai/Umami flows unchanged.
─────────────────────────────────────────────────────────────*/

import React, { useRef, useState, useCallback } from 'react';
import { MichelsonMap } from '@taquito/michelson-encoder';
import { char2Bytes } from '@taquito/utils';

// UI components
import DeployCollectionForm from '../ui/DeployCollectionForm.jsx';
import OperationOverlay     from '../ui/OperationOverlay.jsx';

// Import FAST_ORIGIN flag.  When true, Temple‑wallet originations
// will omit large on‑chain view definitions and instead embed a
// minimal placeholder.  This reduces the operation size to avoid
// Temple’s signing limits.  Kukai/Umami and other wallets are
// unaffected and still originate with full metadata.
import { FAST_ORIGIN } from '../config/deployTarget.js';

// Styled container – centre the page content and provide an opaque
// background.  Without this wrapper the deploy form would sit
// directly on the page background, causing the decorative zeros to
// bleed through.  We mimic the layout used on other pages (e.g.
// manage.js) by setting a max‑width, centering with margin auto and
// applying padding.  The z‑index ensures overlays appear above
// background graphics.
import styledPkg from 'styled-components';
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap = styled.div`
  position: relative;
  z-index: 2;
  background: var(--zu-bg);
  width: 100%;
  max-width: min(90vw, 1920px);
  margin: 0 auto;
  min-height: calc(var(--vh) - var(--hdr, 0));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding: 0.8rem clamp(0.4rem, 1.5vw, 1.2rem) 1.8rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(0.2rem, 0.45vh, 0.6rem);
`;

// Wallet context
import { useWallet } from '../contexts/WalletContext.js';

// Contract source and view definitions
import contractCode from '../../contracts/Zero_Contract_V4.tz';
import viewsJson    from '../../contracts/metadata/views/Zero_Contract_v4_views.json' assert { type: 'json' };

// Network helpers for forging and injection
import {
  forgeViaBackend,
  sigHexWithTag,
  injectSigned,
  sleep,
  forgeOrigination,
  encodeStorageForForge,
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
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

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
 * connected wallet: Temple users offload forging to the remote
 * forge service (Octez CLI) and sign/inject locally; other
 * wallets originate directly via Taquito’s wallet API.  Progress
 * and error states are reported via an overlay.
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
   * Build the full metadata object for the collection.  This function
   * trims array values, assigns default interfaces and embeds
   * off‑chain views.  It returns a plain object which will later be
   * stringified and encoded for on‑chain storage.
   *
   * @param {Object} meta Raw form data from DeployCollectionForm
   * @returns {Object} Ordered metadata object ready for JSON.stringify
   */
  function buildMetaObject(meta) {
    const obj = {
      name        : meta.name.trim(),
      symbol      : meta.symbol.trim(),
      description : meta.description.trim(),
      version     : 'ZeroContractV4',
      license     : meta.license.trim(),
      authors     : Array.isArray(meta.authors)
        ? meta.authors.map((a) => String(a).trim()).filter(Boolean)
        : meta.authors ? [String(meta.authors).trim()] : undefined,
      homepage    : meta.homepage?.trim() || undefined,
      authoraddress: Array.isArray(meta.authoraddress)
        ? meta.authoraddress.map((a) => String(a).trim()).filter(Boolean)
        : meta.authoraddress ? [String(meta.authoraddress).trim()] : undefined,
      creators    : Array.isArray(meta.creators)
        ? meta.creators.map((c) => String(c).trim()).filter(Boolean)
        : meta.creators ? [String(meta.creators).trim()] : undefined,
      type        : meta.type?.trim(),
      interfaces  : uniqInterfaces(meta.interfaces),
      imageUri    : meta.imageUri?.trim() || undefined,
      views       : viewsJson.views,
    };
    // Remove undefined or empty array properties
    Object.keys(obj).forEach((k) => {
      if (obj[k] === undefined || (Array.isArray(obj[k]) && obj[k].length === 0)) {
        delete obj[k];
      }
    });
    return obj;
  }

  /**
   * Build a minimal metadata object for fast originations.  This
   * helper calls buildMetaObject() to assemble the full metadata
   * and then overrides the views property with a placeholder (0x00).
   * Use this when FAST_ORIGIN is enabled to reduce the size of the
   * origination operation for Temple wallet users.  All other
   * properties remain unchanged.
   *
   * @param {Object} meta Raw form data from DeployCollectionForm
   * @returns {Object} Minimal metadata object
   */
  function buildFastMetaObject(meta) {
    const obj = buildMetaObject(meta);
    // Remove the views property entirely for Temple origination.  By
    // omitting views, the metadata stays small and avoids misalignment
    // issues during forging.  Full views can be set later via
    // edit_contract_metadata.
    delete obj.views;
    return obj;
  }
  /**
   * Perform a single-stage origination via the wallet API.  This is
   * used for Kukai/Umami and other wallets that handle large payloads.
   *
   * @param {Object} meta Raw metadata from form
   */
  async function originateSingleStage(meta, fast = false) {
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
      // Choose between full or fast metadata.  When fast=true and FAST_ORIGIN
      // is enabled, build a minimal metadata object (no views).  Otherwise
      // build the full metadata with off‑chain views.  This option is
      // primarily used for Temple to reduce operation size.
      const metaObj = fast && FAST_ORIGIN ? buildFastMetaObject(meta) : buildMetaObject(meta);
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
    // Step 1: originate via wallet API
    setStep(1);
    setLabel('Origination (wallet)');
    setPct(0.25);
    try {
      const op = await wallet.originate({ code: contractCode, storage });
      setStep(2);
      setLabel('Waiting for confirmation');
      setPct(0.5);
      const contract = await op.contract();
      setKt1(contract.address);
      setStep(5);
      setPct(1);
      setLabel('Origination confirmed');
    } catch (err2) {
      setErr(err2.message || String(err2));
    }
  }
  /**
   * Originate via the remote forge service.  Handles Temple wallet
   * compatibility by offloading forging to the backend, then signing
   * and injecting on the client.  Falls back to local forging on
   * failure.
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
    // Step 0: build and encode metadata.  If FAST_ORIGIN is enabled
    // (dual‑stage origination) and we are using Temple (via backend),
    // build a minimal metadata object to reduce payload size.  The
    // full views can be applied later via edit_contract_metadata.
    setStep(0);
    setLabel('Preparing metadata');
    setPct(0);
    let headerBytes;
    let bodyHex;
    try {
      const metaObj = FAST_ORIGIN ? buildFastMetaObject(meta) : buildMetaObject(meta);
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
    // Before forging, log the payload that will be sent to the forge
    // service.  This shows the contract code and the encoded storage
    // that octez-client will read, helping diagnose misaligned
    // expression errors.  Only run in development; in production
    // process.env.NODE_ENV is usually 'production'.
    if (process.env.NODE_ENV !== 'production') {
      try {
        const encodedStorage = encodeStorageForForge(contractCode, storage);
        // Use JSON.stringify for encodedStorage if it is an object; fall
        // back to the raw value otherwise.  The code is left as a string
        // for readability.
        console.log('Temple forge payload:', {
          code   : contractCode,
          storage: encodedStorage,
          source : address,
        });
      } catch (e) {
        console.warn('Failed to encode storage for debug logging:', e);
      }
    }
    // Step 1: forge via backend.  Normalize CRLF→LF in contract code
    // before sending to the forge service to prevent misaligned
    // expression errors.  If this fails, fall back to local forging.
    setStep(1);
    setLabel('Forging operation');
    setPct(0.25);
    let forgedBytes;
    try {
      const activeAcc = await wallet.client.getActiveAccount();
      const publicKey = activeAcc?.publicKey;
      // Replace any CRLF or CR sequences with LF to avoid misalignment.
      const cleanedCode = contractCode.split(/\r\n|\r/).join('\n');
      forgedBytes = await forgeViaBackend(cleanedCode, storage, address, publicKey);
    } catch (e) {
      // Fallback to local forging on backend failure
      try {
        const activeAccLocal = await wallet.client.getActiveAccount();
        const publicKeyLocal = activeAccLocal?.publicKey;
        const { forgedBytes: localBytes } = await forgeOrigination(
          toolkit,
          address,
          contractCode,
          storage,
          publicKeyLocal,
        );
        forgedBytes = localBytes;
      } catch (fallbackForgeErr) {
        setErr(fallbackForgeErr.message || String(fallbackForgeErr));
        return;
      }
    }
    // Step 2: request wallet signature
    setStep(2);
    setLabel('Waiting for wallet signature');
    setPct(0.40);
    let signedBytes;
    try {
      const signResp = await wallet.client.requestSignPayload({
        signingType: SigningType.OPERATION,
        payload    : '03' + forgedBytes,
        sourceAddress: address,
      });
      const sigHex = sigHexWithTag(signResp.signature);
      signedBytes = forgedBytes + sigHex;
    } catch (e) {
      setErr(e.message || String(e));
      return;
    }
    // Step 3: inject via RPC.  We avoid using the backend for
    // injection to prevent 500 errors; instead we call
    // injectSigned() directly.  If that fails, reforge locally and
    // inject again.
    setStep(3);
    setLabel('Injecting operation');
    setPct(0.55);
    let opHash;
    try {
      opHash = await injectSigned(toolkit, signedBytes);
    } catch (injErr) {
      // If RPC injection fails (e.g. invalid bytes), fall back to
      // local forging and injection.  Reforge the operation
      // locally using forgeOrigination(), sign and inject again.
      try {
        const activeAcc2 = await wallet.client.getActiveAccount();
        const pubKey2    = activeAcc2?.publicKey;
        const { forgedBytes: localBytes } = await forgeOrigination(
          toolkit,
          address,
          contractCode,
          storage,
          pubKey2,
        );
        const signResp2 = await wallet.client.requestSignPayload({
          signingType : SigningType.OPERATION,
          payload     : '03' + localBytes,
          sourceAddress: address,
        });
        const sigHex2     = sigHexWithTag(signResp2.signature);
        const signedLocal = localBytes + sigHex2;
        opHash = await injectSigned(toolkit, signedLocal);
      } catch (fallbackErr) {
        setErr(fallbackErr.message || String(fallbackErr));
        return;
      }
    }
    // Step 4: confirmation
    setStep(4);
    setLabel('Confirming origination');
    setPct(0.70);
    // Attempt to resolve contract address via toolkit RPC
    let contractAddr = '';
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
  }
  /**
   * Originate a new contract.  Chooses between the remote forge
   * service and direct wallet origination based on the connected
   * wallet’s capabilities.  Temple wallet users will use the
   * backend forge service; others will originate directly via
   * Taquito’s wallet API.
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
      // For Temple, continue to use the backend forge service but with
      // minimal metadata (no views) and normalised contract code.  This
      // reduces payload size and addresses misalignment errors.  Any
      // additional views can be added later via edit_contract_metadata.
      await originateViaForgeService(meta);
    } else {
      // For other wallets (Kukai/Umami), proceed with a single‑stage
      // origination using full metadata.
      await originateSingleStage(meta, false);
    }
  }
  /*──────── render ─────────────────────────────────────────*/
  return (
    <Wrap>
      {/* Deploy form collects metadata and triggers origination.  Use
          the expected onDeploy prop instead of onSubmit; DeployCollectionForm
          invokes this callback with the user’s metadata when the form
          submits. */}
      <DeployCollectionForm onDeploy={originate} />
      {/* Show the overlay whenever a step is in progress or an error
          has occurred.  The overlay will cover the parent wrapper and
          report progress, errors and the resulting contract address. */}
      {(step !== -1 || err) && (
        <OperationOverlay
          step={step}
          pct={pct}
          label={label}
          error={err}
          kt1={kt1}
          onClose={reset}
        />
      )}
    </Wrap>
  );
}

/* What changed & why:
   – Bumped revision to r1112.  Temple now skips the remote
     forge service entirely and instead uses wallet.originate
     with minimal metadata (no views) to avoid parsing errors
     and sign payload limits.  Added debug logging of encoded
     storage for diagnostics via encodeStorageForForge and
     removed views from the fast meta object.  Kukai/Umami
     flows and the UI wrapper remain unchanged.
*/

