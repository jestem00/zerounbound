/*──────── src/ui/CollectionCard.jsx ────────*/
/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/CollectionCard.jsx
  Rev :    r19   2025‑08‑22
  Summary: live‑count via countTokens → filters burn‑only ids (I67)
──────────────────────────────────────────────────────────────*/
import {
  useEffect, useState, useCallback, useMemo,
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

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Card = styled.div`
  width : var(--col);
  display: flex;
  flex-direction: column;
  border: 2px solid var(--zu-accent,#00c8ff);
  background: var(--zu-bg,#000);
  color: var(--zu-fg,#fff);
  overflow: hidden;
  cursor: pointer;
  &:hover { box-shadow: 0 0 6px var(--zu-accent-sec,#ff0); }
`;

const ThumbWrap = styled.div`
  flex: 0 0 var(--col);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--zu-bg-dim,#111);
  position: relative;
`;

const ThumbMedia = styled(RenderMedia)`
  max-width: 100%;
  max-height: 100%;
  image-rendering: pixelated;
`;

const Badge = styled.span`
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 1.1rem;
  user-select: none;
  z-index: 2;
`;

const Obf = styled.div`
  position: absolute; inset: 0;
  background: rgba(0,0,0,.85);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;font-size:.75rem;gap:10px;z-index:3;
  p{margin:0;width:80%;}
`;

const Meta = styled.div`
  padding: 6px 6px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;

  h3 { margin:0;font-size:.9rem;line-height:1.15;font-family:'Pixeloid Sans',monospace; }
  p  { margin:0;font-size:.75rem;opacity:.8; }
`;

const StatRow = styled.div`
  display:flex;justify-content:space-between;font-size:.75rem;
`;

const AddrRow = styled.div`
  display:flex;align-items:center;gap:4px;font-size:.68rem;opacity:.6;
  button{ line-height:1;padding:0 .3rem;font-size:.65rem; }
`;

/*──────── helpers ───────────────────────────────────────────*/
const ipfsToHttp = (u='') => u.replace(/^ipfs:\/\//,'https://ipfs.io/ipfs/');

function decodeHexMetadata(val=''){
  try{
    if(typeof val!=='string')return null;
    const s=val.trim();
    if(s.startsWith('{')&&s.endsWith('}'))return JSON.parse(s);
    const hex=s.replace(/^0x/,'');
    if(!/^[0-9a-f]+$/i.test(hex)||hex.length%2)return null;
    const bytes=new Uint8Array(hex.match(/.{1,2}/g).map(b=>parseInt(b,16)));
    return JSON.parse(new TextDecoder().decode(bytes).replace(/[\u0000-\u001F\u007F]/g,''));
  }catch{return null;}
}

/*──────── component ─────────────────────────────────────────*/
export default function CollectionCard({ contract }){
  const [meta,setMeta]        = useState(null);
  const [owners,setOwners]    = useState(null);
  const [live,setLive]        = useState(null);          /* NEW */
  const [loading,setLoading]  = useState(true);
  const [thumbOk,setThumbOk]  = useState(true);

  const [allowNSFW,   setAllowNSFW]   = useConsent('nsfw',false);
  const [allowFlash,  setAllowFlash]  = useConsent('flash',false);
  const [allowScripts,setAllowScripts]= useConsent('scripts',false);

  const net = process.env.NEXT_PUBLIC_NETWORK || 'ghostnet';

  /* metadata */
  useEffect(()=>{let c=false;
    (async()=>{
      try{
        const url=`https://api.${net}.tzkt.io/v1/contracts/${contract.address}/bigmaps/metadata/keys?key=content&select=value`;
        const [v]=await jFetch(url);
        const j=decodeHexMetadata(v);
        if(!c&&j)setMeta(j);
      }finally{ if(!c) setLoading(false);}
    })();
    return ()=>{c=true;};
  },[contract.address,net]);

  /* owners */
  useEffect(()=>{let c=false;
    (async()=>{ const n=await countOwners(contract.address,net); if(!c)setOwners(n);})();
    return ()=>{c=true;};
  },[contract.address,net]);

  /* live token count (filters burn‑only ids) */
  useEffect(()=>{let c=false;
    (async()=>{
      const n=await countTokens(contract.address,net);
      if(!c)setLive(n);
    })();
    return ()=>{c=true;};
  },[contract.address,net]);

  const { nsfw, flashing, scripts } = detectHazards(meta);
  const hide = (nsfw&&!allowNSFW)||(flashing&&!allowFlash);

  const integrity = useMemo(()=>meta?checkOnChainIntegrity(meta).status:'unknown',[meta]);
  const { badge,label } = getIntegrityInfo(integrity);

  if(loading)              return <Card as="div"/>;
  if(!meta||!thumbOk)      return null;

  return(
    <a href={`/contracts/${contract.address}`} style={{textDecoration:'none'}}>
      <Card>
        <ThumbWrap>
          <Badge title={label}>{badge}</Badge>

          {hide&&(
            <Obf>
              <p>{nsfw&&'NSFW'}{nsfw&&flashing?' / ':''}{flashing&&'Flashing'}</p>
              <PixelButton size="sm" onClick={()=>{
                if(nsfw&&!allowNSFW) setAllowNSFW(true);
                if(flashing&&!allowFlash) setAllowFlash(true);
              }}>Unhide</PixelButton>
            </Obf>
          )}

          {!hide&&(
            <ThumbMedia
              uri={ipfsToHttp(meta.imageUri)}
              alt={meta.name}
              allowScripts={scripts&&allowScripts}
              onInvalid={()=>setThumbOk(false)}
            />
          )}

          {scripts&&!allowScripts&&!hide&&(
            <Obf>
              <p>⚠ Executable media</p>
              <PixelButton size="sm" warning onClick={()=>{
                if(window.confirm('This media executes code which may be unsafe.\nEnable anyway?')){
                  setAllowScripts(true);
                }
              }}>Allow scripts</PixelButton>
            </Obf>
          )}
        </ThumbWrap>

        <Meta>
          <h3 title={meta.name}>{meta.name}</h3>
          {Array.isArray(meta.authors)&&meta.authors.length>0&&(
            <p>By {meta.authors.join(', ')}</p>
          )}
          <StatRow>
            <span>{live ?? '…'} Tokens</span>
            {Number.isFinite(owners)&&<span>{owners} Owners</span>}
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

CollectionCard.propTypes={
  contract:PropTypes.shape({
    address:PropTypes.string.isRequired,
  }).isRequired,
};
/* What changed & why (r19):
   • Replaced static `tokensCount` with live count via countTokens()
     which already omits burn‑only IDs (I67).
   • UI shows “…” until count resolves; owners logic unchanged. */
