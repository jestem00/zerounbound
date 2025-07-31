/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ContractMetaPanelContracts.jsx
  Rev :    r5    2025‑10‑09
  Summary: hazards + script‑toggle, shortKt, copyable addr,
           fallback preview support (ipfs/http), confirm dlg
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

// Import domain resolver and network key for reverse lookups.  These helpers
// allow conversion of Tezos addresses to .tez domains when a reverse
// record exists.  shortAddr() abbreviates tz/KT addresses.  See
// resolveTezosDomain.js for implementation details.
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
const StatRow= styled.div`
  display:flex;gap:10px;font-size:.8rem;flex-wrap:wrap;
  span{border:1px solid var(--zu-fg);padding:1px 6px;white-space:nowrap;}
`;

/*──────── component ───────────────────────────────────────*/
export default function ContractMetaPanelContracts({
  meta={}, contractAddress='', stats={tokens:'…',owners:'…',sales:'…'},
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

  // --------------------------------------------------------------
  // Address parsing and domain resolution logic.  The contract
  // metadata may include fields such as authors, authoraddress and
  // creators containing comma‑separated addresses or arrays.  We
  // normalise these fields into arrays, resolve any Tezos addresses
  // to .tez domains where possible, and provide optional copy
  // functionality.  See resolveTezosDomain.js for details.

  // Helper to parse a metadata field into an array of strings.
  const parseField = useCallback((field) => {
    if (!field) return [];
    if (Array.isArray(field)) return field.map((x) => String(x).trim()).filter(Boolean);
    if (typeof field === 'string') return field.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean);
    if (typeof field === 'object') return Object.values(field).map((s) => String(s).trim()).filter(Boolean);
    return [];
  }, []);

  // Extract arrays for authors, admin (authoraddress) and creators.
  const authorsArr = useMemo(() => [], []);
  const adminArr   = useMemo(() => parseField(metaObj.authoraddress), [metaObj.authoraddress, parseField]);
  const creatorsArr= useMemo(() => parseField(metaObj.creators), [metaObj.creators, parseField]);

  // Domain cache and list expansion flags.
  const [domains, setDomains] = useState({});
  const [showAllAuthors, setShowAllAuthors] = useState(false);
  const [showAllAdmins, setShowAllAdmins]   = useState(false);
  const [showAllCreators, setShowAllCreators] = useState(false);

  // Derive a user‑friendly version label from the contract metadata.
  // If the metadata includes a "version" key (e.g. "ZeroContractV4a"),
  // extract the suffix after "ZeroContract" and lower‑case it (e.g. "v4a").
  // Otherwise, leave blank.  This will be appended next to the contract
  // address in parentheses.  A missing or malformed version yields an
  // empty string so nothing extra is shown.
  const verLabel = useMemo(() => {
    const ver = String(metaObj.version || '').trim();
    if (!ver) return '';
    const lower = ver.toLowerCase();
    const prefix = 'zerocontract';
    const idx = lower.indexOf(prefix);
    if (idx >= 0) {
      const suffix = lower.slice(idx + prefix.length);
      // ensure suffix starts with 'v'; if not, prepend 'v'
      const trimmed = suffix.replace(/^v?/i, '');
      return `v${trimmed}`;
    }
    return '';
  }, [metaObj.version]);

  // Resolve domain names for all addresses in the lists.  We use
  // NETWORK_KEY to choose the correct Tezos Domains endpoint (mainnet
  // or ghostnet).  The lookup only runs once per unique address.
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

  // Format a single value: return the resolved domain if present;
  // return the value verbatim if it contains a dot (likely a name);
  // otherwise abbreviate tz/KT addresses via shortAddr().
  const formatVal = useCallback((val) => {
    if (!val || typeof val !== 'string') return String(val || '');
    const v = val.trim();
    const key = v.toLowerCase();
    const dom = domains[key];
    if (dom) return dom;
    if (v.includes('.')) return v;
    return shortAddr(v);
  }, [domains]);

  // Render a list of values with optional copy buttons.  When
  // showAll is false and more than three entries exist, append a
  // toggle to reveal the remainder.  Addresses are linked to the
  // explore filter page.  Names/domains are rendered as plain text.
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

  return (
    <>
      {/*
        Contract metadata panel for marketplace collections. Displays
        a preview thumbnail, collection title with integrity badge,
        contract address (abbreviated KT1 + copy button), admin
        addresses with domain resolution and copy icons, and
        additional metadata fields such as symbol, version, type,
        license, homepage, authors and creators.  Author/creator
        lists support multiple entries with "More" toggles and link
        to the explore filter page.  All fields are optional and
        hidden when absent.
      */}
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

          {/* optional metadata fields */}
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

          <StatRow>
            <span>{stats.tokens} Tokens</span>
            <span>{stats.owners} Owners</span>
            <span>{stats.sales} For Sale</span>
          </StatRow>
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
};
/* EOF */
