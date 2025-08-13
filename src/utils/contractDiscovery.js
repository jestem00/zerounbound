/*Developed by @jams2blues
  File: src/utils/contractDiscovery.js
  Rev: r74
  Summary: Creator & Collaborator discovery (parallel; progressive; de‑dupe). */

import { getAllowedTypeHashList } from './allowedHashes.js';
import {
  listCreatedByWallet,
  listRecentAllowedContracts,
  collabHasWallet,
} from './tzkt.js';

/**
 * discoverCreated(wallet, network)
 * Returns [{ address, typeHash, timestamp }]
 */
export async function discoverCreated(wallet, network = 'mainnet') {
  if (!wallet) return [];
  const allowed = getAllowedTypeHashList();
  return await listCreatedByWallet(wallet, network, allowed);
}

/**
 * discoverCollaborating(wallet, network, { limit, onProgress, signal })
 * Checks recent allowed contracts and verifies collaborator membership.
 * Emits progressive hits via onProgress(hit).
 */
export async function discoverCollaborating(wallet, network = 'mainnet', opts = {}) {
  const { limit = 160, onProgress = null, signal = null } = opts;
  if (!wallet) return [];

  const allowed = getAllowedTypeHashList();
  const candidates = await listRecentAllowedContracts(allowed, network, limit);

  const hits = [];
  const seen = new Set();
  const abort = () => signal && signal.aborted;

  // bounded concurrency (fast but gentle)
  const limitRun = ((n) => {
    const q = [];
    let active = 0;
    const next = () => { active -= 1; if (q.length) q.shift()(); };
    return (fn) => new Promise((res, rej) => {
      const run = () => {
        active += 1;
        fn().then((v) => { res(v); next(); }, (e) => { rej(e); next(); });
      };
      if (active < n) run(); else q.push(run);
    });
  })(12);

  await Promise.all(candidates.map((c) => limitRun(async () => {
    if (abort()) return;
    if (seen.has(c.address)) return;
    const ok = await collabHasWallet(c.address, wallet, network).catch(() => false);
    if (ok) {
      seen.add(c.address);
      const row = { address: c.address, typeHash: c.typeHash, timestamp: c.timestamp };
      hits.push(row);
      onProgress && onProgress(row);
    }
  })));

  hits.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  return hits;
}

export default { discoverCreated, discoverCollaborating };

/* What changed & why:
   • Matches tzkt.js exports; avoids “contractsByCreator is not a function”.
   • Progressive collaborator scan with bound concurrency. */ // EOF
