/* Developed by @jams2blues
   File: zerounbound/src/ui/BuyDialog.jsx
   Rev:  r14  2025-08-31
   Summary: Buy dialog with strict preflight and consistent price formatting
            using formatMutez (no rounding, trims trailing zeros). */

import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';

import PixelHeading from './PixelHeading.jsx';
import PixelButton from './PixelButton.jsx';
import OperationOverlay from './OperationOverlay.jsx';
import { useWalletContext } from '../contexts/WalletContext.js';

import { buildBuyParams, preflightBuy, fetchListings } from '../core/marketplace.js';
import {
  fetchSellerListingsViaTzkt,
  resolveSellerListingForToken,
  resolveSellerListingForTokenRobust,
  fetchTokenListingsViaView,
  verifyListingPairViaTzkt,
} from '../core/marketplaceHelper.js';
import { listListingsForCollectionViaBigmap } from '../utils/marketplaceListings.js';
import { NETWORK_KEY } from '../config/deployTarget.js';
import { formatMutez } from '../utils/formatTez.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* Modal */
const ModalOverlay = styled.div`
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.65); z-index: 9999;
`;
const ModalBox = styled.section`
  background: var(--zu-bg, #0a001e);
  border: 2px solid var(--zu-accent, #8f3ce1);
  padding: 1rem; width: min(90%, 480px); max-width: 480px;
  box-shadow: 0 0 0 4px var(--zu-dark, #1b023a);
`;
const Wrap = styled.section` margin-top: 1.0rem; `;

export default function BuyDialog(props) {
  const {
    open,
    isOpen,                     // alias
    contract,
    contractAddress,            // alias
    tokenId,
    priceMutez,
    seller,
    nonce,
    listingNonce,               // alias
    amount = 1,
    onClose = () => {},
    expectedSeller,             // optional preferred seller (dashboard context)
  } = props;

  const OPEN     = (open ?? isOpen) === true;
  const CONTRACT = contract || contractAddress;
  const NONCE    = (nonce ?? listingNonce);

  const { toolkit } = useWalletContext() || {};
  const [ov, setOv] = useState({ open: false, label: '' });

  const closeBtnRef = useRef(null);
  useEffect(() => { if (OPEN) closeBtnRef.current?.focus?.(); }, [OPEN]);

  const snack = (msg, sev = 'info') => {
    window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }));
  };

  if (!OPEN || priceMutez == null || !seller || NONCE == null) return null;

  const priceXTZ = formatMutez(priceMutez);

  async function handleBuy() {
    if (!toolkit) { snack('Wallet unavailable', 'error'); return; }

    try {
      try {
        // eslint-disable-next-line no-console
        console.info('[ListingsDbg] buy begin', { contract: CONTRACT, tokenId, seller, expectedSeller, nonce: NONCE, priceMutez });
      } catch {}
      // Last line of defense: verify the seller/nonce/price against current big‑map
      // to avoid "Not listed" when a stale pair slipped through the page.
      const preferSeller = String(expectedSeller || seller || '').toLowerCase();
      let effSeller = seller;
      let effNonce  = Number(NONCE);
      let effPrice  = Number(priceMutez);
      try {
        const list = await fetchListings({ toolkit, nftContract: CONTRACT, tokenId: Number(tokenId) }).catch(() => []);
        // Try current seed seller first; if none, try preferred seller
        let mine = (list || []).filter((l) => String(l.seller || '').toLowerCase() === String(seller || '').toLowerCase());
        if (!mine.length && preferSeller && preferSeller !== String(seller || '').toLowerCase()) {
          mine = (list || []).filter((l) => String(l.seller || '').toLowerCase() === preferSeller);
        }

        // Strengthen with seller index (exact nonces)
        const netKey = (toolkit?._network?.type && /mainnet/i.test(toolkit._network.type)) ? 'mainnet' : (NETWORK_KEY || 'ghostnet');
        // Important: TzKT keys are case-sensitive (base58). Use the original-case seller for index lookups.
        // Prefer the canonical-case seller from current props; fallback to expectedSeller
        const sellerForIdx = (expectedSeller || seller || '').trim();
        let mineIdx = await fetchSellerListingsViaTzkt(sellerForIdx, netKey).catch(() => []);
        mineIdx = (mineIdx || []).filter((r) => String(r.contract) === String(CONTRACT) && Number(r.tokenId) === Number(tokenId));
        // If index is empty, try executing the on-chain view via TzKT for this token and filter by seller
        if (!mineIdx.length) {
          try {
            const viaView = await fetchTokenListingsViaView(CONTRACT, Number(tokenId), netKey).catch(() => []);
            const viewMine = (viaView || []).filter((r) => String(r.seller || '').toLowerCase() === sellerForIdx.toLowerCase());
            if (viewMine && viewMine.length) mineIdx = viewMine;
          } catch { /* keep mineIdx */ }
        }
        // If seller index is missing for this marketplace, fall back to scanning the listings holder directly.
        if (!mineIdx.length) {
          const resolved = await resolveSellerListingForToken(CONTRACT, Number(tokenId), sellerForIdx, netKey).catch(() => null);
          if (resolved) mineIdx = [resolved];
        }
        if (mineIdx && mineIdx.length) {
          // Prefer exact price match, else highest nonce (most recent)
          const pref = Number.isFinite(effPrice) ? mineIdx.find((r) => Number(r.priceMutez) === Number(effPrice)) : null;
          const bestIdx = pref || mineIdx.reduce((m, c) => (Number(c.nonce) > Number(m.nonce) ? c : m));
          // Overwrite with canonical seller-scoped pair immediately
          effSeller = String(bestIdx.seller);
          effNonce  = Number(bestIdx.nonce);
          effPrice  = Number(bestIdx.priceMutez);
          mine = [bestIdx];
        }

        if (mine && mine.length) {
          const pref = mine.find((l) => Number(l.priceMutez) === effPrice);
          const best = pref || mine.reduce((m, c) => (Number(c.nonce) > Number(m.nonce) ? c : m));
          if (!Number.isFinite(effNonce) || Number(best.nonce) !== effNonce || Number(best.priceMutez) !== effPrice) {
            effSeller = String(best.seller);
            effNonce  = Number(best.nonce);
            effPrice  = Number(best.priceMutez);
            if (typeof window !== 'undefined' && window.localStorage?.getItem('zu:debugListings') === '1') {
              // eslint-disable-next-line no-console
              console.info('[ListingsDbg] corrected pair', { contract: CONTRACT, tokenId: Number(tokenId), seller: effSeller, nonce: effNonce, price: effPrice });
            }
          }
        }
      } catch { /* best effort */ }

      // Ensure we have a valid nonce; derive via view or seller index when missing
      if (!Number.isFinite(effNonce) || effNonce <= 0) {
        try {
          const netKey = (toolkit?._network?.type && /mainnet/i.test(toolkit._network.type)) ? 'mainnet' : (NETWORK_KEY || 'ghostnet');
          // Try robust seller-scoped resolution that doesn't depend on address casing
          const candidateSellers = Array.from(new Set([
            String(expectedSeller || '').trim(),
            String(seller || '').trim(),
            String(effSeller || '').trim(),
          ].filter(Boolean)));

          let fixed = null;
          for (const cand of candidateSellers) {
            // 0) Robust resolver (collection_listings holder when present)
            fixed = await resolveSellerListingForTokenRobust(CONTRACT, Number(tokenId), cand, netKey).catch(() => null);
            if (fixed) break;
            // 1) Direct holder scan (fast and case-insensitive for filtering)
            fixed = await resolveSellerListingForToken(CONTRACT, Number(tokenId), cand, netKey).catch(() => null);
            if (fixed) break;
            // 2) On-chain view via TzKT (case-insensitive filtering)
            try {
              const viaView = await fetchTokenListingsViaView(CONTRACT, Number(tokenId), netKey).catch(() => []);
              const viewMine = (viaView || []).filter((r) => String(r.seller || '').toLowerCase() === cand.toLowerCase());
              if (viewMine && viewMine.length) {
                fixed = viewMine.reduce((m, c) => (Number(c.nonce) > Number(m.nonce) ? c : m));
                break;
              }
            } catch { /* ignore */ }
            // 3) Seller index (requires exact-case; last resort)
            try {
              let mineIdx = await fetchSellerListingsViaTzkt(cand, netKey).catch(() => []);
              mineIdx = (mineIdx || []).filter((r) => String(r.contract) === String(CONTRACT) && Number(r.tokenId) === Number(tokenId));
              if (mineIdx && mineIdx.length) {
                fixed = mineIdx.reduce((m, c) => (Number(c.nonce) > Number(m.nonce) ? c : m));
                break;
              }
            } catch { /* ignore */ }
          }
          if (fixed) {
            effSeller = String(fixed.seller);
            effNonce  = Number(fixed.nonce);
            effPrice  = Number(fixed.priceMutez);
            try {
              if (typeof window !== 'undefined' && window.localStorage?.getItem('zu:debugListings') === '1') {
                // eslint-disable-next-line no-console
                console.info('[ListingsDbg] nonce resolved via fallback', { contract: CONTRACT, tokenId: Number(tokenId), seller: effSeller, nonce: effNonce, price: effPrice });
              }
            } catch {}
          }
          // Parity fallback with Explore: collection_listings via utils helper
          if (!Number.isFinite(effNonce) || effNonce <= 0) {
            try {
              const list = await listListingsForCollectionViaBigmap(CONTRACT, netKey).catch(() => []);
              const row = (() => {
                const want = String(expectedSeller || '').toLowerCase();
                if (want) {
                  const m = (list || []).filter((r) => Number(r.tokenId) === Number(tokenId) && String(r.seller || '').toLowerCase() === want);
                  if (m && m.length) return m.reduce((a,b)=> (Number(b.nonce)>Number(a.nonce)?b:a));
                }
                return (list || []).find((r) => Number(r.tokenId) === Number(tokenId));
              })();
              if (row && Number(row.nonce) > 0) {
                effSeller = String(row.seller || effSeller || seller);
                effNonce  = Number(row.nonce);
                effPrice  = Number(row.priceMutez || effPrice);
              }
            } catch { /* ignore */ }
          }
          // 4) Last resort: take any active listing for this token (may be different seller)
          if (!Number.isFinite(effNonce) || effNonce <= 0) {
            try {
              const all = await fetchListings({ toolkit, nftContract: CONTRACT, tokenId: Number(tokenId) }).catch(() => []);
              const active = (all || []).filter((l) => Number(l.amount) > 0 && Number.isFinite(l.priceMutez));
              if (active && active.length) {
                const chosen = active.reduce((m, c) => (Number(c.priceMutez) < Number(m.priceMutez) ? c : m));
                if (chosen && Number(chosen.nonce) > 0) {
                  effSeller = String(chosen.seller || effSeller || seller);
                  effNonce  = Number(chosen.nonce);
                  effPrice  = Number(chosen.priceMutez || effPrice);
                }
              }
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
      if (!Number.isFinite(effNonce) || effNonce <= 0) {
        try {
          // eslint-disable-next-line no-console
          console.info('[ListingsDbg] nonce resolution failed', { contract: CONTRACT, tokenId, seller: effSeller, expectedSeller, nonce: NONCE, effNonce, priceMutez });
        } catch {}
        snack('Purchase failed: could not resolve a valid listing nonce. Please refresh.', 'error');
        return;
      }

      // Final verification against TzKT holder to avoid stale nonce
      try {
        const netKey = (toolkit?._network?.type && /mainnet/i.test(toolkit._network.type)) ? 'mainnet' : (NETWORK_KEY || 'ghostnet');
        const okRow = await verifyListingPairViaTzkt(CONTRACT, Number(tokenId), effSeller, effNonce, netKey);
        if (!okRow) {
          const resolved = await resolveSellerListingForToken(CONTRACT, Number(tokenId), effSeller, netKey).catch(() => null);
          if (resolved) {
            effSeller = resolved.seller;
            effNonce  = resolved.nonce;
            effPrice  = resolved.priceMutez;
          } else {
            const err = new Error('Listing not found for selected seller/nonce');
            err.code = 'NOT_LISTED_PAIR';
            throw err;
          }
        }
      } catch (e) {
        // Non-blocking: if holder verification fails, proceed with preflight and let
        // contract validation handle mismatches (preserves existing working flows).
        // eslint-disable-next-line no-console
        console.info('[ListingsDbg] verify holder', { ok: !(e instanceof Error), error: String(e?.message || e) });
      }
      try {
        // eslint-disable-next-line no-console
        console.info('[ListingsDbg] buy preflight', { contract: CONTRACT, tokenId, seller: effSeller, nonce: effNonce, amount, priceMutez: effPrice });
      } catch {}
      // Stale listing preflight (TzKT)
      await preflightBuy(toolkit, {
        nftContract: CONTRACT,
        tokenId    : Number(tokenId),
        seller     : effSeller,
        amount     : Number(amount) || 1,
      });

      setOv({ open: true, label: 'Waiting for confirmation…' });

      const params = await buildBuyParams(toolkit, {
        nftContract: CONTRACT,
        tokenId    : Number(tokenId),
        priceMutez : effPrice,
        seller     : effSeller,
        nonce      : effNonce,
        amount     : Number(amount) || 1,
      });
      try {
        // eslint-disable-next-line no-console
        console.info('[ListingsDbg] buy params', { params });
      } catch {}

      const op = await toolkit.wallet.batch(params).send();
      await op.confirmation();

      setOv({ open: false, label: '' });
      snack('Token purchased ✅');
      onClose();
      try {
        window.dispatchEvent(new CustomEvent('zu:openShare', { detail: { contract: CONTRACT, tokenId: Number(tokenId), variant: 'purchase' } }));
      } catch {}
    } catch (err) {
      // Always emit a detailed debug line for troubleshooting when enabled
      try {
        if (typeof window !== 'undefined' && window.localStorage?.getItem('zu:debugListings') === '1') {
          // eslint-disable-next-line no-console
          console.info('[ListingsDbg] buy failed', { contract: CONTRACT, tokenId, seller, nonce: NONCE, amount, priceMutez, error: String(err?.message || err) });
        }
      } catch {}
      console.error('Purchase failed:', err);
      setOv({ open: false, label: '' });
      if (err?.code === 'STALE_LISTING_NO_BALANCE') { snack('Purchase failed: listing appears stale (seller balance insufficient). Ask seller to re-list.', 'error'); return; }
      if (err?.code === 'UNSUPPORTED_MARKET_BUY')   { snack('Unsupported marketplace buy/collect entrypoint for this version.', 'error'); return; }
      const msg = String(err?.message || 'Transaction failed');
      if (/FA2_NOT_OPERATOR/i.test(msg) || /not the (Owner|owner)/i.test(msg)) { snack('Seller has not granted operator rights or is no longer the owner. They must re-list.', 'error'); return; }
      snack(msg, 'error');
    }
  }

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()} data-modal="buy-token">
        <PixelHeading>Buy Token</PixelHeading>
        <Wrap>
          <p>
            You are about to buy 1 edition for <strong>{priceXTZ} ꜩ</strong>.
          </p>
        </Wrap>
        <PixelButton onClick={handleBuy}>BUY</PixelButton>
        {ov.open && (
          <OperationOverlay
            label={ov.label}
            // Map cancel to close the overlay while in-flight
            onCancel={() => setOv({ open: false, label: '' })}
          />
        )}
        <PixelButton ref={closeBtnRef} onClick={onClose} data-sec>Close</PixelButton>
      </ModalBox>
    </ModalOverlay>
  );
}

BuyDialog.propTypes = {
  open      : PropTypes.bool,
  isOpen    : PropTypes.bool, // alias
  contract  : PropTypes.string,
  contractAddress: PropTypes.string, // alias
  tokenId   : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  priceMutez: PropTypes.number,
  seller    : PropTypes.string,
  nonce     : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  listingNonce: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose   : PropTypes.func,
  amount    : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  expectedSeller: PropTypes.string,
};








