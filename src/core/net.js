/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/net.js
  Rev :    r911   2025-07-13
  Summary: added retry on TypeError/failed; up tries to 10 for TzKT
──────────────────────────────────────────────────────────────*/
const LIMIT = 4;                         // parallel fetch cap
let   active = 0;                        // in-flight counter
const queue  = [];                       // FIFO backlog

export const sleep = (ms = 500) => new Promise(r => setTimeout(r, ms));

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
 * @param   {number} tries   max attempts (default 5)
 * @returns {Promise<any>}   parsed JSON
 */
export function jFetch(url, tries = /tzkt\.io/i.test(url) ? 10 : 5) {
  return new Promise((resolve, reject) => {
    const run = () => exec(async () => {
      for (let i = 0; i < tries; i += 1) {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 45_000);
        try {
          const res = await fetch(url, { signal: ctrl.signal });
          clearTimeout(timer);

          if (res.status === 429) {            // rate-limit
            await sleep(800 * (i + 1));
            continue;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          return resolve(await res.json());
        } catch (e) {                          // network / parse error
          clearTimeout(timer);
          const errStr = e?.name || String(e?.message || e);
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

/* What changed & why: Added retry on TypeError/failed to fetch/NetworkError; increased tries to 10 for TzKT URLs to handle flaky large responses; Compile-Guard passed.
*/
/* EOF */