/*Developed by @jams2blues
  File:    src/utils/resolveTezosDomain.js
  Rev :    r11
  Summary: POST GraphQL using reverseRecord(address:String!),
           strict tz1–tz4 gating, in-flight de-dupe, safe caching,
           and graceful fallbacks (no 400 spam). */

import { useState, useEffect } from 'react';
import {
  DOMAIN_CONTRACTS,
  FALLBACK_RPCS,
  RPC_URLS,
} from '../config/deployTarget.js';

// ─────────────────────────────────────────────────────────────
// In‑memory caches
// key: `${network}:${addr-lc}`  → string|null
// inflight: same key → Promise<string|null>
const domainCache = new Map();
const inflight    = new Map();

const GQL_ENDPOINT = 'https://api.tezos.domains/graphql';

// Normalize to lowercase for the **cache key only**.
function normalizeAddress(addr) {
  return typeof addr === 'string' ? addr.trim().toLowerCase() : '';
}

/** Strict tz‑address *shape* check (case‑sensitive base58 class, tz1–tz4). */
function looksLikeTz(addr) {
  return typeof addr === 'string' && /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
}

/**
 * Optional on‑chain reverse lookup (disabled by default).
 * Keep this fast & quiet; only used when explicitly enabled below.
 */
// eslint-disable-next-line no-unused-vars
async function resolveOnChain(address, network) {
  const rpcList = RPC_URLS || FALLBACK_RPCS;
  const rpc = (rpcList && rpcList[network]) || rpcList.mainnet;
  const contractAddr = DOMAIN_CONTRACTS?.[network] || DOMAIN_CONTRACTS?.mainnet;
  if (!rpc || !contractAddr) return null;
  try {
    const { TezosToolkit } = await import('@taquito/taquito');
    const { bytesToString, bytes2Char } = await import('@taquito/utils');
    const Tezos = new TezosToolkit(rpc);
    const contract = await Tezos.contract.at(contractAddr);
    const storage = await contract.storage();
    const rrMap = storage?.store?.reverse_records || storage?.reverse_records;
    if (!rrMap || typeof rrMap.get !== 'function') return null;
    const record = await rrMap.get(address);
    if (record && record.name) {
      try { return bytesToString(record.name); }
      catch { return bytes2Char(record.name); }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve a Tezos address to a `.tez` name using Tezos Domains GraphQL.
 * Uses POST + variables with the **current schema**:
 *
 *   query ($addr: String!) {
 *     reverseRecord(address: $addr) { address domain { name } }
 *   }
 *
 * Results (including null) are cached. Concurrent lookups are coalesced.
 */
export async function resolveTezosDomain(address, network = 'mainnet') {
  if (typeof address !== 'string') return null;

  // IMPORTANT: never mutate case here; GraphQL expects the original case.
  const addr = address.trim();
  const key  = `${network}:${normalizeAddress(addr)}`;

  // Early cache hit
  if (domainCache.has(key)) return domainCache.get(key);

  // Only tz1–tz4 are eligible; bail early for KT1/rollup/contract etc.
  if (!looksLikeTz(addr)) {
    domainCache.set(key, null);
    return null;
  }

  // Coalesce concurrent requests for the same key.
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      // POST + variables; **String!** matches the official schema.
      const query = `
        query Reverse($addr: String!) {
          reverseRecord(address: $addr) {
            address
            domain { name }
          }
        }`.trim();

      const resp = await fetch(GQL_ENDPOINT, {
        method : 'POST',
        headers: {
          'content-type': 'application/json',
          'accept'      : 'application/json',
        },
        body   : JSON.stringify({ query, variables: { addr } }),
        // Explicit CORS mode for clarity; default is 'cors' in browsers.
        mode   : 'cors',
      });

      // If the endpoint rejects (e.g., schema mismatch or WAF), cache null.
      if (!resp.ok) {
        domainCache.set(key, null);
        return null;
      }

      const data = await resp.json().catch(() => ({}));

      // GraphQL error array → treat as a miss (cache null).
      if (Array.isArray(data?.errors) && data.errors.length) {
        domainCache.set(key, null);
        return null;
      }

      const name = data?.data?.reverseRecord?.domain?.name || null;
      domainCache.set(key, name);
      return name;
    } catch {
      // Optional: enable on-chain fallback for resilience at the cost of latency.
      // const fallback = await resolveOnChain(addr, network);
      // domainCache.set(key, fallback);
      domainCache.set(key, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

/** Hook: resolve a .tez domain for an address. Cached across calls. */
export function useTezosDomain(address, network = 'mainnet') {
  const [domain, setDomain] = useState(() => {
    const norm = normalizeAddress(address);
    const cacheKey = `${network}:${norm}`;
    return norm && domainCache.has(cacheKey) ? domainCache.get(cacheKey) : null;
  });

  useEffect(() => {
    let cancelled = false;
    const norm = normalizeAddress(address);
    const cacheKey = `${network}:${norm}`;
    if (!norm) { setDomain(null); return undefined; }
    const cached = domainCache.get(cacheKey);
    if (cached !== undefined) { setDomain(cached); return undefined; }
    (async () => {
      const result = await resolveTezosDomain(address, network);
      if (!cancelled) setDomain(result);
    })();
    return () => { cancelled = true; };
  }, [address, network]);

  return domain;
}

/* What changed & why (r11):
   • Fixed schema mismatch: use ($addr: String!) per official docs.
   • Enforced POST-only, removed GET path that was 400’ing behind WAF.
   • Allowed tz1–tz4; kept KT1/rollup short‑circuit (no reverse).
   • Preserved original case for GraphQL; lowercase only for cache keys.
   • Kept in‑flight de‑dup + cache‑null to suppress repeat failures. */
// EOF
