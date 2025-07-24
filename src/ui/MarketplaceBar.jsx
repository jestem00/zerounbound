/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBar.jsx
  Rev :    r4     2025‑07‑24 UTC
  Summary: swap stub for live ZeroSum UI – shows lowest price &
           opens BUY/LIST/OFFER dialogs; falls back gracefully.
─────────────────────────────────────────────────────────────*/
import React, { useEffect, useState } from 'react';
import PropTypes                      from 'prop-types';

import PixelButton                    from './PixelButton.jsx';
import BuyDialog                      from './BuyDialog.jsx';
import ListTokenDialog                from './ListTokenDialog.jsx';
import MakeOfferDialog                from './MakeOfferDialog.jsx';

import { useWalletContext }           from '../contexts/WalletContext.js';
import { fetchLowestListing }         from '../core/marketplace.js';

export default function MarketplaceBar({
  contractAddress,
  tokenId,
}) {
  const { toolkit }        = useWalletContext() || {};
  const [priceMutez, setPrice] = useState(null);
  const [dlg, setDlg]      = useState(null);   // 'buy' | 'list' | 'offer'

  /*── load cheapest listing on mount ───────────────────────*/
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
        if (!cancel && l) setPrice(l.priceMutez);
      } catch (e) { /* silent – network OK */ }
    })();
    return () => { cancel = true; };
  }, [toolkit, contractAddress, tokenId]);

  const priceXTZ = priceMutez != null ? (priceMutez / 1_000_000).toLocaleString() : null;

  const disabledBuy = priceMutez == null || !toolkit;
  const disabledList = !toolkit;
  const disabledOffer = !toolkit;

  return (
    <>
      <PixelButton
        disabled={disabledBuy}
        warning={disabledBuy}
        onClick={() => setDlg('buy')}
      >
        {priceXTZ ? `BUY (${priceXTZ} ꜩ)` : 'BUY'}
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
      {dlg === 'buy' && (
        <BuyDialog
          open
          contract={contractAddress}
          tokenId={tokenId}
          priceMutez={priceMutez}
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
/* What changed & why: replaced objkt stub with live integration – queries
   cheapest listing via off‑chain view, shows dynamic price; opens existing
   Buy/List/Offer dialogs wired to new core helpers. */
/* EOF */
