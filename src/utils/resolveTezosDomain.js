/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/resolveTezosDomain.js
  Rev :    r9    2025‑08‑01
  Summary: Tezos Domains resolver with network-aware GraphQL
           queries and in-memory caching.  This revision imports
           DOMAIN_CONTRACTS and FALLBACK_RPCS from deployTarget.js
           (per invariant I10) instead of hard‑coding them, and
           reverts to a GET-based GraphQL query to maintain
           reliable mainnet domain resolution.  It suppresses
           warnings on failures and caches null results to avoid
           repeated requests.  On-chain fallback remains
           disabled by default but can be enabled by uncommenting
           the relevant code.
─────────────────────────────────────────────────────────────*/

import { useState, useEffect } from 'react';
import {
  DOMAIN_CONTRACTS,
  FALLBACK_RPCS,
  RPC_URLS,
} from '../config/deployTarget.js';

// In-memory cache mapping `${network}:${address}` → domain name or null.
const domainCache = new Map();

// Normalize addresses to lower-case strings to ensure consistent caching.
function normalizeAddress(addr) {
  return typeof addr === 'string' ? addr.toLowerCase() : '';
}

/**
 * Resolve a Tezos address to a .tez domain name via on-chain lookup.
 * This helper queries the Tezos Domains NameRegistry contract on
 * the specified network and decodes the reverse record bytes into
 * a human-readable string.  If no record exists or an error
 * occurs, null is returned.  On-chain lookup is off by default in
 * the main resolver; enable by uncommenting the call in
 * resolveTezosDomain() if GraphQL fails.
 *
 * @param {string} address The Tezos address to resolve.
 * @param {string} network The network key ('mainnet' | 'ghostnet' | …).
 * @returns {Promise<string|null>} The resolved domain name or null.
 */
// eslint-disable-next-line no-unused-vars
async function resolveOnChain(address, network) {
  const rpcList = RPC_URLS || FALLBACK_RPCS;
  // Choose a single RPC endpoint per network for on‑chain calls.
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
      try {
        return bytesToString(record.name);
      } catch {
        return bytes2Char(record.name);
      }
    }
    return null;
  } catch {
    // On-chain lookup failures are silent; the caller handles null.
    return null;
  }
}

/**
 * Perform a reverse record lookup against the Tezos Domains GraphQL
 * endpoint.  Returns the domain name (e.g. `alice.tez`) if found,
 * otherwise null.  This function uses a GET request with the
 * GraphQL query encoded in the URL.  Ghostnet currently lacks a
 * dedicated subdomain, so all networks query the main endpoint.
 * Errors are suppressed and null values are cached to avoid
 * repeated requests.
 *
 * @param {string} address Tezos address to resolve.
 * @param {string} [network='mainnet'] Network key ('mainnet' | 'ghostnet').
 * @returns {Promise<string|null>} The .tez domain name or null.
 */
export async function resolveTezosDomain(address, network = 'mainnet') {
  const normAddr = normalizeAddress(address);
  if (!normAddr) return null;
  const key = `${network}:${normAddr}`;
  // If we have a cached result, return it immediately.
  if (domainCache.has(key)) return domainCache.get(key);

  // Tezos Domains reverse lookups are defined only for tz1/2/3 addresses.
  // Skip contract (KT1/KT2/…) addresses to avoid unnecessary 400 errors.
  if (!/^tz[123]/i.test(normAddr)) {
    domainCache.set(key, null);
    return null;
  }

  // Tezos Domains GraphQL endpoint – same for all networks.
  const endpoint = 'https://api.tezos.domains/graphql';
  try {
    // GraphQL query to fetch reverse records for a specific address.  We
    // use the `in` operator with a single-element array, which is the
    // pattern supported by the Tezos Domains GraphQL API.  Quotes
    // surrounding the address are escaped to preserve JSON validity.
    const gql = `query { reverseRecords(where: { address: { in: [\"${address}\"] } }) { items { address domain { name } } } }`;
    const url = `${endpoint}?query=${encodeURIComponent(gql)}`;
    const resp = await fetch(url, { method: 'GET' });
    if (resp.ok) {
      const data = await resp.json();
      const items = data?.data?.reverseRecords?.items;
      if (Array.isArray(items) && items.length > 0) {
        const record = items[0];
        const name = record?.domain?.name || null;
        domainCache.set(key, name);
        return name;
      }
    }
  } catch {
    // Suppress GraphQL errors; fall through to cache null.
  }
  // Optionally enable on-chain fallback by uncommenting the next lines.
  // const fallback = await resolveOnChain(address, network);
  // domainCache.set(key, fallback);
  domainCache.set(key, null);
  return null;
}

/**
 * React hook to resolve a Tezos address to its .tez domain name.
 * The hook triggers a lookup whenever the address or network changes
 * and returns null until a result is available.  Results are
 * cached across hook invocations.  Components can fall back to
 * displaying a truncated address while the lookup completes.
 *
 * @param {string} address Tezos address to resolve.
 * @param {string} network Tezos network key (defaults to 'mainnet').
 * @returns {string|null} The resolved domain name or null if none.
 */
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
    if (!norm) {
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

/* What changed & why: r9 – Added imports of DOMAIN_CONTRACTS,
   FALLBACK_RPCS and RPC_URLS from deployTarget.js to centralise
   network-specific configuration per invariant I10.  Reverted to
   the GET-based GraphQL query used prior to r7 to restore
   reliable mainnet resolution.  Added detailed documentation and
   suppressed warning logs on errors.  On-chain fallback remains
   commented out but can be enabled by uncommenting the call.
*/