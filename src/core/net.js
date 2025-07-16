/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/net.js
  Rev :    r914   2025-07-16
  Summary: add Temple-specific retry logic
──────────────────────────────────────────────────────────────*/
const LIMIT = 4;                        // parallel fetch cap
let   active = 0;                       // in-flight counter
const queue  = [];                      // FIFO backlog

import { selectFastestRpc } from '../config/deployTarget.js';

export const sleep = (ms = 500) => new Promise(r => setTimeout(r, ms));

const USE_BACKEND = process.env.USE_BACKEND === 'true';  // env toggle

async function exec(task) {
  active += 1;
  try { return await task(); }
  finally {
    active -= 1;
    if (queue.length) queue.shift()();   // pull next
  }
}

/**
 * jFetch()
 * Safe JSON fetch with:
 * • global concurrency throttle (LIMIT)
 * • 429 exponential back-off
 * • network error retries (connection reset, CORS, timeout, ERR_CONNECTION_RESET, TypeError/failed)
 * • hard 45 s request timeout
 * • up to 10 tries for TzKT API endpoints
 *
 * @param   {string} url     fully-qualified URL
 * • proxy to /api/forge or /api/inject when USE_BACKEND
 * @param   {number} tries   max attempts (default 5)
 * @returns {Promise<any>}   parsed JSON
 */
export function jFetch(url, opts = {}, tries) {
  if (typeof opts === 'number') { tries = opts; opts = {}; }
  if (!Number.isFinite(tries)) tries = /tzkt\.io/i.test(url) ? 10 : 5;
  return new Promise((resolve, reject) => {
    const run = () => exec(async () => {
      for (let i = 0; i < tries; i += 1) {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 45_000);
        try {
          const res = await fetch(url, { ...opts, signal: ctrl.signal });
          clearTimeout(timer);

          if (res.status === 429) {            // rate-limit
            await sleep(800 * (i + 1));
            continue;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const ct = res.headers.get('content-type') || '';
          const data = ct.includes('application/json')
            ? await res.json()
            : await res.text();
          return resolve(data);
        } catch (e) {                          // network / parse error
          clearTimeout(timer);
          const errStr = e?.name || String(e?.message || e);
          if (errStr.includes('Receiving end does not exist')) {
            // Temple-specific: extension port closed
            await sleep(1200 * (i + 1));
            continue;
          }
          if (errStr.includes('ERR_CONNECTION_RESET') || errStr.includes('ECONNRESET')) {
            await sleep(1200 * (i + 1));      // longer back-off for reset
            continue;
          }
          if (errStr === 'TypeError' || errStr.includes('failed to fetch') || errStr.includes('NetworkError')) {
            await sleep(800 * (i + 1));       // retry on general network fails
            continue;
          }
          if (i === tries - 1) return reject(e);
          await sleep(600 * (i + 1));          // progressive back-off
        }
      }
    });

    active < LIMIT ? run() : queue.push(run);
  });
}

/* origination forger */
export async function forgeOrigination(code, storage) {
  const rpc = await selectFastestRpc().catch(() => { throw new Error('No reachable RPC'); });
  const branch = await jFetch(`${rpc}/chains/main/blocks/head/hash`);
  const op = {
    branch,
    contents: [{
      kind: 'origination',
      balance: '0',
      script: {
        code,
        storage,
      }
    }]
  };
  if (USE_BACKEND) {
    const { forged } = await jFetch('/api/forge', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(op),
    });
    return forged;
  } else {
    const res = await fetch(`${rpc}/chains/main/blocks/head/helpers/forge/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op),
    });
    if (!res.ok) throw new Error(`Forge failed: HTTP ${res.status}`);
    let txt = await res.text();
    try { txt = JSON.parse(txt); } catch {}
    return String(txt).replace(/"/g, '').trim();
  }
}

/* signed injection */
export async function injectSigned(signedBytes) {
  const rpc = await selectFastestRpc().catch(() => { throw new Error('No reachable RPC'); });
  if (USE_BACKEND) {
    const { opHash } = await jFetch('/api/inject', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ signedBytes }),
    });
    return opHash;
  } else {
    const res = await fetch(`${rpc}/injection/operation`, {
      method: 'POST',
      body: JSON.stringify(signedBytes)
    });
    if (!res.ok) throw new Error(`Inject failed: HTTP ${res.status}`);
    return await res.text();  // op hash
  }
}
/* What changed & why: jFetch supports options & text; forge/inject helpers return parsed values. rev r915 */