/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBar.jsx
  Rev :    r914    2025‑07‑24 UTC
  Summary: Marketplace action bar.  Displays the lowest active
           listing price for a given token and exposes Buy,
           List, Offer, Cancel and Accept buttons.  Each button
           opens a centrally aligned overlay form rather than
           relying on a scrolling drawer.  Uses off‑chain views
           to determine the cheapest listing and offer presence.
─────────────────────────────────────────────────────────────*/

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

  // Format price in ꜩ when available
  const priceXTZ = lowest && lowest.priceMutez != null
    ? (lowest.priceMutez / 1_000_000).toLocaleString()
    : null;

  // Determine if the connected wallet is the seller of the lowest listing
  const isSeller = lowest && walletAddr && lowest.seller && walletAddr.toLowerCase() === lowest.seller.toLowerCase();

  return (
    <>
      {/* Buy button – disabled when no active listing or toolkit not ready */}
      <PixelButton
        disabled={!toolkit || !lowest || lowest.priceMutez == null || isSeller}
        warning={!lowest || lowest.priceMutez == null}
        onClick={() => setDlg('buy')}
      >
        {priceXTZ ? `BUY (${priceXTZ} ꜩ)` : 'BUY'}
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

/* What changed & why: new MarketplaceBar implementation that
   integrates all ZeroSum operations (buy, list, offer, cancel,
   accept) into a centralised overlay-driven UI.  Uses off‑chain
   views to determine the lowest active listing and whether any
   offers exist, computes seller ownership to conditionally
   expose cancel/accept buttons, and opens corresponding dialogs
   when clicked.  This implementation avoids scrollable drawers,
   aligning with the 8‑bit overlay aesthetic mandated by the
   project invariants. */
/* EOF */