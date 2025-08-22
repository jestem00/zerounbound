/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/sliceCacheV4a.js
  Rev :    r1 2025-09-07
  Summary: IndexedDB-backed slice checkpoints for ZeroTerminal (v4a)
──────────────────────────────────────────────────────────────*/
import { get as idbGet, set as idbSet, del as idbDel } from './idbCache.js';

const PREFIX = 'zu:slice:v4a';
const detectNet = () => (typeof window === 'undefined' ? 'ghostnet' : (/ghostnet/i.test(window.location.hostname) ? 'ghostnet' : 'mainnet'));
const keyOf = (net, contract, tokenId, label='artifact') => `${PREFIX}:${net}:${contract}:${tokenId}:${label}`;

async function migrateLocal(contract, tokenId, label, net) {
  if (typeof localStorage === 'undefined') return null;
  const oldKey = `zuSliceCache:${net}:${contract}:${tokenId}:${label}`;
  const raw = localStorage.getItem(oldKey);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    const now = Date.now();
    const rec = { tokenId:+tokenId, label, chunkSize: obj.chunkSize || 32_768, updated: now, created: obj.created || now, ...obj };
    await idbSet(keyOf(net, contract, tokenId, label), rec);
    localStorage.removeItem(oldKey);
    return rec;
  } catch {
    return null;
  }
}

export async function loadSliceCheckpoint(contract, tokenId, label='artifact', net=detectNet()) {
  const k = keyOf(net, contract, tokenId, label);
  let row = await idbGet(k);
  if (!row) row = await migrateLocal(contract, tokenId, label, net);
  return row || null;
}

export async function saveSliceCheckpoint(contract, tokenId, label, info, net=detectNet()) {
  const k = keyOf(net, contract, tokenId, label);
  const now = Date.now();
  const prev = (await idbGet(k)) || {};
  const rec = { tokenId:+tokenId, label, created: prev.created || now, updated: now, ...prev, ...info };
  await idbSet(k, rec);
}

export async function clearSliceCheckpoint(contract, tokenId, label='artifact', net=detectNet()) {
  await idbDel(keyOf(net, contract, tokenId, label));
}

export const loadSliceCache = loadSliceCheckpoint;
export const saveSliceCache = saveSliceCheckpoint;
export const clearSliceCache = clearSliceCheckpoint;

export function purgeExpiredSliceCache() { /* no-op for IDB */ }

export function strHash(s='') {
  /* eslint-disable no-bitwise */
  return s.split('').reduce((h,c)=>(h<<5)+h+c.charCodeAt(0),5381)>>>0;
}
/* EOF */