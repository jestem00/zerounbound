/*Developed by @jams2blues – ZeroContract Studio
  File: src/ui/ContractMetaPanelContracts.jsx
  Rev : r7    2025‑10‑12
  Summary(of what this file does): Contract header card.  Preserves
           hazards/preview/addr logic, adds **theme‑aware** “For Sale”
           pill styling **and** restores interactivity: clicking the
           pill opens a popover listing unique token‑ids from
           `saleListings`; clicking an id calls `onPickTokenId(id)`. */

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import PropTypes                    from 'prop-types';
import styledPkg                    from 'styled-components';

import RenderMedia                  from '../utils/RenderMedia.jsx';
import { checkOnChainIntegrity }    from '../utils/onChainValidator.js';
import { getIntegrityInfo }         from '../constants/integrityBadges.js';
import detectHazards                from '../utils/hazards.js';
import useConsent                   from '../hooks/useConsent.js';
import IntegrityBadge               from './IntegrityBadge.jsx';
import PixelButton                  from './PixelButton.jsx';
import PixelConfirmDialog           from './PixelConfirmDialog.jsx';
import { shortKt, copyToClipboard, shortAddr } from '../utils/formatAddress.js';
import {
  EnableScriptsToggle,
  EnableScriptsOverlay,
} from './EnableScripts.jsx';
import decodeHexFields,{decodeHexJson} from '../utils/decodeHexFields.js';

// Domain resolver + network for reverse lookups
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';
import { NETWORK_KEY } from '../config/deployTarget.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helpers ───────────────────────────────────────────*/
const PLACEHOLDER = '/sprites/cover_default.svg';
const DATA_RE     = /^data:/i;
const ipfsToHttp  = (u='') => u.replace(/^ipfs:\/\//,'https://ipfs.io/ipfs/');

function toMetaObject(meta){
  if(!meta) return {};
  if(typeof meta==='string'){
    try{return decodeHexFields(JSON.parse(meta));}catch{/*ignore*/}
    const parsed=decodeHexJson(meta);
    if(parsed) return decodeHexFields(parsed);
    return {};
  }
  return decodeHexFields(meta);
}
function pickThumb(m={}){
  const uri=m.imageUri||m.thumbnailUri||m.displayUri||m.artifactUri||'';
  if(!uri) return '';
  return DATA_RE.test(uri)?uri:(uri.startsWith('ipfs://')?ipfsToHttp(uri):uri);
}

/*──────── styled shells ─────────────────────────────────────*/
const Card = styled.section`
  border:2px solid var(--zu-accent);background:var(--zu-bg);
  color:var(--zu-fg);display:flex;flex-direction:column;gap:10px;
  padding:12px;margin-bottom:20px;
  @media(min-width:720px){flex-direction:row;align-items:flex-start;}
`;
const ThumbBox = styled.div`
  flex:0 0 120px;width:120px;height:120px;border:2px solid var(--zu-fg);
  background:var(--zu-bg-dim);display:flex;align-items:center;justify-content:center;
  position:relative;
  img,video,model-viewer,object{width:100%;height:100%;object-fit:contain;}
`;
const Body = styled.div`
  flex:1 1 auto;display:flex;flex-direction:column;gap:6px;min-width:0;
`;
const TitleRow = styled.div`
  display:flex;flex-wrap:wrap;gap:6px;align-items:center;
  h2{margin:0;font-size:1rem;line-height:1.2;word-break:break-word;
     color:var(--zu-accent);}
  .badge{font-size:1.1rem;}
`;
const AddrRow = styled.div`
  font-size:.75rem;opacity:.8;display:flex;align-items:center;gap:6px;
  code{word-break:break-all;}button{padding:0 4px;font-size:.65rem;line-height:1;}
`;
const Desc   = styled.p`
  margin:6px 0 0;font-size:.8rem;line-height:1.35;white-space:pre-wrap;
`;

/* Stat row + theme‑aware, clickable For‑Sale pill */
const StatWrap = styled.div`
  position:relative; /* anchor popover */
`;
const StatRow= styled.div`
  display:flex;gap:10px;font-size:.8rem;flex-wrap:wrap;

  span{
    border:1px solid var(--zu-fg);
    padding:1px 6px;
    white-space:nowrap;
    display:inline-flex;
    align-items:center;
    line-height:1.2;
    border-radius:2px;
    background:transparent;
    color:var(--zu-fg);
  }
  /* Accented clickable pill for “For Sale”. Supports class .for-sale. */
  span.for-sale{
    cursor:pointer;
    background:var(--zu-accent);
    border-color:var(--zu-accent);
    color:var(--zu-btn-fg);
    text-shadow:0 1px 0 rgba(0,0,0,.35);
    user-select:none;
  }
  span.for-sale:hover{
    background:var(--zu-accent-hover);
    border-color:var(--zu-accent-hover);
  }
  span.for-sale:focus-visible{
    outline:3px dashed var(--zu-accent-hover);
    outline-offset:1px;
  }
`;

/* Lightweight popover of token‑ids */
const SalePopover = styled.div`
  position:absolute;
  top:calc(100% + 6px);
  right:0;
  z-index:40;
  min-width: 220px;
  max-height: 50vh;
  overflow:auto;
  background:var(--zu-bg);
  color:var(--zu-fg);
  border:2px solid var(--zu-accent);
  box-shadow:0 6px 18px rgba(0,0,0,.35);
  border-radius:2px;
  padding:8px;

  h4{ margin:0 0 6px; font-size:.85rem; color:var(--zu-heading); }
  ul{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:6px; }
  li{ margin:0; }
  button{
    width:100%;
    font:inherit;
    padding:4px 6px;
    border:1px solid var(--zu-accent);
    background:transparent;
    color:var(--zu-fg);
    cursor:pointer;
  }
  button:hover{ background:var(--zu-accent); color:var(--zu-btn-fg); }
`;

/*──────── component ───────────────────────────────────────*/
function ContractMetaPanelContracts({
  meta = {},
  contractAddress = '',
  stats = { tokens:'…', owners:'…', sales:'…' },
  saleListings = [],
  saleFallbackCount = 0,
  onPickTokenId = null,       // (id:string|number) => void
}) {
  const metaObj = useMemo(()=>toMetaObject(meta),[meta]);
  const hazards = detectHazards(metaObj);

  const [allowScr,setAllowScr] = useConsent(`scripts:${contractAddress}`,false);
  const [dlg,setDlg]           = useState(false);
  const [terms,setTerms]       = useState(false);

  const integrity  = useMemo(()=>checkOnChainIntegrity(metaObj),[metaObj]);
  const {label}    = useMemo(()=>getIntegrityInfo(integrity.status),[integrity.status]);

  const [thumbOk,setThumbOk] = useState(true);
  const thumb = pickThumb(metaObj);
  const showFallback = !thumbOk||!thumb;

  const copy = () => {copyToClipboard(contractAddress);};
  const askEnable = () => {setTerms(false);setDlg(true);};
  const enable = () => {if(!terms)return;setAllowScr(true);setDlg(false);};

  /* -------- address/domain helpers (unchanged baseline) -------- */
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
  const [showAllAdmins, setShowAllAdmins]   = useState(false);
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
        setDomains((prev) => {
          if (prev[key] !== undefined) return prev;
          return { ...prev, [key]: name };
        });
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

  const renderList = useCallback(
    (list, showAll, setShowAll, allowCopy) => {
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
                <a
                  href={`/explore?cmd=tokens&admin=${item}`}
                  style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'none', wordBreak: 'break-all' }}
                >
                  {formatted}
                </a>
                {allowCopy && (
                  <PixelButton
                    size="xs"
                    title="Copy address"
                    onClick={(e) => {
                      e.preventDefault(); e.stopPropagation(); copyToClipboard(item);
                    }}
                  >📋</PixelButton>
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
            …&nbsp;
            <button
              type="button"
              aria-label="Show all entries"
              onClick={(e) => { e.preventDefault(); setShowAll(true); }}
              style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
            >
              🔻More
            </button>
          </>,
        );
      }
      return elems;
    },
    [formatVal],
  );

  /* -------- for‑sale popover & handlers -------- */
  const forSaleBtnRef = useRef(null);
  const [openSale, setOpenSale] = useState(false);

  const listedIds = useMemo(() => {
    const set = new Set();
    for (const r of (saleListings || [])) {
      const id = Number(r?.tokenId ?? r?.token_id);
      if (Number.isFinite(id)) set.add(id);
    }
    return Array.from(set).sort((a,b)=>a-b);
  }, [saleListings]);

  const hasRealList = listedIds.length > 0;
  const hasOnlyCount = !hasRealList && Number(saleFallbackCount || 0) > 0;

  const toggleSale = useCallback((e) => {
    e.preventDefault();
    if (hasRealList) setOpenSale((v) => !v);
    else if (hasOnlyCount) {
      // No on‑chain list details available; nothing to show.
      // Keep the pill visually interactive but no popover.
      setOpenSale(false);
    }
  }, [hasRealList, hasOnlyCount]);

  const onKeyForSale = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSale(e); }
  }, [toggleSale]);

  useEffect(() => {
    if (!openSale) return;
    const onDoc = (ev) => {
      if (!forSaleBtnRef.current) return setOpenSale(false);
      if (!forSaleBtnRef.current.parentElement) return setOpenSale(false);
      const root = forSaleBtnRef.current.parentElement;
      if (!root.contains(ev.target)) setOpenSale(false);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('mousedown', onDoc, true);
      document.addEventListener('touchstart', onDoc, true);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('mousedown', onDoc, true);
        document.removeEventListener('touchstart', onDoc, true);
      }
    };
  }, [openSale]);

  const pickId = useCallback((id) => {
    if (typeof onPickTokenId === 'function') onPickTokenId(id);
    setOpenSale(false);
  }, [onPickTokenId]);

  /*──────── render ─────────────────────────────────────────*/
  return (
    <>
      <Card>
        <ThumbBox>
          {hazards.scripts&&(
            <span style={{position:'absolute',top:4,left:4,zIndex:4}}>
              <EnableScriptsToggle
                enabled={allowScr}
                onToggle={allowScr?()=>setAllowScr(false):askEnable}
              />
            </span>
          )}

          {showFallback?(
            <img src={PLACEHOLDER} alt="preview"/>
          ):(
            <RenderMedia
              uri={thumb}
              alt={metaObj.name}
              allowScripts={hazards.scripts&&allowScr}
              onInvalid={()=>setThumbOk(false)}
            />
          )}

          {hazards.scripts&&!allowScr&&(
            <EnableScriptsOverlay onAccept={askEnable}/>
          )}
        </ThumbBox>

        <Body>
          <TitleRow>
            <h2>{metaObj.name||'Untitled Collection'}</h2>
            <span className="badge" title={label}><IntegrityBadge status={integrity.status}/></span>
          </TitleRow>

          <AddrRow>
            <code title={contractAddress}>
              {shortKt(contractAddress)}
              {verLabel ? ` (${verLabel})` : ''}
            </code>
            <PixelButton size="xs" onClick={copy}>📋</PixelButton>
          </AddrRow>

          {/* admin row with domain resolution and copy buttons */}
          {adminArr.length > 0 && (
            <AddrRow>
              <span>Admin:&nbsp;</span>
              {renderList(adminArr, showAllAdmins, setShowAllAdmins, true)}
            </AddrRow>
          )}

          {metaObj.symbol && (
            <p style={{ fontSize: '.75rem', margin: '0 0 2px' }}>
              <strong>Symbol</strong>: {metaObj.symbol}
            </p>
          )}
          {metaObj.version && (
            <p style={{ fontSize: '.75rem', margin: '0 0 2px' }}>
              <strong>Version</strong>: {metaObj.version}
            </p>
          )}
          {metaObj.type && (
            <p style={{ fontSize: '.75rem', margin: '0 0 2px' }}>
              <strong>Type</strong>: {metaObj.type}
            </p>
          )}
          {metaObj.license && (
            <p style={{ fontSize: '.75rem', margin: '0 0 2px' }}>
              <strong>License</strong>: {metaObj.license}
            </p>
          )}
          {metaObj.homepage && (
            <p style={{ fontSize: '.75rem', margin: '0 0 2px' }}>
              <strong>Homepage</strong>:&nbsp;
              {/^https?:\/\//i.test(metaObj.homepage) ? (
                <a href={metaObj.homepage} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'underline' }}>
                  {metaObj.homepage}
                </a>
              ) : (
                metaObj.homepage
              )}
            </p>
          )}

          {/* creator list (authors suppressed) */}
          {creatorsArr.length > 0 && (
            <p style={{ fontSize: '.75rem', margin: '0 0 2px' }}>
              <strong>Creator(s)</strong>:&nbsp;
              {renderList(creatorsArr, showAllCreators, setShowAllCreators, false)}
            </p>
          )}

          {metaObj.description && <Desc>{metaObj.description}</Desc>}

          {/* Stats row + interactive “For Sale” pill */}
          <StatWrap>
            <StatRow>
              <span>{stats.tokens} Tokens</span>
              <span>{stats.owners} Owners</span>
              <span
                ref={forSaleBtnRef}
                className="for-sale"
                role="button"
                tabIndex={0}
                aria-haspopup={hasRealList ? 'menu' : undefined}
                aria-expanded={openSale ? 'true' : 'false'}
                onClick={toggleSale}
                onKeyDown={onKeyForSale}
                title={hasRealList ? 'Show listed token‑ids' : 'For‑sale count'}
              >
                {stats.sales} For Sale
              </span>
            </StatRow>

            {openSale && hasRealList && (
              <SalePopover>
                <h4>{listedIds.length} Token‑ID{listedIds.length>1?'s':''} for sale</h4>
                <ul>
                  {listedIds.map((id) => (
                    <li key={id}>
                      <button type="button" onClick={() => pickId(id)}>
                        Token‑ID&nbsp;{id}
                      </button>
                    </li>
                  ))}
                </ul>
              </SalePopover>
            )}
          </StatWrap>
        </Body>
      </Card>

      {dlg&&(
        <PixelConfirmDialog
          open
          title="Enable scripts?"
          message={(
            <>
              <label style={{display:'flex',gap:'6px',alignItems:'center',marginBottom:'8px'}}>
                <input type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)}/>
                I&nbsp;agree&nbsp;to&nbsp;<a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
              Executable code can be harmful. Proceed only if you trust the author.
            </>
          )}
          confirmLabel="OK"
          cancelLabel="Cancel"
          confirmDisabled={!terms}
          onConfirm={enable}
          onCancel={()=>setDlg(false)}
        />
      )}
    </>
  );
}

ContractMetaPanelContracts.propTypes = {
  meta:PropTypes.oneOfType([PropTypes.object,PropTypes.string]),
  contractAddress:PropTypes.string.isRequired,
  stats:PropTypes.shape({
    tokens:PropTypes.oneOfType([PropTypes.number,PropTypes.string]),
    owners:PropTypes.oneOfType([PropTypes.number,PropTypes.string]),
    sales :PropTypes.oneOfType([PropTypes.number,PropTypes.string]),
  }),
  /* New interactive props */
  saleListings: PropTypes.array,            // normalized listings from marketplace view
  saleFallbackCount: PropTypes.number,      // count only (when listings unavailable)
  onPickTokenId: PropTypes.func,            // called with tokenId when a user clicks one
};

export default ContractMetaPanelContracts;

/* What changed & why (r7):
   • Restored click behaviour for “For Sale”: added a theme‑matched
     popover listing unique token‑ids from saleListings; clicking an
     id calls onPickTokenId(id) in the page to filter the grid.
   • Kept the contrast‑safe pill styling and all existing metadata/
     hazard logic intact.  Fixed duplicate default‑export issue by
     ensuring a single default export.
   • Built on the prior r5 baseline of this component for structural
     parity.  :contentReference[oaicite:3]{index=3} */
// EOF
