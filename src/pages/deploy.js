/*─────────────────────────────────────────────────────────────
      Developed by @jams2blues – ZeroContract Studio
      File:    src/pages/deploy.js
      Rev :    r1027   2025‑07‑20
      Summary: two‑stage collection origination with resume
               support.  Remote forge/inject helpers are
               reinstated.  High‑level storage is now
               converted to Micheline via Taquito’s Schema
               encoding (with fallback flattening) before
               sending to the remote forge, preventing
               500 errors.  Robust fallback to local forge
               remains.  Metadata builders handle arrays and
               views pointer correctly.
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

// Additional imports to support conversion of high‑level storage (with
// MichelsonMap instances) into Micheline before sending to the
// remote forge service.  Parser and Schema come from Taquito’s
// michelson codec and encoder packages.  These imports are safe
// because both packages are already dependencies of ZeroUnbound and
// are used elsewhere in the project (e.g. net.js).  See
// https://taquito.io/docs/michelsonencoder for API details.
import { Parser } from '@taquito/michel-codec';
import { Schema } from '@taquito/michelson-encoder';
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

/*───────────────────────── sanitization helpers ──────────────────────────*/
/**
 * Sanitize a high‑level storage object by converting all MichelsonMap
 * instances (recursively) into standard JavaScript objects.  This
 * function preserves arrays and primitive values.  Note that this
 * simple conversion only flattens the maps; it does not produce
 * proper Micheline (annotated Michelson).  It is intended as a
 * fallback when Schema encoding fails.
 */
function mapToObject(map) {
  const obj = {};
  for (const [k, v] of map.entries()) {
    obj[k] = v instanceof MichelsonMap ? mapToObject(v) : v;
  }
  return obj;
}

function sanitizeStorage(value) {
  if (value instanceof MichelsonMap) {
    return mapToObject(value);
  }
  if (Array.isArray(value)) {
    return value.map((el) => sanitizeStorage(el));
  }
  if (value !== null && typeof value === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(value)) {
      res[k] = sanitizeStorage(v);
    }
    return res;
  }
  return value;
}

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
   * contract address is known.  It first attempts to forge and
   * inject using the remote forge service (configured via
   * FORGE_SERVICE_URL in deployTarget.js).  When remote calls
   * fail due to network errors or invalid inputs, it gracefully
   * falls back to local forging and injection.  Resume support
   * ensures that users can reload the page without losing progress.
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
        authors : Array.isArray(meta.authors) ? meta.authors : (meta.authors ? [meta.authors] : undefined),
        authoraddress: Array.isArray(meta.authoraddress) ? meta.authoraddress : (meta.authoraddress ? [meta.authoraddress] : undefined),
        creators: Array.isArray(meta.creators) ? meta.creators : (meta.creators ? [meta.creators] : undefined),
        type    : meta.type,
        interfaces: uniqInterfaces(meta.interfaces),
        imageUri: meta.imageUriPlaceholder ||
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAP+Ke1cQAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=',
        // Use a string placeholder for views when FAST_ORIGIN is true
        views   : FAST_ORIGIN ? '0x00' : JSON.parse(hexToString(viewsHex)),
      };
      // Remove undefined or empty array properties
      Object.keys(minimal).forEach((k) => {
        const v = minimal[k];
        if (v === undefined) delete minimal[k];
        else if (Array.isArray(v) && v.length === 0) delete minimal[k];
      });
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

    // Convert high‑level storage (containing MichelsonMap) into a form
    // suitable for remote forging.  The remote forge service expects
    // storage either as Micheline (Michelson JSON) or as a plain
    // object without Taquito maps.  We first attempt to use the
    // contract’s storage type and Schema to encode the high‑level
    // storage into Micheline.  If that fails (e.g. due to a
    // mis‑match in the storage layout), we fall back to recursively
    // flattening MichelsonMap instances into plain objects.
    let storageForForge = storage;
    try {
      const parser = new Parser();
      // The contract code may be a string; parse it into Micheline JSON.
      const script = parser.parseScript(contractCode);
      // Find the storage declaration in the script.  The script is
      // expected to have the form { parameter: ..., storage: ..., code: ... }.
      const storageExpr = script.find((ex) => ex.prim === 'storage');
      if (storageExpr) {
        const schema = new Schema(storageExpr);
        storageForForge = schema.Encode(storage);
      }
    } catch (convErr) {
      // Fallback: flatten the storage by converting maps to plain objects
      storageForForge = sanitizeStorage(storage);
    }
    setStep(1);
    setLabel('Preparing origination (1/2)');
    setPct(0.25);
    try {
      // Attempt remote forging via backend first.  If the
      // remote forge service returns an error (HTTP ≥400 or
      // JSON error), fall back to local forging via
      // forgeOrigination().
      let forgedBytes;
      try {
        // Use the encoded/sanitised storage when forging via the backend.
        forgedBytes = await forgeViaBackend(contractCode, storageForForge, address);
      } catch (remoteErr) {
        // Fallback: use the original high‑level storage for local forging.
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
      // Attempt remote injection via backend first.  If the
      // remote inject service returns an error, fall back to
      // local injection via injectSigned().
      let hash;
      try {
        hash = await injectViaBackend(signedBytes);
      } catch (injErr) {
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
      <CRTFrame>
        <PixelHeading>Deploy New Collection</PixelHeading>
        <DeployCollectionForm onDeploy={originate} />
      </CRTFrame>
      {(step !== -1 || err) && (
        <OperationOverlay
          status={label}
          progress={pct}
          error={err}
          kt1={kt1}
          opHash={opHash}
          current={step}
          total={5}
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
   • Bumped revision to r1027 and updated summary.  Added imports
     for Parser and Schema from Taquito.  Implemented sanitization
     helpers that flatten MichelsonMap instances into plain
     objects when encoding fails.
   • In originate(), storage is now converted to Micheline using
     Schema.Encode() before sending it to the remote forge.  If
     encoding throws, we fall back to flattening maps.  The
     remote forge call now passes this encoded/sanitised
     storage, preventing HTTP 500 errors from the backend.
   • Metadata builder improvements from r1024 remain: array
     fields are trimmed and preserved, empty arrays are removed,
     and the views pointer uses a string ('0x00') when
     FAST_ORIGIN is true.  This continues to prevent runtime
     errors during metadata preparation and storage construction.
*/