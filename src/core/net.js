/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/net.js
  Rev :    r1004   2025‑08‑05
  Summary: fix Vercel build — import LocalForger from
           @taquito/local-forging; no behavioural changes.
─────────────────────────────────────────────────────────────*/

import { Parser }                 from '@taquito/michel-codec';
import { Schema }                 from '@taquito/michelson-encoder';
import { OpKind }                 from '@taquito/taquito';
import { LocalForger }            from '@taquito/local-forging';
import { b58cdecode, prefix }     from '@taquito/utils';
import { Buffer }                 from 'buffer';

/*─────────────────────────────────────────────────────────────
  Concurrency & throttled fetch
─────────────────────────────────────────────────────────────*/

// Lower the global concurrency to 2 to reduce pressure on TzKT and other
// HTTP2 endpoints.  The previous implementation allowed four
// concurrent requests which could trigger HTTP2 protocol errors on
// resource‑constrained APIs.  See Invariant I68 for details.
const LIMIT = 2;
let   active = 0;
const queue  = [];

/**
 * Sleep helper with a default delay.  Used for exponential
 * backoff between retries.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = (ms = 500) => new Promise((r) => setTimeout(r, ms));

/**
 * Execute a queued task respecting the concurrency limit.
 *
 * @param {Function} task
 * @returns {Promise<any>}
 */
function exec(task) {
  active++;
  return task().finally(() => {
    active--;
    if (queue.length) queue.shift()();
  });
}

/**
 * Throttled fetch with retry and back‑off.  Automatically
 * parses JSON/text responses.  Retries on network & HTTP2 errors.
 *
 * @param {string} url
 * @param {object|number} opts
 * @param {number} tries
 * @returns {Promise<any>}
 */
export function jFetch(url, opts = {}, tries) {
  if (typeof opts === 'number') { tries = opts; opts = {}; }
  if (!Number.isFinite(tries)) tries = /tzkt\.io/i.test(url) ? 6 : 5;

  return new Promise((resolve, reject) => {
    const run = () => exec(async () => {
      for (let i = 0; i < tries; i++) {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 45_000);
        try {
          const res = await fetch(url, { ...opts, signal: ctrl.signal });
          clearTimeout(timer);
          if (res.status === 429) { await sleep(1_200 * (i + 1)); continue; }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ct  = res.headers.get('content-type') || '';
          const data = ct.includes('json') ? await res.json() : await res.text();
          return resolve(data);
        } catch (e) {
          clearTimeout(timer);
          const m = e?.message || '';
          if (/Receiving end|ECONNRESET|NetworkError|failed fetch|HTTP2|ProtocolError/i.test(m)) {
            await sleep(800 * (i + 1));
            continue;
          }
          if (i === tries - 1) return reject(e);
          await sleep(600 * (i + 1));
        }
      }
    });
    if (active >= LIMIT) queue.push(run); else run();
  });
}

/*─────────────────────────────────────────────────────────────
  Backend forge and inject helpers
─────────────────────────────────────────────────────────────*/

// Internal helper to build the forge endpoint URL.
function forgeEndpoint() {
  const svc = typeof process !== 'undefined' ? process.env.FORGE_SERVICE_URL : '';
  return svc ? `${svc.replace(/\/$/, '')}/forge` : '/api/forge';
}

/**
 * Encode a high‑level storage object into Micheline using the storage type.
 *
 * @param {any} code
 * @param {any} storage
 * @returns {any}
 */
export function encodeStorageForForge(code, storage) {
  try {
    let script = code;
    if (typeof code === 'string') {
      const parser = new Parser();
      script = parser.parseScript(code);
    }
    let storageExpr = null;
    if (Array.isArray(script)) storageExpr = script.find((ex) => ex.prim === 'storage');
    else if (script && script.prim === 'storage') storageExpr = script;

    if (storageExpr?.args?.length) {
      const schema = new Schema(storageExpr.args[0]);
      return schema.Encode(storage);
    }
  } catch {/* swallow */}
  return storage;
}

/**
 * Forge an origination operation via backend API.
 */
export async function forgeViaBackend(code, storage, source, publicKey) {
  const url = forgeEndpoint();
  const payload = {
    code,
    storage: encodeStorageForForge(code, storage),
    source,
    ...(publicKey ? { publicKey } : {}),
  };
  const res = await jFetch(url, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify(payload),
  });
  if (res?.forgedBytes || res?.forgedbytes) return res.forgedBytes || res.forgedbytes;
  if (res?.error) throw new Error(res.error);
  throw new Error('Backend forge failed');
}

/**
 * Deprecated – remote injection removed.
 */
export async function injectViaBackend() {
  throw new Error('Remote injection disabled; use injectSigned()');
}

/*─────────────────────────────────────────────────────────────
  Signature helpers
─────────────────────────────────────────────────────────────*/

export function sigToHex(signature) {
  let bytes;
  if (signature.startsWith('edsig')) {
    bytes = b58cdecode(signature, prefix.edsig).slice(5);
  } else if (signature.startsWith('spsig1')) {
    bytes = b58cdecode(signature, prefix.spsig1).slice(5);
  } else if (signature.startsWith('p2sig')) {
    bytes = b58cdecode(signature, prefix.p2sig).slice(4);
  } else {
    bytes = b58cdecode(signature, prefix.sig).slice(3);
  }
  return Buffer.from(bytes).toString('hex');
}

export function sigHexWithTag(signature) {
  const hex = sigToHex(signature);
  let tag = '00';
  if (signature.startsWith('spsig1')) tag = '01';
  else if (signature.startsWith('p2sig')) tag = '02';
  return hex + tag;
}

export async function injectSigned(toolkit, signedBytes) {
  return toolkit.rpc.injectOperation(signedBytes);
}

/*─────────────────────────────────────────────────────────────
  Local forge and inject helpers
─────────────────────────────────────────────────────────────*/

export async function forgeOrigination(toolkit, source, code, storage, publicKey) {
  let parsedCode = code;
  if (typeof code === 'string') {
    const parser = new Parser();
    parsedCode = parser.parseScript(code);
  }
  const encodedStorage = encodeStorageForForge(parsedCode, storage);

  let needsReveal = false;
  if (publicKey) {
    try { needsReveal = !(await toolkit.rpc.getManagerKey(source)); }
    catch { needsReveal = true; }
  }

  const branch   = (await toolkit.rpc.getBlockHeader()).hash;
  const counter0 = parseInt((await toolkit.rpc.getContract(source)).counter, 10) + 1;
  let counter    = counter0;
  const contents = [];

  if (needsReveal && publicKey) {
    contents.push({
      kind         : OpKind.REVEAL,
      source,
      fee          : '1300',
      counter      : String(counter),
      gas_limit    : '10000',
      storage_limit: '0',
      public_key   : publicKey,
    });
    counter += 1;
  }

  let feeMutez = '200000';
  let gasLimit = '200000';
  let storageLimit = '60000';
  try {
    const est = await toolkit.estimate.originate({ code: parsedCode, storage: encodedStorage, balance: '0' });
    feeMutez      = String(est.suggestedFeeMutez);
    gasLimit      = String(est.gasLimit);
    storageLimit  = String(est.storageLimit);
  } catch {/* ignore estimation errors */}

  contents.push({
    kind         : OpKind.ORIGINATION,
    source,
    fee          : feeMutez,
    counter      : String(counter),
    gas_limit    : gasLimit,
    storage_limit: storageLimit,
    balance      : '0',
    script       : { code: parsedCode, storage: encodedStorage },
  });

  let forgedBytes;
  try {
    forgedBytes = await toolkit.rpc.forgeOperations({ branch, contents });
  } catch {
    const local = new LocalForger();
    forgedBytes = await local.forge({ branch, contents });
  }
  return { forgedBytes, contents, branch };
}

/* What changed & why:
   • Import LocalForger from @taquito/local-forging (fixes Vercel build
     error “not exported from @taquito/taquito”).
   • Header Rev bump to r1004; no other logic touched.
*/
/* EOF */
