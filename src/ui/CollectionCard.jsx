/*Developed by @jams2blues
  File: src/ui/CollectionCard.jsx
  Rev : r28   2025‑08‑16
  Summary: Restrict Tezos Domains reverse lookups to tz‑addresses only
           (skip KT1 and human names) to cut unnecessary resolver hits
           and avoid GraphQL 400s. Preserve existing behavior, counts,
           hazard gates, and UX.
*/

import {
  useEffect,
  useState,
  useMemo,
  useCallback,
} from 'react';
import PropTypes                  from 'prop-types';
import styledPkg                  from 'styled-components';

import useConsent                 from '../hooks/useConsent.js';
import detectHazards              from '../utils/hazards.js';
import { checkOnChainIntegrity }  from '../utils/onChainValidator.js';
import { getIntegrityInfo }       from '../constants/integrityBadges.js';
import countOwners                from '../utils/countOwners.js';
import countTokens                from '../utils/countTokens.js';
import { shortKt, copyToClipboard, shortAddr } from '../utils/formatAddress.js';
import RenderMedia                from '../utils/RenderMedia.jsx';
import PixelButton                from './PixelButton.jsx';
import { jFetch }                 from '../core/net.js';
import decodeHexFields            from '../utils/decodeHexFields.js';
import {
  EnableScriptsToggle,
  EnableScriptsOverlay,
} from './EnableScripts.jsx';
import { NETWORK_KEY, TZKT_API }  from '../config/deployTarget.js';
import { resolveTezosDomain }     from '../utils/resolveTezosDomain.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Card = styled.div`
  width : var(--col);
  display: flex; flex-direction: column;
  border: 2px solid var(--zu-accent,#00c8ff);
  background: var(--zu-bg,#000); color: var(--zu-fg,#fff);
  overflow: hidden; cursor: pointer;
  &:hover { box-shadow: 0 0 6px var(--zu-accent-sec,#ff0); }
`;

const ThumbWrap = styled.div`
  flex: 0 0 var(--col);
  display:flex;align-items:center;justify-content:center;
  background: var(--zu-bg-dim,#111);
  position: relative;
`;

const ThumbMedia = styled(RenderMedia)`
  max-width:100%; max-height:100%; image-rendering:pixelated;
`;

const Badge = styled.span`
  position:absolute;top:4px;right:4px;z-index:2;font-size:1.1rem;
`;

const Obf = styled.div`
  position:absolute;inset:0;background:rgba(0,0,0,.85);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:10px;font-size:.75rem;z-index:3;text-align:center;
  p{margin:0;width:80%;}
`;

const Meta = styled.div`
  padding:6px 6px 4px;display:flex;flex-direction:column;gap:2px;
  h3{margin:0;font-size:.9rem;line-height:1.15;font-family:'Pixeloid Sans',monospace;}
  p {margin:0;font-size:.75rem;opacity:.8;}
`;

const StatRow = styled.div`
  display:flex;justify-content:space-between;font-size:.75rem;
`;

const AddrRow = styled.div`
  display:flex;align-items:center;gap:4px;font-size:.68rem;opacity:.6;
  button{line-height:1;padding:0 .3rem;font-size:.65rem;}
`;

/*──────── helpers ───────────────────────────────────────────*/
const ipfsToHttp = (u='') => u.replace(/^ipfs:\/\//,'https://ipfs.io/ipfs/');
const PLACEHOLDER = '/sprites/cover_default.svg';

function decodeHexMetadata(val='') {
  try{
    if(typeof val!=='string') return null;
    const s = val.trim();
    if(s.startsWith('{') && s.endsWith('}')) return JSON.parse(s);
    const hex = s.replace(/^0x/,'');
    if(!/^[0-9a-f]+$/i.test(hex) || hex.length%2) return null;
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(b=>parseInt(b,16)));
    return JSON.parse(new TextDecoder().decode(bytes).replace(/[\u0000-\u001F\u007F]/g,''));
  }catch{return null;}
}

/** Tight tz‑address check for resolver */
const isTz = (s) => typeof s === 'string' && /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/i.test(s?.trim());

/*──────── component ─────────────────────────────────────────*/
export default function CollectionCard({ contract, initialTokensCount, hideIfEmpty = false }) {
  const [meta, setMeta]     = useState({});
  const [owners,setOwners]  = useState(null);
  const [live,  setLive]    = useState(
    Number.isFinite(initialTokensCount) ? Number(initialTokensCount) : null,
  );
  const [thumbOk,setThumbOk]= useState(true);

  const [allowNSFW,setAllowNSFW]= useConsent('nsfw',false);
  const [allowFlash,setAllowFlash]= useConsent('flash',false);
  const [allowScripts,setAllowScripts]= useConsent('scripts',false);

  // Determine current network from deployTarget.js.
  const net = NETWORK_KEY;
  // Base API URL for the chosen network.
  const api = `${TZKT_API}/v1`;

  /*── metadata – big‑map “content” key query ───────────────*/
  useEffect(()=>{let cancelled=false;
    (async()=>{
      let m = {};
      try{
        const rows = await jFetch(
          `${api}/contracts/${contract.address}/bigmaps/metadata/keys`
          + '?key=content&select=value&limit=1',
        ).catch(()=>[]);
        const raw = rows?.[0];
        const parsed = decodeHexMetadata(raw);
        if(parsed) m = parsed;
      }catch{/* ignore */}

      if(!m.name){                                   /* fallback contract */
        try{
          const c = await jFetch(`${api}/contracts/${contract.address}`).catch(()=>null);
          if(c?.metadata) m = { ...m, ...decodeHexFields(c.metadata) };
        }catch{/* ignore */}
      }
      if(!cancelled) setMeta(decodeHexFields(m));
    })();
    return ()=>{cancelled=true;};
  },[contract.address,api]);

  /* counts (seed from props; then refresh) */
  useEffect(()=>{let c=false;
    // seed (if provided) to avoid flash of "0 Tokens" on explore
    if (Number.isFinite(initialTokensCount)) {
      setLive(Number(initialTokensCount));
    }
    countOwners(contract.address,net).then(n=>{if(!c)setOwners(n);});
    countTokens(contract.address,net).then(n=>{if(!c)setLive(n);});
    return ()=>{c=true;};
  },[contract.address,net,initialTokensCount]);

  const { nsfw,flashing,scripts } = detectHazards(meta);
  const hide  = (nsfw&&!allowNSFW)||(flashing&&!allowFlash);
  const integrity = useMemo(()=>checkOnChainIntegrity(meta).status,[meta]);
  const { badge,label } = getIntegrityInfo(integrity);

  /* preview + text */
  const preview = meta.imageUri ? ipfsToHttp(meta.imageUri) : PLACEHOLDER;
  const showPlaceholder = (!meta.imageUri || !thumbOk);
  const nameSafe = meta.name || shortKt(contract.address);
  const authors = Array.isArray(meta.authors)
    ? meta.authors
    : typeof meta.authors === 'string'
      ? meta.authors.split(/[,;]\s*/)
      : [];

  // Domain resolution – tz‑only (skip KT/names)
  const [domains, setDomains] = useState({});
  const [showAllAuthors, setShowAllAuthors] = useState(false);

  useEffect(() => {
    const addrs = new Set();
    authors.forEach((a) => {
      if (a && typeof a === 'string') {
        const v = a.trim();
        if (isTz(v)) addrs.add(v);
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authors.join('|')]);

  const formatEntry = useCallback(
    (val) => {
      if (!val || typeof val !== 'string') return String(val || '');
      const v = val.trim();
      const lower = v.toLowerCase();
      const dom = domains[lower];
      if (dom) return dom;
      if (v.includes('.')) return v;
      return shortAddr(v);
    },
    [domains],
  );

  const renderAuthors = useCallback(() => {
    const list = showAllAuthors ? authors : authors.slice(0, 3);
    const elems = [];
    list.forEach((item, idx) => {
      const prefix = idx > 0 ? ', ' : '';
      const formatted = formatEntry(item);
      const isAddr = typeof item === 'string' && /^(tz|kt)/i.test(item.trim());
      elems.push(
        isAddr ? (
          <a
            key={`${item}_${idx}`}
            href={`/explore?cmd=tokens&admin=${item}`}
            style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'none' }}
          >
            {prefix}
            {formatted}
          </a>
        ) : (
          <span key={`${String(item)}_${idx}`}>{prefix}{formatted}</span>
        ),
      );
    });
    if (authors.length > 3 && !showAllAuthors) {
      elems.push(
        <span key="authors-more">
          …&nbsp;
          <button
            type="button"
            aria-label="Show all authors"
            onClick={(e) => { e.preventDefault(); setShowAllAuthors(true); }}
            style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
          >
            🔻More
          </button>
        </span>,
      );
    }
    return elems;
  }, [authors, showAllAuthors, formatEntry]);

  /* optional Explore-only hide for empty contracts */
  if (hideIfEmpty && live === 0) {
    return null;
  }

  /* toggle handler */
  const handleToggleScripts = () => {
    if (allowScripts) {
      setAllowScripts(false);
    } else if (typeof window !== 'undefined' && window.confirm('Enable executable scripts for this media?')) {
      setAllowScripts(true);
    }
  };

  /*──────── render ─*/
  return (
    <a href={`/contracts/${contract.address}`} style={{textDecoration:'none'}}>
      <Card>
        <ThumbWrap>
          <Badge title={label}>{badge}</Badge>

          {scripts && (
            <span style={{ position:'absolute', top:4, left:4, zIndex:11 }}>
              <EnableScriptsToggle
                enabled={allowScripts}
                onToggle={handleToggleScripts}
              />
            </span>
          )}

          {hide && (
            <Obf>
              <p>{nsfw&&'NSFW'}{nsfw&&flashing?' / ':''}{flashing&&'Flashing'}</p>
              <PixelButton size="sm" onClick={e=>{e.preventDefault();
                if(nsfw)    setAllowNSFW(true);
                if(flashing)setAllowFlash(true);
              }}>UNHIDE</PixelButton>
            </Obf>
          )}

          {!hide && !showPlaceholder && (
            <ThumbMedia
              uri={preview}
              alt={nameSafe}
              allowScripts={scripts&&allowScripts}
              onInvalid={()=>setThumbOk(false)}
            />
          )}

          {!hide && showPlaceholder && (
            <img src={PLACEHOLDER} alt="" style={{width:'60%',opacity:.45}} />
          )}

          {scripts && !allowScripts && !hide && (
            <Obf>
              <EnableScriptsOverlay onAccept={handleToggleScripts}/>
            </Obf>
          )}
        </ThumbWrap>

        <Meta>
          <h3 title={nameSafe}>{nameSafe}</h3>
          {authors.length > 0 && (
            <p style={{ wordBreak: 'break-all' }}>
              Author(s)&nbsp;
              {renderAuthors()}
            </p>
          )}

          <StatRow>
            <span>{live ?? '…'} Tokens</span>
            {Number.isFinite(owners) && <span>{owners} Owners</span>}
          </StatRow>

          <AddrRow>
            <span>{shortKt(contract.address)}</span>
            <PixelButton size="xs" title="Copy address"
              onClick={e=>{e.preventDefault();copyToClipboard(contract.address);}}>
              📋
            </PixelButton>
          </AddrRow>
        </Meta>
      </Card>
    </a>
  );
}

CollectionCard.propTypes = {
  contract: PropTypes.shape({
    address: PropTypes.string.isRequired,
  }).isRequired,
  initialTokensCount: PropTypes.number,   // optional seed from parent (e.g., explore)
  hideIfEmpty: PropTypes.bool,            // when true, hide card if live === 0
};

/* What changed & why (r28):
   • Only attempt reverse Tezos Domains lookups for tz‑addresses
     (skip KT1/names) to reduce failed requests and network noise.
   • Behavior otherwise unchanged; hazards/UX intact.
*/
