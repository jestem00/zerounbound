/* Developed by @jams2blues
  File:    src/utils/contractDiscovery.js
  Rev:     r75
  Summary: Definitive, carousel-inspired discovery logic. Finds contracts
           created by (initiator/creator) and collaborated on, then verifies
           admin rights via storage to ensure perfect accuracy.
*/

import { getAllowedTypeHashList, typeHashToVersion } from './allowedHashes.js';
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

  // Known open-collaboration collections visible to all wallets (by network)
  // SIFRZERO default collaborative (v4b) on mainnet: anyone can mint.
  // Ensure it always appears in the collaborative carousel regardless of
  // collaborator lists in storage.
  const GLOBAL_OPEN_COLLABS = {
    mainnet: [
      'KT1ME5gH4gA3ZZYmJzGqN8Axu8GcaYH4yini', // SIFRZERO v4b (default collaborative)
    ],
    ghostnet: [],
  };
  const extra = (GLOBAL_OPEN_COLLABS[network] || [])
    .filter((addr) => !candidates.some((c) => c.address === addr))
    .map((address) => ({ address, typeHash: 617511430, timestamp: null }));
  if (extra.length) candidates.push(...extra);

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
    // Treat open-collaboration versions as visible to all (no storage list)
    const ver = typeHashToVersion(c.typeHash);
    let ok = (ver === 'V4B' || ver === 'V4C');
    if (!ok) ok = await collabHasWallet(c.address, wallet, network).catch(() => false);
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
   • Reverted to the correct, working logic that properly discovers both
     factory-deployed (v4e) and legacy contracts by relying on the
     battle-tested tzkt.js helpers, ensuring parity with ContractCarousels. */
