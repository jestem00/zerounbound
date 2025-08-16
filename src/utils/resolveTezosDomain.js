/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/resolveTezosDomain.js
  Rev :    r10    2025‑08‑16
  Summary: POST‑first GraphQL with variables (more reliable),
           strict tz address validation, graceful GET fallback,
           optional on‑chain fallback, and null‑caching.
──────────────────────────────────────────────────────────────*/

import { useState, useEffect } from 'react';
import {
  DOMAIN_CONTRACTS,
  FALLBACK_RPCS,
  RPC_URLS,
} from '../config/deployTarget.js';

// In-memory cache mapping `${network}:${address}` → domain name or null.
const domainCache = new Map();

const isTz = (s) => typeof s === 'string' && /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/i.test(s);

/** Normalize addresses to lower-case strings to ensure consistent caching. */
function normalizeAddress(addr) {
  return typeof addr === 'string' ? addr.toLowerCase().trim() : '';
}

/**
 * Resolve a Tezos address to a .tez domain name via on-chain lookup.
 * Disabled by default (only used as a last-resort fallback).
 */
// eslint-disable-next-line no-unused-vars
async function resolveOnChain(address, network) {
  const rpcList = RPC_URLS || FALLBACK_RPCS;
  const rpc = (rpcList && rpcList[network]) || rpcList?.mainnet;
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
      try {
        return bytesToString(record.name);
      } catch {
        return bytes2Char(record.name);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve a Tezos address to its .tez domain via Tezos Domains GraphQL.
 * POST with variables first (most compatible), then GET fallback, then
 * optional on-chain fallback. Results (including null) are cached.
 */
export async function resolveTezosDomain(address, network = 'mainnet') {
  const normAddr = normalizeAddress(address);
  if (!isTz(normAddr)) return null;

  const key = `${network}:${normAddr}`;
  if (domainCache.has(key)) return domainCache.get(key);

  const endpoint = 'https://api.tezos.domains/graphql';

  // 1) Try POST with variables
  try {
    const query = `
      query Reverse($addrs: [String!]) {
        reverseRecords(where: { address: { in: $addrs } }) {
          items { address domain { name } }
        }
      }`;
    const body = JSON.stringify({ query, variables: { addrs: [normAddr] } });
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      const items = data?.data?.reverseRecords?.items;
      const name = (Array.isArray(items) && items[0]?.domain?.name) || null;
      domainCache.set(key, name);
      return name;
    }
  } catch { /* swallow and try fallback */ }

  // 2) Fallback GET (encoded query)
  try {
    const gql = `query { reverseRecords(where: { address: { in: ["${normAddr}"] } }) { items { address domain { name } } } }`;
    const url = `${endpoint}?query=${encodeURIComponent(gql)}`;
    const resp = await fetch(url, { method: 'GET' });
    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      const items = data?.data?.reverseRecords?.items;
      const name = (Array.isArray(items) && items[0]?.domain?.name) || null;
      domainCache.set(key, name);
      return name;
    }
  } catch { /* swallow and try final fallback */ }

  // 3) Optional on-chain fallback (last resort)
  try {
    const fallback = await resolveOnChain(normAddr, network);
    domainCache.set(key, fallback);
    return fallback;
  } catch {
    domainCache.set(key, null);
    return null;
  }
}

/** React hook wrapper with cache awareness. */
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
    if (!isTz(norm)) {
      setDomain(null);
      return undefined;
    }
    const cached = domainCache.get(cacheKey);
    if (cached !== undefined) {
      setDomain(cached);
      return undefined;
    }
    (async () => {
      const result = await resolveTezosDomain(address, network);
      if (!cancelled) setDomain(result);
    })();
    return () => { cancelled = true; };
  }, [address, network]);
  return domain;
}

/* What changed & why (r10):
   • POST‑first GraphQL with variables for fewer 400s.
   • Strict tz address validation to avoid invalid queries.
   • GET fallback retained; optional on‑chain fallback enabled at end.
   • Cache nulls to prevent repeat lookups. */ /* EOF */
