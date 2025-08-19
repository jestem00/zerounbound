/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ListTokenDialog.jsx
  Rev :    r981  2025‑08‑19
  Summary: Restore single‑signature listing (operator+listing batch);
           pass sellerAddress to builder; add pre‑flight operator toast;
           preserve guardrails, metrics & royalty auto‑fill. */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styledPkg from 'styled-components';

import PixelHeading     from './PixelHeading.jsx';
import PixelInput       from './PixelInput.jsx';
import PixelButton      from './PixelButton.jsx';
import OperationOverlay from './OperationOverlay.jsx';

import { useWallet } from '../contexts/WalletContext.js';
import {
  buildListParams,
  getFa2BalanceViaTzkt,
  fetchOnchainListingsForSeller,
  hasOperatorForId,
  getMarketContract,
} from '../core/marketplace.js';
import { jFetch } from '../core/net.js';
import { TZKT_API } from '../config/deployTarget.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*───────────────────────────────────────────────────────────────
  Styled shells — pixel aesthetic, compact, and scroll‑safe
───────────────────────────────────────────────────────────────*/
const Backdrop = styled.div`
  position: fixed; inset: 0; z-index: 2300;
  background: rgba(0,0,0,.86);
  display: flex; align-items: flex-start; justify-content: center;
  overflow: auto;
`;
const Panel = styled.section`
  --bg: var(--zu-bg, #0b0b0b);
  --fg: var(--zu-fg, #e8e8e8);
  --bd: var(--zu-fg, #e8e8e8);
  width: min(1040px, 96vw);
  margin: calc(var(--hdr, 0px) + 12px) auto 16px;
  max-height: calc(100vh - (var(--hdr, 0px) + 28px));
  overflow: auto;
  background: var(--bg);
  color: var(--fg);
  border: 2px solid var(--bd);
  box-shadow: 0 0 0 2px #000, 8px 8px 0 0 #000;
  padding: .9rem 1rem .9rem;
  font-family: 'PixeloidSans', monospace;
  font-size: .92rem;
`;
const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(320px, 1fr);
  gap: .75rem .75rem;
  align-items: start;
  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;
const Row = styled.div`
  display: grid;
  grid-template-columns: 8.6rem 1fr;
  gap: .5rem;
  align-items: center;
  @media (max-width: 560px) { grid-template-columns: 1fr; }
`;
const Line = styled.hr`
  grid-column: 1 / -1;
  margin: .55rem 0;
  border: none;
  height: 2px; background: currentColor; opacity: .35;
`;
const Help = styled.p`
  grid-column: 1 / -1;
  font-size: .8rem;
  margin: .2rem 0 .55rem;
  opacity: .82;
`;
const FieldNote = styled.p`
  margin: .28rem 0 0;
  font-size: .78rem;
  color: ${({ $warn }) => ($warn ? 'var(--zu-accent-sec, #ff2d2d)' : 'var(--zu-fg, #e8e8e8)')};
  opacity: ${({ $warn }) => ($warn ? 1 : .78)};
`;
const Actions = styled.div`
  display:flex; gap:.5rem; justify-content:flex-end; margin-top:.75rem; flex-wrap:wrap;
`;
const Badge = styled.span`
  display:inline-block; min-width: 1.6rem; padding: .05rem .28rem;
  border: 2px solid var(--zu-fg); background: var(--zu-bg);
  text-align:center; font-size:.76rem; user-select:none;
`;
const Meter = styled.div`
  display: grid; grid-template-columns: auto 1fr auto 1fr auto 1fr auto 1fr;
  gap: .45rem .9rem; align-items: center;
  font-size: .86rem; line-height: 1.22;
  padding: .45rem .45rem .45rem 0;
  border: 2px dashed rgba(255,255,255,.25);
`;
const Mono = styled.code`
  font-family: 'PixeloidMono', monospace;
  word-break: break-all;
`;

/*───────────────────────────────────────────────────────────────
  Utilities & parsers
───────────────────────────────────────────────────────────────*/
const TZKTv1 = (() => {
  const base = String(TZKT_API || 'https://api.tzkt.io').replace(/\/+$/, '');
  return `${base}/v1`;
})();
const isTz = (s = '') =>
  /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/.test(s) ||
  /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(s);
const toMutez = (x) => Math.round(Number(x || 0) * 1_000_000);
function startDelayFromInput(dtValue) {
  if (!dtValue) return 0;
  const ms = Date.parse(dtValue);
  if (!Number.isFinite(ms)) return 0;
  const delta = Math.floor((ms - Date.now()) / 1000);
  return Math.max(0, delta);
}
function hexToString(hex = '') {
  const clean = (hex.startsWith('0x') ? hex.slice(2) : hex).replace(/[^0-9a-f]/gi, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 2) {
    const c = parseInt(clean.substr(i, 2), 16);
    if (!Number.isNaN(c)) out += String.fromCharCode(c);
  }
  return out;
}
function royaltiesFromMetadata(meta) {
  if (!meta || typeof meta !== 'object') return [];
  const r = meta.royalties || meta.Royalties || meta.creator_royalties || null;
  if (!r || typeof r !== 'object') return [];
  const shares = r.shares || r.Shares || r.recipients || null;
  const dec    = Number(r.decimals ?? r.Decimals ?? 2);
  if (shares && typeof shares === 'object') {
    const out = [];
    for (const [addr, vRaw] of Object.entries(shares)) {
      const val = Number(vRaw);
      if (!Number.isFinite(val) || !isTz(addr)) continue;
      const fraction = val / (10 ** dec);
      const bps = Math.round(fraction * 10_000);
      if (bps > 0) out.push({ address: addr, bps });
    }
    return out;
  }
  if (Array.isArray(r)) {
    return r.map((x) => {
      if (!x) return null;
      const addr = x.address || x.recipient;
      let bps = Number(x.bps ?? x.bp ?? x.share ?? x.shares ?? x.percent ?? 0);
      if (!Number.isFinite(bps) || bps <= 0) return null;
      if (bps <= 25) bps = Math.round(bps * 100);
      return (isTz(addr) && bps > 0) ? { address: addr, bps } : null;
    }).filter(Boolean);
  }
  return [];
}
async function fetchRoyaltiesViaTzktTokens(contract, tokenId) {
  try {
    const qs = new URLSearchParams({
      contract: contract,
      tokenId: String(tokenId),
      select: 'metadata',
      limit: '1',
    });
    const arr = await jFetch(`${TZKTv1}/tokens?${qs.toString()}`, 1).catch(() => []);
    const meta = Array.isArray(arr) ? arr[0] : null;
    return royaltiesFromMetadata(meta || {}) || [];
  } catch { return []; }
}
async function fetchRoyaltiesViaBigmap(contract, tokenId) {
  try {
    const maps = await jFetch(`${TZKTv1}/contracts/${contract}/bigmaps`);
    const meta = Array.isArray(maps) ? maps.find((m) => m.path === 'token_metadata') : null;
    const mapId = meta?.ptr ?? meta?.id ?? null;
    if (mapId == null) return [];
    const row = await jFetch(`${TZKTv1}/bigmaps/${mapId}/keys/${tokenId}`).catch(() => null);
    const ti  = row?.value?.token_info || null;
    if (!ti || typeof ti !== 'object') return [];
    const royHex = ti.royalties ?? ti.Royalties ?? ti.creator_royalties ?? null;
    if (!royHex || typeof royHex !== 'string') return [];
    const json = hexToString(royHex);
    try {
      const parsed = JSON.parse(json);
      return royaltiesFromMetadata({ royalties: parsed });
    } catch { return []; }
  } catch { return []; }
}
async function fetchRoyaltiesAllWays({ tokenMeta, contract, tokenId }) {
  let splits = royaltiesFromMetadata(tokenMeta || {});
  if (splits?.length) return splits;
  splits = await fetchRoyaltiesViaTzktTokens(contract, tokenId);
  if (splits?.length) return splits;
  splits = await fetchRoyaltiesViaBigmap(contract, tokenId);
  return splits || [];
}

/*───────────────────────────────────────────────────────────────
  Component
───────────────────────────────────────────────────────────────*/
export default function ListTokenDialog(props) {
  const {
    open = false,
    onClose = () => {},
    tokenId,
    tokenMeta = null,
    defaultPriceTez = '',
    nftContract: nftContractProp,
    contract: contractProp,
  } = props;

  const nftContract = nftContractProp || contractProp;
  const { toolkit, address: walletAddr, isWalletConnected } = useWallet() || {};

  // Form state
  const [price, setPrice]       = useState(String(defaultPriceTez || ''));
  const [qty, setQty]           = useState(1);

  // Sale Split editor
  const [saleAddr, setSaleAddr] = useState('');
  const [salePct, setSalePct]   = useState('');
  const [saleSplits, setSaleSplits] = useState([]); // [{address,bps}]

  // Royalty Split editor
  const [royAddr, setRoyAddr]   = useState('');
  const [royPct, setRoyPct]     = useState('');
  const [roySplits, setRoySplits] = useState([]);   // [{address,bps}]
  const [royAutofilled, setRoyAutofilled] = useState(false);

  // Start time
  const [startAt, setStartAt]   = useState('');

  // Metrics
  const [decimals, setDecimals]     = useState(0);
  const [ownedEditions, setOwnedEd] = useState(null);
  const [listedEd, setListedEd]     = useState(0);
  const [availableEd, setAvailEd]   = useState(0);

  // Overlay & busy
  const [busy, setBusy] = useState(false);
  const [ovr, setOvr]   = useState({ show: false, msg: '', err: '' });

  /*──────────── Decimals + balances + listings snapshot ────────────*/
  const getDecimals = useCallback(async (contract, id) => {
    try {
      const maps = await jFetch(`${TZKTv1}/contracts/${contract}/bigmaps`);
      const meta = Array.isArray(maps) ? maps.find((m) => m.path === 'token_metadata') : null;
      const mapId = meta?.ptr ?? meta?.id ?? null;
      if (mapId == null) return 0;
      const dat = await jFetch(`${TZKTv1}/bigmaps/${mapId}/keys/${id}`);
      const ds = hexToString(dat?.value?.token_info?.decimals ?? '');
      const n  = parseInt(ds, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch { return 0; }
  }, []);

  const refreshMetrics = useCallback(async () => {
    if (!isTz(nftContract) || tokenId == null || !walletAddr) return;

    const dec = await getDecimals(nftContract, tokenId);
    setDecimals(dec);

    // Owned balance (raw units → editions)
    let bal = 0;
    try {
      const raw = await getFa2BalanceViaTzkt(walletAddr, nftContract, tokenId);
      bal = Number(raw || 0);
    } catch { bal = 0; }
    const owned = dec > 0 ? Math.floor(bal / (10 ** dec)) : bal;
    setOwnedEd(owned);

    // Listed on ZeroSum by this seller (editions)
    let listed = 0;
    try {
      const rows = await fetchOnchainListingsForSeller({ toolkit, seller: walletAddr })
        .catch(() => []);
      if (Array.isArray(rows) && rows.length) {
        const mine = rows.filter((r) =>
          String(r.token_id ?? r.tokenId) === String(tokenId) &&
          String(r.nft_contract ?? r.contract ?? r.fa2) === String(nftContract) &&
          (r.active ?? r.isActive ?? true));
        listed = mine.reduce((t, l) => {
          const amt = Number(l.amount ?? 0);
          return t + (dec > 0 ? Math.floor(amt / (10 ** dec)) : amt);
        }, 0);
      }
    } catch { listed = 0; }
    setListedEd(listed);

    // Available editions
    setAvailEd(Math.max(owned - listed, 0));
  }, [walletAddr, nftContract, tokenId, toolkit, getDecimals]);

  useEffect(() => {
    if (!open || !walletAddr) return;
    let cancel = false;
    (async () => { if (!cancel) await refreshMetrics(); })();

    const id = setInterval(() => { refreshMetrics(); }, 20_000);
    const onFocus = () => refreshMetrics();
    window.addEventListener('focus', onFocus);

    return () => { cancel = true; clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [open, walletAddr, refreshMetrics]);

  /*──────────── First‑open Royalty Auto‑fill ────────────*/
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!open || royAutofilled || !isTz(nftContract) || tokenId == null) return;
      const splits = await fetchRoyaltiesAllWays({ tokenMeta, contract: nftContract, tokenId });
      if (!cancel && splits && splits.length) {
        setRoySplits(splits);
        setRoyAutofilled(true);
      }
    })();
    return () => { cancel = true; };
  }, [open, tokenMeta, nftContract, tokenId, royAutofilled]);

  const handleAutofillRoyalties = useCallback(async () => {
    const splits = await fetchRoyaltiesAllWays({ tokenMeta, contract: nftContract, tokenId });
    if (splits && splits.length) {
      setRoySplits(splits);
      setRoyAutofilled(true);
      window.dispatchEvent(new CustomEvent('zu:snackbar', {
        detail: { message: 'Royalties loaded from metadata (editable).', severity: 'info' },
      }));
    } else {
      window.dispatchEvent(new CustomEvent('zu:snackbar', {
        detail: { message: 'No royalties found in token metadata.', severity: 'warning' },
      }));
    }
  }, [tokenMeta, nftContract, tokenId]);

  /*──────────── Split row helpers (Sale / Royalty) ────────────*/
  const addSaleSplit = useCallback(() => {
    const addr = saleAddr.trim();
    const pct  = Number(salePct);
    if (!isTz(addr) || !Number.isFinite(pct) || pct <= 0) {
      window.dispatchEvent(new CustomEvent('zu:snackbar', {
        detail: { message: 'Enter a valid sale recipient & percent.', severity: 'error' },
      }));
      return;
    }
    const next = [...saleSplits, { address: addr, bps: Math.round(pct * 100) }];
    const totalPct = next.reduce((t, s) => t + (s.bps / 100), 0);
    if (totalPct > 100) {
      window.dispatchEvent(new CustomEvent('zu:snackbar', {
        detail: { message: 'Sale split total cannot exceed 100%.', severity: 'error' },
      }));
      return;
    }
    setSaleSplits(next);
    setSaleAddr(''); setSalePct('');
  }, [saleAddr, salePct, saleSplits]);

  const rmSaleSplit = (i) => setSaleSplits(saleSplits.filter((_, idx) => idx !== i));

  const addRoySplit = useCallback(() => {
    const addr = royAddr.trim();
    const pct  = Number(royPct);
    if (!isTz(addr) || !Number.isFinite(pct) || pct <= 0) {
      window.dispatchEvent(new CustomEvent('zu:snackbar', {
        detail: { message: 'Enter a valid royalty recipient & percent.', severity: 'error' },
      }));
      return;
    }
    const next = [...roySplits, { address: addr, bps: Math.round(pct * 100) }];
    const totalPct = next.reduce((t, s) => t + (s.bps / 100), 0);
    if (totalPct > 25) {
      window.dispatchEvent(new CustomEvent('zu:snackbar', {
        detail: { message: 'Royalties cannot exceed 25% total.', severity: 'error' },
      }));
      return;
    }
    setRoySplits(next);
    setRoyAddr(''); setRoyPct('');
  }, [royAddr, royPct, roySplits]);

  const rmRoySplit = (i) => setRoySplits(roySplits.filter((_, idx) => idx !== i));

  /*──────────── Derived totals & validators ────────────*/
  const saleTotalPct = useMemo(() =>
    saleSplits.reduce((t, s) => t + (s.bps / 100), 0),
  [saleSplits]);

  const royTotalPct = useMemo(() =>
    roySplits.reduce((t, s) => t + (s.bps / 100), 0),
  [roySplits]);

  // Start-time helpers
  const startDelaySeconds = useMemo(() => startDelayFromInput(startAt), [startAt]);
  const startHint = useMemo(() => {
    if (!startAt) return null;
    const ms = Date.parse(startAt);
    if (!Number.isFinite(ms)) return null;
    if (ms < Date.now()) return 'Start time is in the past → will list immediately.';
    const secs = Math.floor((ms - Date.now()) / 1000);
    if (secs > 0 && secs < 60) return 'Start time is <60s ahead — chain time can cause immediate listing.';
    return null;
  }, [startAt]);

  const reasons = useMemo(() => {
    const errs = [];
    if (!isWalletConnected) errs.push('Connect wallet to continue.');
    if (!isTz(nftContract)) errs.push('Invalid contract address.');
    if (!Number.isFinite(Number(tokenId))) errs.push('Invalid token id.');
    const P = Number(price);
    if (!Number.isFinite(P) || P <= 0) errs.push('Enter a valid price in ꜩ.');
    const Q = Number(qty);
    if (!Number.isInteger(Q) || Q <= 0) errs.push('Quantity must be a positive integer.');
    if (availableEd != null && Number.isInteger(Q) && Q > availableEd) {
      errs.push(`Quantity exceeds available to list (${availableEd}).`);
    }
    if (saleTotalPct > 100) errs.push('Sale split total cannot exceed 100%.');
    if (royTotalPct > 25) errs.push('Royalty split total cannot exceed 25%.');
    return errs;
  }, [isWalletConnected, nftContract, tokenId, price, qty, availableEd, saleTotalPct, royTotalPct]);

  const canSubmit = reasons.length === 0;

  // Compose final sale splits: seller receives the remainder to 100% (UI view only)
  const saleSplitsWithRemainder = useMemo(() => {
    const base = Array.isArray(saleSplits) ? [...saleSplits] : [];
    const used = base.reduce((t, s) => t + s.bps, 0);
    const remainderBps = Math.max(0, 10_000 - used);
    if (remainderBps > 0 && isTz(walletAddr)) {
      base.push({ address: walletAddr, bps: remainderBps });
    }
    return base;
  }, [saleSplits, walletAddr]);

  /*──────────── Submit (single‑signature batch) ────────────*/
  const handleList = useCallback(async () => {
    if (!canSubmit) return;
    try {
      setBusy(true);
      setOvr({ show: true, msg: 'Building list operation…', err: '' });

      const dec = Number(decimals) || 0;
      const amountUnits = dec > 0 ? Number(qty) * (10 ** dec) : Number(qty);

      // Pre‑flight: if already operator, tell the user (clarity)
      try {
        const market   = await getMarketContract(toolkit);
        const already  = await hasOperatorForId({
          nftContract,
          owner   : walletAddr,
          operator: market.address,
          tokenId,
        });
        window.dispatchEvent(new CustomEvent('zu:snackbar', {
          detail: {
            message: already
              ? 'Marketplace already authorized for this token — skipping approval.'
              : 'Authorizing marketplace for this token + creating listing…',
            severity: 'info',
          },
        }));
      } catch { /* non‑fatal UX nicety */ }

      // Builder handles signature variants & injects update_operators when needed.
      const params = await buildListParams(toolkit, {
        nftContract,
        tokenId,
        priceMutez: toMutez(price),
        amount: amountUnits,
        saleSplits: saleSplitsWithRemainder, // [{address,bps}] — builder normalizes
        royaltySplits: roySplits,            // [{address,bps}] — builder normalizes
        startDelay: startDelaySeconds,
        offline_balance: true,               // safe: builder tries with/without
        sellerAddress: walletAddr,           // enables operator‑ensure in batch
      });

      setOvr({ show: true, msg: 'Awaiting wallet signature…', err: '' });
      const op = await toolkit.wallet.batch(params).send();

      setOvr({ show: true, msg: 'Waiting for confirmation…', err: '' });
      await op.confirmation(1);

      setOvr({ show: true, msg: 'Success', err: '', opHash: op.opHash });
    } catch (e) {
      const msg = String(e?.message || e) || 'Unknown error';
      setOvr({ show: true, msg, err: 'error' });
    } finally {
      setBusy(false);
    }
  }, [
    canSubmit, toolkit, nftContract, tokenId, price, qty,
    saleSplitsWithRemainder, roySplits, startDelaySeconds, decimals, walletAddr,
  ]);

  const close = useCallback(() => {
    setOvr({ show: false, msg: '', err: '' });
    onClose?.();
  }, [onClose]);

  /*──────────── Render ────────────*/
  if (!open) return null;

  return (
    <>
      <Backdrop role="dialog" aria-modal="true" aria-label="List token dialog">
        <Panel onClick={(e) => e.stopPropagation()}>
          <PixelHeading level={2} style={{ margin: '.15rem 0 .45rem' }}>
            List Token for Sale
          </PixelHeading>

          {/* Metrics banner */}
          <Meter style={{ marginBottom: '.75rem' }}>
            <strong>Owned:</strong>
            <span>{ownedEditions == null ? '—' : `${ownedEditions}`}</span>
            <strong>Listed (ZeroSum):</strong>
            <span>{listedEd}</span>
            <strong>Available:</strong>
            <span>{availableEd}</span>
            <strong>Decimals:</strong>
            <span>{decimals}</span>
          </Meter>
          <Help>
            <em>Owned</em> is your live FA2 balance. <em>Listed</em> shows your active ZeroSum
            listings. <em>Available</em> = Owned − Listed (ZeroSum). External markets will be
            subtracted once configured. Values refresh automatically.
          </Help>

          <Grid>
            {/* Price & quantity */}
            <Row>
              <label htmlFor="price"><Badge>Price</Badge></label>
              <div>
                <PixelInput
                  id="price"
                  type="number"
                  min="0"
                  step="0.000001"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                <FieldNote>Enter price per edition in ꜩ.</FieldNote>
              </div>
            </Row>

            <Row>
              <label htmlFor="qty"><Badge>Quantity</Badge></label>
              <div>
                <PixelInput
                  id="qty"
                  type="number"
                  min="1"
                  step="1"
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))}
                />
                <FieldNote>
                  You can list up to <strong>{availableEd}</strong> editions now.
                </FieldNote>
              </div>
            </Row>

            <Line />

            {/* Sale split editor */}
            <Row style={{ alignItems: 'start' }}>
              <label><Badge>Sale Split</Badge></label>
              <div>
                <Help style={{ marginTop: 0 }}>
                  Optional: route a portion of sale proceeds to others. Seller remainder is
                  calculated automatically to total <strong>100%</strong>.
                </Help>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 5.6rem auto', gap: '.42rem' }}>
                  <PixelInput
                    placeholder="tz1… or KT1… (recipient)"
                    value={saleAddr}
                    onChange={(e) => setSaleAddr(e.target.value)}
                  />
                  <PixelInput
                    placeholder="%"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max="100"
                    value={salePct}
                    onChange={(e) => setSalePct(e.target.value)}
                  />
                  <PixelButton onClick={addSaleSplit}>ADD</PixelButton>
                </div>

                {saleSplits.length > 0 && (
                  <ul style={{ marginTop: '.45rem' }}>
                    {saleSplits.map((s, i) => (
                      <li key={`${s.address}-${i}`} style={{ display: 'flex', gap: '.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Mono>{s.address}</Mono>
                        <span>{(s.bps / 100).toFixed(2)}%</span>
                        <PixelButton size="xs" onClick={() => rmSaleSplit(i)}>REMOVE</PixelButton>
                      </li>
                    ))}
                  </ul>
                )}

                <FieldNote>
                  Seller <Mono>{walletAddr || '—'}</Mono> will automatically receive
                  the remainder to <strong>100%</strong>. Current explicit total:&nbsp;
                  <strong>{saleTotalPct.toFixed(2)}%</strong>.
                </FieldNote>
              </div>
            </Row>

            {/* Royalty split editor */}
            <Row style={{ alignItems: 'start' }}>
              <label><Badge>Royalty Split</Badge></label>
              <div>
                <Help style={{ marginTop: 0, display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  Review and edit royalties from Artwork Metadata. Max total <strong>25%</strong>.
                  <PixelButton
                    onClick={handleAutofillRoyalties}
                    title="Auto‑fill from token metadata (editable)"
                    size="xs"
                  >
                    AUTO‑FILL FROM METADATA
                  </PixelButton>
                </Help>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 5.6rem auto', gap: '.42rem' }}>
                  <PixelInput
                    placeholder="tz1… or KT1… (recipient)"
                    value={royAddr}
                    onChange={(e) => setRoyAddr(e.target.value)}
                  />
                  <PixelInput
                    placeholder="%"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max="25"
                    value={royPct}
                    onChange={(e) => setRoyPct(e.target.value)}
                  />
                  <PixelButton onClick={addRoySplit}>ADD</PixelButton>
                </div>

                {roySplits.length > 0 && (
                  <ul style={{ marginTop: '.45rem' }}>
                    {roySplits.map((s, i) => (
                      <li key={`${s.address}-${i}`} style={{ display: 'flex', gap: '.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Mono>{s.address}</Mono>
                        <span>{(s.bps / 100).toFixed(2)}%</span>
                        <PixelButton size="xs" onClick={() => rmRoySplit(i)}>REMOVE</PixelButton>
                      </li>
                    ))}
                  </ul>
                )}

                <FieldNote>
                  Total royalties: <strong>{royTotalPct.toFixed(2)}%</strong>
                  {' '} (remaining headroom: <strong>{(25 - royTotalPct).toFixed(2)}%</strong>).
                </FieldNote>
              </div>
            </Row>

            <Line />

            {/* Start time */}
            <Row>
              <label htmlFor="start"><Badge>Start Time</Badge></label>
              <div>
                <PixelInput
                  id="start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
                <FieldNote>
                  Optional. Leave empty for immediate listing. Future times schedule a delayed start.
                  <br />
                  <em>Format:</em> <strong>YYYY‑MM‑DD — HH:MM</strong> (24‑hour, your local time).
                </FieldNote>
                {startHint && (
                  <FieldNote $warn style={{ marginTop: '.25rem' }}>{startHint}</FieldNote>
                )}
              </div>
            </Row>
          </Grid>

          {reasons.length > 0 && (
            <FieldNote $warn style={{ marginTop: '.75rem' }}>
              {reasons.join(' · ')}
            </FieldNote>
          )}

          <Actions>
            <PixelButton onClick={close} $noActiveFx>Cancel</PixelButton>
            <PixelButton
              onClick={handleList}
              disabled={!canSubmit || busy}
              title="List token for sale"
            >
              List
            </PixelButton>
          </Actions>
        </Panel>
      </Backdrop>

      {ovr.show && (
        <OperationOverlay
          status={ovr.msg}
          error={ovr.err}
          opHash={ovr.opHash}
          onCancel={close}
        />
      )}
    </>
  );
}

/* What changed & why:
   • Restored single‑signature listing (adds update_operators in the
     batch when needed) by passing sellerAddress to builder.
   • Added small UX toast to show when operator is already present.
   • Kept validations, metrics & royalty auto‑fill intact. */
// EOF
