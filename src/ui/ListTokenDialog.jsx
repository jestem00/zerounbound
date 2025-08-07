/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ListTokenDialog.jsx
  Rev :    r45    2025‑08‑06
  Summary: add v2a offline‑balance guard and dual‑marketplace
           support. Detects v2a via hashMatrix using TzKT typeHash,
           checks TzKT balances, sets offline_balance flag and routes
           write calls to the new marketplace instance.
────────────────────────────────────────────────────────────*/

import React, { useState, useEffect } from 'react';
import PropTypes                      from 'prop-types';
import styledPkg                      from 'styled-components';

import PixelHeading   from './PixelHeading.jsx';
import PixelInput     from './PixelInput.jsx';
import PixelButton    from './PixelButton.jsx';
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

import { URL_OBJKT_TOKENS_BASE, TZKT_API, MARKETPLACE_ADDRESS } from '../config/deployTarget.js';
import { Tzip16Module } from '@taquito/tzip16';

/* styled‑components handle */
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*───────── styled shells ───────────────────────────────────*/
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
const Wrap = styled.section`margin-top:1.4rem;`;

/*───────── helpers ─────────────────────────────────────────*/
function hexToString(hex = '') {
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    const c = parseInt(hex.substr(i, 2), 16);
    if (!Number.isNaN(c)) out += String.fromCharCode(c);
  }
  return out;
}

/*──────────────────────────────────────────────────────────*/
export default function ListTokenDialog({
  open,
  contract,
  tokenId,
  onClose = () => {},
}) {
  const { toolkit } = useWalletContext() || {};

  const [price, setPrice]                 = useState('');
  const [amount, setAmount]               = useState('1');
  const [maxAmount, setMaxAmount]         = useState(1);
  const [listedCount, setListedCount]     = useState(0);
  const [listedEntries, setListedEntries] = useState(0);
  const [ov, setOv]                       = useState({ open: false, label: '' });
  const [resolvedTokenId, setResolvedTokenId] = useState(null);

  /* sale‑split state */
  const [splits, setSplits]               = useState([]);
  const [newSplitAddr, setNewSplitAddr]   = useState('');
  const [newSplitPct, setNewSplitPct]     = useState('');

  /* unsupported → non‑FA2 only */
  const [isUnsupported, setIsUnsupported] = useState(false);

  const objktUrl =
    contract && tokenId != null
      ? `${URL_OBJKT_TOKENS_BASE}${contract}/${tokenId}`
      : '';

  const snack = (msg, sev = 'info') =>
    window.dispatchEvent(
      new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }),
    );

  /*───────── sale‑splits add/remove ───────────────────────*/
  function addSplit() {
    const addr = newSplitAddr.trim();
    const pct  = parseFloat(newSplitPct);
    if (!addr || !Number.isFinite(pct) || pct <= 0) {
      snack('Enter valid address & percent', 'error');
      return;
    }
    const basis = Math.floor(pct * 100);
    const total = splits.reduce((t, s) => t + s.percent, 0) + basis;
    if (total >= 10000) {
      snack('Total splits must be < 100 %', 'error');
      return;
    }
    setSplits([...splits, { address: addr, percent: basis }]);
    setNewSplitAddr(''); setNewSplitPct('');
  }
  const removeSplit = (i) => setSplits(splits.filter((_, idx) => idx !== i));

  /*───────── decimals cache ───────────────────────────────*/
  const decCache = {};
  async function getDec(id) {
    const k = String(id);
    if (decCache[k] != null) return decCache[k];
    let d = 0;
    try {
      if (!toolkit || !contract) return 0;
      const tzkt =
        /ghostnet|limanet/i.test(toolkit.rpc.getRpcUrl?.() ?? '')
          ? 'https://api.ghostnet.tzkt.io'
          : 'https://api.tzkt.io';
      const maps = await (await fetch(`${tzkt}/v1/contracts/${contract}/bigmaps`)).json();
      const meta = maps.find((m) => m.path === 'token_metadata');
      if (meta) {
        const mapId = meta.ptr ?? meta.id;
        const dat   = await (await fetch(`${tzkt}/v1/bigmaps/${mapId}/keys/${id}`)).json();
        const ds    = hexToString(dat?.value?.token_info?.decimals ?? '');
        const n     = parseInt(ds, 10);
        if (Number.isFinite(n) && n >= 0) d = n;
      }
    } catch { /* ignore */ }
    decCache[k] = d;
    return d;
  }


  /*───────── version detection (FA2 test) ─────────────────*/
  useEffect(() => {
    (async () => {
      if (!open || !toolkit || !contract) return;
      try {
        const eps = Object.keys(
          (await toolkit.contract.at(contract)).entrypoints.entrypoints || {},
        );
        setIsUnsupported(!eps.includes('update_operators'));
      } catch {
        setIsUnsupported(false);
      }
    })();
  }, [open, toolkit, contract]);

  /*───────── balance + listing counts ─────────────────────*/
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!open || !toolkit || !contract || tokenId == null) return;

      setMaxAmount(1); setAmount('1'); setListedCount(0); setListedEntries(0); setResolvedTokenId(Number(tokenId));

      const idNum = Number(tokenId);
      let owned   = 0;
      let resolvedId = idNum;

      try {
        const pkh = await toolkit.wallet.pkh();
        toolkit.addExtension?.(new Tzip16Module());
        const nft = await toolkit.contract.at(contract);

        /* preferred off‑chain views */
        try {
          const res = await nft.views
            ?.balance_of?.([{ owner: pkh, token_id: idNum }]).read();
          owned = Number(res?.[0]?.balance ?? 0);
        } catch {
          try {
            const res2 = await nft.views
              ?.get_balance?.({ owner: pkh, token_id: idNum }).read();
            owned = typeof res2 === 'object'
              ? Number(Object.values(res2)[0])
              : Number(res2);
          } catch { /* ignore */ }
        }

        /* direct ledger fallback – v2a */
        if (owned === 0) {
          const bal = await getLedgerBalanceV2a({
            tzktBase: TZKT_API,
            contract,
            tokenId: idNum,
            owner: pkh,
          });
          owned = bal;
        }

        /* TzKT balances fallback */
        if (owned === 0) {
          const tzkt =
            /ghostnet|limanet/i.test(toolkit.rpc.getRpcUrl?.() ?? '')
              ? 'https://api.ghostnet.tzkt.io'
              : 'https://api.tzkt.io';
          const u = `${tzkt}/v1/tokens/balances?account=${pkh}&token.contract=${contract}&token.tokenId=${idNum}`;
          const resp = await fetch(u);
          if (resp.ok) {
            const arr = await resp.json();
            if (Array.isArray(arr) && arr.length) owned = Number(arr[0].balance);
          }
        }
      } catch { /* ignore */ }

      if (!cancel) { setMaxAmount(owned); setResolvedTokenId(resolvedId); }

      /* listing counts */
      try {
        const listingId = resolvedId;
        let arr = await fetchOnchainListings({ toolkit, nftContract: contract, tokenId: listingId })
          .catch(() => []);
        if (!arr.length)
          arr = await fetchListings({ toolkit, nftContract: contract, tokenId: listingId })
            .catch(() => []);
        const dec   = await getDec(listingId);
        const total = arr.reduce(
          (t, l) => t + (dec > 0 ? Math.floor(l.amount / 10 ** dec) : Number(l.amount)),
          0,
        );
        if (!cancel) { setListedCount(total); setListedEntries(arr.length); }
      } catch { /* ignore */ }
    })();
    return () => { cancel = true; };
  }, [open, toolkit, contract, tokenId]);

  /* reset on close */
  useEffect(() => {
    if (!open) {
      setPrice(''); setAmount('1'); setOv({ open: false, label: '' });
    }
  }, [open]);

  const amtNum   = Number(amount);
  const priceNum = parseFloat(price);
  const disabled =
    !toolkit || priceNum <= 0 || amtNum <= 0 || amtNum > maxAmount || !Number.isFinite(priceNum);

  /*───────── list click ───────────────────────────────────*/
  async function handleList() {
    /* detect v2a via TzKT typeHash */
    let isV2a = false;
    try {
      const info = await (await fetch(`${TZKT_API}/v1/contracts/${contract}`)).json();
      const tHash = info?.typeHash ?? info?.type_hash;
      if (tHash !== undefined) isV2a = hashMatrix[String(tHash)] === 'v2a';
    } catch {
      /* ignore fetch errors */
    }
    if (isUnsupported) {
      snack('Unsupported contract – redirecting to Objkt…', 'warning');
      objktUrl && window.open(objktUrl, '_blank');
      return;
    }
    const p = parseFloat(price);
    const q = parseInt(amount, 10);
    if (p <= 0 || q <= 0 || q > maxAmount) {
      snack('Check price & quantity', 'error'); return;
    }
    try {
      const listId = resolvedTokenId ?? Number(tokenId);

      /* v2a guard — offline balance check and checklist */
      let offline_balance = false;
      if (isV2a) {
        const bal = await getLedgerBalanceV2a({
          tzktBase: TZKT_API,
          contract,
          tokenId: listId,
          owner: await toolkit.wallet.pkh(),
        });
        if (bal < q) {
          snack('Insufficient editions held (offline check)', 'error');
          return;
        }
        try {
          const store = await (await fetch(`${TZKT_API}/v1/contracts/${MARKETPLACE_ADDRESS}/storage`)).json();
          const cl = Array.isArray(store?.checklist) ? store.checklist : [];
          if (!cl.map((a) => a.toLowerCase()).includes(contract.toLowerCase())) {
            snack('Collection not whitelisted on marketplace', 'error');
            return;
          }
        } catch {
          snack('Checklist verification failed', 'error');
          return;
        }
        offline_balance = true;
      }

      await submitTx(q, Math.floor(p * 1_000_000), offline_balance);
    } catch (e) {
      snack(e.message || 'Build error', 'error');
    }
  }

  /*───────── tx submit ────────────────────────────────────*/
  async function submitTx(qEditions, priceMutez, offline_balance) {
    try {
      setOv({ open: true, label: 'Preparing listing …' });

      const seller = await toolkit.wallet.pkh();
      const nft    = await toolkit.wallet.at(contract);
      const market = await getMarketContract(toolkit, { write: true });
      const opAddr = market.address;

      const upd = (id, rev = false) =>
        nft.methods.update_operators([{
          add_operator: rev
            ? { operator: opAddr, owner: seller, token_id: id }
            : { owner: seller, operator: opAddr, token_id: id },
        }]);

      const hasOperator = async (id) => {
        try {
          const tzkt =
            /ghostnet|limanet/i.test(toolkit.rpc.getRpcUrl?.() ?? '')
              ? 'https://api.ghostnet.tzkt.io'
              : 'https://api.tzkt.io';
          const maps = await (
            await fetch(`${tzkt}/v1/contracts/${contract}/bigmaps`)
          ).json();
          const opMap = maps.find((m) => m.path === 'operators');
          if (!opMap) return false;
          const keys = await (
            await fetch(`${tzkt}/v1/bigmaps/${opMap.ptr ?? opMap.id}/keys?limit=256`)
          ).json();
          return keys.some(
            (k) =>
              k.key?.owner === seller &&
              k.key?.operator === opAddr &&
              Number(k.key.token_id) === id,
          );
        } catch { return false; }
      };

      const saleSplits = (() => {
        if (!splits.length) return [{ address: seller, percent: 10000 }];
        const used = splits.reduce((t, s) => t + s.percent, 0);
        return used < 10000
          ? [...splits, { address: seller, percent: 10000 - used }]
          : splits;
      })();

      const listOnly = async (id, qtyUnits) => {
        const params = await buildListParams(toolkit, {
          nftContract   : contract,
          tokenId       : id,
          /* bool precedes price to match builder signature          */
          offline_balance,
          priceMutez,
          amount        : qtyUnits,
          saleSplits,
          royaltySplits : [],
          startDelay    : 0,
        });
        setOv({ open: true, label: 'Listing token …' });
        const op = await toolkit.wallet.batch(params).send();
        await op.confirmation();
      };

      const updateAndList = async (id, qtyUnits) => {
        if (!(await hasOperator(id))) {
          setOv({ open: true, label: 'Granting operator …' });
          try { await (await upd(id).send()).confirmation(2); }
          catch { await (await upd(id, true).send()).confirmation(2); }
        }
        await listOnly(id, qtyUnits);
      };

      const idNum    = resolvedTokenId ?? Number(tokenId);
      const dec      = await getDec(idNum);
      const qtyUnits = dec > 0 ? qEditions * 10 ** dec : qEditions;

      await updateAndList(idNum, qtyUnits);

      setOv({ open: false, label: '' });
      snack('Listing created ✔', 'info'); onClose();
    } catch (e) {
      setOv({ open: false, label: '' });
      snack(e.message || 'Transaction failed', 'error');
    }
  }

  /*───────── render ───────────────────────────────────────*/
  if (!open) return null;

  const amtLbl =
    listedEntries > 0
      ? ` | For Sale: ${listedCount} (${listedEntries} listing${listedEntries !== 1 ? 's' : ''})`
      : ` | For Sale: ${listedCount}`;

  const handleOverlayKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') onClose();
  };

  return (
    <ModalOverlay onClick={onClose} role="button" tabIndex={0} onKeyDown={handleOverlayKey}>
      <ModalBox onClick={(e) => e.stopPropagation()} data-modal="list-token" role="presentation">
        <Wrap>
          <PixelHeading level={3}>List Token</PixelHeading>

          <p style={{ fontSize: '.75rem', marginBottom: '.2rem', opacity: 0.9 }}>
            Price (ꜩ)
          </p>
          <PixelInput placeholder="0.0" value={price} onChange={(e) => setPrice(e.target.value)} />

          <p style={{ fontSize: '.75rem', margin: '0.6rem 0 .2rem', opacity: 0.9 }}>
            Quantity (max {maxAmount})
          </p>
          <PixelInput
            type="number" min={1} max={maxAmount} step={1}
            disabled={maxAmount <= 0} value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <p style={{ fontSize: '.75rem', margin: '0.6rem 0 .2rem', opacity: 0.9 }}>
            Sale Splits (optional)
          </p>
          <PixelInput
            placeholder="Recipient tz‑address"
            value={newSplitAddr}
            onChange={(e) => setNewSplitAddr(e.target.value)}
          />
          <PixelInput
            placeholder="Percent (e.g. 10)"
            type="number" min={0} max={100} step={0.01}
            value={newSplitPct}
            onChange={(e) => setNewSplitPct(e.target.value)}
          />
          <PixelButton onClick={addSplit} disabled={!newSplitAddr || !newSplitPct}>
            ADD SPLIT
          </PixelButton>

          {splits.map((s, i) => (
            <p key={i} style={{ fontSize: '.7rem', marginTop: '.1rem', opacity: 0.9,
              display: 'flex', alignItems: 'center' }}>
              <span style={{ flexGrow: 1 }}>
                {s.address}: {(s.percent / 100).toFixed(2)}%
              </span>
              <PixelButton style={{ flexShrink: 0 }} onClick={() => removeSplit(i)}>✕</PixelButton>
            </p>
          ))}

          <p style={{ fontSize: '.7rem', marginTop: '.3rem', opacity: 0.8 }}>
            Owned: {maxAmount}{amtLbl}
          </p>

          {isUnsupported ? (
            <>
              <p style={{ fontSize: '.75rem', margin: '0.6rem 0 .2rem', opacity: 0.85 }}>
                Unsupported contract. List on Objkt:
              </p>
              <PixelButton disabled={!objktUrl} onClick={() => objktUrl && window.open(objktUrl, '_blank')}>
                LIST ON OBJKT
              </PixelButton>
            </>
          ) : (
            <PixelButton disabled={disabled} onClick={handleList}>
              LIST TOKEN
            </PixelButton>
          )}

          {ov.open && (
            <OperationOverlay
              label={ov.label}
              onClose={() => setOv({ open: false, label: '' })}
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

/* What changed & why:
   • r43 – Added dual‑marketplace support and v2a offline‑balance guard.
     – Detect v2a via hashMatrix and verify TzKT balance.
     – Pass offline_balance flag to buildListParams and route
       writes through MARKETPLACE_WRITE_ADDRESS. */
/* EOF */