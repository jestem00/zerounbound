/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBar.jsx
  Rev :    r915    2025‑07‑26 UTC
  Summary: Temporarily disables ZeroSum actions.  All marketplace
           buttons now open a stub overlay that informs users the
           new on‑chain marketplace contract is under construction
           and directs them to list on OBJKT for the time being.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState } from 'react';
import PropTypes                      from 'prop-types';

import PixelButton        from './PixelButton.jsx';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';

import { useWalletContext } from '../contexts/WalletContext.js';
import {
  fetchLowestListing,
  fetchOffers,
} from '../core/marketplace.js';

/**
 * MarketplaceBar — temporarily in read‑only mode.
 * All action buttons are still rendered (so layout & styling
 * remain intact) but every click opens a single stub dialog
 * explaining that the upgraded marketplace contract is being
 * deployed.  No transactions are sent.
 */
export default function MarketplaceBar({
  contractAddress,
  tokenId,
}) {
  const { toolkit, address: walletAddr } = useWalletContext() || {};

  /* lowest listing price + seller detection (read‑only) */
  const [lowest,    setLowest]    = useState(null);
  const [hasOffers, setHasOffers] = useState(false);

  /* one stub dialog for every disabled action */
  const [stubOpen,  setStubOpen]  = useState(false);

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
      } catch { /* network errors ignored */ }

      try {
        const off = await fetchOffers({
          toolkit,
          nftContract: contractAddress,
          tokenId,
        });
        if (!cancel) setHasOffers(Array.isArray(off) && off.length > 0);
      } catch { /* ignore */ }
    })();
    return () => { cancel = true; };
  }, [toolkit, contractAddress, tokenId]);

  /* helpers ------------------------------------------------ */
  const priceXTZ = lowest && typeof lowest.priceMutez === 'number'
    ? (lowest.priceMutez / 1_000_000).toLocaleString()
    : null;

  const isSeller = lowest
    && walletAddr
    && lowest.seller
    && walletAddr.toLowerCase() === lowest.seller.toLowerCase();

  const openStub = () => setStubOpen(true);

  /* render ------------------------------------------------- */
  return (
    <>
      <PixelButton
        disabled={!toolkit || !lowest || priceXTZ == null || isSeller}
        warning={!lowest || priceXTZ == null}
        onClick={openStub}
      >
        {priceXTZ ? `BUY (${priceXTZ} ꜩ)` : 'BUY'}
      </PixelButton>

      <PixelButton
        disabled={!toolkit}
        onClick={openStub}
      >
        LIST
      </PixelButton>

      <PixelButton
        disabled={!toolkit}
        onClick={openStub}
      >
        OFFER
      </PixelButton>

      {isSeller && lowest && (
        <PixelButton
          disabled={!toolkit}
          onClick={openStub}
        >
          CANCEL
        </PixelButton>
      )}

      {isSeller && hasOffers && (
        <PixelButton
          disabled={!toolkit}
          onClick={openStub}
        >
          ACCEPT
        </PixelButton>
      )}

      {/* Stub overlay */}
      {stubOpen && (
        <PixelConfirmDialog
          open
          title="Marketplace Upgrade In Progress"
          confirmLabel="OK"
          cancelLabel=""
          onConfirm={() => setStubOpen(false)}
          onCancel={() => setStubOpen(false)}
          message={(
            <p style={{ maxWidth:'320px',lineHeight:'1.35',margin:'0 auto' }}>
              The new on‑chain ZeroSum marketplace contract with native Tezos
              views is under construction.<br /><br />
              🛠️ Please list and trade on&nbsp;
              <a href="https://objkt.com/" target="_blank" rel="noopener noreferrer">
                OBJKT
              </a>{' '}
              for now and check back soon for completion!
            </p>
          )}
        />
      )}
    </>
  );
}

MarketplaceBar.propTypes = {
  contractAddress: PropTypes.string.isRequired,
  tokenId        : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

/* What changed & why:
   • Removed dialog/entrypoint imports to prevent unused‑import lint.
   • All action handlers now route to a single PixelConfirmDialog stub
     instead of dispatching marketplace transactions.
   • Left price/offer lookups intact for contextual display while the
     upgrade is underway, preserving existing UX layout. */
/* EOF */
