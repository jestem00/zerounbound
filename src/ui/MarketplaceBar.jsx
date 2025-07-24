/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBar.jsx
  Rev :    r5     2025‑07‑24 UTC
  Summary: live ZeroSum integration – displays the lowest
           listing price for a token and opens BUY, LIST
           and OFFER dialogs wired to marketplace helpers.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState } from 'react';
import PropTypes                      from 'prop-types';

import PixelButton                    from './PixelButton.jsx';
import BuyDialog                      from './BuyDialog.jsx';
import ListTokenDialog                from './ListTokenDialog.jsx';
import MakeOfferDialog                from './MakeOfferDialog.jsx';

import { useWalletContext }           from '../contexts/WalletContext.js';
import { fetchLowestListing }         from '../core/marketplace.js';

/**
 * MarketplaceBar
 *
 * Renders BUY, LIST and OFFER buttons for a token.  On mount it
 * queries the marketplace off‑chain view for the cheapest active
 * listing and displays the price in XTZ.  Clicking BUY opens
 * BuyDialog with the resolved listing details; LIST opens
 * ListTokenDialog; and OFFER opens MakeOfferDialog.  Buttons
 * disable gracefully when the wallet is disconnected or no
 * listing exists.
 */
export default function MarketplaceBar({ contractAddress, tokenId }) {
  const { toolkit }          = useWalletContext() || {};
  const [priceMutez, setPrice] = useState(null);
  const [listing,    setListing] = useState(null);
  const [dlg,        setDlg]     = useState(null);  // 'buy' | 'list' | 'offer'

  // Fetch the lowest active listing whenever toolkit, contract or
  // tokenId changes.  The listing is cached locally until any
  // dependency changes.
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
        if (!cancel) {
          if (l) {
            setPrice(l.priceMutez);
            setListing(l);
          } else {
            setPrice(null);
            setListing(null);
          }
        }
      } catch (e) {
        // ignore network or view errors – UI shows disabled state
        if (!cancel) { setPrice(null); setListing(null); }
      }
    })();
    return () => { cancel = true; };
  }, [toolkit, contractAddress, tokenId]);

  const priceXTZ = priceMutez != null ? (priceMutez / 1_000_000).toLocaleString() : null;

  const disabledBuy   = priceMutez == null || !toolkit;
  const disabledList  = !toolkit;
  const disabledOffer = !toolkit;

  return (
    <>
      <PixelButton
        disabled={disabledBuy}
        warning={disabledBuy}
        onClick={() => setDlg('buy')}
      >
        {priceXTZ ? `BUY (${priceXTZ} ꜩ)` : 'BUY'}
      </PixelButton>

      <PixelButton
        disabled={disabledList}
        onClick={() => setDlg('list')}
      >
        LIST
      </PixelButton>

      <PixelButton
        disabled={disabledOffer}
        onClick={() => setDlg('offer')}
      >
        OFFER
      </PixelButton>

      {/* dialogs */}
      {dlg === 'buy' && listing && (
        <BuyDialog
          open
          contract={contractAddress}
          tokenId={tokenId}
          listing={listing}
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
          onClose={() => setDlg(null)}
        />
      )}
    </>
  );
}

MarketplaceBar.propTypes = {
  contractAddress: PropTypes.string.isRequired,
  tokenId        : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

/* What changed & why: replaced objkt stub with a live integration.  It
   queries the off‑chain view for the cheapest listing, displays
   the price on the BUY button and opens Buy/List/Offer dialogs
   wired to new core marketplace helpers. */
/* EOF */