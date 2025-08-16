/* Developed by @jams2blues
   File: src/ui/MarketplaceBar.jsx
   Rev:  r922   2025‑09‑21
   Summary: Disable press jiggle on BUY/OFFER/ACCEPT/LIST/CANCEL CTAs. */

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

export default function MarketplaceBar({
  contractAddress,
  tokenId,
  marketplace, // unused placeholder for future props
}) {
  const { toolkit, address: walletAddr } = useWalletContext() || {};
  const [lowest, setLowest]   = useState(null);
  const [hasOffers, setHasOffers] = useState(false);
  const [dlg, setDlg]         = useState(null);

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
      } catch { /* ignore network errors */ }
      try {
        const offers = await fetchOffers({
          toolkit,
          nftContract: contractAddress,
          tokenId,
        });
        if (!cancel) setHasOffers(offers && offers.length > 0);
      } catch { /* ignore network errors */ }
    })();
    return () => { cancel = true; };
  }, [toolkit, contractAddress, tokenId]);

  const priceXTZ = lowest && lowest.priceMutez != null
    ? (lowest.priceMutez / 1_000_000).toLocaleString(undefined, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      })
    : null;

  const isSeller = lowest && walletAddr && lowest.seller
    && walletAddr.toLowerCase() === lowest.seller.toLowerCase();

  return (
    <>
      {/* Price indicator */}
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

      {/* Buy */}
      <PixelButton
        noActiveFx
        disabled={!toolkit || !lowest || lowest.priceMutez == null || isSeller}
        warning={!lowest || lowest.priceMutez == null}
        onClick={() => setDlg('buy')}
      >
        BUY
      </PixelButton>

      {/* List */}
      <PixelButton noActiveFx disabled={!toolkit} onClick={() => setDlg('list')}>
        LIST
      </PixelButton>

      {/* Offer */}
      <PixelButton noActiveFx disabled={!toolkit} onClick={() => setDlg('offer')}>
        OFFER
      </PixelButton>

      {/* Cancel */}
      {walletAddr && (
        <PixelButton noActiveFx disabled={!toolkit} onClick={() => setDlg('cancel')}>
          CANCEL
        </PixelButton>
      )}

      {/* Accept */}
      {isSeller && hasOffers && (
        <PixelButton noActiveFx disabled={!toolkit} onClick={() => setDlg('accept')}>
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
          available={lowest.amount}
          onClose={() => setDlg(null)}
        />
      )}
      {dlg === 'list' && (
        <ListTokenDialog open contract={contractAddress} tokenId={tokenId} onClose={() => setDlg(null)} />
      )}
      {dlg === 'offer' && (
        <MakeOfferDialog open contract={contractAddress} tokenId={tokenId} marketContract={marketplace} onClose={() => setDlg(null)} />
      )}
      {dlg === 'cancel' && (
        <CancelListing open contract={contractAddress} tokenId={tokenId} onClose={() => setDlg(null)} />
      )}
      {dlg === 'accept' && (
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
/* What changed & why: apply `noActiveFx` to CTAs to eliminate jiggle. */
