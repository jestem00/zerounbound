/*Developed by @jams2blues
  File: src/ui/ListTokenDialog.jsx
  Rev:  r1196
  Summary: Listing dialog — extend v2a exception to v2c:
           whitelist + offline_balance path; single-signature batch. */

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';

import { OpKind } from '@taquito/taquito';
import { Tzip16Module } from '@taquito/tzip16';

import PixelHeading from './PixelHeading.jsx';
import PixelInput from './PixelInput.jsx';
import PixelButton from './PixelButton.jsx';
import OperationOverlay from './OperationOverlay.jsx';

import { useWalletContext } from '../contexts/WalletContext.js';
import {
  buildListParams,
  fetchListings,
  fetchOnchainListings,
  getMarketContract,
} from '../core/marketplace.js';
import getLedgerBalanceV2a from '../utils/getLedgerBalanceV2a.cjs';
import hashMatrix from '../data/hashMatrix.json';
import { jFetch } from '../core/net.js';

import {
  URL_OBJKT_TOKENS_BASE,
  TZKT_API,
  MARKETPLACE_ADDRESS,
} from '../config/deployTarget.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*───────── shells ───────────────────────────────────────────*/
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  z-index: 9999;
`;
const ModalBox = styled.section`
  background: var(--zu-bg, #0a001e);
  border: 2px solid var(--zu-accent, #8f3ce1);
  box-shadow: 0 0 0 4px var(--zu-dark, #1b023a);
  padding: 1rem;
  width: min(90%, 480px);
`;
const Wrap = styled.section`
  margin-top: 1.4rem;
`;

/*───────── helpers ──────────────────────────────────────────*/
function hexToString(hex = '') {
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    const c = parseInt(hex.substr(i, 2), 16);
    if (!Number.isNaN(c)) out += String.fromCharCode(c);
  }
  return out;
}

/* Resolve token decimals (TzKT bigmap walk) */
const decCache = {};
async function getDec(_toolkit, contract, id) {
  const k = `${contract}:${id}`;
  if (decCache[k] != null) return decCache[k];
  let d = 0;
  try {
    if (!contract) return 0;
    const maps = await (await fetch(`${TZKT_API}/v1/contracts/${contract}/bigmaps`)).json();
    const meta = Array.isArray(maps) ? maps.find((m) => m.path === 'token_metadata') : null;
    if (meta) {
      const mapId = meta.ptr ?? meta.id;
      const dat = await (await fetch(`${TZKT_API}/v1/bigmaps/${mapId}/keys/${id}`)).json();
      const ds = hexToString(dat?.value?.token_info?.decimals ?? '');
      const n = parseInt(ds, 10);
      if (Number.isFinite(n) && n >= 0) d = n;
    }
  } catch { /* ignore */ }
  decCache[k] = d;
  return d;
}

/* Marketplace checklist (array or big‑map) */
async function isInMarketplaceChecklist(contract) {
  try {
    const store = await jFetch(`${TZKT_API}/v1/contracts/${MARKETPLACE_ADDRESS}/storage`);
    // Array storage
    if (Array.isArray(store?.checklist)) return store.checklist.includes(contract);
    // Big‑map pointer
    const bm = store?.checklist;
    const bigmapId = (bm && (bm.ptr ?? bm.id ?? bm.bigmapId ?? bm.bigMapId ?? bm)) || null;
    if (bigmapId) {
      const resp = await fetch(`${TZKT_API}/v1/bigmaps/${bigmapId}/keys/${contract}`);
      return resp.ok;
    }
  } catch {
    // Non‑blocking if unverifiable; contract will gate on‑chain.
    return true;
  }
  return false;
}

/*───────── component ─────────────────────────────────────────*/
export default function ListTokenDialog({ open, contract, tokenId, onClose = () => {} }) {
  const { toolkit } = useWalletContext() || {};

  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('1');
  const [maxAmount, setMaxAmount] = useState(1);
  const [listedCount, setListedCount] = useState(0);
  const [listedEntries, setListedEntries] = useState(0);
  const [ov, setOv] = useState({ open: false, label: '' });
  const [resolvedTokenId, setResolvedTokenId] = useState(null);

  const [splits, setSplits] = useState([]);
  const [newSplitAddr, setNewSplitAddr] = useState('');
  const [newSplitPct, setNewSplitPct] = useState('');

  const [isUnsupported, setIsUnsupported] = useState(false);

  const objktUrl =
    contract && tokenId != null ? `${URL_OBJKT_TOKENS_BASE}${contract}/${tokenId}` : '';

  const snack = (msg, sev = 'info') =>
    window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }));

  /* FA2 probe — require update_operators */
  useEffect(() => {
    (async () => {
      if (!open || !toolkit || !contract) return;
      try {
        const eps = Object.keys((await toolkit.contract.at(contract)).entrypoints.entrypoints || {});
        setIsUnsupported(!eps.includes('update_operators'));
      } catch {
        setIsUnsupported(false);
      }
    })();
  }, [open, toolkit, contract]);

  /* Balances & listings snapshot */
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!open || !toolkit || !contract || tokenId == null) return;

      setMaxAmount(1);
      setAmount('1');
      setListedCount(0);
      setListedEntries(0);
      setResolvedTokenId(Number(tokenId));

      const idNum = Number(tokenId);
      let owned = 0;
      let resolvedId = idNum;

      try {
        const pkh = await toolkit.wallet.pkh();
        toolkit.addExtension?.(new Tzip16Module());
        const nft = await toolkit.contract.at(contract);

        // Prefer off‑chain views (balance_of / get_balance)
        try {
          const res = await nft.views?.balance_of?.([{ owner: pkh, token_id: idNum }]).read();
          owned = Number(res?.[0]?.balance ?? 0);
        } catch {
          try {
            const res2 = await nft.views?.get_balance?.({ owner: pkh, token_id: idNum }).read();
            owned = typeof res2 === 'object' ? Number(Object.values(res2)[0]) : Number(res2);
          } catch { /* ignore */ }
        }

        // Fallback — query via TzKT tokens/balances when views fail/lie
        if (owned === 0) {
          const bal = await getLedgerBalanceV2a({
            tzktBase: TZKT_API,
            contract,
            tokenId: idNum,
            owner: pkh,
          });
          owned = bal;
        }

        // Last resort — direct TzKT balances
        if (owned === 0) {
          const u = `${TZKT_API}/v1/tokens/balances?account=${pkh}&token.contract=${contract}&token.tokenId=${idNum}`;
          const resp = await fetch(u);
          if (resp.ok) {
            const arr = await resp.json();
            if (Array.isArray(arr) && arr.length) owned = Number(arr[0].balance);
          }
        }
      } catch { /* ignore */ }

      if (!cancel) {
        setMaxAmount(owned);
        setResolvedTokenId(resolvedId);
      }

      // Listings snapshot (count + entries)
      try {
        const listingId = resolvedId;
        let arr = await fetchOnchainListings({ toolkit, nftContract: contract, tokenId: listingId }).catch(() => []);
        if (!arr.length) arr = await fetchListings({ toolkit, nftContract: contract, tokenId: listingId }).catch(() => []);
        const dec = await getDec(toolkit, contract, listingId);
        const total = arr.reduce((t, l) => t + (dec > 0 ? Math.floor(l.amount / 10 ** dec) : Number(l.amount)), 0);
        if (!cancel) {
          setListedCount(total);
          setListedEntries(arr.length);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancel = true; };
  }, [open, toolkit, contract, tokenId]);

  // Reset UI when dialog closes
  useEffect(() => {
    if (!open) {
      setPrice('');
      setAmount('1');
      setOv({ open: false, label: '' });
      setSplits([]);
      setNewSplitAddr('');
      setNewSplitPct('');
    }
  }, [open]);

  /* Splits management */
  function addSplit() {
    const addr = newSplitAddr.trim();
    const pct = parseFloat(newSplitPct);
    if (!addr || !Number.isFinite(pct) || pct <= 0) {
      snack('Enter valid address & percent', 'error');
      return;
    }
    const basis = Math.floor(pct * 100);
    const total = splits.reduce((t, s) => t + s.percent, 0) + basis;
    if (total >= 10000) {
      snack('Total splits must be < 100 %', 'error');
      return;
    }
    setSplits([...splits, { address: addr, percent: basis }]);
    setNewSplitAddr('');
    setNewSplitPct('');
  }
  const removeSplit = (i) => setSplits(splits.filter((_, idx) => idx !== i));

  const amtNum = Number(amount);
  const priceNum = parseFloat(price);
  const disabled =
    !toolkit || priceNum <= 0 || amtNum <= 0 || amtNum > maxAmount || !Number.isFinite(priceNum);

  /* Robust operator probe via TzKT key filters */
  async function hasOperatorForId({ owner, operator, id }) {
    try {
      const maps = await (await fetch(`${TZKT_API}/v1/contracts/${contract}/bigmaps`)).json();
      const opMap = Array.isArray(maps) ? maps.find((m) => m.path === 'operators') : null;
      if (!opMap) return false;
      const mapId = opMap.ptr ?? opMap.id;
      const url = `${TZKT_API}/v1/bigmaps/${mapId}/keys`
        + `?key.owner=${encodeURIComponent(owner)}`
        + `&key.operator=${encodeURIComponent(operator)}`
        + `&key.token_id=${encodeURIComponent(Number(id))}`
        + `&select=active&limit=1`;
      const resp = await fetch(url);
      if (!resp.ok) return false;
      const arr = await resp.json();
      return Array.isArray(arr) && arr.length > 0;
    } catch {
      return false;
    }
  }

  /* Build update_operators transfer params (with reversed‑fields fallback) */
  async function buildUpdateOperatorParams(nft, { owner, operator, id }) {
    // Default ordering
    try {
      const call = nft.methods.update_operators([
        { add_operator: { owner, operator, token_id: Number(id) } },
      ]);
      return call.toTransferParams();
    } catch { /* fall through */ }
    // Reversed fields (rare FA2 quirk)
    const call2 = nft.methods.update_operators([
      { add_operator: { operator, owner, token_id: Number(id) } },
    ]);
    return call2.toTransferParams();
  }

  async function handleList() {
    // Detect v2a OR v2c by typeHash (hashMatrix)
    let needsOffline = false;
    try {
      const info = await (await fetch(`${TZKT_API}/v1/contracts/${contract}`)).json();
      const tHash = info?.typeHash ?? info?.type_hash;
      const label = tHash !== undefined ? hashMatrix[String(tHash)] : '';
      needsOffline = label === 'v2a' || label === 'v2c';
    } catch { /* ignore */ }

    // Hard‑block non‑FA2
    if (isUnsupported) {
      snack('Unsupported contract – redirecting to Objkt…', 'warning');
      if (objktUrl) window.open(objktUrl, '_blank');
      return;
    }

    const p = parseFloat(price);
    const q = parseInt(amount, 10);
    if (p <= 0 || q <= 0 || q > maxAmount) {
      snack('Check price & quantity', 'error');
      return;
    }

    // v2a/v2c guards: whitelist + offline balance
    let offline_balance = false;
    if (needsOffline) {
      const ok = await isInMarketplaceChecklist(contract);
      if (!ok) {
        snack('Collection not whitelisted on marketplace', 'error');
        return;
      }
      try {
        const bal = await getLedgerBalanceV2a({
          tzktBase: TZKT_API,
          contract,
          tokenId: Number(resolvedTokenId ?? tokenId),
          owner: await toolkit.wallet.pkh(),
        });
        if (bal < q) {
          snack('Insufficient editions held (offline check)', 'error');
          return;
        }
        offline_balance = true;
      } catch {
        snack('Offline balance check failed; try again', 'error');
        return;
      }
    }

    await submitTx(q, Math.floor(p * 1_000_000), offline_balance);
  }

  async function submitTx(qEditions, priceMutez, offline_balance) {
    try {
      setOv({ open: true, label: 'Preparing listing …' });

      const seller = await toolkit.wallet.pkh();
      toolkit.addExtension?.(new Tzip16Module());

      const nft = await toolkit.wallet.at(contract);
      const market = await getMarketContract(toolkit);
      const operatorAddr = market.address;

      const idNum = resolvedTokenId ?? Number(tokenId);
      const dec = await getDec(toolkit, contract, idNum);
      const qtyUnits = dec > 0 ? qEditions * 10 ** dec : qEditions;

      // Compose sale splits (ensure seller receives the remainder)
      const saleSplits = (() => {
        if (!splits.length) return [{ address: seller, percent: 10000 }];
        const used = splits.reduce((t, s) => t + s.percent, 0);
        return used < 10000 ? [...splits, { address: seller, percent: 10000 - used }] : splits;
      })();

      // Build list_token params up front (may throw if EP mismatch)
      const listParams = await buildListParams(toolkit, {
        nftContract: contract,
        tokenId: idNum,
        offline_balance, // critical for v2a/v2c
        priceMutez,
        amount: qtyUnits,
        saleSplits,
        royaltySplits: [],
        startDelay: 0,
      });

      // Ensure operator; batch update_operators + list_token for single signature
      const alreadyOp = await hasOperatorForId({ owner: seller, operator: operatorAddr, id: idNum });

      const batchOps = [];
      if (!alreadyOp) {
        const updParams = await buildUpdateOperatorParams(nft, {
          owner: seller,
          operator: operatorAddr,
          id: idNum,
        });
        batchOps.push({ kind: OpKind.TRANSACTION, ...updParams });
      }
      batchOps.push(...listParams);

      setOv({ open: true, label: !alreadyOp ? 'Authorizing & listing …' : 'Listing token …' });
      const op = await toolkit.wallet.batch(batchOps).send();
      await op.confirmation();

      setOv({ open: false, label: '' });
      snack('Listing created ✔', 'info');
      onClose();
    } catch (e) {
      setOv({ open: false, label: '' });
      snack(e?.message || 'Transaction failed', 'error');
    }
  }

  /*───────── render ─────────────────────────────────────────*/
  if (!open) return null;

  const amtLbl =
    listedEntries > 0
      ? ` | For Sale: ${listedCount} (${listedEntries} listing${listedEntries !== 1 ? 's' : ''})`
      : ` | For Sale: ${listedCount}`;

  const handleOverlayKey = (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') onClose();
  };

  return (
    <ModalOverlay onClick={onClose} role="button" tabIndex={0} onKeyDown={handleOverlayKey}>
      <ModalBox onClick={(e) => e.stopPropagation()} data-modal="list-token" role="presentation">
        <PixelHeading level={3}>List Token</PixelHeading>

        <Wrap>
          <label htmlFor="price">Price (ꜩ)</label>
          <PixelInput
            id="price"
            type="number"
            inputMode="decimal"
            step="0.000001"
            min="0"
            placeholder="e.g. 1.25"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Wrap>

        <Wrap>
          <label htmlFor="amount">Quantity (editions){amtLbl}</label>
          <PixelInput
            id="amount"
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            max={maxAmount}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Wrap>

        <Wrap>
          <PixelHeading level={5}>Sale Splits (optional)</PixelHeading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: '.5rem' }}>
            <PixelInput
              placeholder="tz1… address"
              value={newSplitAddr}
              onChange={(e) => setNewSplitAddr(e.target.value)}
            />
            <PixelInput
              placeholder="%"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="100"
              value={newSplitPct}
              onChange={(e) => setNewSplitPct(e.target.value)}
            />
            <PixelButton onClick={addSplit}>ADD</PixelButton>
          </div>
          {splits.length > 0 && (
            <ul style={{ marginTop: '.6rem' }}>
              {splits.map((s, i) => (
                <li key={`${s.address}-${i}`} style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
                  <code style={{ opacity: .9 }}>{s.address}</code>
                  <span style={{ opacity: .8 }}>{(s.percent / 100).toFixed(2)}%</span>
                  <PixelButton onClick={() => removeSplit(i)}>REMOVE</PixelButton>
                </li>
              ))}
            </ul>
          )}
        </Wrap>

        <Wrap style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-end' }}>
          <PixelButton onClick={onClose} aria-label="Cancel">CANCEL</PixelButton>
          <PixelButton onClick={handleList} disabled={disabled} aria-label="Create listing">
            LIST
          </PixelButton>
        </Wrap>

        {ov.open && (
          <OperationOverlay
            open={ov.open}
            onClose={() => setOv({ open: false, label: '' })}
            label={ov.label || 'Working…'}
          />
        )}
      </ModalBox>
    </ModalOverlay>
  );
}

ListTokenDialog.propTypes = {
  open: PropTypes.bool,
  contract: PropTypes.string,
  tokenId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose: PropTypes.func,
};

/* What changed & why: Add v2c to v2a whitelist+offline path to prevent FAILWITH. */
