/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/net.js
  Rev :    r909   2025-07-10
  Summary: resilient jFetch – retry + timeout + 429-aware queue
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
 * • network error retries (connection reset, CORS, timeout)
 * • hard 45 s request timeout
 *
 * @param   {string} url     fully-qualified URL
 * @param   {number} tries   max attempts (default 3)
 * @returns {Promise<any>}   parsed JSON
 */
export function jFetch(url, tries = 3) {
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
          if (i === tries - 1) return reject(e);
          await sleep(600 * (i + 1));          // progressive back-off
        }
      }
    });

    active < LIMIT ? run() : queue.push(run);
  });
}

/* What changed & why: Date aligned; minor doc polish; no functional change.
*/
/* EOF */