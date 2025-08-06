/*─────────────────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/marketplaceListings.js
  Rev :    r5     2025‑08‑06 UTC
  Summary: Aggregate listings across all marketplace addresses and
           expose marketplaceAddrs helper. Maintains per‑network
           TzKT resolver.

   NOTE: These functions should never throw; they always return
   sensible defaults when the network or API is unreachable.
─────────────────────────────────────────────────────────────────────────────*/

import { NETWORK_KEY } from '../config/deployTarget.js';
import { marketplaceAddrs } from '../core/marketplace.js';

/*──────── dynamic TzKT base resolver ───────────────────────*/
// Determine the appropriate TzKT API domain for a given network.  The
// default TZKT_API constant reflects only the build‑time network.
// When functions such as listActiveCollections() are invoked with
// net='mainnet' while the app is configured for ghostnet (or vice
// versa) the static constant points at the wrong chain and yields
// empty results.  To avoid this, derive the API root per network.
const tzktBaseForNet = (net = NETWORK_KEY) => {
  if (!net) net = NETWORK_KEY;
  return /mainnet/i.test(net) ? 'https://api.tzkt.io' : 'https://api.ghostnet.tzkt.io';
};

/**
 * Inspect contract metadata via TzKT to determine if a contract is
 * a ZeroContract instance.  This heuristic checks the contract's
 * `version` field (added by the deploy UI) and interfaces array.
 * It returns true when the version contains “ZeroContract” (case
 * insensitive) or when the contract lists both TZIP‑012 and
 * TZIP‑016 interfaces.  When metadata cannot be fetched the
 * function returns false.
 *
 * @param {string} addr KT1 contract address
 * @param {string} net  network key (ghostnet|mainnet)
 * @returns {Promise<boolean>}
 */
async function isZeroContract(addr, net = NETWORK_KEY) {
  if (!/^KT1[0-9A-Za-z]{33}$/.test(addr)) return false;
  try {
    const base = tzktBaseForNet(net);
    const res  = await fetch(`${base}/v1/contracts/${addr}/metadata`);
    if (!res.ok) return false;
    const md   = await res.json();
    if (!md || typeof md !== 'object') return false;
    // The deploy UI injects a version string on the contract
    const ver = md.version || md.ver || '';
    if (typeof ver === 'string' && /ZeroContract/i.test(ver)) return true;
    // Otherwise, check that both FA2 (TZIP‑12) and metadata (TZIP‑16)
    // interfaces are present.  Some contracts may include more but
    // these two are mandatory for ZeroContract.
    const interfaces = md.interfaces || md.interface || [];
    if (Array.isArray(interfaces)) {
      const has12 = interfaces.some((x) => /TZIP-?12/i.test(x));
      const has16 = interfaces.some((x) => /TZIP-?16/i.test(x));
      if (has12 && has16) return true;
    }
  } catch {
    /* ignore network/parse errors */
  }
  return false;
}

/**
 * Enumerate NFT contract addresses that currently have active
 * listings on the ZeroSum marketplace.  The TzKT API exposes a
 * `collection_listings` big‑map keyed by the collection address.
 * This helper queries the big‑map pointer, retrieves all active
 * keys and returns unique KT1 addresses.  Optionally, the
 * addresses can be filtered to only include ZeroContract
 * instances by inspecting their metadata via {@link isZeroContract}.
 * When the TzKT API fails or no addresses are found, the
 * function returns an empty array; callers are expected to fall
 * back to static lists such as hashMatrix.
 *
 * @param {string} [net=NETWORK_KEY] network identifier ('ghostnet' | 'mainnet')
 * @param {boolean} [filterZeroContract=true] filter results to ZeroContract collections
 * @returns {Promise<string[]>} list of KT1 addresses with active listings
 */
export async function listActiveCollections(net = NETWORK_KEY, filterZeroContract = true) {
  // Resolve all marketplace addresses for the given network. Fall back to
  // the known ghostnet marketplace when unset to preserve legacy behavior.
  let markets = marketplaceAddrs(net) || [];
  if (markets.length === 0 && typeof net === 'string' && net.toLowerCase() === 'ghostnet') {
    markets = ['KT1R1PzLhBXEd98ei72mFuz4FrUYEcuV7t1p'];
  }
  const out = [];
  const base = tzktBaseForNet(net);
  for (const market of markets) {
    try {
      const maps = await fetch(`${base}/v1/contracts/${market}/bigmaps?path=collection_listings`).then((r) => r.json());
      let ptr;
      if (Array.isArray(maps) && maps.length > 0) {
        const match = maps.find((m) => (m.path || m.name) === 'collection_listings');
        ptr = match ? (match.ptr ?? match.id) : undefined;
      }
      if (ptr == null) continue;
      const keys = await fetch(`${base}/v1/bigmaps/${ptr}/keys?active=true`).then((r) => r.json());
      for (const entry of keys) {
        const key = entry.key;
        let addr;
        if (typeof key === 'string') {
          addr = key;
        } else if (key && typeof key.address === 'string') {
          addr = key.address;
        } else if (key && typeof key.value === 'string') {
          addr = key.value;
        }
        if (addr && /^KT1[0-9A-Za-z]{33}$/.test(addr)) {
          out.push(addr);
        }
      }
    } catch {
      /* ignore individual marketplace errors */
    }
  }
  const unique = Array.from(new Set(out));
  if (!filterZeroContract) return unique;
  const filtered = [];
  for (const addr of unique) {
    try {
      if (await isZeroContract(addr, net)) filtered.push(addr);
    } catch {
      /* ignore metadata errors */
    }
  }
  return filtered;
}

/**
 * Retrieve all active listings for a given collection via the
 * marketplace’s `listings` big‑map.  Each entry contains
 * complete listing details (nonce, price, amount, seller and
 * other fields) keyed by a composite of NFT contract, token id
 * and listing nonce.  This helper scans all active entries,
 * filters them by the provided collection address and returns
 * one listing per token id corresponding to the lowest price.
 *
 * @param {string} nftContract KT1 address of the collection
 * @param {string} [net=NETWORK_KEY] network identifier
 * @returns {Promise<Array<{contract:string, tokenId:number, priceMutez:number}>>}
 */
export async function listListingsForCollectionViaBigmap(nftContract, net = NETWORK_KEY) {
  let markets = marketplaceAddrs(net) || [];
  if (markets.length === 0 && typeof net === 'string' && net.toLowerCase() === 'ghostnet') {
    markets = ['KT1R1PzLhBXEd98ei72mFuz4FrUYEcuV7t1p'];
  }
  const byToken = new Map();
  const base = tzktBaseForNet(net);
  for (const market of markets) {
    try {
      const maps = await fetch(`${base}/v1/contracts/${market}/bigmaps?path=listings`).then((r) => r.json());
      let ptr;
      if (Array.isArray(maps) && maps.length > 0) {
        const match = maps.find((m) => (m.path || m.name) === 'listings');
        ptr = match ? (match.ptr ?? match.id) : undefined;
      }
      if (ptr == null) continue;
      const entries = await fetch(`${base}/v1/bigmaps/${ptr}/keys?active=true`).then((r) => r.json());
      for (const entry of entries) {
        const keyAddr = entry.key?.address || entry.key?.value || entry.key;
        if (
          !keyAddr ||
          typeof keyAddr !== 'string' ||
          keyAddr.toLowerCase() !== nftContract.toLowerCase()
        ) {
          continue;
        }
        const values = entry.value || {};
        for (const listing of Object.values(values)) {
          if (!listing || typeof listing !== 'object') continue;
          const tokenId = Number(listing.token_id ?? listing.tokenId);
          let price = listing.price ?? listing.priceMutez;
          let amount = listing.amount ?? listing.quantity ?? listing.amountTokens;
          price = typeof price === 'string' ? Number(price) : price;
          amount = typeof amount === 'string' ? Number(amount) : amount;
          const active = listing.active !== false;
          if (!active || !Number.isFinite(tokenId) || !Number.isFinite(price) || amount <= 0) continue;
          const prev = byToken.get(tokenId);
          if (!prev || price < prev.priceMutez) {
            byToken.set(tokenId, { contract: nftContract, tokenId, priceMutez: price });
          }
        }
      }
    } catch {
      /* ignore individual marketplace errors */
    }
  }
  return Array.from(byToken.values());
}

/* What changed & why: r5 – Aggregate over all marketplace instances and
   expose marketplaceAddrs helper while retaining per‑network TzKT
   resolution. */

