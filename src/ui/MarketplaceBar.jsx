/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBar.jsx
  Rev:     r930  2025‑10‑26
  Summary: Marketplace action bar shown on token detail pages.
           Shows current listing price and exposes BUY/LIST/
           OFFER/CANCEL/ACCEPT actions.  This revision reduces
           button sizes by passing the `sm` variant to PixelButton
           calls, ensuring the bar fits comfortably on smaller
           displays (e.g., 1080p) without truncating adjacent
           content.  Functional behaviour is unchanged from r929.
─────────────────────────────────────────────────────────────*/

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

/** Coerce various numeric representations to a number or null. */
function toNumberOrNull(v) {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Stale check status enum. */
const STALE = {
  IDLE     : 'idle',
  CHECKING : 'checking',
  FRESH    : 'fresh',
  STALE    : 'stale',
};

export default function MarketplaceBar({
  contractAddress,
  tokenId,
  marketplace, // reserved parity with legacy callers
}) {
  const { toolkit, address: walletAddr } = useWalletContext() || {};

  const [lowest, setLowest]       = useState(null);
  const [hasOffers, setHasOffers] = useState(false);
  const [dlg, setDlg]             = useState(null);

  // We verify freshness independently (async) so the bar can show price first.
  const [staleStatus, setStaleStatus] = useState(STALE.IDLE);

  // Load the cheapest listing and whether any offers exist (best effort).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const l = await fetchLowestListing({
          toolkit,
          nftContract: contractAddress,
          tokenId,
          staleCheck: false, // we run our own live‑balance probe below
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

      try {
        const offers = await fetchOffers({
          toolkit,
          nftContract: contractAddress,
          tokenId,
        });
        if (!cancelled) setHasOffers(Boolean(offers && offers.length > 0));
      } catch {
        /* non‑fatal */
      }
    })();

    return () => { cancelled = true; };
  }, [toolkit, contractAddress, tokenId]);

  // Partial‑stock‑safe freshness probe — treat listing as fresh if seller balance ≥ 1.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!lowest || !lowest.seller) {
        if (!cancelled) setStaleStatus(lowest ? STALE.CHECKING : STALE.IDLE);
        return;
      }
      setStaleStatus(STALE.CHECKING);

      try {
        const bal = await getFa2BalanceViaTzkt(
          lowest.seller,
          contractAddress,
          Number(tokenId),
        );
        if (!cancelled) {
          setStaleStatus(bal >= 1 ? STALE.FRESH : STALE.STALE);
        }
      } catch {
        if (!cancelled) setStaleStatus(STALE.STALE);
      }
    })();

    return () => { cancelled = true; };
  }, [lowest, contractAddress, tokenId]);

  // Derived state for rendering.
  const {
    hasListing,
    priceMutez,
    priceXTZ,
    isSeller,
  } = useMemo(() => {
    const _priceMutez = toNumberOrNull(lowest?.priceMutez);
    const _amount     = toNumberOrNull(lowest?.amount) ?? 0;
    const _seller     = typeof lowest?.seller === 'string' ? lowest.seller : null;

    const _hasListingRaw = _priceMutez != null && _amount > 0 && !!_seller;

    const _priceXTZ = _hasListingRaw
      ? (_priceMutez / 1_000_000).toLocaleString(undefined, {
          // Display the full decimal precision of the price (up to 8 places)
          minimumFractionDigits: 6,
          maximumFractionDigits: 8,
        })
      : null;

    const _isSeller = _hasListingRaw
      && !!walletAddr
      && !!_seller
      && walletAddr.toLowerCase() === _seller.toLowerCase();

    // Final active flag reflects live‑balance probe (≥1).
    const uiActive = _hasListingRaw && staleStatus === STALE.FRESH;

    return {
      hasListing : uiActive,
      priceMutez : _priceMutez,
      priceXTZ   : _priceXTZ,
      isSeller   : _isSeller,
    };
  }, [lowest, walletAddr, staleStatus]);

  const disableBuy = !toolkit || !hasListing || isSeller;

  return (
    <>
      {/* Show the price only when confirmed fresh */}
      {hasListing && priceXTZ && (
        <span
          aria-label={`Listing price ${priceXTZ} tez`}
          style={{
            marginRight: '4px',
            color: 'var(--zu-accent-sec,#6ff)',
            fontSize: '.75rem',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
          }}
          data-testid="marketbar-price"
        >
          {priceXTZ}&nbsp;ꜩ
        </span>
      )}

      {/* BUY — enabled when live FA2 balance ≥ 1 and user isn’t the seller */}
      <PixelButton
        $noActiveFx
        $size="sm"
        disabled={disableBuy}
        warning={!hasListing}
        aria-disabled={disableBuy}
        aria-label={disableBuy ? 'Buy disabled' : 'Buy now'}
        onClick={() => setDlg('buy')}
        data-testid="marketbar-buy"
        title={
          !toolkit
            ? 'Connect wallet to buy'
            : staleStatus === STALE.CHECKING
              ? 'Verifying availability…'
              : staleStatus === STALE.STALE
                ? 'Listing unavailable (seller balance is 0)'
                : !hasListing
                  ? 'No active listing to buy'
                  : isSeller
                    ? 'You are the seller of this listing'
                    : 'Buy this token'
        }
      >
        BUY
      </PixelButton>

      {/* LIST — unchanged */}
      <PixelButton
        $noActiveFx
        $size="sm"
        disabled={!toolkit}
        aria-disabled={!toolkit}
        onClick={() => setDlg('list')}
        data-testid="marketbar-list"
        title={!toolkit ? 'Connect wallet to list' : 'List this token for sale'}
      >
        LIST
      </PixelButton>

      {/* OFFER — always clickable; dialog guides connection/validation */}
      <PixelButton
        $noActiveFx
        $size="sm"
        disabled={false}
        aria-disabled={false}
        onClick={() => setDlg('offer')}
        data-testid="marketbar-offer"
        title={toolkit ? 'Make an offer on this token' : 'Connect your wallet inside the dialog to submit your offer'}
      >
        OFFER
      </PixelButton>

      {/* CANCEL — only when *you* are the seller of the active listing */}
      {isSeller && hasListing && (
        <PixelButton
          $noActiveFx
          $size="sm"
          disabled={!toolkit}
          aria-disabled={!toolkit}
          onClick={() => setDlg('cancel')}
          data-testid="marketbar-cancel"
          title="Cancel your active listing"
        >
          CANCEL
        </PixelButton>
      )}

      {/* ACCEPT — only when you are the seller AND offers exist */}
      {isSeller && hasListing && hasOffers && (
        <PixelButton
          $noActiveFx
          $size="sm"
          disabled={!toolkit}
          aria-disabled={!toolkit}
          onClick={() => setDlg('accept')}
          data-testid="marketbar-accept"
          title="Accept an offer for this token"
        >
          ACCEPT
        </PixelButton>
      )}

      {/* dialogs */}
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

      {dlg === 'cancel' && isSeller && hasListing && (
        <CancelListing
          open
          contract={contractAddress}
          tokenId={tokenId}
          onClose={() => setDlg(null)}
        />
      )}

      {dlg === 'accept' && isSeller && hasListing && hasOffers && (
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

/* What changed & why:
   • r930 – Added `$size="sm"` prop to every PixelButton in the bar to
     reduce their footprint, ensuring the bar remains legible and
     functional on lower‑resolution displays (e.g., 1080p).  Also
     increased the price display precision to show up to eight
     fractional digits, ensuring prices like 1.23456789 ꜩ render
     without rounding.  This improves compliance with our I00
     styling invariant while preserving all marketplace functionality
     from r929. */
//EOF