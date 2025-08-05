/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ListTokenDialog.jsx
  Rev :    r38    2025‑08‑05
  Summary: Add optional sale splits.  Users may specify additional
           addresses and percentages for initial sale proceeds; the
           remainder goes to the seller.  UI inputs allow adding
           splits and removing them.  Listing logic builds the
           sale_splits array from state and defaults to 100 % seller
           when no splits are provided.  Version detection and
           operator grant logic remain unchanged.  This update
           preserves previous features while enabling collaborator
           payouts on primary sales.
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

// Import network config to compute Objkt token links
import {
  URL_OBJKT_BASE,
  URL_OBJKT_TOKENS_BASE,
} from '../config/deployTarget.js';

// Add Tzip16Module to enable off‑chain views on NFT contracts
import { Tzip16Module } from '@taquito/tzip16';

// Resolve styled-components default export before defining styled components
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

const Wrap = styled.section`
  margin-top: 1.4rem;
`;

/**
 * Decode a hex‑encoded string into UTF‑8.  Token metadata returned
 * from TzKT exposes values as hex strings.  This helper converts
 * them into human‑readable strings.
 * @param {string} hex
 * @returns {string}
 */
function hexToString(hex) {
  let out = '';
  if (typeof hex !== 'string') return out;
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substr(i, 2), 16);
    if (!Number.isNaN(code)) out += String.fromCharCode(code);
  }
  return out;
}

export default function ListTokenDialog({ open, contract, tokenId, onClose = () => {} }) {
  const { toolkit } = useWalletContext() || {};
  // Price in XTZ (string to allow user input)
  const [price, setPrice] = useState('');
  // Quantity to list (string for input control).  Represents number of editions,
  // not raw token units.  Will be scaled by decimals when submitting.
  const [amount, setAmount] = useState('1');
  // Maximum editions the user owns (determined via on‑chain view or TzKT)
  const [maxAmount, setMaxAmount] = useState(1);
  // Number of editions currently listed for sale (sum of amounts across all listings)
  const [listedCount, setListedCount] = useState(0);
  // Number of individual listing entries (each with its own nonce)
  const [listedEntries, setListedEntries] = useState(0);
  // Operation overlay state
  const [ov, setOv] = useState({ open: false, label: '' });

  // Optional sale splits.  Users can specify additional recipients for
  // the sale proceeds on the first sale.  Each entry contains an
  // address and a percentage expressed in basis points (i.e. percent * 100).
  const [splits, setSplits] = useState([]);
  const [newSplitAddr, setNewSplitAddr] = useState('');
  const [newSplitPct, setNewSplitPct] = useState('');

  // Flags indicating whether the NFT contract is a legacy v2 variant or
  // an unsupported v4 derivative (v4a/v4c/v4d).  When `isLegacy` is
  // true the contract is one of the v2 series and should redirect
  // users to Objkt; when `isUnsupported` is true the contract is
  // a v4a/v4c/v4d derivative that likewise must be listed on Objkt.
  // Supported versions (v1, v3, v4 and v4b) have both flags false.
  const [isLegacy, setIsLegacy] = useState(false);
  const [isUnsupported, setIsUnsupported] = useState(false);

  /**
   * Add a sale split entry.  The user provides a Tezos address and a
   * percentage (0–100).  Internally we convert the percentage to
   * basis points (percent × 100).  Validation ensures that the
   * address is non‑empty, the percent is positive and finite, and
   * that the cumulative percent of all splits remains below 100 %.
   */
  function addSplit() {
    const addr = newSplitAddr.trim();
    const pctFloat = parseFloat(newSplitPct);
    if (!addr || !Number.isFinite(pctFloat) || pctFloat <= 0) {
      snack('Enter a valid address and percent', 'error');
      return;
    }
    const basis = Math.floor(pctFloat * 100);
    // Compute total basis points including the new entry
    let total = basis;
    for (const s of splits) {
      total += s.percent;
    }
    if (total >= 10000) {
      snack('Total sale splits must be less than 100 %', 'error');
      return;
    }
    setSplits([...splits, { address: addr, percent: basis }]);
    setNewSplitAddr('');
    setNewSplitPct('');
  }

  /**
   * Remove a sale split entry by index.
   *
   * @param {number} idx Index of the split to remove
   */
  function removeSplit(idx) {
    setSplits(splits.filter((_, i) => i !== idx));
  }

  // Compute the Objkt token URL.  URL_OBJKT_TOKENS_BASE points directly
  // to the tokens path (e.g. https://ghostnet.objkt.com/tokens/).  When
  // contract and tokenId are defined this creates the full URL;
  // otherwise returns an empty string.
  const objktUrl = (() => {
    if (contract && tokenId != null) {
      return `${URL_OBJKT_TOKENS_BASE}${contract}/${tokenId}`;
    }
    return '';
  })();

  /**
   * Dispatch a snackbar event.  Severity can be 'info', 'warning' or 'error'.
   * Uses CustomEvent because the global snackbar listens for 'zu:snackbar'.
   */
  const snack = (msg, sev = 'info') => {
    window.dispatchEvent(
      new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }),
    );
  };

  /**
   * Cache for token decimals.  Keys are token ids as strings.  These
   * values persist for the lifetime of the dialog to avoid repeated
   * network fetches.
   */
  const tokenDecimalsCache = {};

  /**
   * Fetch the number of decimals for a given tokenId from the token_metadata
   * big‑map via TzKT.  Returns 0 when decimals cannot be determined.
   * Results are cached for the life of the dialog.
   * @param {number} id
   */
  async function getTokenDecimals(id) {
    const key = String(id);
    if (tokenDecimalsCache[key] !== undefined) return tokenDecimalsCache[key];
    let dec = 0;
    try {
      if (!toolkit || !contract) return 0;
      const rpcUrl = toolkit?.rpc?.getRpcUrl?.() ?? '';
      let tzktBase = 'https://api.tzkt.io';
      if (/ghostnet/i.test(rpcUrl) || /limanet/i.test(rpcUrl)) {
        tzktBase = 'https://api.ghostnet.tzkt.io';
      }
      const resp = await fetch(`${tzktBase}/v1/contracts/${contract}/bigmaps`);
      if (!resp.ok) throw new Error(`TzKT bigmaps HTTP ${resp.status}`);
      const maps = await resp.json();
      const metaMap = Array.isArray(maps) ? maps.find((m) => m.path === 'token_metadata') : null;
      if (!metaMap) {
        tokenDecimalsCache[key] = 0;
        return 0;
      }
      const mapId = metaMap.ptr ?? metaMap.id;
      const resp2 = await fetch(`${tzktBase}/v1/bigmaps/${mapId}/keys/${id}`);
      if (!resp2.ok) throw new Error(`TzKT token_metadata HTTP ${resp2.status}`);
      const data = await resp2.json();
      const info = data?.value?.token_info;
      if (info && typeof info.decimals === 'string') {
        const decStr = hexToString(info.decimals);
        const d = parseInt(decStr, 10);
        if (Number.isFinite(d) && d >= 0) dec = d;
      }
    } catch (err) {
      console.warn('Decimals fetch failed:', err);
    }
    tokenDecimalsCache[key] = dec;
    return dec;
  }

  // Populate contract metadata and listing counts when the dialog opens
  useEffect(() => {
    // Determine contract version by inspecting entrypoints.  This
    // effect runs whenever the dialog opens or the contract changes.
    (async () => {
      if (!open || !toolkit || !contract) return;
      try {
        const nft = await toolkit.contract.at(contract);
        const eps = nft?.entrypoints?.entrypoints || {};
        const hasAppendToken     = Object.prototype.hasOwnProperty.call(eps, 'append_token_metadata');
        const hasAppendArtifact  = Object.prototype.hasOwnProperty.call(eps, 'append_artifact_uri');
        const hasAddCollaborator = Object.prototype.hasOwnProperty.call(eps, 'add_collaborator');
        const hasAddChild        = Object.prototype.hasOwnProperty.call(eps, 'add_child');
        if (hasAppendToken) {
          // v4a/v4c/v4d → unsupported
          setIsLegacy(false);
          setIsUnsupported(true);
        } else if (hasAppendArtifact) {
          // v4/v4b → supported
          setIsLegacy(false);
          setIsUnsupported(false);
        } else if (hasAddCollaborator) {
          // v3 → supported
          setIsLegacy(false);
          setIsUnsupported(false);
        } else if (hasAddChild) {
          // v2 variants → legacy
          setIsLegacy(true);
          setIsUnsupported(false);
        } else {
          // v1 or unknown → supported
          setIsLegacy(false);
          setIsUnsupported(false);
        }
      } catch (err) {
        console.warn('Entrypoint detection failed:', err);
        setIsLegacy(false);
        setIsUnsupported(false);
      }
    })();

    let cancel = false;
    (async () => {
      if (!open || !toolkit || !contract || tokenId == null) return;
      // Reset values each time dialog opens
      setMaxAmount(1);
      setAmount('1');
      setListedCount(0);
      setListedEntries(0);
      let bal = 0;
      let decimals = 0;
      try {
        const pkh = await toolkit.wallet.pkh();
        // Enable off‑chain view support on this toolkit
        try {
          toolkit.addExtension(new Tzip16Module());
        } catch (errExt) {
          /* ignore duplicate registration errors */
        }
        const nft = await toolkit.contract.at(contract);
        // Try FA2 balance_of off‑chain view first
        try {
          const req = [{ owner: pkh, token_id: Number(tokenId) }];
          const res = await nft.views?.balance_of?.(req).read();
          bal = Number(res?.[0]?.balance ?? 0);
        } catch (e1) {
          // If balance_of fails, attempt get_balance view
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
        // Fetch decimals for the token; required to convert raw units to editions
        // Always treat balances as whole editions rather than scaling
        // by decimals.  Some tokens set decimals > 0 to represent
        // fractional units; however, edition counts should reflect the
        // raw balance.  Retrieve decimals for listing unit conversion
        // but do not divide the balance here.
        decimals = await getTokenDecimals(Number(tokenId));
        const editionBal = bal; // ignore decimals for owned count
        if (!cancel) {
          setMaxAmount(editionBal);
          if (editionBal > 0) {
            setAmount('1');
          } else {
            setAmount('1');
          }
        }
      } catch (e) {
        console.warn('balance view failed:', e);
      }
      // If no balance detected via view (bal <= 0), fallback to TzKT API
      if (!cancel && bal <= 0) {
          try {
            const pkh = await toolkit.wallet.pkh();
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
              decimals = await getTokenDecimals(Number(tokenId));
              const editionBal = b; // ignore decimals for owned count
              if (!cancel) {
                setMaxAmount(editionBal);
                if (editionBal > 0) {
                  setAmount('1');
                } else {
                  setAmount('1');
                }
                snack(`Balance detected via fallback: ${editionBal}`);
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
      // active flag, which may lag behind actual state.
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
          const d = await getTokenDecimals(Number(tokenId));
          for (const l of listingArr) {
            const amt = Number(l.amount);
            if (amt > 0) {
              const ed = d > 0 ? Math.floor(amt / Math.pow(10, d)) : amt;
              total += ed;
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
      const p = parseFloat(price);
      const qEditions = parseInt(amount, 10);
      if (!Number.isFinite(p) || p <= 0) {
        snack('Enter a valid positive price', 'error');
        return;
      }
      if (!Number.isFinite(qEditions) || qEditions <= 0 || qEditions > maxAmount) {
        snack('Enter a valid quantity within your owned range', 'error');
        return;
      }
      // Redirect unsupported contracts to Objkt
      if (isLegacy || isUnsupported) {
        const base = URL_OBJKT_BASE.replace(/\/collection\/?.*$/, '/tokens/');
        const targetUrl = `${base}${contract}/${tokenId}`;
        snack('This contract version is not supported by the ZeroSum marketplace. Redirecting to Objkt for listing …', 'warning');
        try {
          window.open(targetUrl, '_blank');
        } catch (e) {
          console.warn('Failed to open Objkt listing page:', e);
        }
        return;
      }
      // Build listing params to ensure they compile; throws if invalid
      const idNum = Number(tokenId);
      const dec = await getTokenDecimals(idNum);
      const qtyUnits = dec > 0 ? qEditions * Math.pow(10, dec) : qEditions;
      await buildListParams(toolkit, {
        nftContract: contract,
        tokenId    : idNum,
        amount     : Number(qtyUnits),
        priceMutez : Math.floor(p * 1_000_000),
      });
      // Submit the transaction
      await submitTx(qEditions, Math.floor(p * 1_000_000));
    } catch (err) {
      snack(err.message || 'Build error', 'error');
    }
  }

  /**
   * Send the listing transaction.  Uses getMarketContract to
   * resolve the correct marketplace contract for the current
   * network.  Always grants operator rights before listing to
   * prevent FA2_NOT_OPERATOR errors.  Falls back to the id-1
   * variant for zero‑indexed FA2 contracts when necessary.
   *
   * @param {number} qtyEditions number of editions to list
   * @param {number} priceMutez listing price in mutez
   */
  async function submitTx(qtyEditions, priceMutez) {
    try {
      // Prepare seller and contract instances
      setOv({ open: true, label: 'Preparing listing …' });
      const seller = await toolkit.wallet.pkh();
      const nftContract = await toolkit.wallet.at(contract);
      const market = await getMarketContract(toolkit);
      const operatorAddr = market.address;

      // Helper to build an update_operators call for a specific token id
      const buildUpdateCall = (id) => nftContract.methods.update_operators([
        {
          add_operator: {
            owner   : seller,
            operator: operatorAddr,
            token_id: Number(id),
          },
        },
      ]);

      // Helper to build an update_operators call with reversed field order
      const buildUpdateCallReversed = (id) => nftContract.methods.update_operators([
        {
          add_operator: {
            operator: operatorAddr,
            owner   : seller,
            token_id: Number(id),
          },
        },
      ]);

      // Helper: list token without updating the operator.  Builds
      // saleSplits from the component state.  When splits are defined
      // we allocate the specified basis points to each address and
      // assign the remainder to the seller.  When no splits are
      // specified the seller receives 100 % (basis = 10 000).
      async function listOnly(id, qtyUnits) {
        const royaltySplits = [];
        let saleSplits = [];
        if (splits && splits.length > 0) {
          let total = 0;
          saleSplits = splits.map(({ address, percent }) => {
            total += percent;
            return { address, percent };
          });
          const sellerShare = 10000 - total;
          if (sellerShare > 0) {
            saleSplits.push({ address: seller, percent: sellerShare });
          }
        } else {
          saleSplits = [{ address: seller, percent: 10000 }];
        }
        const params = await buildListParams(toolkit, {
          nftContract  : contract,
          tokenId      : id,
          priceMutez   : priceMutez,
          amount       : Number(qtyUnits),
          saleSplits   : saleSplits,
          royaltySplits: royaltySplits,
          startDelay   : 0,
        });
        setOv({ open: true, label: 'Listing token …' });
        const op = await toolkit.wallet.batch(params).send();
        await op.confirmation();
        return true;
      }

      // Helper: check whether the marketplace is already an operator for the given tokenId
      async function checkOperator(id) {
        try {
          const rpcUrl = toolkit?.rpc?.getRpcUrl?.() ?? '';
          let tzktBase = 'https://api.tzkt.io';
          if (/ghostnet/i.test(rpcUrl) || /limanet/i.test(rpcUrl)) {
            tzktBase = 'https://api.ghostnet.tzkt.io';
          }
          const resp = await fetch(`${tzktBase}/v1/contracts/${contract}/bigmaps`);
          if (!resp.ok) throw new Error(`TzKT bigmaps HTTP ${resp.status}`);
          const maps = await resp.json();
          const opMap = Array.isArray(maps) ? maps.find((m) => m.path === 'operators') : null;
          if (!opMap) return false;
          const mapId = opMap.ptr ?? opMap.id;
          const resp2 = await fetch(`${tzktBase}/v1/bigmaps/${mapId}/keys?limit=256`);
          if (!resp2.ok) throw new Error(`TzKT keys HTTP ${resp2.status}`);
          const keys = await resp2.json();
          for (const entry of keys) {
            const key = entry?.key;
            if (key && key.owner === seller && key.operator === operatorAddr && Number(key.token_id) === id) {
              return true;
            }
          }
        } catch (err) {
          console.warn('Operator check failed:', err);
        }
        return false;
      }

      // Helper: update operator then list token.  Checks operator status via TzKT and
      // skips the update_operators call if the marketplace is already registered.
      async function updateAndList(id, qtyUnits) {
        const alreadyOp = await checkOperator(id);
        if (alreadyOp) {
          return await listOnly(id, qtyUnits);
        }
        setOv({ open: true, label: 'Granting operator …' });
        try {
          const updCall = buildUpdateCall(id);
          const updOp   = await updCall.send();
          await updOp.confirmation(2);
        } catch (eDef) {
          console.warn('Default operator update failed, trying reversed order:', eDef);
          const updCall2 = buildUpdateCallReversed(id);
          const updOp2   = await updCall2.send();
          await updOp2.confirmation(2);
        }
        return await listOnly(id, qtyUnits);
      }

      const idNum = Number(tokenId);
      const dec   = await getTokenDecimals(idNum);
      const qtyUnits = dec > 0 ? qtyEditions * Math.pow(10, dec) : qtyEditions;
      // Always ensure the marketplace is an operator before listing.  The
      // updateAndList helper internally checks and updates operator status.
      try {
        await updateAndList(idNum, qtyUnits);
        setOv({ open: false, label: '' });
        snack('Listing created ✔', 'info');
        onClose();
        return;
      } catch (primaryErr) {
        console.warn('Primary listing failed:', primaryErr);
      }
      // Fallback to tokenId - 1 if applicable (for zero-indexed contracts)
      if (idNum > 0) {
        const altId = idNum - 1;
        try {
          const decAlt = await getTokenDecimals(altId);
          const unitsAlt = decAlt > 0 ? qtyEditions * Math.pow(10, decAlt) : qtyEditions;
          await updateAndList(altId, unitsAlt);
          setOv({ open: false, label: '' });
          snack('Listing created ✔ (fallback ID)', 'info');
          onClose();
          return;
        } catch (fallbackErr) {
          console.warn('Fallback listing failed:', fallbackErr);
        }
      }
      throw new Error('All listing attempts failed');
    } catch (err) {
      console.error('Listing failed:', err);
      setOv({ open: false, label: '' });
      const msg = String(err?.message || 'Transaction failed');
      if (/Insufficient balance/i.test(msg)) {
        // When the marketplace fails the balance check, it may indicate an
        // unsupported contract version (e.g. v2) where the ZeroSum contract
        // cannot verify ownership.  Advise the user to list on
        // an alternative marketplace such as Objkt.
        snack('Listing failed: insufficient token balance. This contract version may not be supported by the ZeroSum marketplace. Please list this token on Objkt or a compatible marketplace.', 'error');
      } else {
        snack(msg, 'error');
      }
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

          {/* Sale splits section.  Allows the seller to optionally
             allocate portions of the first sale to other parties.  Each
             split entry consists of a Tezos address and a percent
             value (0–100).  The seller automatically receives the
             remainder up to 100 %. */}
          <p
            style={{ fontSize: '0.75rem', marginTop: '0.6rem', marginBottom: '0.2rem', opacity: 0.9 }}
          >
            Sale Splits (optional)
          </p>
          <PixelInput
            placeholder="Recipient tz-address"
            value={newSplitAddr}
            onChange={(e) => setNewSplitAddr(e.target.value)}
          />
          <PixelInput
            placeholder="Percent (e.g. 10)"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={newSplitPct}
            onChange={(e) => setNewSplitPct(e.target.value)}
          />
          <PixelButton onClick={addSplit} disabled={!newSplitAddr || !newSplitPct}>
            ADD SPLIT
          </PixelButton>
          {/* Display existing sale splits */}
          {splits && splits.length > 0 && (
            <div style={{ marginTop: '0.4rem' }}>
              {splits.map((sp, idx) => (
                <p
                  key={idx}
                  style={{ fontSize: '0.7rem', marginTop: '0.1rem', opacity: 0.9, display: 'flex', alignItems: 'center' }}
                >
                  <span style={{ flexGrow: 1 }}>
                    {sp.address}: {(sp.percent / 100).toFixed(2)}%
                  </span>
                  <PixelButton
                    onClick={() => removeSplit(idx)}
                    style={{ flexShrink: 0 }}
                  >
                    ✕
                  </PixelButton>
                </p>
              ))}
            </div>
          )}
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
          {isLegacy || isUnsupported ? (
            <>
              <p
                style={{ fontSize: '0.75rem', marginTop: '0.6rem', marginBottom: '0.2rem', opacity: 0.85 }}
              >
                This contract version is not supported by the ZeroSum marketplace. Please list it on Objkt:
              </p>
              <PixelButton
                disabled={!objktUrl}
                onClick={() => {
                  if (objktUrl) {
                    try {
                      window.open(objktUrl, '_blank');
                    } catch (e) {
                      console.warn('Failed to open Objkt page:', e);
                    }
                  }
                }}
              >
                LIST&nbsp;ON&nbsp;OBJKT
              </PixelButton>
            </>
          ) : (
            <PixelButton disabled={disabled} onClick={handleList}>
              LIST&nbsp;TOKEN
            </PixelButton>
          )}
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

/* What changed & why: r37
   • Retained the comprehensive version detection introduced in r36.
     Contracts exposing append_token_metadata (v4a/v4c/v4d) or
     add_child without add_collaborator or append_artifact_uri
     (v2 variants) redirect users to Objkt; v4/v4b, v3 and v1
     list on ZeroSum.
   • Always update maxAmount when computing the user’s token
     balance, even when they own zero editions, so the
     “Owned” count accurately reflects zero ownership.
     Reset amount to its default when no editions are owned.
   • Retained removal of getRoyaltySplits and operator update
     logic from r36. */
