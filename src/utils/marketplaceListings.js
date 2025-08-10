/*─────────────────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/marketplaceListings.js
  Rev :    r4     2025‑08‑03 UTC
  Summary: Removed unused TZKT_API import; revision bump; helper logic
           unchanged.  Maintains the per‑network TzKT resolver and
           listing enumeration functions.

   NOTE: These functions should never throw; they always return
   sensible defaults when the network or API is unreachable.
─────────────────────────────────────────────────────────────────────────────*/

import { NETWORK_KEY } from '../config/deployTarget.js';
import { marketplaceAddr }       from '../core/marketplace.js';

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
  // Determine the correct marketplace contract for the given network.  If
  // marketplaceAddr() returns an undefined or legacy value, fall back to
  // the known ghostnet marketplace.  This guard ensures that calls to
  // TzKT fetch from the intended marketplace contract when the
  // configuration has not yet been updated.
  const rawMarket = marketplaceAddr(net);
  const fallbackMarket =
    (net && typeof net === 'string' && net.toLowerCase() === 'ghostnet')
      ? 'KT1R1PzLhBXEd98ei72mFuz4FrUYEcuV7t1p'
      : undefined;
  const market = rawMarket || fallbackMarket;
  const out = [];
  try {
    // Determine the API base for the given network.  Do not
    // reference the static TZKT_API here, as it may point to a
    // different chain when the wallet selects a network other than
    // the build‑time default.
    const base = tzktBaseForNet(net);
    // Discover the big‑map pointer for collection_listings.  When
    // requesting TzKT bigmaps by path, the API may return multiple
    // entries; find the one whose `path` property exactly matches
    // collection_listings to avoid accidentally picking another
    // big‑map such as total_listed.  See issue with pointer
    // selection in r8.
    const maps = await fetch(`${base}/v1/contracts/${market}/bigmaps?path=collection_listings`).then((r) => r.json());
    let ptr;
    if (Array.isArray(maps) && maps.length > 0) {
      const match = maps.find((m) => (m.path || m.name) === 'collection_listings');
      ptr = match ? (match.ptr ?? match.id) : undefined;
    }
    if (ptr == null) throw new Error('collection_listings bigmap not found');
    // Retrieve active keys (collection addresses)
    const keys = await fetch(`${base}/v1/bigmaps/${ptr}/keys?active=true`).then((r) => r.json());
    for (const entry of keys) {
      const key = entry.key;
      // Keys may be strings or objects; normalise to string
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
    /* ignore network errors; return empty list */
  }
  // Remove duplicates
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
  const market = marketplaceAddr(net);
  const byToken = new Map();
  try {
    // Determine the appropriate TzKT API root for this network.
    const base = tzktBaseForNet(net);
    // Locate the listings big‑map pointer.  As with
    // collection_listings, multiple entries may be returned; find
    // the entry whose `path` equals 'listings'.
    const maps = await fetch(`${base}/v1/contracts/${market}/bigmaps?path=listings`).then((r) => r.json());
    let ptr;
    if (Array.isArray(maps) && maps.length > 0) {
      const match = maps.find((m) => (m.path || m.name) === 'listings');
      ptr = match ? (match.ptr ?? match.id) : undefined;
    }
    if (ptr == null) throw new Error('listings bigmap not found');
    // Fetch all active keys; note that TzKT returns full keys with values
    const entries = await fetch(`${base}/v1/bigmaps/${ptr}/keys?active=true`).then((r) => r.json());
    for (const entry of entries) {
      // Skip keys that do not match the requested collection.  The key
      // identifies (nft_contract, token_id); the address is a string.
      const keyAddr = entry.key?.address || entry.key?.value || entry.key;
      if (
        !keyAddr ||
        typeof keyAddr !== 'string' ||
        keyAddr.toLowerCase() !== nftContract.toLowerCase()
      ) {
        continue;
      }
      const values = entry.value || {};
      // Each entry.value is a map keyed by listing nonce.  Iterate
      // through all listing details to process each active listing.
      for (const listing of Object.values(values)) {
        if (!listing || typeof listing !== 'object') continue;
        const tokenId = Number(listing.token_id ?? listing.tokenId);
        let price = listing.price ?? listing.priceMutez;
        let amount = listing.amount ?? listing.quantity ?? listing.amountTokens;
        // Convert numeric strings to numbers
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
    /* ignore network errors; return empty list */
  }
  return Array.from(byToken.values());
}

/* What changed & why: r4 – Removed an unused TZKT_API import to clean
   up the module and bumped the revision.  The helper continues to
   derive the TzKT base per network and the existing enumeration
   logic remains unchanged. */
