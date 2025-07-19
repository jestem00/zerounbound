/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/net.js
  Rev :    r1026   2025‑07‑19
  Summary: dual‑stage origination helpers.  Provides helpers to
           forge and inject operations locally (with manual
           gas/storage/fee fallback) and exposes forgeViaBackend
           and injectViaBackend for callers that wish to offload
           those steps to serverless endpoints.  net.js itself
           always uses local forging/injection.
──────────────────────────────────────────────────────────────────*/
import { OpKind } from '@taquito/taquito';
import { b58cdecode, prefix } from '@taquito/utils';
// Explicitly import the local forger.  While Taquito may configure
// a local forger by default, our testing has shown that the
// toolkit.forger can still invoke the RPC forger on some
// configurations.  To guarantee that origination bytes are forged
// entirely client‑side (avoiding the RPC /forge/operations endpoint),
// we instantiate our own LocalForger below.  See:
// https://tezostaquito.io/docs/forger for details.
import { LocalForger } from '@taquito/local-forging';
// Parser from michel-codec is used to convert plain Michelson (.tz) source
// into Micheline JSON when forging locally.  Without this conversion,
// passing a raw string into estimate.originate or forge may throw an
// error.  Parsing is performed on-demand in forgeOrigination.
import { Parser } from '@taquito/michel-codec';

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
  Manual forge and inject helpers
─────────────────────────────────────────────────────────────*/

/**
 * Forge an origination operation via backend API.  Sends a POST
 * request to /api/forge with the code, storage and source.  The
 * server returns forged bytes.  This mirrors SmartPy’s backend
 * behaviour and avoids browser payload limits.
 *
 * @param {any[]} code Michelson code array
 * @param {any} storage Initial storage (MichelsonMap or compatible)
 * @param {string} source tz1/KT1 address initiating the origination
 * @returns {Promise<string>} forged bytes
 */
async function forgeViaBackend(code, storage, source) {
  const res = await jFetch('/api/forge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, storage, source }),
  });
  if (res && res.forgedBytes) return res.forgedBytes;
  throw new Error('Backend forge failed');
}

/**
 * Inject a signed operation via backend API.  Sends a POST
 * request to /api/inject with the signed bytes.  Returns the
 * operation hash from the response.  When using the backend,
 * this avoids browser injection limits.
 *
 * @param {string} signedBytes Hex string of the signed operation
 * @returns {Promise<string>} operation hash
 */
async function injectViaBackend(signedBytes) {
  const res = await jFetch('/api/inject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedBytes }),
  });
  if (res && (res.opHash || res.hash)) return res.opHash || res.hash;
  throw new Error('Backend inject failed');
}

// Export backend helpers so that callers (e.g. src/pages/deploy.js)
// can explicitly offload forging and injection to the serverless
// API endpoints.  net.js itself always performs local forging and
// injection by default.
export { forgeViaBackend, injectViaBackend };

/**
 * Forge an origination operation locally.
 * Estimates gas/fee and builds the operation contents with the given code and storage.
 * Returns the forged bytes which must be signed externally.
 *
 * @param {TezosToolkit} toolkit Taquito toolkit instance
 * @param {string} source The originating address (tz1/KT1)
 * @param {any[]} code Michelson code array
 * @param {any} storage Initial storage object (MichelsonMap or compatible)
 * @returns {Promise<{ forgedBytes: string, contents: any[], branch: string }>}
 */
export async function forgeOrigination(toolkit, source, code, storage) {
  /*
   * Attempt to estimate gas, storage and fee via the RPC.  On some
   * networks the RPC returns 400 or fails to simulate large
   * contracts, which in turn aborts the entire origination.  To
   * guard against this, we wrap the call in a try/catch and fall
   * back to conservative defaults when estimation fails.  These
   * defaults are intentionally generous: 1.04 million gas, 60 k
   * storage, and a 0.2 ꜩ fee.  They ensure that the forged
   * operation is accepted by the chain even without prior
   * estimation.  Users will only pay the actual resources consumed
   * when the operation is applied.
   */
  // If the provided code is a raw Michelson string, parse it into
  // Micheline JSON using the Parser.  This allows Taquito to
  // estimate and forge the contract.  If code is already a JSON
  // Michelson array, leave it unchanged.
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
  let feeMutez      = '200000';    // 0.2 ꜩ
  let gasLimit      = '1040000';   // ~1 million gas
  let storageLimit  = '60000';     // 60 k bytes
  try {
    const estimate = await toolkit.estimate.originate({ code: parsedCode, storage, balance: '0' });
    feeMutez      = estimate.suggestedFeeMutez.toString();
    gasLimit      = estimate.gasLimit.toString();
    storageLimit  = estimate.storageLimit.toString();
  } catch (e) {
    // Swallow estimation errors and proceed with manual values.
  }
  // Fetch current branch for forging
  const block = await toolkit.rpc.getBlockHeader();
  const branch = block.hash;
  // Fetch current counter and increment
  const contractInfo = await toolkit.rpc.getContract(source);
  const counter     = parseInt(contractInfo.counter, 10) + 1;
  // Build contents array for origination
  const contents = [{
    kind         : OpKind.ORIGINATION,
    source       : source,
    fee          : feeMutez,
    counter      : counter.toString(),
    gas_limit    : gasLimit,
    storage_limit: storageLimit,
    balance      : '0',
    script       : { code: parsedCode, storage },
  }];
  // Forge the operation bytes using a dedicated LocalForger.  Although
  // Taquito can be configured with a local forger, we explicitly
  // instantiate one here to ensure that forging never falls back to
  // the RPC forger (which would POST to /forge/operations and may
  // return 400 errors for large scripts).  The LocalForger accepts
  // the same input shape as the RPC forger.
  const localForger = new LocalForger();
  const forgedBytes  = await localForger.forge({ branch, contents });
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
 * Inject a signed operation bytes string and return the operation hash.
 * @param {TezosToolkit} toolkit Taquito toolkit instance
 * @param {string} signedBytes Hex string of the signed operation (forgedBytes + signature)
 * @returns {Promise<string>} Operation hash
 */
export async function injectSigned(toolkit, signedBytes) {
  // Inject the signed operation via the RPC.  Front‑end callers
  // may choose to offload this to a serverless API (see
  // forgeViaBackend/injectViaBackend), but this function always
  // performs the local injection.  The caller should handle
  // fallback logic.
  return await toolkit.rpc.injectOperation(signedBytes);
}

/* What changed & why: Removed USE_BACKEND import and moved the
   responsibility of choosing backend vs. local forging to the
   caller.  net.js now always forges and injects locally with a
   manual gas/storage/fee fallback, while exposing forgeViaBackend
   and injectViaBackend for external use.  This avoids build
   errors when deployTarget.js does not export USE_BACKEND and
   centralises the decision logic in deploy.js.  Updated
   revision and summary accordingly. */