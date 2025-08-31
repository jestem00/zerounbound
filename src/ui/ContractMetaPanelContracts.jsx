/*
  Developed by @jams2blues â€“ ZeroContract Studio
  File: src/ui/ContractMetaPanelContracts.jsx
  Rev : r7+ 2025-08-31
  Summary: Contract header card. Preserves preview/hazard/domain logic and
           adds a For Sale popover that lists token IDs with a tiny preview
           and the cheapest price per token (êœ©), sorted cheapest-first.
*/

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';

import RenderMedia from '../utils/RenderMedia.jsx';
import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import { getIntegrityInfo } from '../constants/integrityBadges.js';
import detectHazards from '../utils/hazards.js';
import useConsent from '../hooks/useConsent.js';
import IntegrityBadge from './IntegrityBadge.jsx';
import PixelButton from './PixelButton.jsx';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';
import { shortKt, copyToClipboard, shortAddr } from '../utils/formatAddress.js';
import { EnableScriptsToggle, EnableScriptsOverlay } from './EnableScripts.jsx';
import decodeHexFields, { decodeHexJson } from '../utils/decodeHexFields.js';
import BuyDialog from './BuyDialog.jsx';
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';
import { NETWORK_KEY, TZKT_API } from '../config/deployTarget.js';
import { formatMutez } from '../utils/formatTez.js';
import { fetchListings } from '../core/marketplace.js';
import { useWalletContext } from '../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

// helpers
const PLACEHOLDER = '/sprites/cover_default.svg';
const DATA_RE = /^data:/i;
const ipfsToHttp = (u = '') => u.replace(/^ipfs:\/\//, 'https://ipfs.io/ipfs/');

function toMetaObject(meta) {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try { return decodeHexFields(JSON.parse(meta)); } catch {}
    const parsed = decodeHexJson(meta);
    if (parsed) return decodeHexFields(parsed);
    return {};
  }
  return decodeHexFields(meta);
}
function pickThumb(m = {}) {
  const uri = m.imageUri || m.thumbnailUri || m.displayUri || m.artifactUri || '';
  if (!uri) return '';
  return DATA_RE.test(uri) ? uri : (uri.startsWith('ipfs://') ? ipfsToHttp(uri) : uri);
}

// styled shells
const Card = styled.section`
  border:2px solid var(--zu-accent);
  background:var(--zu-bg);
  color:var(--zu-fg);
  display:flex; flex-direction:column; gap:10px;
  padding:12px; margin-bottom:20px;
  @media (min-width: 720px) { flex-direction:row; align-items:flex-start; }
`;
const ThumbBox = styled.div`
  flex:0 0 120px; width:120px; height:120px; border:2px solid var(--zu-fg);
  background:var(--zu-bg-dim); display:flex; align-items:center; justify-content:center;
  position:relative;
  img,video,model-viewer,object{ width:100%; height:100%; object-fit:contain; }
  img,canvas{ image-rendering: pixelated; }
`;
const Body = styled.div` flex:1 1 auto; display:flex; flex-direction:column; gap:6px; min-width:0; `;
const TitleRow = styled.div`
  display:flex; flex-wrap:wrap; gap:6px; align-items:center;
  h2{ margin:0; font-size:1rem; line-height:1.2; word-break:break-word; color:var(--zu-accent); }
  .badge{ font-size:1.1rem; }
`;
const AddrRow = styled.div`
  font-size:.75rem; opacity:.8; display:flex; align-items:center; gap:6px;
  code{ word-break: break-all; }
  button{ padding:0 4px; font-size:.65rem; line-height:1; }
`;
const Desc = styled.p` margin:6px 0 0; font-size:.8rem; line-height:1.35; white-space:pre-wrap; `;

const StatWrap = styled.div` position:relative; `;
const StatRow = styled.div`
  display:flex; gap:10px; font-size:.8rem; flex-wrap:wrap;
  span{
    border:1px solid var(--zu-fg);
    padding:1px 6px; white-space:nowrap; display:inline-flex; align-items:center; line-height:1.2; border-radius:2px;
    background:transparent; color:var(--zu-fg);
  }
  span.for-sale{
    cursor:pointer; background:var(--zu-accent); border-color:var(--zu-accent); color:var(--zu-btn-fg);
    text-shadow:0 1px 0 rgba(0,0,0,.35); user-select:none;
  }
  span.for-sale:hover{ background:var(--zu-accent-hover); border-color:var(--zu-accent-hover); }
  span.for-sale:focus-visible{ outline:3px dashed var(--zu-accent-hover); outline-offset:1px; }
`;

// Back-compat small popover
const SalePopover = styled.div`
  position:absolute; z-index:40;
  min-width:260px; max-height:60vh; overflow:auto;
  background:var(--zu-bg); color:var(--zu-fg);
  border:2px solid var(--zu-accent); box-shadow:0 6px 18px rgba(0,0,0,.35); border-radius:2px; padding:8px;
  h4{ margin:0 0 6px; font-size:.85rem; color:var(--zu-heading); }
  ul{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
  li{ margin:0; }
`;

const SaleItemRow = styled.div`
  width:100%; font:inherit; padding:4px 6px; border:1px solid var(--zu-accent); background:transparent;
  color:var(--zu-fg); cursor:pointer; display:grid; grid-template-columns:18px 1fr; grid-template-rows:auto auto;
  grid-template-areas:'ico title' 'ico price'; column-gap:6px; row-gap:2px; align-items:center; text-align:left;
  &:hover{ background:var(--zu-accent); color:var(--zu-btn-fg); }
  .ico{ grid-area:ico; width:18px; height:18px; border:1px solid currentColor; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .ico img{ width:100%; height:100%; object-fit:cover; image-rendering:pixelated; }
  .title{ grid-area:title; font-size:.72rem; line-height:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .price{ grid-area:price; font-size:.68rem; opacity:.9; white-space:nowrap; }
  .actions{ grid-column: 1 / -1; display:flex; gap:6px; margin-top:2px; }
  .actions button{ font-size:.6rem; padding:2px 4px; }
`;

function ContractMetaPanelContracts({
  meta = {},
  contractAddress = '',
  stats = { tokens: 'â€¦', owners: 'â€¦', sales: 'â€¦' },
  saleListings = [],
  saleFallbackCount = 0,
  onPickTokenId = null,       // (id: string|number) => void
  tokens = [],                // optional tokens for preview lookup
}) {
  const metaObj = useMemo(() => toMetaObject(meta), [meta]);
  const hazards = detectHazards(metaObj);

  const [allowScr, setAllowScr] = useConsent(`scripts:${contractAddress}`, false);
  const [dlg, setDlg] = useState(false);
  const [terms, setTerms] = useState(false);

  const integrity = useMemo(() => checkOnChainIntegrity(metaObj), [metaObj]);
  const { label } = useMemo(() => getIntegrityInfo(integrity.status), [integrity.status]);

  const [thumbOk, setThumbOk] = useState(true);
  const thumb = pickThumb(metaObj);
  const showFallback = !thumbOk || !thumb;

  const copy = () => { copyToClipboard(contractAddress); };
  const askEnable = () => { setTerms(false); setDlg(true); };
  const enable = () => { if (!terms) return; setAllowScr(true); setDlg(false); };

  // address/domain helpers
  const parseField = useCallback((field) => {
    if (!field) return [];
    if (Array.isArray(field)) return field.map((x) => String(x).trim()).filter(Boolean);
    if (typeof field === 'string') return field.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean);
    if (typeof field === 'object') return Object.values(field).map((s) => String(s).trim()).filter(Boolean);
    return [];
  }, []);

  const authorsArr = useMemo(() => [], []);
  const adminArr   = useMemo(() => parseField(metaObj.authoraddress), [metaObj.authoraddress, parseField]);
  const creatorsArr= useMemo(() => parseField(metaObj.creators), [metaObj.creators, parseField]);

  const [domains, setDomains] = useState({});
  const [showAllAdmins, setShowAllAdmins] = useState(false);
  const [showAllCreators, setShowAllCreators] = useState(false);

  const verLabel = useMemo(() => {
    const ver = String(metaObj.version || '').trim();
    if (!ver) return '';
    const lower = ver.toLowerCase();
    const prefix = 'zerocontract';
    const idx = lower.indexOf(prefix);
    if (idx >= 0) {
      const suffix = lower.slice(idx + prefix.length);
      const trimmed = suffix.replace(/^v?/i, '');
      return `v${trimmed}`;
    }
    return '';
  }, [metaObj.version]);

  useEffect(() => {
    const addrs = new Set();
    [...authorsArr, ...adminArr, ...creatorsArr].forEach((val) => {
      if (!val || typeof val !== 'string') return;
      const v = val.trim();
      if (/^(tz|kt)/i.test(v)) addrs.add(v);
    });
    addrs.forEach((addr) => {
      const key = addr.toLowerCase();
      if (domains[key] !== undefined) return;
      (async () => {
        const name = await resolveTezosDomain(addr, NETWORK_KEY);
        setDomains((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: name }));
      })();
    });
  }, [authorsArr, adminArr, creatorsArr]);

  const formatVal = useCallback((val) => {
    if (!val || typeof val !== 'string') return String(val || '');
    const v = val.trim();
    const key = v.toLowerCase();
    const dom = domains[key];
    if (dom) return dom;
    if (v.includes('.')) return v;
    return shortAddr(v);
  }, [domains]);

  const renderList = useCallback((list, showAll, setShowAll, allowCopy) => {
    const display = showAll ? list : list.slice(0, 3);
    const elems = [];
    display.forEach((item, idx) => {
      const prefix = idx > 0 ? ', ' : '';
      const formatted = formatVal(item);
      const isAddr = typeof item === 'string' && /^(tz|kt)/i.test(item.trim());
      elems.push(
        <React.Fragment key={`${item}-${idx}`}>
          {prefix}
          {isAddr ? (
            <>
              <a href={`/explore?cmd=tokens&admin=${item}`} style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'none', wordBreak: 'break-all' }}>{formatted}</a>
              {allowCopy && (
                <PixelButton size="xs" title="Copy address" onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyToClipboard(item); }}>ðŸ“‹</PixelButton>
              )}
            </>
          ) : (
            <span style={{ wordBreak: 'break-all' }}>{formatted}</span>
          )}
        </React.Fragment>,
      );
    });
    if (list.length > 3 && !showAll) {
      elems.push(
        <>
          â€¦&nbsp;
          <button type="button" aria-label="Show all entries" onClick={(e) => { e.preventDefault(); setShowAll(true); }} style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}>
            More
          </button>
        </>,
      );
    }
    return elems;
  }, [formatVal]);

  // for-sale popover & handlers
  const saleWrapRef = useRef(null);
  const forSaleBtnRef = useRef(null);
  const salePopoverRef = useRef(null);
  const [openSale, setOpenSale] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 24;
  const [popoverPos, setPopoverPos] = useState({ left: 0, top: 0 });

  // cheapest price per id
  const idMinPrice = useMemo(() => {
    const map = new Map();
    for (const r of (saleListings || [])) {
      const id = Number(r?.tokenId ?? r?.token_id);
      const p  = Number(r?.priceMutez ?? r?.price);
      if (!Number.isFinite(id) || !Number.isFinite(p)) continue;
      const prev = map.get(id);
      if (prev == null || p < prev) map.set(id, p);
    }
    return map;
  }, [saleListings]);

  const listedIds = useMemo(() => {
    const arr = Array.from(idMinPrice.keys());
    arr.sort((a,b) => {
      const pa = idMinPrice.get(a) ?? Infinity;
      const pb = idMinPrice.get(b) ?? Infinity;
      if (pa !== pb) return pa - pb; return a - b;
    });
    return arr;
  }, [idMinPrice]);
  // pagination derived from listedIds (ensure listedIds defined before usage)
  const totalPages = useMemo(() => Math.max(1, Math.ceil((listedIds?.length || 0) / perPage)), [listedIds, perPage]);
  const pagedIds = useMemo(() => (listedIds || []).slice(page * perPage, page * perPage + perPage), [listedIds, page, perPage]);
  useEffect(() => { setPage((p) => Math.min(p, Math.max(0, totalPages - 1))); }, [totalPages]);

  const hasRealList = listedIds.length > 0;
  const hasOnlyCount = !hasRealList && Number(saleFallbackCount || 0) > 0;

  const toggleSale = useCallback((e) => {
    e.preventDefault();
    if (hasRealList) setOpenSale((v) => !v);
    else if (hasOnlyCount) setOpenSale(false);
  }, [hasRealList, hasOnlyCount]);

  const onKeyForSale = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSale(e); }
  }, [toggleSale]);

  // Position the popover under the trigger and handle outside-click
  const positionPopover = useCallback(() => {
    if (!openSale) return;
    const btn  = forSaleBtnRef.current;
    const wrap = saleWrapRef.current;
    const pop  = salePopoverRef.current;
    if (!btn || !wrap) return;
    const b = btn.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    let left = b.left - w.left;
    let top  = b.bottom - w.top + 6;
    if (pop) {
      const p = pop.getBoundingClientRect();
      left = b.left + (b.width / 2) - (p.width / 2) - w.left;
      left = Math.max(0, Math.min(left, Math.max(0, w.width - p.width)));
    }
    setPopoverPos({ left, top });
  }, [openSale]);

  useEffect(() => {
    if (!openSale) return;
    positionPopover();
    const onWin = () => positionPopover();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    // one more frame after mount to get final size
    const raf = requestAnimationFrame(positionPopover);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [openSale, positionPopover]);

  useEffect(() => {
    if (!openSale) return;
    const onDoc = (ev) => {
      const root = saleWrapRef.current; if (!root) { setOpenSale(false); return; }
      if (!root.contains(ev.target)) setOpenSale(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('touchstart', onDoc, true);
    return () => {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('touchstart', onDoc, true);
    };
  }, [openSale]);

  const pickId = useCallback((id) => {
    if (typeof onPickTokenId === 'function') onPickTokenId(id);
    setOpenSale(false);
  }, [onPickTokenId]);

  // Best listing per token (for BUY)
  const bestById = useMemo(() => {
    const m = new Map();
    for (const r of (saleListings || [])) {
      const id = Number(r?.tokenId ?? r?.token_id);
      const p  = Number(r?.priceMutez ?? r?.price);
      if (!Number.isFinite(id) || !Number.isFinite(p)) continue;
      const prev = m.get(id);
      if (!prev || p < prev.priceMutez) m.set(id, { tokenId: id, priceMutez: p, seller: r?.seller, nonce: r?.nonce, amount: r?.amount });
    }
    return m;
  }, [saleListings]);
  const [buy, setBuy] = useState(null);
  const ensureListingWithNonce = useCallback(async (id) => {
    const cur = bestById.get(id);
    if (cur && cur.nonce != null && cur.seller) return cur;
    try {
      const arr = await fetchListings({ nftContract: String(contractAddress), tokenId: Number(id) });
      if (Array.isArray(arr) && arr.length) {
        const best = arr.reduce((m, r) => (m == null || Number(r.priceMutez) < Number(m.priceMutez) ? r : m), null);
        if (best && (best.tokenId == null || Number.isNaN(Number(best.tokenId)))) best.tokenId = Number(id); // enrich
        return best || cur || null;
      }
    } catch {}
    return cur || null;
  }, [bestById, contractAddress]);

  // thumbnails for popover items (tokens prop first, TzKT fallback)
  const [previews, setPreviews] = useState({});
  const previewFromTokens = useCallback((id) => {
    const row = Array.isArray(tokens) ? tokens.find((t) => Number(t.tokenId) === Number(id)) : null;
    if (!row) return '';
    const md = row.metadata || {};
    const u  = md.imageUri || md.thumbnailUri || md.displayUri || md.artifactUri || '';
    if (!u) return '';
    return /^data:/i.test(u) ? u : ipfsToHttp(String(u));
  }, [tokens]);

  useEffect(() => {
    if (!openSale) return;
    const missing = listedIds.filter((id) => !previews[id]);
    const fill = {};
    for (const id of missing) { const u = previewFromTokens(id); if (u) fill[id] = u; }
    if (Object.keys(fill).length) setPreviews((prev) => ({ ...prev, ...fill }));
    const need = missing.filter((id) => !fill[id]);
    if (need.length === 0) return;
    (async () => {
      try {
        const base = `${String(TZKT_API || '').replace(/\/+$/, '')}/v1`;
        const idsQ = need.join(',');
        const url  = `${base}/tokens?contract=${encodeURIComponent(contractAddress)}&tokenId.in=${encodeURIComponent(idsQ)}&select=metadata,tokenId&limit=${need.length}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const arr = await res.json();
        const add = {};
        for (const row of arr || []) {
          const md = typeof row?.metadata === 'string' ? (decodeHexJson(row.metadata) || {}) : (row?.metadata || {});
          const meta = decodeHexFields(md);
          const u = meta.imageUri || meta.thumbnailUri || meta.displayUri || meta.artifactUri || '';
          const id = Number(row?.tokenId);
          if (!u || !Number.isFinite(id)) continue;
          add[id] = /^data:/i.test(u) ? u : ipfsToHttp(String(u));
        }
        if (Object.keys(add).length) setPreviews((prev) => ({ ...prev, ...add }));
      } catch {}
    })();
  }, [openSale, listedIds, contractAddress, previewFromTokens]);

  const { address: walletAddr } = useWalletContext() || {};

  // render
  return (
    <>
      <Card>
        <ThumbBox>
          {hazards.scripts && (
            <span style={{ position: 'absolute', top: 4, left: 4, zIndex: 4 }}>
              <EnableScriptsToggle enabled={allowScr} onToggle={allowScr ? () => setAllowScr(false) : askEnable} />
            </span>
          )}

          {showFallback ? (
            <img src={PLACEHOLDER} alt="preview" />
          ) : (
            <RenderMedia uri={thumb} alt={metaObj.name} allowScripts={hazards.scripts && allowScr} onInvalid={() => setThumbOk(false)} />
          )}

          {hazards.scripts && !allowScr && (
            <EnableScriptsOverlay onAccept={askEnable} />
          )}
        </ThumbBox>

        <Body>
          <TitleRow>
            <h2>{metaObj.name || 'Untitled Collection'}</h2>
            <span className="badge" title={label}><IntegrityBadge status={integrity.status} /></span>
          </TitleRow>

          <AddrRow>
            <code title={contractAddress}>{shortKt(contractAddress)}{verLabel ? ` (${verLabel})` : ''}</code>
            <PixelButton size="xs" onClick={copy}>ðŸ“‹</PixelButton>
          </AddrRow>

          {adminArr.length > 0 && (
            <AddrRow>
              <span>Admin:&nbsp;</span>
              {renderList(adminArr, showAllAdmins, setShowAllAdmins, true)}
            </AddrRow>
          )}

          {metaObj.symbol && (<p style={{ fontSize: '.75rem', margin: '0 0 2px' }}><strong>Symbol</strong>: {metaObj.symbol}</p>)}
          {metaObj.version && (<p style={{ fontSize: '.75rem', margin: '0 0 2px' }}><strong>Version</strong>: {metaObj.version}</p>)}
          {metaObj.type && (<p style={{ fontSize: '.75rem', margin: '0 0 2px' }}><strong>Type</strong>: {metaObj.type}</p>)}
          {metaObj.license && (<p style={{ fontSize: '.75rem', margin: '0 0 2px' }}><strong>License</strong>: {metaObj.license}</p>)}
          {metaObj.homepage && (
            <p style={{ fontSize: '.75rem', margin: '0 0 2px' }}>
              <strong>Homepage</strong>:&nbsp;
              {/^https?:\/\//i.test(metaObj.homepage)
                ? <a href={metaObj.homepage} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'underline' }}>{metaObj.homepage}</a>
                : metaObj.homepage}
            </p>
          )}

          {creatorsArr.length > 0 && (
            <p style={{ fontSize: '.75rem', margin: '0 0 2px' }}>
              <strong>Creator(s)</strong>:&nbsp;{renderList(creatorsArr, showAllCreators, setShowAllCreators, false)}
            </p>
          )}

          {metaObj.description && <Desc>{metaObj.description}</Desc>}

          <StatWrap ref={saleWrapRef}>
            <StatRow>
              <span>{stats.tokens} Tokens</span>
              <span>{stats.owners} Owners</span>
              <span
                ref={forSaleBtnRef}
                className="for-sale"
                role="button"
                tabIndex={0}
                aria-haspopup={hasRealList ? 'menu' : undefined}
                aria-expanded={openSale ? 'true' : 'false'}
                onClick={toggleSale}
                onKeyDown={onKeyForSale}
                title={hasRealList ? 'Show listed token-ids' : 'For-sale count'}
              >
                {stats.sales} For Sale
              </span>
            </StatRow>

            {openSale && hasRealList && (
              <SalePopover
                ref={salePopoverRef}
                style={{ left: `${popoverPos.left}px`, top: `${popoverPos.top}px` }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <h4>{listedIds.length} Token-IDs for sale</h4>
                <ul>
                  {pagedIds.map((id) => {
                    const price = idMinPrice.get(id);
                    const pStr  = Number.isFinite(price) ? `${formatMutez(price)} ꜩ` : '';
                    const prev  = previews[id] || PLACEHOLDER;
                    const bestLite = bestById.get(id);
                    const isSeller = !!(walletAddr && bestLite?.seller && walletAddr.toLowerCase() === String(bestLite.seller).toLowerCase());
                    return (
                      <li key={id}>
                        <SaleItemRow
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickId(id); } }}
                          onClick={() => pickId(id)}
                        >
                          <span className="ico" aria-hidden>
                            <img src={prev || PLACEHOLDER} alt="" />
                          </span>
                          <span className="title">Token-ID&nbsp;{id}</span>
                          <span className="price">{pStr}</span>
                          <div className="actions">
                            <PixelButton
                              size="xs"
                              disabled={isSeller}
                              title={isSeller ? 'You are the seller' : 'Buy this token'}
                              onClick={(e) => {
                                e.stopPropagation();
                                (async () => {
                                  const best = await ensureListingWithNonce(id);
                                  if (best && best.nonce != null && best.seller) setBuy({ ...best, tokenId: Number(id) });
                                  else {
                                    try { window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: 'Could not resolve listing details for BUY', severity: 'error' } })); } catch {}
                                  }
                                })();
                              }}
                            >
                              BUY
                            </PixelButton>
                            <a href={`/tokens/${encodeURIComponent(contractAddress)}/${encodeURIComponent(String(id))}`} onClick={(e)=> e.stopPropagation()} style={{ textDecoration:'none' }}>
                              <PixelButton size="xs">VIEW</PixelButton>
                            </a>
                          </div>
                        </SaleItemRow>
                      </li>
                    );
                  })}
                </ul>
                {totalPages > 1 && (
                  <div style={{ display:'flex', justifyContent:'center', gap:'6px', marginTop:'8px' }}>
                    <PixelButton size="xs" disabled={page<=0} onClick={()=> setPage((p)=> Math.max(0,p-1))}>PREV</PixelButton>
                    <span style={{ fontSize:'.75rem' }}>Page {page+1} / {totalPages}</span>
                    <PixelButton size="xs" disabled={page>=totalPages-1} onClick={()=> setPage((p)=> Math.min(totalPages-1,p+1))}>NEXT</PixelButton>
                  </div>
                )}
              </SalePopover>
            )}
          </StatWrap>
        </Body>
      </Card>

      {dlg && (
        <PixelConfirmDialog
          open
          title="Enable scripts?"
          message={(
            <>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                I agree to <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
              Executable code can be harmful. Proceed only if you trust the author.
            </>
          )}
          confirmLabel="OK"
          cancelLabel="Cancel"
          confirmDisabled={!terms}
          onConfirm={enable}
          onCancel={() => setDlg(false)}
        />
      )}

      {buy && (
        <BuyDialog
          open
          contract={contractAddress}
          tokenId={buy.tokenId}
          priceMutez={buy.priceMutez}
          seller={buy.seller}
          nonce={buy.nonce}
          onClose={() => setBuy(null)}
        />
      )}
    </>
  );
}

ContractMetaPanelContracts.propTypes = {
  meta: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
  contractAddress: PropTypes.string.isRequired,
  stats: PropTypes.shape({
    tokens: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    owners: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    sales : PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }),
  saleListings: PropTypes.array,
  saleFallbackCount: PropTypes.number,
  onPickTokenId: PropTypes.func,
  tokens: PropTypes.array,
};

export default ContractMetaPanelContracts;






