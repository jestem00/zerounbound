/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBuyBar.jsx
  Rev :    r1    2025‑07‑30 UTC
  Summary: Simplified marketplace action bar exposing only the
           Buy button.  Displays the lowest active listing price
           and opens a BuyDialog when clicked.  Designed for
           explore/listings pages to keep the focus on art and
           purchasing, hiding the listing and offer actions.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState } from 'react';
import PropTypes                      from 'prop-types';

import PixelButton                    from './PixelButton.jsx';
import BuyDialog                      from './BuyDialog.jsx';

import { useWalletContext }           from '../contexts/WalletContext.js';
import { fetchLowestListing }         from '../core/marketplace.js';

/**
 * A slimmed‑down marketplace bar that only displays the Buy action.
 * It fetches the lowest active listing via off/on‑chain views and
 * renders a PixelButton labelled with the price in ꜩ.  When
 * clicked, it opens the BuyDialog for the token.  The button is
 * disabled when no wallet is connected, when the caller is the
 * seller or when no active listing exists.  Intended for pages
 * showing many listings where offer and listing actions should
 * remain hidden.
 *
 * @param {object} props component props
 * @param {string} props.contractAddress KT1 address of the NFT contract
 * @param {string|number} props.tokenId token id within the contract
 */
export default function MarketplaceBuyBar({ contractAddress, tokenId }) {
  const { toolkit, address: walletAddr } = useWalletContext() || {};
  const [lowest, setLowest] = useState(null);
  const [open, setOpen]     = useState(false);

  // Fetch the lowest listing on mount and whenever dependencies change
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
      } catch {
        /* ignore errors */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [toolkit, contractAddress, tokenId]);

  const priceXTZ = lowest && lowest.priceMutez != null
    ? (lowest.priceMutez / 1_000_000).toLocaleString()
    : null;
  const isSeller = lowest && walletAddr && lowest.seller && walletAddr.toLowerCase() === lowest.seller.toLowerCase();

  return (
    <>
      <PixelButton
        disabled={!toolkit || !lowest || lowest.priceMutez == null || isSeller}
        warning={!lowest || lowest.priceMutez == null}
        onClick={() => setOpen(true)}
      >
        {priceXTZ ? `BUY (${priceXTZ} ꜩ)` : 'BUY'}
      </PixelButton>
      {open && lowest && (
        <BuyDialog
          open
          contract={contractAddress}
          tokenId={tokenId}
          priceMutez={lowest.priceMutez}
          seller={lowest.seller}
          nonce={lowest.nonce}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

MarketplaceBuyBar.propTypes = {
  contractAddress: PropTypes.string.isRequired,
  tokenId        : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

/* What changed & why: Added MarketplaceBuyBar as a lightweight
   alternative to MarketplaceBar.  It hides listing and offer
   actions, exposing only the Buy button with price and dialog
   integration.  This promotes a streamlined shopping experience
   on the explore/listings pages. */