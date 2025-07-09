/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MAINTokenMetaPanel.jsx
  Rev :    r3    2025‑10‑09
  Summary: script‑toggle & hazards on collection thumb,
           shortKt address, ipfs preview, copy‑feedback,
           consistent UX with TokenCard
──────────────────────────────────────────────────────────────*/
import React, { useMemo, useState } from 'react';
import PropTypes                    from 'prop-types';
import styledPkg                    from 'styled-components';
import { format }                   from 'date-fns';

import PixelHeading                 from './PixelHeading.jsx';
import PixelButton                  from './PixelButton.jsx';
import RenderMedia                  from '../utils/RenderMedia.jsx';
import IntegrityBadge               from './IntegrityBadge.jsx';
import MarketplaceBar               from './MarketplaceBar.jsx';

import { checkOnChainIntegrity }    from '../utils/onChainValidator.js';
import { getIntegrityInfo }         from '../constants/integrityBadges.js';
import detectHazards                from '../utils/hazards.js';
import useConsent                   from '../hooks/useConsent.js';
import { shortKt, copyToClipboard } from '../utils/formatAddress.js';
import { EnableScriptsToggle, EnableScriptsOverlay } from './EnableScripts.jsx';
import PixelConfirmDialog           from './PixelConfirmDialog.jsx';
import countAmount                  from '../utils/countAmount.js';
import hashMatrix                   from '../data/hashMatrix.json';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──── styled shells ────*/
const Panel = styled.aside`
  display:flex;flex-direction:column;gap:1rem;
`;

const Section = styled.section`
  display:flex;flex-direction:column;gap:.5rem;
`;

const CollectionLink = styled.a`
  display:flex;align-items:center;gap:8px;text-decoration:none;color:inherit;
  &:hover{text-decoration:underline;}
`;

const ThumbWrap = styled.div`
  position:relative;width:32px;height:32px;flex:0 0 32px;
  border:1px solid var(--zu-fg);display:flex;align-items:center;justify-content:center;
`;

const ThumbMedia = styled(RenderMedia)`
  width:100%;height:100%;object-fit:contain;
`;

const AddrRow = styled.div`
  font-size:.75rem;opacity:.8;display:flex;align-items:center;gap:6px;
  code{word-break:break-all;}
`;

const Description = styled.p`
  font-size:.85rem;line-height:1.4;white-space:pre-wrap;margin:0;
`;

const BadgeWrap = styled.span`
  display:flex;align-items:center;gap:6px;line-height:1;
`;

const Tag = styled.span`
  display:inline-block;padding:2px 8px;border:1px solid var(--zu-fg);
  background:var(--zu-bg-alt);font-size:.7rem;border-radius:4px;
`;

const MetaGrid = styled.dl`
  display:grid;grid-template-columns:max-content 1fr;gap:4px 8px;font-size:.8rem;
  dt{font-weight:700;opacity:.8;}dd{margin:0;word-break:break-all;}
`;

/*──── helpers ────*/
const HASH2VER = Object.entries(hashMatrix)
  .reduce((o,[h,v])=>{o[+h]=v.toUpperCase();return o;},{});

/* ipfs helper */
const ipfsToHttp = (u='') => u.replace(/^ipfs:\/\//,'https://ipfs.io/ipfs/');

/*──── component ────*/
export default function MAINTokenMetaPanel({ token, collection, walletAddress }) {
  const [copied,setCopied] = useState(false);
  const collMeta = collection.metadata || {};

  /* collection preview hazards */
  const hazards = detectHazards(collMeta);
  const [allowScr,setAllowScr] = useConsent(`scripts:${collection.address}`,false);
  const [dlg,setDlg] = useState(false);
  const [terms,setTerms] = useState(false);

  const integrity = useMemo(()=>checkOnChainIntegrity(token.metadata||{}),[token.metadata]);
  const {label}  = useMemo(()=>getIntegrityInfo(integrity.status),[integrity.status]);

  const editions = useMemo(()=>countAmount(token),[token]);
  const verLabel = HASH2VER[collection.typeHash]||'?';

  /* thumb uri */
  const rawThumb = collMeta.imageUri||collMeta.thumbnailUri||'';
  const thumb = rawThumb.startsWith('ipfs://')?ipfsToHttp(rawThumb):rawThumb;

  const copyAddr = () => {
    copyToClipboard(collection.address);
    setCopied(true); setTimeout(()=>setCopied(false),1000);
  };

  const askEnable = () => {setTerms(false);setDlg(true);};
  const enable = () => {if(!terms)return;setAllowScr(true);setDlg(false);};

  return (
    <>
      <Panel>
        {/* collection head */}
        <Section>
          <CollectionLink href={`/contracts/${collection.address}`}>
            <ThumbWrap>
              {hazards.scripts&&(
                <span style={{position:'absolute',top:0,left:0}}>
                  <EnableScriptsToggle
                    enabled={allowScr}
                    onToggle={allowScr?()=>setAllowScr(false):askEnable}
                    size="xs"
                  />
                </span>
              )}
              {thumb ? (
                <ThumbMedia
                  uri={thumb}
                  alt={collMeta.name}
                  allowScripts={hazards.scripts&&allowScr}
                  onInvalid={()=>{}}
                />
              ) : (
                <img src="/sprites/cover_default.svg" alt="" style={{width:'100%',opacity:.5}}/>
              )}
              {hazards.scripts&&!allowScr&&<EnableScriptsOverlay onAccept={askEnable}/>}
            </ThumbWrap>

            <PixelHeading level={4} style={{margin:0,fontSize:'1rem'}}>
              {collMeta.name || shortKt(collection.address)}
            </PixelHeading>
          </CollectionLink>

          <AddrRow>
            <code title={collection.address}>{shortKt(collection.address)}</code>
            <PixelButton size="xs" onClick={copyAddr}>{copied?'✓':'📋'}</PixelButton>
            <span>({verLabel})</span>
          </AddrRow>
        </Section>

        {/* token name + integrity */}
        <Section>
          <PixelHeading level={2} style={{margin:0}}>
            <BadgeWrap>
              {token.metadata?.name || `Token #${token.tokenId}`}
              <IntegrityBadge status={integrity.status} title={label}/>
            </BadgeWrap>
          </PixelHeading>
          <p style={{margin:0,opacity:.8}}>
            Minted&nbsp;{format(new Date(token.firstTime),'MMM dd, yyyy')} • {editions} edition{editions!==1?'s':''}
          </p>
        </Section>

        {/* description */}
        {token.metadata?.description&&(
          <Section><Description>{token.metadata.description}</Description></Section>
        )}

        {/* marketplace buttons */}
        <MarketplaceBar contractAddress={token.contract.address} tokenId={token.tokenId}/>

        {/* tags */}
        {Array.isArray(token.metadata?.tags)&&token.metadata.tags.length>0&&(
          <Section style={{flexDirection:'row',flexWrap:'wrap',gap:'6px'}}>
            {token.metadata.tags.map(t=><Tag key={t}>{t}</Tag>)}
          </Section>
        )}

        {/* misc meta */}
        <Section>
          <MetaGrid>
            <dt>MIME Type</dt><dd>{token.metadata?.mimeType||'N/A'}</dd>
            <dt>Creator(s)</dt><dd>{
              (()=>{const a=token.metadata||{};const s=a.authors||a.artists||a.creators||[];return Array.isArray(s)?s.join(', '):s})()
            }</dd>
            {token.metadata?.rights&&<><dt>Rights</dt><dd>{token.metadata.rights}</dd></>}
          </MetaGrid>
        </Section>
      </Panel>

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

MAINTokenMetaPanel.propTypes = {
  token        : PropTypes.object.isRequired,
  collection   : PropTypes.object.isRequired,
  walletAddress: PropTypes.string,
};
/* EOF */
