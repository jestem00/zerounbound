/*Developed by @jams2blues with love for the Tezos community
  File: src/core/net.js
  Summary: Global 429-aware fetch queue + helpers */

const LIMIT = 4;                       // max simultaneous requests
let active  = 0;
const queue = [];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function exec(task) {
  active++;
  try { return await task(); }
  finally {
    active--;
    if (queue.length) queue.shift()();
  }
}

export async function jFetch(url, tries = 3) {
  return new Promise((resolve, reject) => {
    const run = () =>
      exec(async () => {
        for (let i = 0; i < tries; i++) {
          try {
            const r = await fetch(url);
            if (r.status === 429) { await sleep(800 * (i + 1)); continue; }
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return resolve(await r.json());
          } catch (e) { if (i === tries - 1) reject(e); }
        }
      });
    active < LIMIT ? run() : queue.push(run);
  });
}

/* What changed & why: centralises 429 handling + limits concurrency to 4 */
