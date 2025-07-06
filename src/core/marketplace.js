/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/marketplace.js
  Rev :    r910   2025-09-21 UTC
  Summary: ZeroSum wrapper + param builders (buy,list,…)
─────────────────────────────────────────────────────────────*/
import { OpKind } from '@taquito/taquito';

/*── deployed addresses ───────────────────────────────────────*/
export const GHOSTNET_ADDR = 'KT1EQMQp65qitTcSAqoAtZY7jy6n2WLYYKNL';
export const MAINNET_ADDR  = 'KT1PLACEHOLDERMAINNET';            /* TODO */

/** Resolve Marketplace address by network string (“mainnet”|“ghostnet”). */
export function marketplaceAddr(net = 'ghostnet') {
  return /mainnet/i.test(net) ? MAINNET_ADDR : GHOSTNET_ADDR;
}

/*════════ builders (flat transferParams[]) ═══════════════════*/
export async function buildBuyParams(
  toolkit,
  {
    nft,
    tokenId,
    amount     = 1,
    priceMutez = 0,     /* ꜩ → mutez handled by caller */
  },
) {
  const c = await toolkit.wallet.at(marketplaceAddr(toolkit._network?.type));
  return [{
    kind: OpKind.TRANSACTION,
    ...c.methods
      .buy(amount, nft, tokenId)
      .toTransferParams({ amount: priceMutez }),
  }];
}

export async function buildListParams(
  toolkit,
  {
    nft,
    tokenId,
    amount        = 1,
    priceMutez,
    royaltySplits = [],
    saleSplits    = [],
    startDelay    = 0,
  },
) {
  const c = await toolkit.wallet.at(marketplaceAddr(toolkit._network?.type));
  return [{
    kind: OpKind.TRANSACTION,
    ...c.methods
      .list_token(
        amount,
        nft,
        priceMutez,
        royaltySplits,
        saleSplits,
        startDelay,
        tokenId,
      ).toTransferParams(),
  }];
}
/* Future: add buildOfferParams, buildWithdrawParams, etc. */
/* EOF */
