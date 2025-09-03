/* Developed by @jams2blues
   File: src/ui/CollectionCard.jsx
   Rev : r30
   Summary: Clean, ASCII-safe collection card with square preview,
            overlays, stats, and a global-bus SHARE button. */

import { useEffect, useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';

import useConsent from '../hooks/useConsent.js';
import detectHazards from '../utils/hazards.js';
import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import { getIntegrityInfo } from '../constants/integrityBadges.js';
import countOwners from '../utils/countOwners.js';
import countTokens from '../utils/countTokens.js';
import { shortKt, copyToClipboard, shortAddr } from '../utils/formatAddress.js';
import RenderMedia from '../utils/RenderMedia.jsx';
import PixelButton from './PixelButton.jsx';
import { jFetch } from '../core/net.js';
import decodeHexFields from '../utils/decodeHexFields.js';
import { EnableScriptsToggle, EnableScriptsOverlay } from './EnableScripts.jsx';
import { NETWORK_KEY, TZKT_API } from '../config/deployTarget.js';
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* styled shells */
const Card = styled.div`
  width : var(--col);
  display: flex; flex-direction: column;
  border: 2px solid var(--zu-accent,#00c8ff);
  background: var(--zu-bg,#000); color: var(--zu-fg,#fff);
  overflow: hidden; cursor: pointer;
  opacity: ${(p) => (p.$dim ? 0.45 : 1)};
  &:hover { box-shadow: 0 0 6px var(--zu-accent-sec,#ff0); }
`;

const ThumbWrap = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;                 /* strict 1:1 for every card */
  display:flex;align-items:center;justify-content:center;
  background: var(--zu-bg-dim,#111);
`;

const ThumbMedia = styled(RenderMedia)`
  /* Down-scale only; center. */
  width: auto; height: auto;
  max-width: 100%; max-height: 100%;
  object-fit: contain; object-position: center;
  image-rendering: pixelated;
`;

const Badge = styled.span`
  position:absolute;top:4px;right:4px;z-index:12;font-size:1.1rem;
`;

const Obf = styled.div`
  position:absolute;inset:0;background:rgba(0,0,0,.85);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:10px;font-size:.75rem;z-index:11;text-align:center;
  p{margin:0;width:80%;}
`;

const Meta = styled.div`
  padding:6px 6px 4px;display:flex;flex-direction:column;gap:6px;
  h3{margin:0;font-size:.9rem;line-height:1.15;font-family:'Pixeloid Sans',monospace;}
  p {margin:0;font-size:.75rem;opacity:.8;}
`;

const StatRow = styled.div`
  display:flex;justify-content:space-between;font-size:.75rem;
`;

const AddrRow = styled.div`
  display:flex;align-items:center;gap:6px;font-size:.68rem;opacity:.75;
  button{line-height:1;padding:0 .3rem;font-size:.65rem;}
`;

/* helpers */
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

/* component */
export default function CollectionCard({
  contract, initialTokensCount, hideIfEmpty = false,
  canHide = false, onToggleHide, isHidden = false, dimHidden = false,
}) {
  const [meta, setMeta]     = useState({});
  const [owners,setOwners]  = useState(null);
  const [live,  setLive]    = useState(
    Number.isFinite(initialTokensCount) ? Number(initialTokensCount) : null,
  );
  const [thumbOk,setThumbOk]= useState(true);

  const [allowNSFW,setAllowNSFW]= useConsent('nsfw',false);
  const [allowFlash,setAllowFlash]= useConsent('flash',false);
  const [allowScripts,setAllowScripts]= useConsent('scripts',false);

  const net = NETWORK_KEY;
  const api = `${TZKT_API}/v1`;

  /* metadata – big-map “content” key query */
  useEffect(()=>{let cancelled=false;
    (async ()=>{
      let m = {};
      try{
        const rows = await jFetch(
          `${api}/contracts/${contract.address}/bigmaps/metadata/keys` +
          '?key=content&select=value&limit=1',
        ).catch(()=>[]);
        const raw = rows?.[0];
        const parsed = decodeHexMetadata(raw);
        if(parsed) m = parsed;
      }catch{/* ignore */}

      if(!m.name){
        try{
          const c = await jFetch(`${api}/contracts/${contract.address}`).catch(()=>null);
          if(c?.metadata) m = { ...m, ...decodeHexFields(c.metadata) };
        }catch{/* ignore */}
      }
      if(!cancelled) setMeta(decodeHexFields(m));
    })();
    return ()=>{cancelled=true;};
  },[contract.address,api]);

  /* counts (seed from props; then refresh). Optimize: only fetch owners when live>0 */
  useEffect(() => { let cancelled = false;
    if (Number.isFinite(initialTokensCount)) setLive(Number(initialTokensCount));
    (async () => {
      try {
        const nLive = await countTokens(contract.address, net);
        if (cancelled) return;
        setLive(nLive);
        if (nLive > 0) {
          const nOwners = await countOwners(contract.address, net).catch(() => null);
          if (!cancelled && Number.isFinite(nOwners)) setOwners(nOwners);
          if (!cancelled && !Number.isFinite(nOwners)) setOwners(null);
        } else {
          if (!cancelled) setOwners(0);
        }
      } catch {
        // Fallback: attempt owners anyway (best-effort)
        try {
          const nOwners = await countOwners(contract.address, net);
          if (!cancelled) setOwners(nOwners);
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, [contract.address, net, initialTokensCount]);

  const { nsfw,flashing,scripts } = detectHazards(meta);
  const hide  = (nsfw&&!allowNSFW)||(flashing&&!allowFlash);
  const integrity = useMemo(()=>checkOnChainIntegrity(meta).status,[meta]);
  const { badge,label } = getIntegrityInfo(integrity);

  const preview = meta.imageUri ? ipfsToHttp(meta.imageUri) : PLACEHOLDER;
  const showPlaceholder = (!meta.imageUri || !thumbOk);
  const nameSafe = meta.name || shortKt(contract.address);
  const authors = Array.isArray(meta.authors)
    ? meta.authors
    : typeof meta.authors === 'string'
      ? meta.authors.split(/[,;]\s*/)
      : [];

  const [domains, setDomains] = useState({});
  const [showAllAuthors, setShowAllAuthors] = useState(false);

  useEffect(() => {
    const addrs = new Set();
    authors.forEach((a) => { if (a && typeof a === 'string' && /^(tz|kt)/i.test(a.trim())) addrs.add(a); });
    addrs.forEach((addr) => {
      const key = addr.toLowerCase();
      if (domains[key] !== undefined) return;
      (async () => {
        const name = await resolveTezosDomain(addr, NETWORK_KEY);
        setDomains((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: name }));
      })();
    });
  }, [authors, domains]);

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
            key={item}
            href={`/explore?cmd=tokens&admin=${item}`}
            style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'none' }}
          >
            {prefix}{formatted}
          </a>
        ) : (
          <span key={item}>{prefix}{formatted}</span>
        ),
      );
    });
    if (authors.length > 3 && !showAllAuthors) {
      elems.push(
        <span key="authors-more">
          ...&nbsp;
          <button
            type="button"
            aria-label="Show all authors"
            onClick={(e) => { e.preventDefault(); setShowAllAuthors(true); }}
            style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
          >
            More
          </button>
        </span>,
      );
    }
    return elems;
  }, [authors, showAllAuthors, formatEntry]);

  if (hideIfEmpty && live === 0) return null;

  const handleToggleScripts = () => {
    if (allowScripts) {
      setAllowScripts(false);
    } else if (typeof window !== 'undefined' && window.confirm('Enable executable scripts for this media?')) {
      setAllowScripts(true);
    }
  };

  return (
    <a href={`/contracts/${contract.address}`} style={{ textDecoration:'none' }}>
      <Card $dim={dimHidden}>
        <ThumbWrap className="preview-1x1">
          <Badge title={label}>{badge}</Badge>

          {scripts && (
            <span style={{ position:'absolute', top:4, left:4, zIndex:12 }}>
              <EnableScriptsToggle enabled={allowScripts} onToggle={handleToggleScripts} />
            </span>
          )}

          {canHide && (
            <span style={{ position:'absolute', top:4, right:4, zIndex:14 }}>
              <PixelButton size="xs" onClick={(e)=>{ e.preventDefault(); onToggleHide?.(); }}>
                {isHidden ? 'SHOW' : 'HIDE'}
              </PixelButton>
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
            <EnableScriptsOverlay onAccept={handleToggleScripts} style={{ zIndex:11 }}/>
          )}
        </ThumbWrap>

        <Meta>
          <h3 title={nameSafe}>{nameSafe}</h3>
          <div>
            <PixelButton
              size="xs"
              onClick={(e) => {
                e.preventDefault();
                try {
                  window.dispatchEvent(new CustomEvent('zu:openShare', {
                    detail: {
                      scope: 'collection',
                      url: `/contracts/${contract.address}`,
                      name: nameSafe,
                      creators: authors,
                      variant: 'view',
                      previewUri: preview !== PLACEHOLDER ? preview : undefined,
                    },
                  }));
                } catch { /* ignore */ }
              }}
              title="Share this collection"
            >
              <img src="/sprites/share.png" alt="" aria-hidden="true" style={{ width: 12, height: 12, marginRight: 6, verticalAlign: '-2px' }} />
              SHARE
            </PixelButton>
          </div>
          {authors.length > 0 && (
            <p style={{ wordBreak: 'break-all' }}>
              Author(s) {renderAuthors()}
            </p>
          )}

          <StatRow>
            <span>{(live ?? '...')} Tokens</span>
            {Number.isFinite(owners) && <span>{owners} Owners</span>}
          </StatRow>

          <AddrRow>
            <span>{shortKt(contract.address)}</span>
            <PixelButton size="xs" title="Copy address" onClick={e=>{e.preventDefault();copyToClipboard(contract.address);}}>
              COPY
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
  initialTokensCount: PropTypes.number,
  hideIfEmpty: PropTypes.bool,
  canHide: PropTypes.bool,
  onToggleHide: PropTypes.func,
  isHidden: PropTypes.bool,
  dimHidden: PropTypes.bool,
};

/* What changed & why (r30):
   - Removed mojibake artifacts; normalized labels to ASCII.
   - Fixed SHARE button: uses global share bus with collection URL and preview.
   - Preserved square preview, overlays, and stats with safe fallbacks.
*/
