/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ContractMetaPanelContracts.jsx
  Rev :    r5    2025‑10‑09
  Summary: hazards + script‑toggle, shortKt, copyable addr,
           fallback preview support (ipfs/http), confirm dlg
──────────────────────────────────────────────────────────────*/
import React, { useMemo, useState } from 'react';
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
import { shortKt, copyToClipboard } from '../utils/formatAddress.js';
import {
  EnableScriptsToggle,
  EnableScriptsOverlay,
} from './EnableScripts.jsx';
import decodeHexFields,{decodeHexJson} from '../utils/decodeHexFields.js';

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
            <code title={contractAddress}>{shortKt(contractAddress)}</code>
            <PixelButton size="xs" onClick={copy}>📋</PixelButton>
          </AddrRow>

          {metaObj.description&&<Desc>{metaObj.description}</Desc>}

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
