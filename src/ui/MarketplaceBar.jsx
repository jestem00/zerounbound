/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBar.jsx
  Rev:     r929  2025‑08‑19
  Summary(of what this file does): Marketplace action bar shown on
           token detail pages. Shows current listing price and
           exposes BUY/LIST/OFFER/CANCEL/ACCEPT actions.
           This revision enables BUY when the seller’s **live**
           FA2 balance is ≥ 1 (partial‑stock friendly). The Buy
           dialog still runs a strict preflight for the actual
           requested quantity. */

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
      } catch { /* non‑fatal */ }
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
          minimumFractionDigits: 6,
          maximumFractionDigits: 6,
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
   • BUY is now enabled when the seller’s live FA2 balance (via TzKT
     tokens/balances) is ≥ 1 for the token. This handles “partial stock”
     scenarios caused by cross‑market sales (e.g., on Objkt) while still
     blocking truly stale listings (balance 0). TzKT is the recommended
     indexer API for live token balances on Tezos. 
   • The Buy dialog’s preflight remains strict for the requested quantity,
     preventing over‑purchases when inventory runs low. */
//EOF
