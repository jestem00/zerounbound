/*─────────────────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/marketplaceListings.js
  Rev :    r1186    2025‑08‑07
  Summary: Aggregate listings across the canonical marketplace address only.
           Legacy marketplace fallbacks have been removed.  Functions
           return sensible defaults when network/API unreachable and
           expose marketplaceAddrs helper.
─────────────────────────────────────────────────────────────────────────────*/

import { NETWORK_KEY } from '../config/deployTarget.js';
import { marketplaceAddrs } from '../core/marketplace.js';

/*──────── dynamic TzKT base resolver ───────────────────────*/
// Determine the appropriate TzKT API domain for a given network.
const tzktBaseForNet = (net = NETWORK_KEY) => {
  if (!net) net = NETWORK_KEY;
  return /mainnet/i.test(net)
    ? 'https://api.tzkt.io'
    : 'https://api.ghostnet.tzkt.io';
};

/**
 * Inspect contract metadata via TzKT to determine if a contract is
 * a ZeroContract instance.  Checks the `version` field (added by deploy UI)
 * and the interfaces array.  Returns true if the version contains
 * “ZeroContract” (case insensitive) or if the contract lists both
 * TZIP‑012 and TZIP‑016 interfaces.  When metadata cannot be fetched,
 * returns false.
 *
 * @param {string} addr KT1 contract address
 * @param {string} [net=NETWORK_KEY] network key ('ghostnet' | 'mainnet')
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
    const ver  = md.version || md.ver || '';
    if (typeof ver === 'string' && /ZeroContract/i.test(ver)) return true;
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
 * Enumerate NFT collection addresses that currently have active listings
 * on the ZeroSum marketplace.  Queries the `collection_listings` big‑map for
 * all keys where active=true.  Returns unique KT1 addresses; optional filter
 * restricts results to ZeroContract collections by checking metadata.
 * Returns an empty array if no addresses found or API fails.
 *
 * @param {string} [net=NETWORK_KEY] network key ('ghostnet' | 'mainnet')
 * @param {boolean} [filterZeroContract=true] filter out non‑ZeroContract collections
 * @returns {Promise<string[]>}
 */
export async function listActiveCollections(net = NETWORK_KEY, filterZeroContract = true) {
  // Gather marketplace addresses for the network.  Legacy addresses have
  // been removed from deployTarget.js.  marketplaceAddrs() returns an
  // array containing only the canonical contract for the network.
  const markets = marketplaceAddrs(net) || [];
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
        if (addr && /^KT1[0-9A-Za-z]{33}$/.test(addr)) out.push(addr);
      }
    } catch {
      /* ignore individual marketplace errors */
    }
  }
  const uniqueAddrs = Array.from(new Set(out));
  if (!filterZeroContract) return uniqueAddrs;
  const filtered = [];
  for (const addr of uniqueAddrs) {
    try {
      if (await isZeroContract(addr, net)) filtered.push(addr);
    } catch {
      /* ignore metadata lookup errors */
    }
  }
  return filtered;
}

/**
 * Retrieve all active listings for a given collection via the marketplace’s
 * `listings` big‑map.  Each entry contains listing details keyed by a
 * composite of collection address, token id and listing nonce.  This scans
 * all active entries, filters by the provided collection address, and
 * returns one listing per token id (the lowest price listing for each
 * token).
 *
 * @param {string} nftContract KT1 address of the collection
 * @param {string} [net=NETWORK_KEY] network key
 * @returns {Promise<Array<{ contract: string, tokenId: number, priceMutez: number }>>}
 */
export async function listListingsForCollectionViaBigmap(nftContract, net = NETWORK_KEY) {
  // Use canonical marketplace addresses only.  Legacy contracts have been
  // removed from deployTarget.js, so this array typically contains a single
  // entry.  When empty, the loop will simply do nothing.
  const markets = marketplaceAddrs(net) || [];
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
        if (!keyAddr || typeof keyAddr !== 'string' || keyAddr.toLowerCase() !== nftContract.toLowerCase()) {
          continue;
        }
        const listingsObj = entry.value || {};
        for (const listing of Object.values(listingsObj)) {
          if (!listing || typeof listing !== 'object') continue;
          const tokenId = Number(listing.token_id ?? listing.tokenId);
          let price  = listing.price ?? listing.priceMutez;
          let amount = listing.amount ?? listing.quantity ?? listing.amountTokens;
          price  = typeof price === 'string' ? Number(price) : price;
          amount = typeof amount === 'string' ? Number(amount) : amount;
          const active = listing.active !== false;
          if (!active || !Number.isFinite(tokenId) || !Number.isFinite(price) || amount <= 0) {
            continue;
          }
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

/* What changed & why: r1186 – Removed fallback to legacy marketplace
   contracts and updated comments accordingly.  marketplaceAddrs()
   now returns only the canonical contract for each network, and no
   ghostnet fallback address is injected.  All queries rely on this
   updated list. */