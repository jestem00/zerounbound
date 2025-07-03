/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/CollectionCard.jsx
  Rev :    r24   2025‑08‑26
  Summary: restore working metadata query (content key),
           guaranteed placeholder preview, authors/name back
──────────────────────────────────────────────────────────────*/
import {
  useEffect, useState, useMemo,
}                                 from 'react';
import PropTypes                  from 'prop-types';
import styledPkg                  from 'styled-components';

import useConsent                 from '../hooks/useConsent.js';
import detectHazards              from '../utils/hazards.js';
import { checkOnChainIntegrity }  from '../utils/onChainValidator.js';
import { getIntegrityInfo }       from '../constants/integrityBadges.js';
import countOwners                from '../utils/countOwners.js';
import countTokens                from '../utils/countTokens.js';
import { shortKt, copyToClipboard } from '../utils/formatAddress.js';
import RenderMedia                from '../utils/RenderMedia.jsx';
import PixelButton                from './PixelButton.jsx';
import { jFetch }                 from '../core/net.js';
import decodeHexFields            from '../utils/decodeHexFields.js';

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

/*──────── component ─────────────────────────────────────────*/
export default function CollectionCard({ contract }) {
  const [meta, setMeta]   = useState({});
  const [owners,setOwners]= useState(null);
  const [live,  setLive]  = useState(null);
  const [thumbOk,setThumbOk]=useState(true);

  const [allowNSFW,setAllowNSFW]=useConsent('nsfw',false);
  const [allowFlash,setAllowFlash]=useConsent('flash',false);
  const [allowScripts,setAllowScripts]=useConsent('scripts',false);

  const net = process.env.NEXT_PUBLIC_NETWORK || 'ghostnet';
  const api = `https://api.${net}.tzkt.io/v1`;

  /*── metadata – replicate original “content” key query ─────────────*/
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

  /* counts */
  useEffect(()=>{let c=false;
    countOwners(contract.address,net).then(n=>{if(!c)setOwners(n);});
    countTokens(contract.address,net).then(n=>{if(!c)setLive(n);});
    return ()=>{c=true;};
  },[contract.address,net]);

  const { nsfw,flashing,scripts } = detectHazards(meta);
  const hide  = (nsfw&&!allowNSFW)||(flashing&&!allowFlash);
  const integrity = useMemo(()=>checkOnChainIntegrity(meta).status,[meta]);
  const { badge,label } = getIntegrityInfo(integrity);

  /* derive preview + text */
  const preview = meta.imageUri ? ipfsToHttp(meta.imageUri) : PLACEHOLDER;
  const showPlaceholder = (!meta.imageUri || !thumbOk);
  const nameSafe = meta.name || shortKt(contract.address);
  const authors = Array.isArray(meta.authors)
    ? meta.authors
    : typeof meta.authors === 'string'
      ? meta.authors.split(/[,;]\s*/)
      : [];

  /*──────── render ─*/
  return (
    <a href={`/contracts/${contract.address}`} style={{textDecoration:'none'}}>
      <Card>
        <ThumbWrap>
          <Badge title={label}>{badge}</Badge>

          {hide && (
            <Obf>
              <p>{nsfw&&'NSFW'}{nsfw&&flashing?' / ':''}{flashing&&'Flashing'}</p>
              <PixelButton size="sm" onClick={e=>{e.preventDefault();
                if(nsfw)    setAllowNSFW(true);
                if(flashing)setAllowFlash(true);
              }}>Unhide</PixelButton>
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
              <p>Executable media</p>
              <PixelButton size="sm" warning onClick={e=>{e.preventDefault();
                if(window.confirm('Enable scripts for this media?')) setAllowScripts(true);
              }}>Allow scripts</PixelButton>
            </Obf>
          )}
        </ThumbWrap>

        <Meta>
          <h3 title={nameSafe}>{nameSafe}</h3>
          {authors.length>0 && <p>By {authors.join(', ')}</p>}

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
};
/* What changed & why (r24):
   • Re‑implemented original big‑map “content” value query (worked in r19).
   • decodeHexMetadata helper restored → proper JSON extraction.
   • Placeholder sprite shows when no image or load‑error.
   • Authors/name render from recovered metadata; counts untouched.
   • Removes empty‑key path that broke earlier; cards no longer black.
*/