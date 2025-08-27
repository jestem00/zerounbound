/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/zeroSumViews.js
  Rev :    r12   2025‑10‑11
  Summary: Robust wrappers for **on‑chain** ZeroSum views executed
           via Taquito TZIP‑16 contractViews with resilient param
           handling.  Fixes the “0 For Sale” issue by trying all
           common single‑param shapes (object keys: address /
           nft_contract / collection, and positional) and normalises
           results across toolchain variations.
──────────────────────────────────────────────────────────────*/

import { Tzip16Module, tzip16 } from '@taquito/tzip16';

/* Ensure the toolkit has the tzip16 extension attached (idempotent). */
function ensureTzip16(toolkit) {
  if (!toolkit) throw new Error('Tezos toolkit is required');
  try { toolkit.addExtension?.(new Tzip16Module()); } catch { /* already added */ }
  return toolkit;
}

/* Attempt to derive a view caller. On-chain views require a sender address. */
async function getViewCaller(contract, toolkit) {
  try { return await toolkit.signer.publicKeyHash(); } catch {}
  try { return (await toolkit.wallet?.pkh?.()) || String(contract?.address || ''); } catch {}
  return String(contract?.address || '');
}

/* Load the marketplace contract with tzip16 interface enabled. */
async function getMarket(toolkit, marketAddress) {
  ensureTzip16(toolkit);
  return toolkit.contract.at(marketAddress, tzip16);
}

/* Execute a contract view trying multiple parameter shapes until one succeeds. */
async function execView(contract, viewName, paramVariants, execOpts) {
  const v = contract?.contractViews?.[viewName];
  if (typeof v !== 'function') throw new Error(`View ${viewName} not found on contract`);
  for (const arg of paramVariants) {
    try {
      const handle = Array.isArray(arg) ? v(...arg) : v(arg);
      const res = await handle.executeView(execOpts);
      return res;
    } catch (e) {
      // continue with next variant
    }
  }
  return null;
}

/* Convert various collection view results into a normalised array. */
function parseCollectionListings(raw) {
  const out = [];
  const push = (x) => {
    if (!x) return;
    out.push({
      contract     : String(x.nft_contract || x.contract || x.collection || ''),
      tokenId      : Number(x.token_id ?? x.tokenId ?? x.token?.token_id ?? x.token?.id ?? 0),
      seller       : String(x.seller || x.owner || ''),
      priceMutez   : Number(x.price ?? x.priceMutez ?? 0),
      amount       : Number(x.amount ?? x.quantity ?? x.amountTokens ?? 0),
      active       : !!(x.active ?? x.is_active ?? true),
      startTime    : x.start_time ?? x.start ?? null,
      saleSplits   : x.sale_splits || x.saleSplits || [],
      royaltySplits: x.royalty_splits || x.royaltySplits || [],
    });
  };

  if (!raw) return out;
  if (Array.isArray(raw)) {
    raw.forEach(push);
    return out;
  }
  if (raw?.entries && typeof raw.entries === 'function') {
    for (const [, v] of raw.entries()) push(v);
    return out;
  }
  if (typeof raw === 'object') {
    Object.values(raw).forEach(push);
    return out;
  }
  return out;
}

/**
 * Read **on‑chain** listings for the whole collection.
 * Tries object & positional parameter shapes:
 *   { nft_contract }, { address }, { collection }, "<KT1…>"
 */
export async function onchainListingsForCollection(toolkit, marketAddress, nftContract) {
  const c = await getMarket(toolkit, marketAddress);
  const viewCaller = await getViewCaller(c, toolkit);
  const variants = [
    { nft_contract: nftContract },
    { collection: nftContract },
    { address: nftContract },
    nftContract,
  ];
  const raw = await execView(c, 'onchain_listings_for_collection', variants, { viewCaller });
  const rows = parseCollectionListings(raw);
  return rows.filter((r) => r.active && Number.isFinite(r.priceMutez) && r.amount > 0);
}

/**
 * Read **on‑chain** listings for a specific token.
 * Tries object & positional parameter shapes:
 *   { nft_contract, token_id }, { address, token_id }, [nft_contract, token_id], [token_id, nft_contract]
 */
export async function onchainListingsForToken(toolkit, marketAddress, nftContract, tokenId) {
  const c = await getMarket(toolkit, marketAddress);
  const viewCaller = await getViewCaller(c, toolkit);
  const id = Number(tokenId);
  const variants = [
    { nft_contract: nftContract, token_id: id },
    { address: nftContract, token_id: id },
    { collection: nftContract, token_id: id },
    [nftContract, id],
    [id, nftContract],
  ];
  const raw = await execView(c, 'onchain_listings_for_token', variants, { viewCaller });
  const rows = parseCollectionListings(raw);
  return rows.filter((r) => r.active && Number.isFinite(r.priceMutez) && r.amount > 0);
}

export default {
  onchainListingsForCollection,
  onchainListingsForToken,
};

/* What changed & why (r12):
   • Added robust multi‑shape param invocation to fix view execution
     when the ABI exposes a single `address` arg under varying names.
   • Normalised output across Taquito/BCD shapes and filtered to
     active listings only. */
// EOF
