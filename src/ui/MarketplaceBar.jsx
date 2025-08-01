/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBar.jsx
  Rev :    r915    2025‑08‑01 UTC
  Summary: Marketplace action bar.  Displays the lowest active
           listing price for a given token and exposes Buy,
           List, Offer, Cancel and Accept buttons.  Each button
           opens a centrally aligned overlay form rather than
           relying on a scrolling drawer.  Uses off‑chain views
           to determine the cheapest listing and offer presence.
           This revision improves price visibility by showing
           the price as a separate accent‑coloured label with
           full six‑decimal precision before the buy button and
           simplifies the buy button label to just “BUY”.
────────────────────────────────────────────────────────────*/

import React, { useEffect, useState } from 'react';
import PropTypes                      from 'prop-types';

import PixelButton                    from './PixelButton.jsx';
import BuyDialog                      from './BuyDialog.jsx';
import ListTokenDialog                from './ListTokenDialog.jsx';
import MakeOfferDialog                from './MakeOfferDialog.jsx';
import CancelListing                  from './Entrypoints/CancelListing.jsx';
import AcceptOffer                    from './Entrypoints/AcceptOffer.jsx';

import { useWalletContext }           from '../contexts/WalletContext.js';
import { fetchLowestListing, fetchOffers } from '../core/marketplace.js';

/**
 * A responsive action bar for the ZeroSum marketplace.  Shows
 * dynamic actions based on the lowest listing and wallet
 * ownership.  Buttons open overlay dialogs rather than drawers.
 * This revision moves the price out of the Buy button and
 * displays it as an accent‑coloured label with full precision
 * prior to the button.  See invariants I123 and I130 for
 * marketplace integration rules.
 */
export default function MarketplaceBar({
  contractAddress,
  tokenId,
  marketplace, // unused placeholder for future props
}) {
  const { toolkit, address: walletAddr } = useWalletContext() || {};
  const [lowest, setLowest]   = useState(null);
  const [hasOffers, setHasOffers] = useState(false);
  const [dlg, setDlg]         = useState(null);   // 'buy' | 'list' | 'offer' | 'cancel' | 'accept'

  /* Load the cheapest listing and offer presence on mount */
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!toolkit) return;
      try {
        const l = await fetchLowestListing({
          toolkit,
          nftContract: contractAddress,
          tokenId,
        });
        if (!cancel) setLowest(l);
      } catch {/* ignore network errors */}
      try {
        const offers = await fetchOffers({
          toolkit,
          nftContract: contractAddress,
          tokenId,
        });
        if (!cancel) setHasOffers(offers && offers.length > 0);
      } catch {/* ignore network errors */}
    })();
    return () => { cancel = true; };
  }, [toolkit, contractAddress, tokenId]);

  // Format price in ꜩ when available: show six decimal places and
  // thousands separators to avoid rounding and truncation.
  const priceXTZ = lowest && lowest.priceMutez != null
    ? (lowest.priceMutez / 1_000_000).toLocaleString(undefined, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      })
    : null;

  // Determine if the connected wallet is the seller of the lowest listing
  const isSeller = lowest && walletAddr && lowest.seller && walletAddr.toLowerCase() === lowest.seller.toLowerCase();

  return (
    <>
      {/* Price indicator – shown before buttons when a listing exists */}
      {priceXTZ && (
        <span
          style={{
            marginRight: '4px',
            color: 'var(--zu-accent-sec,#6ff)',
            fontSize: '.75rem',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {priceXTZ} ꜩ
        </span>
      )}
      {/* Buy button – disabled when no active listing or toolkit not ready */}
      <PixelButton
        disabled={!toolkit || !lowest || lowest.priceMutez == null || isSeller}
        warning={!lowest || lowest.priceMutez == null}
        onClick={() => setDlg('buy')}
      >
        BUY
      </PixelButton>

      {/* List button – always available if wallet connected */}
      <PixelButton
        disabled={!toolkit}
        onClick={() => setDlg('list')}
      >
        LIST
      </PixelButton>

      {/* Offer button – always available if wallet connected */}
      <PixelButton
        disabled={!toolkit}
        onClick={() => setDlg('offer')}
      >
        OFFER
      </PixelButton>

      {/* Cancel button – only show when the wallet is the seller */}
      {isSeller && lowest && (
        <PixelButton
          disabled={!toolkit}
          onClick={() => setDlg('cancel')}
        >
          CANCEL
        </PixelButton>
      )}

      {/* Accept button – only show when the wallet is the seller and there are offers */}
      {isSeller && hasOffers && (
        <PixelButton
          disabled={!toolkit}
          onClick={() => setDlg('accept')}
        >
          ACCEPT
        </PixelButton>
      )}

      {/* dialogs */}
      {dlg === 'buy' && lowest && (
        <BuyDialog
          open
          contract={contractAddress}
          tokenId={tokenId}
          priceMutez={lowest.priceMutez}
          seller={lowest.seller}
          nonce={lowest.nonce}
          onClose={() => setDlg(null)}
        />
      )}
      {dlg === 'list' && (
        <ListTokenDialog
          open
          contract={contractAddress}
          tokenId={tokenId}
          onClose={() => setDlg(null)}
        />
      )}
      {dlg === 'offer' && (
        <MakeOfferDialog
          open
          contract={contractAddress}
          tokenId={tokenId}
          marketContract={marketplace}
          onClose={() => setDlg(null)}
        />
      )}
      {dlg === 'cancel' && lowest && (
        <CancelListing
          open
          contract={contractAddress}
          tokenId={tokenId}
          listingNonce={lowest.nonce}
          onClose={() => setDlg(null)}
        />
      )}
      {dlg === 'accept' && (
        <AcceptOffer
          open
          contract={contractAddress}
          tokenId={tokenId}
          onClose={() => setDlg(null)}
        />
      )}
    </>
  );
}

MarketplaceBar.propTypes = {
  contractAddress: PropTypes.string.isRequired,
  tokenId        : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  marketplace    : PropTypes.any,
};

/* What changed & why: r915 – Enhanced price visibility by moving the
   listing price out of the BUY button into a separate accent‑coloured
   label shown before the action buttons.  Updated price formatting
   to use six decimal places to avoid rounding.  Simplified the
   BUY button label accordingly.  All other marketplace actions
   remain unchanged. */