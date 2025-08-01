/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBuyBar.jsx
  Rev :    r2    2025‑08‑01 UTC
  Summary: Simplified marketplace action bar exposing only the
           Buy button.  Displays the lowest active listing price
           and opens a BuyDialog when clicked.  Designed for
           explore/listings pages to keep the focus on art and
           purchasing, hiding the listing and offer actions.
           Added a configurable `showPrice` prop to optionally
           omit the price from the button label and updated
           price formatting to display full precision (6
           decimals) when needed.  This enables callers such
           as TokenListingCard to control how the price is
           presented while keeping other consumers unchanged.
────────────────────────────────────────────────────────────*/

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
 * remain hidden.  The optional `showPrice` prop controls whether
 * the price appears in the button label (defaults to true).
 *
 * @param {object} props component props
 * @param {string} props.contractAddress KT1 address of the NFT contract
 * @param {string|number} props.tokenId token id within the contract
 * @param {boolean} [props.showPrice=true] display price in button label
 */
export default function MarketplaceBuyBar({ contractAddress, tokenId, showPrice = true }) {
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

  // Format price: use full precision (6 decimals) and thousands separators
  const priceXTZ = lowest && lowest.priceMutez != null
    ? (lowest.priceMutez / 1_000_000).toLocaleString(undefined, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      })
    : null;
  const isSeller = lowest && walletAddr && lowest.seller && walletAddr.toLowerCase() === lowest.seller.toLowerCase();

  return (
    <>
      <PixelButton
        size="sm"
        disabled={!toolkit || !lowest || !priceXTZ || isSeller}
        onClick={() => setOpen(true)}
      >
        {showPrice && priceXTZ ? `BUY (${priceXTZ} ꜩ)` : 'BUY'}
      </PixelButton>
      {open && lowest && (
        <BuyDialog
          isOpen={open}
          onClose={() => setOpen(false)}
          contractAddress={contractAddress}
          tokenId={tokenId}
          priceMutez={lowest.priceMutez}
          seller={lowest.seller}
        />
      )}
    </>
  );
}

MarketplaceBuyBar.propTypes = {
  contractAddress: PropTypes.string.isRequired,
  tokenId        : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  showPrice      : PropTypes.bool,
};

/* What changed & why: r2 – Added a `showPrice` prop (default true) to
   allow callers to hide the price in the buy button label when the
   price is displayed elsewhere.  Updated price formatting to show
   six decimal places with thousands separators to avoid rounding and
   preserve full Tezos precision.  Included full props support and
   documentation. */