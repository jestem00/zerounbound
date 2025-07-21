/*─────────────────────────────────────────────────────────────────
      Developed by @jams2blues – ZeroContract Studio
      File:    src/core/net.js
      Rev :    r1103   2025‑07‑21
      Summary: unified single‑stage origination helpers.  Added
               sigHexWithTag() for curve-tagging signatures and
               updated forgeViaBackend() to send high‑level storage
               directly to the backend instead of encoding it.  This
               prevents double encoding when using the remote forge
               service and aligns with the backend’s new estimation
               pipeline.  forgeOrigination() still encodes storage,
               handles reveals and attempts RPC forging before
               falling back to LocalForger.
────────────────────────────────────────────────────────────────*/

import { OpKind } from '@taquito/taquito';
import { b58cdecode, prefix } from '@taquito/utils';
import { LocalForger } from '@taquito/local-forging';
// Parser from michel-codec is used to convert plain Michelson (.tz) source
// into Micheline JSON when forging locally and for extracting the storage
// type for encoding.  Without this conversion, passing a raw string into
// estimate.originate or forge may throw an error.  Parsing is performed
// on-demand in forgeOrigination and encodeStorageForForge.
import { Parser } from '@taquito/michel-codec';
import { Schema } from '@taquito/michelson-encoder';
// Import forge service URL from deployTarget so that remote calls can
// be routed to an external host.  When FORGE_SERVICE_URL is empty,
// backend helpers fall back to /api endpoints within Next.js.
import { FORGE_SERVICE_URL } from '../config/deployTarget.js';

/* global concurrency limit */
const LIMIT = 4;
let   active = 0;
const queue  = [];

/**
 * Sleep helper with default 500ms.
 */
export const sleep = (ms = 500) => new Promise(r => setTimeout(r, ms));

/**
 * Execute a queued task respecting concurrency limit.
 */
function exec(task) {
  active++;
  return task().finally(() => {
    active--;
    if (queue.length) {
      queue.shift()();
    }
  });
}

/**
 * Throttled fetch with retry and backoff.
 * Automatically parses JSON and text responses.
 * Respects a global concurrency limit and retries network/429 errors.
 * @param {string} url Request URL
 * @param {object|number} opts Fetch init or number of retries
 * @param {number} tries Number of retry attempts
 */
export function jFetch(url, opts = {}, tries) {
  if (typeof opts === 'number') { tries = opts; opts = {}; }
  if (!Number.isFinite(tries)) tries = /tzkt\.io/i.test(url) ? 10 : 5;

  return new Promise((resolve, reject) => {
    const run = () => exec(async () => {
      for (let i = 0; i < tries; i++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 45_000);
        try {
          const res = await fetch(url, { ...opts, signal: ctrl.signal });
          clearTimeout(timer);
          if (res.status === 429) {
            await sleep(800 * (i + 1));
            continue;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ct  = res.headers.get('content-type') || '';
          const data = ct.includes('json') ? await res.json() : await res.text();
          return resolve(data);
        } catch (e) {
          clearTimeout(timer);
          const m = e?.message || '';
          /* retry on network/interruption errors */
          if (/Receiving end|ECONNRESET|NetworkError|failed fetch/i.test(m)) {
            await sleep(800 * (i + 1));
            continue;
          }
          if (i === tries - 1) return reject(e);
          await sleep(600 * (i + 1));
        }
      }
    });
    if (active >= LIMIT) queue.push(run);
    else run();
  });
}

/*─────────────────────────────────────────────────────────────
  Backend forge and inject helpers
────────────────────────────────────────────────────────────*/

/**
 * Determine the full URL for the forge API.  If FORGE_SERVICE_URL
 * is non-empty, append `/forge`; otherwise fall back to the local
 * Next.js API route.  This indirection allows deployments to swap
 * between a remote service and in-process API routes without
 * changing the call sites.
 */
function forgeEndpoint() {
  return FORGE_SERVICE_URL ? `${FORGE_SERVICE_URL.replace(/\/$/, '')}/forge`
 : '/api/forge';
}

/**
 * Determine the full URL for the inject API.  Same logic as
 * forgeEndpoint().
 */
function injectEndpoint() {
  return FORGE_SERVICE_URL ? `${FORGE_SERVICE_URL.replace(/\/$/, '')}/inject` 
 : '/api/inject';
}

/**
 * Encode a high-level storage object into Micheline using the contract's
 * storage type.  If the provided code is a raw Michelson string, it is
 * parsed into Micheline via the Parser.  The storage type is extracted
 * from the `storage` section's first argument.  On success, the encoded
 * Micheline is returned; on failure, the original storage object is
 * returned unchanged.
 *
 * This helper centralises the conversion required by Tezos RPC
 * forgeOperations and ensures that remote forge calls receive valid
 * Micheline.  Local forging functions accept high-level storage, so
 * encoding is only necessary for the backend path.
 *
 * @param {any} code Raw Michelson string or Micheline array
 * @param {any} storage High-level storage object (MichelsonMap or plain)
 * @returns {any} Micheline representation of storage, or the original value
 */
export function encodeStorageForForge(code, storage) {
  try {
    let script = code;
    if (typeof code === 'string') {
      const parser = new Parser();
      script = parser.parseScript(code);
    }
    // script is expected to be an array of declarations; find the storage
    let storageExpr = null;
    if (Array.isArray(script)) {
      storageExpr = script.find(ex => ex.prim === 'storage');
    } else if (script && script.prim === 'storage') {
      storageExpr = script;
    }
    if (storageExpr && Array.isArray(storageExpr.args) && storageExpr.args.length) {
      const storageType = storageExpr.args[0];
      const schema = new Schema(storageType);
      const encoded = schema.Encode(storage);
      return encoded;
    }
  } catch (err) {
    // swallow errors; fallback to original storage
  }
  return storage;
}

/**
 * Forge an origination operation via backend API.  Sends a POST
 * request to the configured forge endpoint with the code, storage
 * and source address.  The server returns forged bytes.  When
 * FORGE_SERVICE_URL is set this will call the external service; when
 * empty it uses the built-in Next.js API (/api/forge).  Callers
 * should catch errors and fall back to local forging via
 * forgeOrigination.
 *
 * @param {any[]} code Michelson code array or raw string
 * @param {any} storage Initial storage (MichelsonMap or compatible)
 * @param {string} source tz1/KT1 address initiating the origination
 * @returns {Promise } forged bytes
 */
export async function forgeViaBackend(code, storage, source, publicKey) {
  const url = forgeEndpoint();
  // Do not encode storage here.  Pass the high‑level storage object
  // directly.  The backend will perform encoding and estimation
  // itself.  Encoding on the client can lead to double‑encoding and
  // estimation failures.
  const payload = { code, storage, source };
  if (publicKey) payload.publicKey = publicKey;
  const res = await jFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res && (res.forgedBytes || res.forgedbytes)) {
    return res.forgedBytes || res.forgedbytes;
  }
  throw new Error('Backend forge failed');
}

/**
 * Inject a signed operation via backend API.  Sends a POST
 * request to the configured inject endpoint with the signed bytes.
 * Returns the operation hash from the response.  When
 * FORGE_SERVICE_URL is set this will call the external service; when
 * empty it uses the built-in Next.js API (/api/inject).  Callers
 * should catch errors and fall back to local injection via
 * injectSigned().
 *
 * @param {string} signedBytes Hex string of the signed operation
 * @returns {Promise } operation hash
 */
export async function injectViaBackend(signedBytes) {
  const url = injectEndpoint();
  const res = await jFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedBytes }),
  });
  if (res && (res.opHash || res.hash)) {
    return res.opHash || res.hash;
  }
  throw new Error('Backend inject failed');
}

/*─────────────────────────────────────────────────────────────
  Local forge and inject helpers
────────────────────────────────────────────────────────────*/

/**
 * Forge an origination operation locally.
 * Estimates gas/fee and builds the operation contents with the given code
 * and storage.  Returns the forged bytes which must be signed externally.
 *
 * @param {TezosToolkit} toolkit Taquito toolkit instance
 * @param {string} source The originating address (tz1/KT1)
 * @param {any[]} code Michelson code array or raw Michelson string
 * @param {any} storage Initial storage object (MichelsonMap or compatible)
 * @returns {Promise<{ forgedBytes: string, contents: any[], branch: string }>}
 */
export async function forgeOrigination(toolkit, source, code, storage, publicKey) {
  // Parse the Michelson code into Micheline if necessary.  This
  // conversion is required for estimation and forging.  If parsing
  // fails, throw an error to signal invalid code.
  let parsedCode = code;
  if (typeof code === 'string') {
    try {
      const parser = new Parser();
      const parsed = parser.parseScript(code);
      if (parsed) parsedCode = parsed;
    } catch (errParse) {
      throw new Error('Invalid Michelson code: ' + errParse.message);
    }
  }
  // Encode high‑level storage into Micheline using Schema.  This
  // ensures that complex types (e.g. MichelsonMaps) are correctly
  // represented during forging.  If encoding fails, fallback to
  // the original storage value.
  const encodedStorage = encodeStorageForForge(parsedCode, storage);
  // Determine whether the source account needs a reveal.  Query
  // the manager key via RPC; if it is undefined or errors, we
  // assume that a reveal operation must precede the origination.
  let needsReveal = false;
  if (publicKey) {
    try {
      const mgrKey = await toolkit.rpc.getManagerKey(source);
      if (!mgrKey) needsReveal = true;
    } catch (e) {
      needsReveal = true;
    }
  }
  // Fetch branch and counter for forging.  The counter is
  // incremented manually for each operation (reveal + origination).
  const blockHeader = await toolkit.rpc.getBlockHeader();
  const branch = blockHeader.hash;
  const contractInfo = await toolkit.rpc.getContract(source);
  let counter = parseInt(contractInfo.counter, 10) + 1;
  const contents = [];
  // If reveal is needed, prepend a reveal operation using the
  // provided publicKey.  Fee/gas/storage values follow typical
  // defaults and may be adjusted by the caller if desired.
  if (needsReveal && publicKey) {
    contents.push({
      kind         : OpKind.REVEAL,
      source       : source,
      fee          : '1300',
      counter      : counter.toString(),
      gas_limit    : '10000',
      storage_limit: '0',
      public_key   : publicKey,
    });
    counter += 1;
  }
  // Estimate fee/gas/storage for the origination.  Wrap in try/catch
  // and fall back to conservative defaults if estimation fails.
  let feeMutez     = '200000';   // 0.2 ꜩ
  let gasLimit     = '200000';   // default gas for origination
  let storageLimit = '60000';    // default storage limit (~60 kB)
  try {
    const estimate = await toolkit.estimate.originate({ code: parsedCode, storage: encodedStorage, balance: '0' });
    feeMutez      = estimate.suggestedFeeMutez.toString();
    gasLimit      = estimate.gasLimit.toString();
    storageLimit  = estimate.storageLimit.toString();
  } catch (e) {
    // estimation errors are ignored; defaults remain in effect
  }
  // Append the origination operation to the contents.  Use the
  // encodedStorage for the script to ensure proper Micheline
  // representation.
  contents.push({
    kind         : OpKind.ORIGINATION,
    source       : source,
    fee          : feeMutez,
    counter      : counter.toString(),
    gas_limit    : gasLimit,
    storage_limit: storageLimit,
    balance      : '0',
    script       : { code: parsedCode, storage: encodedStorage },
  });
  // Forge the operation bytes.  Attempt RPC forging first, which may
  // produce more compact bytes and is the preferred method.  On
  // failure (e.g. due to RPC parse errors with large scripts), fall
  // back to the LocalForger.  Return the forged bytes along with
  // the contents and branch.
  let forgedBytes;
  try {
    forgedBytes = await toolkit.rpc.forgeOperations({ branch, contents });
  } catch (rpcErr) {
    try {
      const localForger = new LocalForger();
      forgedBytes = await localForger.forge({ branch, contents });
    } catch (localErr) {
      throw new Error(`Forge failed: ${rpcErr.message || localErr.message}`);
    }
  }
  return { forgedBytes, contents, branch };
}

/**
 * Convert a base58 signature (edsig/spsig/p2sig) to raw hex for injection.
 * Beacon wallets return base58 signatures prefixed with edsig/spsig1/p2sig.
 * This helper slices the correct prefix and returns the remaining bytes in hex.
 *
 * @param {string} signature Base58 encoded signature from wallet.client.requestSignPayload
 * @returns {string} Hex string of signature bytes (without any prefix)
 */
export function sigToHex(signature) {
  let bytes;
  if (signature.startsWith('edsig')) {
    bytes = b58cdecode(signature, prefix.edsig);
    // strip edsig prefix (5 bytes) per Taquito docs
    bytes = bytes.slice(5);
  } else if (signature.startsWith('spsig1')) {
    bytes = b58cdecode(signature, prefix.spsig1);
    bytes = bytes.slice(5);
  } else if (signature.startsWith('p2sig')) {
    bytes = b58cdecode(signature, prefix.p2sig);
    bytes = bytes.slice(4);
  } else {
    // generic sig prefix
    bytes = b58cdecode(signature, prefix.sig);
    bytes = bytes.slice(3);
  }
  return Buffer.from(bytes).toString('hex');
}

/**
 * Convert a base58 signature to hex and append the appropriate curve tag.
 * Tezos RPC requires that the signed operation bytes end with an 8‑bit tag
 * identifying the curve used for the signature: 00 for Ed25519 (edsig),
 * 01 for secp256k1 (spsig1), and 02 for P‑256 (p2sig).  Without this
 * suffix the RPC may return a phantom operation hash or parsing error.
 *
 * @param {string} signature Base58 encoded signature from wallet.client.requestSignPayload
 * @returns {string} Hex string of signature bytes followed by a curve tag byte
 */
export function sigHexWithTag(signature) {
  const hex = sigToHex(signature);
  // Determine curve tag based on signature prefix
  let tag = '00'; // default to Ed25519
  if (signature.startsWith('spsig1')) {
    tag = '01';
  } else if (signature.startsWith('p2sig')) {
    tag = '02';
  } else if (signature.startsWith('edsig')) {
    tag = '00';
  } else {
    // unknown prefixes default to Ed25519 tag
    tag = '00';
  }
  return hex + tag;
}

/**
 * Inject a signed operation bytes string and return the operation hash.
 * @param {TezosToolkit} toolkit Taquito toolkit instance
 * @param {string} signedBytes Hex string of the signed operation (forgedBytes + signature)
 * @returns {Promise } Operation hash
 */
export async function injectSigned(toolkit, signedBytes) {
  // Inject the signed operation via the RPC.  Front‑end callers
  // may choose to offload this to a serverless API (see
  // forgeViaBackend/injectViaBackend), but this function always
  // performs the local injection.  The caller should handle
  // fallback logic.
  return await toolkit.rpc.injectOperation(signedBytes);
}

/* What changed & why:
   • Bumped revision to r1103.  forgeViaBackend() no longer encodes
     the storage before sending it to the backend.  Passing the
     high‑level storage prevents double encoding and allows the
     backend’s TezosToolkit to correctly estimate gas/fee/storage.
   • Maintained support for optional publicKey to insert reveal
     operations.  forgeOrigination() continues to encode storage
     locally, detect unrevealed accounts, prepend reveal ops and
     attempt RPC forging before falling back to LocalForger.
   • These changes align the front‑end with the updated forge
     service, reducing prevalidation errors due to mis‑encoded
     storage and ensuring interoperability with large contracts.
*/