/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/sliceCache.js
  Rev :    r1 2025-09-07
  Summary: IndexedDB-only slice checkpoint cache
──────────────────────────────────────────────────────────────*/
import { get as idbGet, set as idbSet, del as idbDel } from './idbCache.js';

const PREFIX = 'zu:slice';
const detectNet = () => (typeof window === 'undefined' ? 'ghostnet' : (/ghostnet/i.test(window.location.hostname) ? 'ghostnet' : 'mainnet'));

const keyOf = (net, contract, tokenId) => `${PREFIX}:${net}:${contract}:${tokenId}`;

async function migrateLocal(contract, tokenId, label, net) {
  if (typeof localStorage === 'undefined') return null;
  const oldKey = `zuSliceCache:${net}:${contract}:${tokenId}:${label}`;
  const raw = localStorage.getItem(oldKey);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    const rec = {
      tokenKey: `${net}/${contract}/${tokenId}`,
      lastConfirmedBytes: obj.next || 0,
      headBytes: obj.headBytes || 0,
      expectedTotalBytes: obj.total || 0,
      sha256Head: obj.sha256Head || '',
      sha256Full: obj.hash || '',
      lastOpHash: obj.lastOpHash || '',
      createdAt: obj.created || Date.now(),
      updatedAt: obj.updated || Date.now(),
    };
    await idbSet(keyOf(net, contract, tokenId), rec);
    localStorage.removeItem(oldKey);
    return rec;
  } catch {
    return null;
  }
}

export async function loadSliceCheckpoint(contract, tokenId, label='artifactUri', net=detectNet()) {
  const k = keyOf(net, contract, tokenId);
  let row = await idbGet(k);
  if (!row) row = await migrateLocal(contract, tokenId, label, net);
  return row || null;
}

export async function saveSliceCheckpoint(contract, tokenId, label, info, net=detectNet()) {
  const k = keyOf(net, contract, tokenId);
  const now = Date.now();
  const prev = (await idbGet(k)) || {};
  const rec = {
    tokenKey: `${net}/${contract}/${tokenId}`,
    createdAt: prev.createdAt || now,
    updatedAt: now,
    ...prev,
    ...info,
  };
  await idbSet(k, rec);
}

export async function clearSliceCheckpoint(contract, tokenId, _label='artifactUri', net=detectNet()) {
  await idbDel(keyOf(net, contract, tokenId));
}

export const loadSliceCache = loadSliceCheckpoint;
export const saveSliceCache = saveSliceCheckpoint;
export const clearSliceCache = clearSliceCheckpoint;

export function purgeExpiredSliceCache() { /* no-op for IDB */ }

/* EOF */
