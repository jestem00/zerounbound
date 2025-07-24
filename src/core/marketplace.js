/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/marketplace.js
  Rev :    r912   2025‑07‑24 UTC
  Summary: live ZeroSum marketplace helpers – resolves
           contract addresses per network, queries off‑chain
           views for listings, selects the cheapest listing and
           builds buy/list transaction parameters.
─────────────────────────────────────────────────────────────*/

import { OpKind }            from '@taquito/taquito';
import { tzip16 }            from '@taquito/tzip16';

/*── deployed marketplace addresses ──────────────────────────*/
export const GHOSTNET_ADDR = 'KT1HmDjRUJSx4uUoFVZyDWVXY5WjDofEgH2G';
export const MAINNET_ADDR  = 'KT1Pg8KjHptWXJgN79vCnuWnYUZF3gz9hUhu';

/**
 * Resolve marketplace address from a network identifier.  When
 * provided a string containing “mainnet” the mainnet contract
 * address is returned; otherwise ghostnet is used.  The
 * toolkit._network.type property is passed through unchanged.
 */
export function marketplaceAddr(net = 'ghostnet') {
  return /mainnet/i.test(net) ? MAINNET_ADDR : GHOSTNET_ADDR;
}

/**
 * Instantiate and return a tzip16‑enabled wallet contract handle
 * for the current ZeroSum marketplace.  The returned contract
 * exposes metadataViews() used by other helpers.
 *
 * @param {TezosToolkit} toolkit – connected wallet context
 * @returns {Promise<ContractAbstraction>} tzip16‑enabled contract
 */
export async function getMarketContract(toolkit) {
  const addr = marketplaceAddr(toolkit?._network?.type);
  return toolkit.wallet.at(addr, tzip16);
}

/**
 * Reads the marketplace off‑chain view `get_listings_for_token` and
 * returns a normalised array of listings.  Each entry contains
 * numeric fields for priceMutez and amount, the seller address,
 * the nonce (listing identifier) and an `active` flag.
 *
 * @param {object} args
 * @param {TezosToolkit} args.toolkit
 * @param {string} args.nftContract – the FA2 contract address
 * @param {number|string} args.tokenId  – token id
 * @returns {Promise<Array<{nonce:number,priceMutez:number,amount:number,seller:string,active:boolean}>>}
 */
export async function fetchListings({ toolkit, nftContract, tokenId }) {
  const market = await getMarketContract(toolkit);
  const views  = await market.tzip16().metadataViews();
  const raw    = await views.get_listings_for_token().executeView(
    String(nftContract),
    Number(tokenId),
  );

  const out = [];
  const push = (n, o) => out.push({
    nonce      : Number(n),
    priceMutez : Number(o.price),
    amount     : Number(o.amount),
    seller     : o.seller,
    active     : o.active,
  });

  if (raw && typeof raw.entries === 'function') {
    for (const [k, v] of raw.entries()) push(k, v);
  } else if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([k, v]) => push(k, v));
  }
  return out;
}

/**
 * Return the cheapest *active* listing for the given token or
 * null when none exist.  Only listings with amount > 0 and
 * active=true are considered.  The returned listing retains
 * seller, nonce, amount and priceMutez fields.
 *
 * @param {object} args
 * @param {TezosToolkit} args.toolkit
 * @param {string} args.nftContract
 * @param {number|string} args.tokenId
 * @returns {Promise<Object|null>}
 */
export async function fetchLowestListing({ toolkit, nftContract, tokenId }) {
  const list = await fetchListings({ toolkit, nftContract, tokenId });
  const act  = list.filter((l) => l.active && l.amount > 0);
  if (!act.length) return null;
  return act.reduce((m, c) => (c.priceMutez < m.priceMutez ? c : m));
}

/**
 * Build transaction parameters for purchasing a token via the
 * ZeroSum marketplace.  The caller must supply the nftContract,
 * tokenId, seller, nonce and priceMutez (in mutez).  The
 * returned array is suitable for wallet.batch() and sets
 * amount: priceMutez, mutez:true on the transfer params.
 *
 * @param {TezosToolkit} toolkit
 * @param {object} args
 * @returns {Promise<Array<object>>}
 */
export async function buildBuyParams(toolkit, {
  nftContract,
  tokenId,
  priceMutez,
  seller,
  nonce,
}) {
  const c = await getMarketContract(toolkit);
  return [{
    kind : OpKind.TRANSACTION,
    ...c.methodsObject.buy({
      seller,
      nft_contract : nftContract,
      token_id     : tokenId,
      amount       : 1,
      nonce,
    }).toTransferParams({ amount: priceMutez, mutez:true }),
  }];
}

/**
 * Build transaction parameters for listing a token.  The token is
 * listed at `priceMutez` for `amount` editions.  Optional
 * saleSplits and royaltySplits arrays follow the contract
 * structure of [{ address, percent }].  startDelay (in seconds)
 * postpones listing activation.
 *
 * @param {TezosToolkit} toolkit
 * @param {object} args
 * @returns {Promise<Array<object>>}
 */
export async function buildListParams(toolkit, {
  nftContract,
  tokenId,
  priceMutez,
  amount        = 1,
  saleSplits    = [],
  royaltySplits = [],
  startDelay    = 0,
}) {
  const c = await getMarketContract(toolkit);
  return [{
    kind : OpKind.TRANSACTION,
    ...c.methodsObject.list_token({
      nft_contract   : nftContract,
      token_id       : tokenId,
      price          : priceMutez,
      amount,
      sale_splits    : saleSplits,
      royalty_splits : royaltySplits,
      start_delay    : startDelay,
    }).toTransferParams(),
  }];
}

/**
 * Build transaction parameters for accepting an offer on a listing.
 * Accepts amount (quantity), listingNonce, nftContract, offeror address and tokenId.
 * Returns a single transaction param object for wallet.batch().
 *
 * @param {TezosToolkit} toolkit
 * @param {object} args
 * @returns {Promise<Array<object>>}
 */
export async function buildAcceptOfferParams(toolkit, {
  nftContract,
  tokenId,
  listingNonce,
  offeror,
  amount        = 1,
}) {
  const c = await getMarketContract(toolkit);
  return [{
    kind : OpKind.TRANSACTION,
    ...c.methodsObject.accept_offer({
      amount        : amount,
      listing_nonce : listingNonce,
      nft_contract  : nftContract,
      offeror       : offeror,
      token_id      : tokenId,
    }).toTransferParams(),
  }];
}

/* What changed & why: wired real contract addresses for ghostnet/mainnet;
   exposed marketplaceAddr, getMarketContract, fetchListings and
   fetchLowestListing; rewrote buildBuyParams and buildListParams to
   leverage object‑style entrypoints (buy/list_token) and return
   transferParams arrays compatible with wallet.batch(). */
/* EOF */