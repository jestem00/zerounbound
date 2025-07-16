/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/chooseFastestRpc.js
  Rev :    r2   2025‑07‑15
  Summary: RPC race selector with 10min cache
──────────────────────────────────────────────────────────────*/
import { RPC_URLS } from '../config/deployTarget.js';

const CACHE_KEY = 'zu_fastest_rpc';
const TTL_MS    = 10 * 60 * 1000;  // 10 min

async function raceRpcs(urls, timeout = 2000) {
  return Promise.race(urls.map(async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const start = Date.now();
    try {
      const res = await fetch(`${url}/chains/main/blocks/head/header`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { url, time: Date.now() - start };
    } catch {
      clearTimeout(timer);
      return { url, time: Infinity };
    }
  }));
}

export async function chooseFastestRpc() {
  if (typeof window === 'undefined') return RPC_URLS[0];

  const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY));
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.url;

  const { url } = await raceRpcs(RPC_URLS).catch(() => ({ url: RPC_URLS[0] }));
  sessionStorage.setItem(CACHE_KEY, JSON.stringify({ url, ts: Date.now() }));

  return url;
}

/* What changed & why: Added 2s timeout, abort on slow RPCs; rev r2. */