/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ListTokenDialog.jsx
  Rev :    r19    2025‑07‑31 UTC
  Summary: pop‑out listing dialog with improved listing count
           detection and clearer display.  Uses on‑chain views
           first to derive the total number of editions for sale
           and falls back to off‑chain views or TzKT as needed.
           Shows the owned count and total editions listed
           alongside the number of listing entries (nonces), so
           users understand when a single listing covers many
           editions.  Retains balance detection, TzKT fallback,
           update_operators permissioning and batched listing
           transaction.  Integrates OperationOverlay for
           progress feedback.
────────────────────────────────────────────────────────────*/

import React, { useState, useEffect } from 'react';
import PropTypes                       from 'prop-types';
import styledPkg                       from 'styled-components';

import PixelHeading from './PixelHeading.jsx';
import PixelInput   from './PixelInput.jsx';
import PixelButton  from './PixelButton.jsx';
import OperationOverlay from './OperationOverlay.jsx';
import { useWalletContext } from '../contexts/WalletContext.js';
import {
  buildListParams,
  fetchListings,
  fetchOnchainListings,
  getMarketContract,
} from '../core/marketplace.js';

// Add Tzip16Module to enable off‑chain views on NFT contracts
import { Tzip16Module } from '@taquito/tzip16';

// styled-components helpers: accept both default and named exports
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

// Container for the modal overlay
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  z-index: 9999;
`;

// Inner box for the modal content
const ModalBox = styled.section`
  background: var(--zu-bg, #0a001e);
  border: 2px solid var(--zu-accent, #8f3ce1);
  padding: 1rem;
  width: min(90%, 480px);
  max-width: 480px;
  box-shadow: 0 0 0 4px var(--zu-dark, #1b023a);
`;

const Wrap = styled.section`margin-top: 1.4rem;`;

/**
 * Dialog to list an NFT edition on the ZeroSum marketplace.
 * Supports selecting a price and quantity up to the number of
 * editions owned.  Displays owned and listed counts, fetches
 * balance via on‑chain view and TzKT fallback, and calls
 * marketplace.list_token directly without gas simulation.
 */
export default function ListTokenDialog({ open, contract, tokenId, onClose = () => {} }) {
  const { toolkit } = useWalletContext() || {};
  // Price in XTZ (string to allow user input)
  const [price, setPrice] = useState('');
  // Quantity to list (string for input control)
  const [amount, setAmount] = useState('1');
  // Maximum editions the user owns (determined via on‑chain view or TzKT)
  const [maxAmount, setMaxAmount] = useState(1);
  // Number of editions currently listed for sale (sum of amounts across all listings)
  const [listedCount, setListedCount] = useState(0);
  // Number of individual listing entries (each with its own nonce)
  const [listedEntries, setListedEntries] = useState(0);
  // Operation overlay state
  const [ov, setOv] = useState({ open: false, label: '' });

  /**
   * Dispatch a snackbar event.  Severity can be 'info', 'warning' or 'error'.
   * Uses CustomEvent because the global snackbar listens for 'zu:snackbar'.
   */
  const snack = (msg, sev = 'info') => {
    window.dispatchEvent(
      new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }),
    );
  };

  // When the dialog opens, retrieve the owned editions and listed count.
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!open || !toolkit || !contract || tokenId == null) return;
      // Reset values each time dialog opens
      setMaxAmount(1);
      setAmount('1');
      setListedCount(0);
      setListedEntries(0);
      // Declare balance outside the try-catch so it is available for fallback check
      let bal = 0;
      try {
        const pkh = await toolkit.wallet.pkh();
        // Enable off‑chain view support on this toolkit
        try {
          toolkit.addExtension(new Tzip16Module());
        } catch (errExt) {
          /* ignored if already added */
        }
        const nft = await toolkit.contract.at(contract);
        // Try FA2 balance_of off‑chain view first; wrap in its own try/catch so bal persists
        try {
          const req = [{ owner: pkh, token_id: Number(tokenId) }];
          const res = await nft.views?.balance_of?.(req).read();
          bal = Number(res?.[0]?.balance ?? 0);
        } catch (e1) {
          // If balance_of fails, attempt get_balance view (pair owner address token_id nat)
          try {
            const res2 = await nft.views?.get_balance?.({ owner: pkh, token_id: Number(tokenId) }).read();
            if (typeof res2 === 'object' && res2 !== null) {
              if ('0' in res2) {
                bal = Number(res2['0']);
              } else if ('balance' in res2) {
                bal = Number(res2.balance);
              } else {
                bal = Number(Object.values(res2)[0]);
              }
            } else {
              bal = Number(res2);
            }
          } catch (e2) {
            console.warn('Both balance views failed:', e1, e2);
          }
        }
        if (!cancel && bal > 0) {
          setMaxAmount(bal);
          setAmount(String(Math.min(1, bal)));
        }
      } catch (e) {
        // Silently ignore; will fallback to TzKT below
        console.warn('balance view failed:', e);
      }
      // If no balance detected via view (bal <= 0), fallback to TzKT API
      if (!cancel && bal <= 0) {
        try {
          const pkh = await toolkit.wallet.pkh();
          // Determine the appropriate base URL for TzKT (ghostnet/mainnet)
          const rpcUrl = toolkit?.rpc?.getRpcUrl?.() ?? '';
          let tzktBase = 'https://api.tzkt.io';
          if (/ghostnet/i.test(rpcUrl) || /limanet/i.test(rpcUrl)) {
            tzktBase = 'https://api.ghostnet.tzkt.io';
          }
          const url = `${tzktBase}/v1/tokens/balances?account=${pkh}&token.contract=${contract}&token.tokenId=${tokenId}`;
          snack('On‑chain balance view unavailable; using network explorer fallback', 'warning');
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`TzKT HTTP ${resp.status}`);
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) {
            const b = Number(data[0]?.balance ?? 0);
            if (!cancel && b > 0) {
              setMaxAmount(b);
              setAmount(String(Math.min(1, b)));
              snack(`Balance detected via fallback: ${b}`);
            }
          }
        } catch (err) {
          console.error('TzKT fallback failed:', err);
          if (!cancel) {
            snack('Failed to detect balance; assuming you own 1 edition', 'warning');
          }
        }
      }
      // Fetch the total number of editions currently listed.  Prefer the on‑chain view
      // and fall back to the off‑chain view when on‑chain results are empty.  Sum
      // the amount field for each listing with amount > 0; do not rely on the
      // `active` flag, which may lag behind actual state.
      try {
        let listingArr = [];
        try {
          listingArr = await fetchOnchainListings({ toolkit, nftContract: contract, tokenId });
        } catch {
          listingArr = [];
        }
        if (!listingArr || listingArr.length === 0) {
          try {
            listingArr = await fetchListings({ toolkit, nftContract: contract, tokenId });
          } catch {
            listingArr = [];
          }
        }
        let total = 0;
        let entries = 0;
        if (Array.isArray(listingArr)) {
          for (const l of listingArr) {
            const amt = Number(l.amount);
            if (amt > 0) {
              total += amt;
              entries += 1;
            }
          }
        }
        if (!cancel) {
          setListedCount(total);
          setListedEntries(entries);
        }
      } catch (e) {
      console.warn('Failed to fetch listing count:', e);
        if (!cancel) {
          setListedCount(0);
          setListedEntries(0);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, toolkit, contract, tokenId]);

  // Reset internal state when dialog is closed
  useEffect(() => {
    if (!open) {
      setPrice('');
      setAmount('1');
      setOv({ open: false, label: '' });
    }
  }, [open]);

  // Parse amount and price for validation
  const amtNum = Number(amount);
  const priceNum = parseFloat(price);
  const disabled = !toolkit || !price || !Number.isFinite(priceNum) || priceNum <= 0 || !Number.isFinite(amtNum) || amtNum <= 0 || amtNum > maxAmount;

  /**
   * Handle the list button click.  Validates input then triggers the
   * transaction immediately.  Errors are surfaced via snackbar.
   */
  async function handleList() {
    try {
      // Validate price and quantity; invalid numbers show warnings
      const p = parseFloat(price);
      const q = parseInt(amount, 10);
      if (!Number.isFinite(p) || p <= 0) {
        snack('Enter a valid positive price', 'error');
        return;
      }
      if (!Number.isFinite(q) || q <= 0 || q > maxAmount) {
        snack('Enter a valid quantity within your owned range', 'error');
        return;
      }
      // Build listing params to ensure they compile; throws if invalid
      await buildListParams(toolkit, {
        nftContract: contract,
        tokenId: Number(tokenId),
        amount: q,
        priceMutez: Math.floor(p * 1_000_000),
      });
      // Submit immediately
      await submitTx(q, Math.floor(p * 1_000_000));
    } catch (err) {
      snack(err.message || 'Build error', 'error');
    }
  }

  /**
   * Send the listing transaction.  Uses getMarketContract to
   * resolve the correct marketplace contract for the current
   * network.  Constructs the arguments manually with a single
   * 100 % sale split to the seller.  No gas estimation is
   * performed; the wallet computes fees.
   *
   * @param {number} qty number of editions to list
   * @param {number} priceMutez listing price in mutez
   */
  async function submitTx(qty, priceMutez) {
    try {
      setOv({ open: true, label: 'Waiting for confirmation …' });
      const seller = await toolkit.wallet.pkh();
      // Resolve contracts
      const nftContract = await toolkit.wallet.at(contract);
      const market = await getMarketContract(toolkit);
      // Determine the marketplace address as operator
      const operatorAddr = market.address;
      // Build FA2 update_operators call to grant the marketplace permission
      const updateCall = nftContract.methods.update_operators([
        {
          add_operator: {
            owner   : seller,
            operator: operatorAddr,
            token_id: Number(tokenId),
          },
        },
      ]);
      // Build list_token call on marketplace contract
      const listArgs = {
        nft_contract  : contract,
        token_id      : Number(tokenId),
        price         : priceMutez,
        amount        : Number(qty),
        sale_splits   : [{ address: seller, percent: 10000 }],
        royalty_splits: [],
        start_delay   : 0,
      };
      const listCall = market.methodsObject.list_token(listArgs);
      // Send both operations in a batch using withContractCall for proper kinds
      const batch = toolkit.wallet.batch()
        .withContractCall(updateCall)
        .withContractCall(listCall);
      const op = await batch.send();
      await op.confirmation();
      setOv({ open: false, label: '' });
      snack('Listing created ✔');
      onClose();
    } catch (err) {
      console.error('Listing failed:', err);
      setOv({ open: false, label: '' });
      snack(err.message || 'Transaction failed', 'error');
    }
  }

  // Do not render anything when closed
  if (!open) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()} data-modal="list-token">
        <Wrap>
          <PixelHeading level={3}>List Token</PixelHeading>
          {/* Price input */}
          <p style={{ fontSize: '0.75rem', marginBottom: '0.2rem', opacity: 0.9 }}>
            Price (ꜩ)
          </p>
          <PixelInput
            placeholder="0.0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          {/* Quantity input */}
          <p style={{ fontSize: '0.75rem', marginTop: '0.6rem', marginBottom: '0.2rem', opacity: 0.9 }}>
            Quantity (max {maxAmount})
          </p>
          <PixelInput
            placeholder="1"
            type="number"
            min={1}
            max={maxAmount}
            step={1}
            disabled={maxAmount <= 1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {/* Owned and listed counts.  Display the total number of editions for sale
             and the number of distinct listings (nonces) to avoid confusion when
             multiple editions are sold under a single listing. */}
          <p style={{ fontSize: '0.7rem', marginTop: '0.3rem', opacity: 0.8 }}>
            Owned: {maxAmount} | For Sale: {listedCount}
            {listedEntries > 0 && (
              <span>
                {' '}(
                {listedEntries} listing{listedEntries !== 1 ? 's' : ''}
                )
              </span>
            )}
          </p>
          <PixelButton disabled={disabled} onClick={handleList}>
            LIST&nbsp;TOKEN
          </PixelButton>
          {ov.open && (
            <OperationOverlay
              label={ov.label}
              onClose={() => setOv({ open: false, label: '' })}
              /**
               * Provide an onCancel handler so that clicking the
               * Cancel button inside OperationOverlay closes the
               * overlay immediately. Without this prop the Cancel
               * button defaults to a no‑op for this dialog.
               */
              onCancel={() => setOv({ open: false, label: '' })}
            />
          )}
          <PixelButton onClick={onClose}>Close</PixelButton>
        </Wrap>
      </ModalBox>
    </ModalOverlay>
  );
}

ListTokenDialog.propTypes = {
  open    : PropTypes.bool,
  contract: PropTypes.string,
  tokenId : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose : PropTypes.func,
};

/* What changed & why: Introduced on‑chain listing count detection in
   ListTokenDialog.  The component now calls fetchOnchainListings
   first to obtain all marketplace listings for the specified
   token, falling back to fetchListings (off‑chain view) when
   necessary.  It sums the amount for each listing with amount > 0
   and records the number of distinct listing entries.  The UI
   shows the number of editions for sale alongside the number of
   listing entries so users understand when one listing covers
   many editions.  The remainder of the dialog retains the
   existing balance detection, TzKT fallback and transaction
   batching logic. */
