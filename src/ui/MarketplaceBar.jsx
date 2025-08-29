/*
  Developed by @jams2blues — ZeroContract Studio
  File:    src/ui/MarketplaceBar.jsx
  Rev:     r932  2025-08-29
  Summary: Prefer TzKT-first listings, gate RPC offers by env, and
           enable BUY while freshness check runs. Reduces noisy RPC
           view calls on listing grids and speeds up “BUY” enabling.
*/

import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';

import PixelButton     from './PixelButton.jsx';
import BuyDialog       from './BuyDialog.jsx';
import ListTokenDialog from './ListTokenDialog.jsx';
import MakeOfferDialog from './MakeOfferDialog.jsx';
import CancelListing   from './Entrypoints/CancelListing.jsx';
import AcceptOffer     from './Entrypoints/AcceptOffer.jsx';

import { useWalletContext } from '../contexts/WalletContext.js';
import {
  fetchLowestListing,
  fetchOffers,
  getFa2BalanceViaTzkt,
} from '../core/marketplace.js';
import { ENABLE_ONCHAIN_VIEWS } from '../config/deployTarget.js';


function toNumberOrNull(v) {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

const STALE = {
  IDLE     : 'idle',
  CHECKING : 'checking',
  FRESH    : 'fresh',
  STALE    : 'stale',
};

export default function MarketplaceBar({ contractAddress, tokenId, marketplace }) {
  const { toolkit, address: walletAddr } = useWalletContext() || {};

  const [lowest, setLowest]       = useState(null);
  const [hasOffers, setHasOffers] = useState(false);
  const [dlg, setDlg]             = useState(null);
  const [staleStatus, setStaleStatus] = useState(STALE.IDLE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const l = await fetchLowestListing({
          toolkit,
          nftContract: contractAddress,
          tokenId,
          staleCheck: false,
        });
        if (!cancelled) {
          setLowest(l || null);
          setStaleStatus(l ? STALE.CHECKING : STALE.IDLE);
        }
      } catch {
        if (!cancelled) {
          setLowest(null);
          setStaleStatus(STALE.IDLE);
        }
      }

      if (ENABLE_ONCHAIN_VIEWS) {
        try {
          const offers = await fetchOffers({ toolkit, nftContract: contractAddress, tokenId });
          if (!cancelled) setHasOffers(Boolean(offers && offers.length > 0));
        } catch {/* non-fatal */}
      }
    })();
    return () => { cancelled = true; };
  }, [toolkit, contractAddress, tokenId]);

  // Stock-safety probe via TzKT balance (non-blocking for BUY enable)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!lowest || !lowest.seller) {
        if (!cancelled) setStaleStatus(lowest ? STALE.CHECKING : STALE.IDLE);
        return;
      }
      setStaleStatus(STALE.CHECKING);
      try {
        const bal = await getFa2BalanceViaTzkt(lowest.seller, contractAddress, Number(tokenId));
        if (!cancelled) setStaleStatus(bal >= 1 ? STALE.FRESH : STALE.STALE);
      } catch {
        if (!cancelled) setStaleStatus(STALE.STALE);
      }
    })();
    return () => { cancelled = true; };
  }, [lowest, contractAddress, tokenId]);

  const { hasListing, priceMutez, priceXTZ, isSeller } = useMemo(() => {
    const _priceMutez = toNumberOrNull(lowest?.priceMutez);
    const _amount     = toNumberOrNull(lowest?.amount) ?? 0;
    const _seller     = typeof lowest?.seller === 'string' ? lowest.seller : null;
    const _hasListingRaw = _priceMutez != null && _amount > 0 && !!_seller;

    const _priceXTZ = _hasListingRaw
      ? (_priceMutez / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 })
      : null;

    const _isSeller = _hasListingRaw && !!walletAddr && walletAddr.toLowerCase() === String(_seller).toLowerCase();

    // Enable BUY while verifying; block only when proven stale.
    const uiActive = _hasListingRaw && staleStatus !== STALE.STALE;

    return { hasListing: uiActive, priceMutez: _priceMutez, priceXTZ: _priceXTZ, isSeller: _isSeller };
  }, [lowest, walletAddr, staleStatus]);

  const disableBuy = !toolkit || !hasListing || isSeller;

  return (
    <>
      {hasListing && priceXTZ && (
        <span
          aria-label={`Listing price ${priceXTZ} tez`}
          style={{ marginRight: '4px', color: 'var(--zu-accent-sec,#6ff)', fontSize: '.75rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}
          data-testid="marketbar-price"
        >
          {priceXTZ} ꜩ
        </span>
      )}

      <PixelButton
        $noActiveFx
        $size="sm"
        disabled={disableBuy}
        warning={!hasListing}
        aria-disabled={disableBuy}
        aria-label={disableBuy ? 'Buy disabled' : 'Buy now'}
        onClick={() => setDlg('buy')}
        data-testid="marketbar-buy"
        title={!toolkit ? 'Connect wallet to buy'
          : staleStatus === STALE.CHECKING ? 'Verifying availability…'
          : staleStatus === STALE.STALE ? 'Listing unavailable (seller balance is 0)'
          : !hasListing ? 'No active listing to buy'
          : isSeller ? 'You are the seller of this listing'
          : 'Buy this token'}
      >
        BUY
      </PixelButton>

      <PixelButton $noActiveFx $size="sm" disabled={!toolkit} aria-disabled={!toolkit} onClick={() => setDlg('list')} data-testid="marketbar-list" title={!toolkit ? 'Connect wallet to list' : 'List this token for sale'}>
        LIST
      </PixelButton>

      <PixelButton $noActiveFx $size="sm" onClick={() => setDlg('offer')} data-testid="marketbar-offer" title={toolkit ? 'Make an offer on this token' : 'Connect your wallet inside the dialog to submit your offer'}>
        OFFER
      </PixelButton>

      {isSeller && hasListing && (
        <PixelButton $noActiveFx $size="sm" disabled={!toolkit} aria-disabled={!toolkit} onClick={() => setDlg('cancel')} data-testid="marketbar-cancel" title="Cancel your active listing">
          CANCEL
        </PixelButton>
      )}

      {ENABLE_ONCHAIN_VIEWS && isSeller && hasListing && hasOffers && (
        <PixelButton $noActiveFx $size="sm" disabled={!toolkit} aria-disabled={!toolkit} onClick={() => setDlg('accept')} data-testid="marketbar-accept" title="Accept an offer for this token">
          ACCEPT
        </PixelButton>
      )}

      {dlg === 'buy' && hasListing && priceMutez != null && (
        <BuyDialog
          open
          contract={contractAddress}
          tokenId={tokenId}
          priceMutez={priceMutez}
          seller={lowest?.seller}
          nonce={lowest?.nonce}
          available={toNumberOrNull(lowest?.amount) ?? undefined}
          onClose={() => setDlg(null)}
        />
      )}

      {dlg === 'list' && (
        <ListTokenDialog open contract={contractAddress} tokenId={tokenId} onClose={() => setDlg(null)} />
      )}

      {dlg === 'offer' && (
        <MakeOfferDialog open contract={contractAddress} tokenId={tokenId} marketContract={marketplace} onClose={() => setDlg(null)} />
      )}

      {dlg === 'cancel' && isSeller && hasListing && (
        <CancelListing open contract={contractAddress} tokenId={tokenId} onClose={() => setDlg(null)} />
      )}

      {ENABLE_ONCHAIN_VIEWS && dlg === 'accept' && isSeller && hasListing && hasOffers && (
        <AcceptOffer open contract={contractAddress} tokenId={tokenId} onClose={() => setDlg(null)} />
      )}
    </>
  );
}

MarketplaceBar.propTypes = {
  contractAddress: PropTypes.string.isRequired,
  tokenId        : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  marketplace    : PropTypes.any,
};

/* What changed & why (r932):
   - TzKT-first listing flow remains; RPC-backed offers are gated by
     NEXT_PUBLIC_ENABLE_ONCHAIN_VIEWS (default OFF) to avoid RPC noise.
   - BUY is enabled while freshness is CHECKING, blocked only when proven
     STALE; BuyDialog preflight still guards against stale listings. */
// EOF
