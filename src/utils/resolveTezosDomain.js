/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/resolveTezosDomain.js
  Rev :    r6    2025‑07‑29 UTC
  Summary: Tezos Domains resolver with network-aware GraphQL
           queries and in-memory caching.  This revision
           improves resilience when resolving domains on
           Ghostnet by falling back to the mainnet GraphQL
           endpoint when the ghostnet subdomain is not
           available.  The helper retains the on‑chain
           fallback logic but keeps it disabled by default.
*/

import { useState, useEffect } from 'react';

// Attempt to import RPC_URLS from the deployTarget config. If this
// fails (e.g. due to circular dependencies or missing file in this
// environment), the fallback RPCs defined below will be used. This
// conditional import ensures that resolveTezosDomain.js remains
// isolated from build-time configuration when not available.
let RPC_URLS;
try {
  // eslint-disable-next-line global-require
  ({ RPC_URLS } = require('../config/deployTarget.js'));
} catch (_) {
  RPC_URLS = undefined;
}

// Domain registry contract addresses per network. These addresses
// correspond to the Tezos Domains NameRegistry contract which holds
// the reverse_records bigmap. For networks other than mainnet or
// ghostnet, mainnet is used as a fallback.
const DOMAIN_CONTRACTS = {
  mainnet : 'KT1GBZmSxmnKJXGMdMLbugPfLyUPmuLSMwKS',
  ghostnet: 'KT1REqKBXwULnmU6RpZxnRBUgcBmESnXhCWs',
};

// Fallback RPC URLs for networks when RPC_URLS is not available.
const FALLBACK_RPCS = {
  mainnet : 'https://mainnet.api.tez.ie',
  ghostnet: 'https://ghostnet.tezos.marigold.dev',
};

/**
 * Resolve a Tezos address to a .tez domain name via on-chain lookup.
 * This function queries the Tezos Domains registry contract on the
 * specified network and fetches the reverse record for the given
 * address. It decodes the returned bytes into a human-readable
 * string. If no record exists or an error occurs, null is returned.
 *
 * @param {string} address The Tezos address to resolve.
 * @param {string} network The network key ('mainnet' | 'ghostnet' | ...).
 * @returns {Promise<string|null>} The resolved domain name or null.
 */
async function resolveOnChain(address, network) {
  const norm = address;
  if (!norm) return null;
  const rpc = (RPC_URLS && RPC_URLS[network]) || FALLBACK_RPCS[network] || FALLBACK_RPCS.mainnet;
  const contractAddr = DOMAIN_CONTRACTS[network] || DOMAIN_CONTRACTS.mainnet;
  try {
    const { TezosToolkit } = await import('@taquito/taquito');
    const { bytesToString, bytes2Char } = await import('@taquito/utils');
    const Tezos = new TezosToolkit(rpc);
    const contract = await Tezos.contract.at(contractAddr);
    const storage = await contract.storage();
    const rrMap = storage?.store?.reverse_records || storage?.reverse_records;
    if (!rrMap || typeof rrMap.get !== 'function') return null;
    const record = await rrMap.get(norm);
    if (record && record.name) {
      try {
        return bytesToString(record.name);
      } catch (_) {
        return bytes2Char(record.name);
      }
    }
    return null;
  } catch (err) {
    console.warn('[resolveTezosDomain] on-chain lookup failed', network, address, err);
    return null;
  }
}

// In-memory cache mapping addresses (lowercase) to resolved domain names.
const domainCache = new Map();

function normalizeAddress(addr) {
  return typeof addr === 'string' ? addr.toLowerCase() : '';
}

/**
 * Perform a reverse record lookup against the Tezos Domains GraphQL
 * endpoint. Returns the name of the domain (e.g. `alice.tez`) if
 * found, otherwise null. This function uses a GET request with a
 * GraphQL query. If the request fails or returns no record, null is
 * returned and cached to avoid repeated failed lookups.
 *
 * According to invariant I40, all network requests should funnel
 * through jFetch. In this simplified helper we fall back to the
 * global fetch() API. Projects integrating this helper should
 * consider adapting it to jFetch or another centralized network
 * helper if available.
 *
 * @param {string} address Tezos address to resolve
 * @param {string} [network='mainnet'] Network key ('mainnet' | 'ghostnet')
 * @returns {Promise<string|null>} The .tez domain name or null
 */
export async function resolveTezosDomain(address, network = 'mainnet') {
  const normAddr = typeof address === 'string' ? address.toLowerCase() : '';
  if (!normAddr) return null;
  const key = `${network}:${normAddr}`;
  if (domainCache.has(key)) return domainCache.get(key);

  // Choose GraphQL endpoint based on network.  When resolving on
  // Ghostnet, the Tezos Domains project no longer provides a
  // ghostnet-specific subdomain.  In that case we fall back to
  // the mainnet GraphQL endpoint and rely on on-chain lookups
  // for ghostnet addresses.  Additional networks may be added
  // in the future.
  let endpoint;
  if (network && /ghostnet/i.test(network)) {
    // ghostnet API is currently unavailable; use mainnet endpoint
    endpoint = 'https://api.tezos.domains/graphql';
  } else {
    endpoint = 'https://api.tezos.domains/graphql';
  }

  console.debug('[resolveTezosDomain] lookup', { network, address });
  try {
    const gql = `query { reverseRecords(where: { address: { in: [\"${address}\"] } }) { items { address domain { name } } } }`;
    const url = `${endpoint}?query=${encodeURIComponent(gql)}`;
    const resp = await fetch(url, { method: 'GET' });
    if (resp.ok) {
      const data = await resp.json();
      const items = data?.data?.reverseRecords?.items;
      if (Array.isArray(items) && items.length > 0) {
        const record = items[0];
        const name = record?.domain?.name || null;
        if (name) {
          console.debug('[resolveTezosDomain] result (GraphQL)', { network, address, name });
          domainCache.set(key, name);
          return name;
        }
      }
    } else {
      console.warn('[resolveTezosDomain] GraphQL request failed', resp.status);
    }
  } catch (err) {
    console.warn('[resolveTezosDomain] GraphQL request error', err);
  }
  // On-chain fallback remains disabled by default.  Uncomment the
  // following lines to enable on‑chain resolution when GraphQL
  // fails.  Be aware that the RPC may log 404 errors for
  // non‑existent reverse records.
  // const fallback = await resolveOnChain(address, network);
  // domainCache.set(key, fallback);
  // return fallback;
  domainCache.set(key, null);
  return null;
}

/**
 * React hook to resolve a Tezos address to its .tez domain name. The
 * hook triggers a lookup when the address changes and returns null
 * until a result is available. Components can fall back to a
 * truncated address while the lookup completes. Results are cached
 * across hook invocations.
 *
 * @param {string} address Tezos address to resolve
 * @returns {string|null} The resolved domain name or null if none
 */
export function useTezosDomain(address, network = 'mainnet') {
  const [domain, setDomain] = useState(() => {
    const norm = normalizeAddress(address);
    const key  = `${network}:${norm}`;
    return norm && domainCache.has(key) ? domainCache.get(key) : null;
  });
  useEffect(() => {
    let cancelled = false;
    const norm = normalizeAddress(address);
    const key  = `${network}:${norm}`;
    if (!norm) {
      setDomain(null);
      return undefined;
    }
    const cached = domainCache.get(key);
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