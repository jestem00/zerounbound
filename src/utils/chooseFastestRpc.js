/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/chooseFastestRpc.js
  Rev :    r1   2025‑07‑15
  Summary: RPC race selector with 10min cache
──────────────────────────────────────────────────────────────*/
import { RPC_URLS } from '../config/deployTarget.js';

const CACHE_KEY = 'zu_fastest_rpc';
const TTL_MS    = 10 * 60 * 1000;  // 10 min

async function raceRpcs(urls) {
  return Promise.race(urls.map(async url => {
    const start = Date.now();
    await fetch(`${url}/chains/main/blocks/head/header`);
    return { url, time: Date.now() - start };
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

/* What changed & why: New RPC selector; rev r1. */