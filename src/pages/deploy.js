/*─────────────────────────────────────────────────────────────
      Developed by @jams2blues – ZeroContract Studio
      File:    src/pages/deploy.js
      Rev :    r1105   2025‑07‑21
      Summary: production‑grade deploy page for ZeroContract collections.
               This revision abandons manual forging entirely and
               leverages the wallet’s originate API.  Metadata is
               assembled on the client, encoded as a big‑map, and
               passed directly to `TezosToolkit.wallet.originate()`,
               ensuring protocol‑correct encoding and reveal handling.
               Off‑chain views are imported directly from their JSON
               descriptor.  This avoids the double‑nesting bug seen
               when decoding from hex.  Progress feedback mirrors the
               legacy UI without depending on backend forge services.
               Use this page for single‑stage origination; patching
               flows remain unaffected elsewhere.
─────────────────────────────────────────────────────────────*/

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { MichelsonMap } from '@taquito/michelson-encoder';
import { char2Bytes } from '@taquito/utils';

// UI components
import DeployCollectionForm from '../ui/DeployCollectionForm.jsx';
import PixelHeading         from '../ui/PixelHeading.jsx';
import CRTFrame             from '../ui/CRTFrame.jsx';
import OperationOverlay     from '../ui/OperationOverlay.jsx';

// Wallet context
import { useWallet } from '../contexts/WalletContext.js';

// Contract sources and view definitions
import contractCode  from '../../contracts/Zero_Contract_V4.tz';
// Import the off‑chain views definition as a hex string.  This file
// exports a hex‑encoded JSON payload containing the contract’s
// views.  It is parsed into an object via hexToString() below.
// Import the off‑chain views definition directly from JSON.  The
// file exports an object with a `views` array.  Using JSON avoids
// the double‑nesting bug observed when decoding from hex.  Ensure
// that the `contracts/metadata/views/Zero_Contract_v4_views.json` file
// is present in your repository.
import viewsJson     from '../../contracts/metadata/views/Zero_Contract_v4_views.json' assert { type: 'json' };

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

/**
 * Convert a hex string (optionally prefixed with 0x) back to a UTF‑8
 * string.  Used to decode the embedded views JSON from viewsHex.
 *
 * @param {string} hex Hex string with or without 0x prefix
 * @returns {string} Decoded UTF‑8 string
 */
const hexToString = (hex) => {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const len = h.length;
  const bytes = new Uint8Array(len / 2);
  for (let i = 0; i < len; i += 2) bytes[i / 2] = parseInt(h.slice(i, i + 2), 16);
  return new TextDecoder().decode(bytes);
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
 * collection.  It builds on‑chain metadata, requests a signature
 * through the connected wallet, and monitors the operation until
 * confirmation.  Progress and error states are reported via an
 * overlay.  This component does not perform manual forging; all
 * encoding and reveal management are delegated to the wallet.
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

  // Single‑stage origination does not support resuming, so effect is empty
  useEffect(() => {}, []);

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
   * Originate a new ZeroContract collection via wallet.originate().  This
   * method builds the metadata, encodes it into a Michelson map, and
   * submits the origination.  Progress is reported through the
   * component’s state.  All forging and reveal logic is handled by
   * Taquito/Beacon internally, ensuring compatibility with Tezos RPC.
   *
   * @param {Object} meta Metadata from form
   */
  async function originate(meta) {
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

    // Stage 0: compress metadata
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

    // Animate progress while the wallet modal is open and operation is sent
    const tick = () => {
      setPct((p) => Math.min(0.45, p + 0.002));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    try {
      // Originate via wallet API.  Beacon/Temple will prompt the user to
      // sign, handle reveals, and inject the operation.  The returned
      // operation includes the hash and contractAddress.
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

      // Wait for at least two confirmations to consider the origination final
      await op.confirmation(2);
      setStep(3);
      setLabel('Confirming on-chain');
      setPct(0.9);

      // Attempt to resolve the originated contract address
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

  /*──────── render ─────────────────────────────────────────*/
  return (
    <>
      {/* Centre the form inside a CRTFrame with a PixelHeading */}
      <CRTFrame>
        <PixelHeading>Deploy&nbsp;New&nbsp;Collection</PixelHeading>
        <DeployCollectionForm onDeploy={originate} />
      </CRTFrame>
      {/* Overlay for progress and errors */}
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
   • r1105 reimplements the deploy page using wallet.originate() and
     removes all manual forging, injection and signature tagging.
     This mirrors the older, more reliable pipeline which leaves
     encoding and reveal logic to Taquito and the connected wallet.
     Metadata is built on the client and encoded into a big‑map
     with both the pointer and content stored as hex.  Off‑chain
     views are imported directly from their JSON file instead of
     decoding a hex constant; this prevents the double‑nesting of
     the `views` property.  Progress feedback matches legacy
     behaviour without relying on backend forge services.  The UI
     remains centred inside CRTFrame with PixelHeading, and errors
     are surfaced via OperationOverlay.
*/