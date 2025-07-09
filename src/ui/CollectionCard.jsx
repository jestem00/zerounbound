/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/CollectionCard.jsx
  Rev :    r26   2025‑10‑09
  Summary: unified script‑toggle UX (PixelConfirmDialog),
           terms checkbox, shortKt in addr row, refactored
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
import PixelConfirmDialog         from './PixelConfirmDialog.jsx';
import { jFetch }                 from '../core/net.js';
import decodeHexFields            from '../utils/decodeHexFields.js';
import {
  EnableScriptsToggle,
  EnableScriptsOverlay,
} from './EnableScripts.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Card = styled.div`
  width : var(--col);
  display:flex;flex-direction:column;
  border:2px solid var(--zu-accent,#00c8ff);
  background:var(--zu-bg,#000);color:var(--zu-fg,#fff);
  overflow:hidden;cursor:pointer;
  &:hover{box-shadow:0 0 6px var(--zu-accent-sec,#ff0);}
`;

const ThumbWrap = styled.div`
  flex:0 0 var(--col);
  display:flex;align-items:center;justify-content:center;
  background:var(--zu-bg-dim,#111);position:relative;
`;

const ThumbMedia = styled(RenderMedia)`
  max-width:100%;max-height:100%;image-rendering:pixelated;
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

/*──────── component ─────────────────────────────────────────*/
export default function CollectionCard({ contract }) {
  const [meta, setMeta]        = useState({});
  const [owners,setOwners]     = useState(null);
  const [live,  setLive]       = useState(null);
  const [thumbOk,setThumbOk]   = useState(true);

  /* consent */
  const [allowNSFW,setAllowNSFW]   = useConsent('nsfw',false);
  const [allowFlash,setAllowFlash] = useConsent('flash',false);
  const [allowScr,setAllowScr]     = useConsent(`scripts:${contract.address}`,false);

  /* confirm dlg */
  const [dlgOpen,setDlgOpen]   = useState(false);
  const [termsOk,setTermsOk]   = useState(false);

  const net = process.env.NEXT_PUBLIC_NETWORK || 'ghostnet';
  const api = `https://api.${net}.tzkt.io/v1`;

  /*── metadata fetch ─*/
  useEffect(()=>{let cancelled=false;
    (async()=>{
      let m={};
      try{
        const rows=await jFetch(
          `${api}/contracts/${contract.address}/bigmaps/metadata/keys?key=content&select=value&limit=1`,
        ).catch(()=>[]);
        const raw=rows?.[0];
        if(raw){
          try{m=JSON.parse(decodeURIComponent(atob(raw.replace(/^0x/,'')||'')));}catch{/*ignore*/}
        }
      }catch{/*ignore*/}
      if(!m.name){
        try{
          const c=await jFetch(`${api}/contracts/${contract.address}`).catch(()=>null);
          if(c?.metadata) m={...m,...decodeHexFields(c.metadata)};
        }catch{/*ignore*/}
      }
      if(!cancelled) setMeta(decodeHexFields(m));
    })();
    return()=>{cancelled=true;};
  },[contract.address,api]);

  /* counts */
  useEffect(()=>{let c=false;
    countOwners(contract.address,net).then(n=>{if(!c)setOwners(n);});
    countTokens(contract.address,net).then(n=>{if(!c)setLive(n);});
    return()=>{c=true;};
  },[contract.address,net]);

  const hazards = detectHazards(meta);
  const hide = (hazards.nsfw&&!allowNSFW)||(hazards.flashing&&!allowFlash);

  const integrity = useMemo(()=>checkOnChainIntegrity(meta).status,[meta]);
  const {badge,label}=getIntegrityInfo(integrity);

  const previewRaw = meta.imageUri || meta.thumbnailUri || '';
  const preview = previewRaw.startsWith('ipfs://') ? ipfsToHttp(previewRaw) : previewRaw;
  const showPlaceholder = (!preview || !thumbOk);

  const nameSafe = meta.name || shortKt(contract.address);
  const authors = Array.isArray(meta.authors)
    ? meta.authors
    : typeof meta.authors==='string'
      ? meta.authors.split(/[,;]\s*/)
      : [];

  /* script toggle */
  const askEnable = () => { setTermsOk(false); setDlgOpen(true); };
  const enableNow = () => { if(!termsOk)return; setAllowScr(true); setDlgOpen(false); };

  /*──────── render ─*/
  return (
    <>
      <a href={`/contracts/${contract.address}`} style={{textDecoration:'none'}}>
        <Card>
          <ThumbWrap>
            <Badge title={label}>{badge}</Badge>

            {hazards.scripts && (
              <span style={{position:'absolute',top:4,left:4,zIndex:11}}>
                <EnableScriptsToggle
                  enabled={allowScr}
                  onToggle={allowScr?()=>setAllowScr(false):askEnable}
                />
              </span>
            )}

            {hide && (
              <Obf>
                <p>
                  {hazards.nsfw&&'NSFW'}
                  {hazards.nsfw&&hazards.flashing&&' / '}
                  {hazards.flashing&&'Flashing'}
                </p>
                <PixelButton size="sm" onClick={e=>{
                  e.preventDefault();
                  if(hazards.nsfw) setAllowNSFW(true);
                  if(hazards.flashing) setAllowFlash(true);
                }}>UNHIDE</PixelButton>
              </Obf>
            )}

            {!hide && !showPlaceholder && (
              <ThumbMedia
                uri={preview}
                alt={nameSafe}
                allowScripts={hazards.scripts&&allowScr}
                onInvalid={()=>setThumbOk(false)}
              />
            )}

            {!hide && showPlaceholder && (
              <img src={PLACEHOLDER} alt="" style={{width:'60%',opacity:.45}}/>
            )}

            {hazards.scripts && !allowScr && !hide && (
              <Obf><EnableScriptsOverlay onAccept={askEnable}/></Obf>
            )}
          </ThumbWrap>

          <Meta>
            <h3 title={nameSafe}>{nameSafe}</h3>
            {authors.length>0&&<p>By {authors.join(', ')}</p>}

            <StatRow>
              <span>{live??'…'} Tokens</span>
              {Number.isFinite(owners)&&<span>{owners} Owners</span>}
            </StatRow>

            <AddrRow>
              <span title={contract.address}>{shortKt(contract.address)}</span>
              <PixelButton size="xs" title="Copy address"
                onClick={e=>{e.preventDefault();copyToClipboard(contract.address);}}>
                📋
              </PixelButton>
            </AddrRow>
          </Meta>
        </Card>
      </a>

      {dlgOpen&&(
        <PixelConfirmDialog
          open
          title="Enable scripts?"
          message={(
            <>
              <label style={{display:'flex',gap:'6px',alignItems:'center',marginBottom:'8px'}}>
                <input type="checkbox" checked={termsOk} onChange={e=>setTermsOk(e.target.checked)}/>
                I&nbsp;agree&nbsp;to&nbsp;<a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
              Executable code can be harmful. Proceed only if you trust the author.
            </>
          )}
          confirmLabel="OK"
          cancelLabel="Cancel"
          confirmDisabled={!termsOk}
          onConfirm={enableNow}
          onCancel={()=>setDlgOpen(false)}
        />
      )}
    </>
  );
}

CollectionCard.propTypes = {
  contract: PropTypes.shape({ address:PropTypes.string.isRequired }).isRequired,
};
/* EOF */
