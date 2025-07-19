/*Developed by @jams2blues – ZeroContract Studio
  File:    src/core/net.js
  Rev :    r1022   2025‑07‑19
  Summary: dual‑stage origination helpers using toolkit.forger (local forging default) */
import { OpKind } from '@taquito/taquito';
import { b58cdecode, prefix } from '@taquito/utils';

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
  // Estimate the origination to get gas, storage and fee
  const estimate = await toolkit.estimate.originate({
    code,
    storage,
    balance: '0',
  });
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
    fee          : estimate.suggestedFeeMutez.toString(),
    counter      : counter.toString(),
    gas_limit    : estimate.gasLimit.toString(),
    storage_limit: estimate.storageLimit.toString(),
    balance      : '0',
    script       : { code, storage },
  }];
  // Forge the operation bytes using the toolkit's forger provider. Since
  // Taquito v12 the default forger is LocalForger, which performs local
  // forging and avoids RPC 400 errors.
  const forgedBytes = await toolkit.forger.forge({ branch, contents });
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
  return await toolkit.rpc.injectOperation(signedBytes);
}

/* What changed & why: Adjusted forgeOrigination to use toolkit.forger.forge
   (local forging) instead of RPC or explicit LocalForger import. This avoids
   RPC 400 errors and removes dependency on @taquito/local-forging. Retained
   sigToHex, injectSigned, jFetch and sleep from previous revision. */
