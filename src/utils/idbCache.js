/* Developed by @jams2blues
  File:    src/utils/idbCache.js
  Rev:     r1
  Summary: A simple, promise-based IndexedDB key-value store to replace
           localStorage for a more robust and performant caching solution.
*/

const DB_NAME = 'ZeroUnboundCache';
const STORE_NAME = 'KeyValueStore';
const DB_VERSION = 2;

let dbPromise = null;

function getDb() {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const { result } = request;
        if (!result.objectStoreNames.contains(STORE_NAME)) {
          result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function withStore(type, callback) {
  const db = await getDb();
  if(!db) return null;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, type);
    const store = transaction.objectStore(STORE_NAME);
    callback(store, resolve, reject);
  });
}

export async function get(key) {
  return withStore('readonly', (store, resolve) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function set(key, value) {
  return withStore('readwrite', (store, resolve) => {
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
  });
}

export async function del(key) {
  return withStore('readwrite', (store, resolve) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
  });
}

export async function clear() {
  return withStore('readwrite', (store, resolve) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
  });
}

// Replicating the interface from the old cache.js for drop-in replacement
export const getCache = get;
export const patchCache = async (key, dataPatch) => {
    const existing = (await get(key)) || {};
    const newData = { ...existing.data, ...dataPatch };
    return set(key, { data: newData, ts: Date.now() });
};
export const nukeCache = clear;
export const listKey = (kind, wallet, net) => `${kind}_${wallet}_${net}`;
export const getList = async (k, ttlMs) => {
  const row = await get(k);
  if (!row) return null;
  if (ttlMs && Date.now() - row.ts > ttlMs) return null;
  return row.data?.v || null;
};
export const cacheList = (k, v) => patchCache(k, { v });

export default { get, set, del, clear, getCache, patchCache, nukeCache, listKey, getList, cacheList };

/* What changed & why: New file. Created a robust, promise-based IndexedDB
   caching utility to replace the less performant localStorage solution,
   as requested for a more future-proof architecture. */