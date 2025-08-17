/*Developed by @jams2blues
  File: src/ui/MarketplaceBar.jsx
  Rev:  r926   2025‑08‑17
  Summary:
    - Guard against STALE listings (seller must still own >= amount).
    - Hide price & disable BUY when stale or unverifiable (safe default).
    - Preserve previous UX:
        • OFFER always clickable (even when wallet disconnected).
        • BUY disabled if no listing or when user is the seller.
        • CANCEL only for the seller of the active listing.
        • ACCEPT only for the seller when offers exist.
    - Keep legacy layout and $noActiveFx jiggle fix intact. */

import React, { useEffect, useMemo, useState } from 'react';
import PropTypes                                from 'prop-types';

import PixelButton       from './PixelButton.jsx';
import BuyDialog         from './BuyDialog.jsx';
import ListTokenDialog   from './ListTokenDialog.jsx';
import MakeOfferDialog   from './MakeOfferDialog.jsx';
import CancelListing     from './Entrypoints/CancelListing.jsx';
import AcceptOffer       from './Entrypoints/AcceptOffer.jsx';

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

/** Stale check status enum (string union for easy debugging). */
const STALE = {
  IDLE: 'idle',
  CHECKING: 'checking',
  FRESH: 'fresh',
  STALE: 'stale',
};

export default function MarketplaceBar({
  contractAddress,
  tokenId,
  marketplace, // reserved for parity with legacy call-sites
}) {
  const { toolkit, address: walletAddr } = useWalletContext() || {};

  const [lowest, setLowest]       = useState(null);
  const [hasOffers, setHasOffers] = useState(false);
  const [dlg, setDlg]             = useState(null);

  // Stale-listing detection state
  const [staleStatus, setStaleStatus] = useState(STALE.IDLE);

  // Load the cheapest listing and whether any offers exist (best effort)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!toolkit) return; // preserve legacy behavior when disconnected

      try {
        const l = await fetchLowestListing({
          toolkit,
          nftContract: contractAddress,
          tokenId,
          // core guard already enabled by default; UI guard below double-checks
          staleCheck: true,
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

  // UI‑level stale check (defense in depth): seller must still hold >= amount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!lowest || !lowest.seller || !Number.isFinite(Number(lowest.amount))) {
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
          // Safe default: if we couldn’t verify, core helper returns 0 (UI-safe)
          setStaleStatus(bal >= Number(lowest.amount) ? STALE.FRESH : STALE.STALE);
        }
      } catch {
        if (!cancelled) {
          // Network failure → treat as stale at UI layer (safe, prevents accidental buys)
          setStaleStatus(STALE.STALE);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [lowest, contractAddress, tokenId]);

  // Derived state
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

    // Final "active" flag considers stale guard
    const uiActive = _hasListingRaw && staleStatus !== STALE.STALE;

    return {
      hasListing : uiActive,
      priceMutez : _priceMutez,
      priceXTZ   : _priceXTZ,
      isSeller   : _isSeller,
    };
    // include staleStatus so we recompute hasListing when check completes
  }, [lowest, walletAddr, staleStatus]);

  const disableBuy = !toolkit || !hasListing || isSeller;

  return (
    <>
      {/* Price indicator — only when listing is verified fresh */}
      {hasListing && priceXTZ && staleStatus === STALE.FRESH && (
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

      {/* BUY — disabled when not purchasable or you are seller */}
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
                ? 'Listing unavailable (seller no longer holds the token)'
                : !hasListing
                  ? 'No active listing to buy'
                  : isSeller
                    ? 'You are the seller of this listing'
                    : 'Buy this token'
        }
      >
        BUY
      </PixelButton>

      {/* LIST — unchanged (requires wallet for the eventual tx, but UI can open dialog) */}
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

      {/* OFFER — always clickable; dialog will guide connection/validation */}
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

      {/* CANCEL — only when *you* are the seller of the active (fresh) listing */}
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
      {dlg === 'buy' && hasListing && priceMutez != null && staleStatus === STALE.FRESH && (
        <BuyDialog
          open
          contract={contractAddress}
          tokenId={tokenId}
          priceMutez={priceMutez}
          seller={lowest.seller}
          nonce={lowest.nonce}
          available={toNumberOrNull(lowest.amount) ?? undefined}
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

/* What changed & why (r926):
   • UI stale‑listing check using live FA2 balances via TzKT to ensure the
     seller still holds >= amount: hides price & disables Buy when stale.
   • Safe default: if TzKT is unreachable, treat as stale in UI (prevents
     accidental attempts). Core logic remains authoritative for tx building.
   • All other button rules remain exactly as in r924 (OFFER always enabled,
     BUY disabled without an active listing or when you are the seller, and
     CANCEL/ACCEPT only for the seller of an active listing). */
