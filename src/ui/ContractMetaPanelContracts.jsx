/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ContractMetaPanelContracts.jsx
  Rev :    r7    2025‑08‑27
  Summary(of what this file does): Contract header panel with
           integrity badge, admin/creator display, copyable KT1,
           and a **clickable For‑Sale list** fed by on‑chain view.
           The “For Sale” pill is now theme‑correct & readable.
──────────────────────────────────────────────────────────────*/
import React, { useMemo, useState, useEffect, useCallback } from 'react';
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
import { NETWORK_KEY } from '../config/deployTarget.js';
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';

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
const tez = (mutez) => {
  const n = Number(mutez) / 1_000_000;
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
};

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
const StatRow= styled.div`
  display:flex;gap:10px;font-size:.8rem;flex-wrap:wrap;align-items:center;
  .pill{
    display:inline-flex;align-items:center;gap:.35rem;
    padding:1px 8px;border:1px solid var(--zu-fg);
    background:var(--zu-bg);color:var(--zu-fg);
    text-decoration:none;white-space:nowrap;
    line-height:1.2;cursor:default; user-select:none;
  }
  .pill.btn{
    cursor:pointer;
    transition:transform .05s ease;
  }
  .pill.btn:focus{ outline:1px dashed var(--zu-accent); outline-offset:2px; }
  .pill.btn:hover{ transform:translateY(-1px); }
  .pill.btn:disabled{ opacity:.6; cursor:default; }
`;

const SalePanel = styled.div`
  margin-top:8px;border:2px dashed var(--zu-fg);padding:8px;display:grid;gap:6px;
  background:var(--zu-bg-dim);
`;
const SaleRow = styled.div`
  display:flex;gap:10px;align-items:center;justify-content:space-between;
  font-size:.8rem;
  a{ color: var(--zu-accent-sec,#6ff); text-decoration:none; }
  code{ opacity:.85; }
`;

/*──────── component ───────────────────────────────────────*/
export default function ContractMetaPanelContracts({
  meta={}, contractAddress='', stats={tokens:'…',owners:'…',sales:'…'}, saleListings=[]
}) {
  const metaObj = useMemo(()=>toMetaObject(meta),[meta]);
  const hazards = detectHazards(metaObj);

  const [allowScr,setAllowScr] = useConsent(`scripts:${contractAddress}`,false);
  const [dlg,setDlg]           = useState(false);
  const [terms,setTerms]       = useState(false);

  const [showSale, setShowSale] = useState(false);

  const integrity  = useMemo(()=>checkOnChainIntegrity(metaObj),[metaObj]);
  const {label}    = useMemo(()=>getIntegrityInfo(integrity.status),[integrity.status]);

  const [thumbOk,setThumbOk] = useState(true);
  const thumb = pickThumb(metaObj);
  const showFallback = !thumbOk||!thumb;

  const copy = () => {copyToClipboard(contractAddress);};

  const askEnable = () => {setTerms(false);setDlg(true);};
  const enable = () => {if(!terms)return;setAllowScr(true);setDlg(false);};

  // ---------- Address & Domain helpers ----------
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
  const [showAllAuthors, setShowAllAuthors] = useState(false);
  const [showAllAdmins, setShowAllAdmins]   = useState(false);
  const [showAllCreators, setShowAllCreators] = useState(false);

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

  // ---------- Sale list (deduped per token, lowest price) ----------
  const saleRows = useMemo(() => {
    const byToken = new Map();
    for (const r of (saleListings || [])) {
      if (!r) continue;
      const id = Number(r.tokenId ?? r.token_id);
      const price = Number(r.priceMutez ?? r.price);
      const amt = Number(r.amount ?? 0);
      const seller = String(r.seller || '');
      const start = r.startTime || r.start_time || null;
      if (!Number.isFinite(id) || !Number.isFinite(price) || price < 0 || amt <= 0) continue;
      const prev = byToken.get(id);
      if (!prev || price < prev.priceMutez) {
        byToken.set(id, { tokenId: id, priceMutez: price, amount: amt, seller, startTime: start });
      }
    }
    return Array.from(byToken.values()).sort((a,b)=>a.tokenId-b.tokenId);
  }, [saleListings]);

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
              {(() => {
                const ver = String(metaObj.version || '').trim();
                if(!ver) return '';
                const idx = ver.toLowerCase().indexOf('zerocontract');
                if(idx<0) return '';
                const suffix = ver.toLowerCase().slice(idx+'zerocontract'.length).replace(/^v?/,'v');
                return ` (${suffix})`;
              })()}
            </code>
            <PixelButton size="xs" onClick={copy}>📋</PixelButton>
          </AddrRow>

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

          {creatorsArr.length > 0 && (
            <p style={{ fontSize: '.75rem', margin: '0 0 2px' }}>
              <strong>Creator(s)</strong>:&nbsp;
              {renderList(creatorsArr, showAllCreators, setShowAllCreators, false)}
            </p>
          )}

          {metaObj.description && <Desc>{metaObj.description}</Desc>}

          <StatRow>
            <span className="pill">{stats.tokens} Tokens</span>
            <span className="pill">{stats.owners} Owners</span>
            <button
              type="button"
              className="pill btn"
              aria-expanded={showSale}
              onClick={() => setShowSale((v) => !v)}
              title={saleRows.length ? 'Click to view items for sale' : 'No active listings'}
              disabled={!saleRows.length}
            >
              {String(saleRows.length)} For Sale
            </button>
          </StatRow>

          {showSale && saleRows.length > 0 && (
            <SalePanel role="region" aria-label="Items for sale">
              {saleRows.map((r) => (
                <SaleRow key={`sale-${r.tokenId}`}>
                  <div style={{display:'flex',gap:'8px',alignItems:'center',minWidth:0}}>
                    <a href={`/tokens/${contractAddress}/${r.tokenId}`}>
                      Token #{r.tokenId}
                    </a>
                    {r.amount > 1 && <code>×{r.amount}</code>}
                  </div>
                  <div>
                    <strong>{tez(r.priceMutez)} ꜩ</strong>
                  </div>
                </SaleRow>
              ))}
            </SalePanel>
          )}
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
  saleListings: PropTypes.arrayOf(PropTypes.shape({
    tokenId   : PropTypes.oneOfType([PropTypes.string,PropTypes.number]),
    priceMutez: PropTypes.oneOfType([PropTypes.string,PropTypes.number]),
    amount    : PropTypes.oneOfType([PropTypes.string,PropTypes.number]),
    seller    : PropTypes.string,
    startTime : PropTypes.oneOfType([PropTypes.string,PropTypes.number]),
  })),
};
/* What changed & why: r7 – Fixed pill contrast (explicit theme
   colors), kept semantic button behaviour, and added a clickable
   sale panel listing lowest‑price items with token links. */
// EOF
