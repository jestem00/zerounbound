/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/marketplace.js
  Rev :    r911   2025‑07‑24 UTC
  Summary: plug‑in live ZeroSum addresses, modern param‑builders
           + helpers to query lowest listing price.
─────────────────────────────────────────────────────────────*/
import { OpKind, TezosToolkit }      from '@taquito/taquito';
import { Tzip16Module, tzip16 }      from '@taquito/tzip16';

/*── deployed marketplace addresses ──────────────────────────*/
export const GHOSTNET_ADDR = 'KT1HmDjRUJSx4uUoFVZyDWVXY5WjDofEgH2G';
export const MAINNET_ADDR  = 'KT1Pg8KjHptWXJgN79vCnuWnYUZF3gz9hUhu';

/** Resolve marketplace address from a network label. */
export const marketplaceAddr = (net = 'ghostnet') =>
  /mainnet/i.test(net) ? MAINNET_ADDR : GHOSTNET_ADDR;

/*─────────────────────────────────────────────────────────────
  1 · Low‑level helpers
─────────────────────────────────────────────────────────────*/
export async function getMarketContract(toolkit) {
  const addr = marketplaceAddr(toolkit._network?.type);
  return toolkit.wallet.at(addr, tzip16);
}

/**
 * Reads the marketplace off‑chain view <get_listings_for_token> and
 * returns a *normalised* JS array with numeric fields.
 */
export async function fetchListings({ toolkit, nftContract, tokenId }) {
  const market = await getMarketContract(toolkit);
  const views  = await market.tzip16().metadataViews();
  const raw    = await views.get_listings_for_token()
                            .executeView(String(nftContract), Number(tokenId));

  const out = [];
  const push = (n, o) => out.push({
    nonce      : Number(n),
    priceMutez : Number(o.price),
    amount     : Number(o.amount),
    seller     : o.seller,
    active     : o.active,
  });

  if (raw?.entries) {                        // Michelson map
    for (const [k,v] of raw.entries()) push(k,v);
  } else if (typeof raw === 'object') {      // plain JS obj
    Object.entries(raw).forEach(([k,v]) => push(k,v));
  }
  return out;
}

/** Returns the cheapest *active* listing or null when none exist. */
export async function fetchLowestListing({ toolkit, nftContract, tokenId }) {
  const list = await fetchListings({ toolkit, nftContract, tokenId });
  const act  = list.filter((l) => l.active && l.amount > 0);
  if (!act.length) return null;
  return act.reduce((m,c) => (c.priceMutez < m.priceMutez ? c : m));
}

/*─────────────────────────────────────────────────────────────
  2 · Transfer‑param builders (for wallet.batch())
─────────────────────────────────────────────────────────────*/
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
      nft_contract  : nftContract,
      token_id      : tokenId,
      price         : priceMutez,
      amount,
      sale_splits   : saleSplits,
      royalty_splits: royaltySplits,
      start_delay   : startDelay,
    }).toTransferParams(),
  }];
}
/* What changed & why: wired real contract addresses; added getMarketContract,
   fetchListings & fetchLowestListing; rebuilt buy/list param‑builders to match
   ZeroSum’s object‑style entrypoints; bumped Rev. */
/* EOF */
