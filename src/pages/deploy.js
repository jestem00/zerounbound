/*──────── src/pages/deploy.js ────────*/
/*──────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/deploy.js
  Rev :    r1125‑a1   2025‑07‑23
  Summary: Improved single‑stage origination by reliably resolving the
           contract address on mainnet.  After confirmation, the code
           now attempts to retrieve the address via op.contract() and
           getOriginatedContractAddresses() before falling back to a
           longer block‑scan.  This prevents timeouts when Kukai/Umami
           succeed but op.contractAddress is undefined.
──────────────────────────────────────────────────────────────*/

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
  // Track whether the remote forge backend is used (Temple wallet)
  const [useBackend, setUseBackend] = useState(false);

  /**
   * Reset the component state to its initial values.  Cancels
   * any pending RAF updates and resets progress.
   */
  function reset() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setStep(-1);
    setPct(0);
    setLabel('');
    setKt1('');
    setErr('');
  }

  /**
   * Attempt to connect the wallet if not already connected.
   * Retries once on failure.  Returns undefined on success,
   * otherwise sets error and aborts.
   */
  async function retryConnect() {
    try {
      if (!address) await connect();
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  /**
   * Build full metadata object.  Trims and normalises fields and
   * includes full views from viewsJson.
   */
  function buildMetaObject(meta) {
    return {
      name        : meta.name.trim(),
      symbol      : meta.symbol.trim(),
      description : meta.description.trim(),
      license     : meta.license.trim(),
      authors     : Array.isArray(meta.authors)
        ? meta.authors.map((a) => String(a).trim()).filter(Boolean)
        : meta.authors ? [String(meta.authors).trim()] : undefined,
      authoraddress: Array.isArray(meta.authoraddress)
        ? meta.authoraddress.map((a) => String(a).trim()).filter(Boolean)
        : meta.authoraddress ? [String(meta.authoraddress).trim()] : undefined,
      creators    : Array.isArray(meta.creators)
        ? meta.creators.map((c) => String(c).trim()).filter(Boolean)
        : meta.creators ? [String(meta.creators).trim()] : undefined,
      type        : meta.type?.trim(),
      homepage    : meta.homepage?.trim() || undefined,
      interfaces  : uniqInterfaces(meta.interfaces),
      imageUri    : meta.imageUri?.trim() || undefined,
      views       : viewsJson.views,
    };
  }

  /**
   * Build minimal metadata object for FAST_ORIGIN.  Replaces
   * views with a placeholder pointer and omits the image URI.
   */
  function buildFastMetaObject(meta) {
    const obj = buildMetaObject(meta);
    obj.views = '0x00';
    return obj;
  }

  /**
   * Originate via single‑stage Taquito wallet API.  Used for
   * Kukai/Umami and other non‑Temple wallets.
   */
  async function originateSingleStage(meta) {
    // Ensure wallet connection
    if (!address) {
      await retryConnect();
      if (!address) return;
    }
    const mdObj  = buildMetaObject(meta);
    const headerBytes = '0x' + char2Bytes('tezos-storage:content');
    const bodyHex     = utf8ToHex(JSON.stringify(mdObj), (p) => {});
    const md = new MichelsonMap();
    md.set('', headerBytes);
    md.set('content', bodyHex);
    const storage = { ...STORAGE_TEMPLATE, admin: address, metadata: md };
    // Step 1: originate via wallet API
    // Clear any previous error before starting
    setErr('');
    setStep(1);
    setLabel('Origination (wallet)');
    setPct(0.25);
    try {
      // Use toolkit.wallet.originate() instead of wallet.originate().
      // The wallet object from useWallet() may not implement originate().
      // Send the origination operation via wallet API
      const op = await toolkit.wallet
        .originate({ code: contractCode, storage })
        .send();
      setStep(2);
      setLabel('Waiting for confirmation');
      setPct(0.5);
      // Wait for at least one confirmation before retrieving the contract address
      try {
        await op.confirmation();
      } catch {}
      let contractAddr = op.contractAddress;
      // Attempt to resolve the contract address via Taquito helpers
      if (!contractAddr) {
        try {
          const c = await (op.contract?.());
          if (c && c.address) {
            contractAddr = c.address;
          }
        } catch {}
      }
      if (!contractAddr) {
        try {
          const arr = op.getOriginatedContractAddresses?.();
          if (arr && arr.length) {
            contractAddr = arr[0];
          }
        } catch {}
      }
      if (!contractAddr) {
        // Fallback: scan recent blocks for the origination result using opHash
        let resolved = '';
        const opHash = op.opHash || op.hash || op.operationHash || op.operation_hash;
        for (let i = 0; i < 20; i++) {
          await sleep(3000);
          try {
            const block = await toolkit.rpc.getBlock();
            for (const opGroup of block.operations.flat()) {
              if (opGroup.hash === opHash) {
                const res = opGroup.contents.find((c) => c.kind === 'origination');
                if (
                  res?.metadata?.operation_result?.originated_contracts?.length
                ) {
                  resolved = res.metadata.operation_result.originated_contracts[0];
                  break;
                }
              }
            }
          } catch {}
          if (resolved) break;
        }
        if (!resolved) {
          const msg = 'Could not resolve contract address after origination.';
          setErr(msg);
          setLabel(msg);
          return;
        }
        contractAddr = resolved;
      }
      // Set the resolved contract address
      setKt1(contractAddr);
      // Clear error on success
      setErr('');
      setStep(5);
      setPct(1);
      setLabel('Origination confirmed');
    } catch (err2) {
      const msg = err2.message || String(err2);
      setErr(msg);
      setLabel(msg);
    }
  }

  /**
   * Originate via the remote forge service.  Handles Temple wallet
   * compatibility by offloading forging to the backend, then signing
   * and injecting on the client.  Falls back to local forging on
   * failure.
   */
  async function originateViaForgeService(meta) {
    // Ensure wallet connection
    if (!address) {
      await retryConnect();
      if (!address) return;
    }
    if (!toolkit) {
      const msg = 'Toolkit not ready';
      setErr(msg);
      setLabel(msg);
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
      const msg = `Metadata encoding failed: ${e.message || String(e)}`;
      setErr(msg);
      setLabel(msg);
      return;
    }
    // Build metadata big‑map
    const md = new MichelsonMap();
    md.set('', headerBytes);
    md.set('content', bodyHex);
    // Build storage object
    const storage = { ...STORAGE_TEMPLATE, admin: address, metadata: md };
    // Step 1: forge via backend.  If this fails, fall back to local forging.
    setStep(1);
    setLabel('Forging operation');
    setPct(0.25);
    let forgedBytes;
    try {
      const activeAcc = await wallet.client.getActiveAccount();
      const publicKey = activeAcc?.publicKey;
      forgedBytes = await forgeViaBackend(contractCode, storage, address, publicKey);
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
        const msg = fallbackForgeErr.message || String(fallbackForgeErr);
        setErr(msg);
        setLabel(msg);
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
      const msg = e.message || String(e);
      setErr(msg);
      setLabel(msg);
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
        const msg = fallbackErr.message || String(fallbackErr);
        setErr(msg);
        setLabel(msg);
        return;
      }
    }
    // Step 4: confirmation
    setStep(4);
    setLabel('Confirming origination');
    setPct(0.70);
    // Attempt to resolve contract address via toolkit RPC
    let contractAddr = '';
    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      try {
        const block = await toolkit.rpc.getBlock();
        for (const opGroup of block.operations.flat()) {
          if (opGroup.hash === opHash) {
            const result = opGroup.contents.find((c) => c.kind === 'origination');
            if (
              result?.metadata?.operation_result?.originated_contracts?.length
            ) {
              contractAddr = result.metadata.operation_result.originated_contracts[0];
              break;
            }
          }
        }
      } catch {}
      if (contractAddr) break;
    }
    if (!contractAddr) {
      const msg = 'Could not resolve contract address after origination.';
      setErr(msg);
      setLabel(msg);
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
    let useBackendFlag = false;
    try {
      const info = await wallet.client.getWalletInfo();
      const name = (info?.name || '').toLowerCase();
      if (name.includes('temple')) {
        useBackendFlag = true;
      }
    } catch {}
    // Persist which path is being used for rendering purposes
    setUseBackend(useBackendFlag);
    if (useBackendFlag) {
      await originateViaForgeService(meta);
    } else {
      await originateSingleStage(meta);
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
          status={label}
          progress={pct}
          error={!!err}
          kt1={kt1}
          onCancel={reset}
          onRetry={() => {
            reset();
            // Re-initiate origination when retrying; use stored
            // metadata if available.  For simplicity we rely on the
            // form to re-submit metadata on user action.
          }}
          step={step}
          total={useBackend ? 5 : 1}
        />
      )}
    </Wrap>
  );
}

/* What changed & why:
   – Restored baseline behaviour for origination across all wallets.  The
     CONTRACT_CODE constant and debug logging introduced in r1115 have been
     removed, and the code now relies on the original contractCode import
     for both single‑stage and remote forge flows.  buildFastMetaObject now
     assigns a minimal placeholder ('0x00') to the views property instead of
     deleting it entirely.  These changes ensure that Kukai and Umami
     origination flows operate correctly while still enabling FAST_ORIGIN
     (reduced payloads) for Temple.
   – Improved contract address resolution in single‑stage origination.
     After waiting for confirmation, the code now calls op.contract()
     and getOriginatedContractAddresses() to retrieve the new KT1 on
     mainnet.  If both methods fail, the fallback block scan runs for
     20 iterations instead of 15, reducing timeouts on slower networks.
*/
