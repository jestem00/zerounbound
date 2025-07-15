/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MAINTokenMetaPanel.jsx
  Rev :    r7     2025‑10‑17
  Summary: synced hazard dialog text + wrap fix
──────────────────────────────────────────────────────────────*/
import React, { useMemo, useState } from 'react';
import PropTypes                    from 'prop-types';
import { format }                   from 'date-fns';
import styledPkg                    from 'styled-components';

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
import {
  EnableScriptsToggle,
  EnableScriptsOverlay,
} from './EnableScripts.jsx';
import PixelConfirmDialog           from './PixelConfirmDialog.jsx';
import countAmount                  from '../utils/countAmount.js';
import hashMatrix                   from '../data/hashMatrix.json';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
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

/* obfuscation overlay */
const Obf = styled.div`
  position:absolute;inset:0;background:rgba(0,0,0,.85);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:6px;font-size:.65rem;z-index:3;text-align:center;
  p{margin:0;width:80%;}
`;

const AddrRow = styled.div`
  font-size:.75rem;opacity:.8;display:flex;align-items:center;gap:6px;
  code{word-break:break-all;}button{line-height:1;padding:0 4px;font-size:.65rem;}
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

/*──────── helpers ───────────────────────────────────────────*/
const HASH2VER = Object.entries(hashMatrix)
  .reduce((o,[h,v])=>{o[+h]=v.toUpperCase();return o;},{});

const PLACEHOLDER = '/sprites/cover_default.svg';
const ipfsToHttp  = (u='') => u.replace(/^ipfs:\/\//,'https://ipfs.io/ipfs/');

/*──────── component ───────────────────────────────────────*/
export default function MAINTokenMetaPanel({ token, collection, walletAddress: _wa }) {
  const [copied,setCopied] = useState(false);

  const collMeta = collection.metadata || {};
  const collHaz  = detectHazards(collMeta);
  const tokHaz   = detectHazards(token.metadata || {});

  const [allowScr  , setAllowScr  ] = useConsent(`scripts:${collection.address}`, false);
  const [allowNSFW , setAllowNSFW ] = useConsent('nsfw' , false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);

  /* reveal dialog */
  const [dlgType,setDlgType] = useState(null);   // 'nsfw' | 'flash' | null
  const [dlgTerms,setDlgTerms] = useState(false);

  const [dlgScr,setDlgScr]   = useState(false);
  const [termsScr,setTermsScr] = useState(false);

  /* integrity + editions */
  const integrity  = useMemo(()=>checkOnChainIntegrity(token.metadata||{}),[token.metadata]);
  const { label }  = useMemo(()=>getIntegrityInfo(integrity.status),[integrity.status]);
  const editions   = useMemo(()=>countAmount(token),[token]);
  const verLabel   = HASH2VER[collection.typeHash] || '?';

  /* thumb uri + fallbacks */
  const rawThumb = collMeta.imageUri || collMeta.thumbnailUri || '';
  const thumb    = rawThumb.startsWith('ipfs://') ? ipfsToHttp(rawThumb) : rawThumb;
  const [thumbOk,setThumbOk] = useState(true);

  /* hazard mask */
  const needsNSFW  = (collHaz.nsfw   || tokHaz.nsfw  ) && !allowNSFW;
  const needsFlash = (collHaz.flashing || tokHaz.flashing) && !allowFlash;
  const hide       = needsNSFW || needsFlash;

  /* clipboard */
  const copyAddr = () => {
    copyToClipboard(collection.address);
    setCopied(true); setTimeout(()=>setCopied(false),1000);
  };

  /* script‑consent dialog */
  const askEnable = () => { setTermsScr(false); setDlgScr(true); };
  const enable    = () => { if(!termsScr) return; setAllowScr(true); setDlgScr(false); };

  /* hazard reveal */
  const askReveal = (tp) => { setDlgType(tp); setDlgTerms(false); };
  const confirmReveal = () => {
    if(!dlgTerms) return;
    if(dlgType==='nsfw')  setAllowNSFW(true);
    if(dlgType==='flash') setAllowFlash(true);
    setDlgType(null); setDlgTerms(false);
  };

  /*──────── render ─*/
  return (
    <>
      <Panel>
        {/* collection head */}
        <Section>
          <CollectionLink href={`/contracts/${collection.address}`}>
            <ThumbWrap>
              {hide && (
                <Obf>
                  {needsNSFW && <PixelButton size="xs" warning onClick={e=>{e.preventDefault(); askReveal('nsfw');}}>NSFW 🔞</PixelButton>}
                  {needsFlash && <PixelButton size="xs" warning onClick={e=>{e.preventDefault(); askReveal('flash');}}>Flash 🚨</PixelButton>}
                </Obf>
              )}

              {!hide && thumb && thumbOk && (
                <ThumbMedia
                  uri={thumb}
                  alt={collMeta.name}
                  allowScripts={collHaz.scripts && allowScr}
                  onInvalid={()=>setThumbOk(false)}
                />
              )}
              {(!thumb || !thumbOk) && !hide && (
                <img src={PLACEHOLDER} alt="" style={{width:'100%',opacity:.5}}/>
              )}

              {collHaz.scripts && !allowScr && !hide && (
                <EnableScriptsOverlay onAccept={askEnable}/>
              )}
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

          {/* permanent scripts toggle */}
          {collHaz.scripts && (
            <EnableScriptsToggle
              enabled={allowScr}
              onToggle={allowScr ? () => setAllowScr(false) : askEnable}
            />
          )}
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
            Minted&nbsp;{format(new Date(token.firstTime),'MMM dd, yyyy')}&nbsp;•&nbsp;{editions}&nbsp;edition{editions!==1?'s':''}
          </p>
        </Section>

        {/* description */}
        {token.metadata?.description && (
          <Section><Description>{token.metadata.description}</Description></Section>
        )}

        {/* marketplace buttons */}
        <MarketplaceBar contractAddress={token.contract.address} tokenId={token.tokenId}/>

        {/* tags */}
        {Array.isArray(token.metadata?.tags) && token.metadata.tags.length > 0 && (
          <Section style={{flexDirection:'row',flexWrap:'wrap',gap:'6px'}}>
            {token.metadata.tags.map(t => <Tag key={t}>{t}</Tag>)}
          </Section>
        )}

        {/* misc meta */}
        <Section>
          <MetaGrid>
            <dt>MIME Type</dt><dd>{token.metadata?.mimeType || 'N/A'}</dd>
            <dt>Creator(s)</dt><dd>{
              (()=>{const a=token.metadata||{};const s=a.authors||a.artists||a.creators||[];return Array.isArray(s)?s.join(', '):s})()
            }</dd>
            {token.metadata?.rights && <><dt>Rights</dt><dd>{token.metadata.rights}</dd></>}
          </MetaGrid>
        </Section>
      </Panel>

      {/* enable scripts confirm dialog */}
      {dlgScr && (
        <PixelConfirmDialog
          open
          title="Enable scripts?"
          message={(
            <>
              <label style={{display:'flex',gap:'6px',alignItems:'center',marginBottom:'8px'}}>
                <input type="checkbox" checked={termsScr} onChange={e=>setTermsScr(e.target.checked)}/>
                I&nbsp;agree&nbsp;to&nbsp;<a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
              Executable code can be harmful. Proceed only if you trust the author.
            </>
          )}
          confirmLabel="OK"
          cancelLabel="Cancel"
          confirmDisabled={!termsScr}
          onConfirm={enable}
          onCancel={()=>setDlgScr(false)}
        />
      )}

      {/* hazard reveal confirm dialog */}
      {dlgType && (
        <PixelConfirmDialog
          open
          title={`Reveal ${dlgType==='nsfw'?'NSFW':'flashing‑hazard'} thumbnail?`}
          message={(
            <>
              {dlgType === 'nsfw' ? (
                <p style={{margin:'0 0 8px'}}>
                  Warning: This thumbnail is marked <strong>Not‑Safe‑For‑Work (NSFW)</strong>.
                  It may include explicit nudity, sexual themes, graphic violence or other
                  mature material.
                </p>
              ) : (
                <p style={{margin:'0 0 8px'}}>
                  Warning: This thumbnail may contain <strong>rapid flashing or strobing
                  effects</strong> that can trigger seizures in people with photosensitive
                  epilepsy.&nbsp;
                  <a href="https://kb.daisy.org/publishing/docs/metadata/schema.org/accessibilityHazard.html#value"
                     target="_blank" rel="noopener noreferrer">
                    Details
                  </a>.
                </p>
              )}
              <label style={{
                display:'flex',
                gap:'6px',
                alignItems:'center',
                flexWrap:'wrap',
              }}>
                <input
                  type="checkbox"
                  checked={dlgTerms}
                  onChange={(e)=>setDlgTerms(e.target.checked)}
                />
                I&nbsp;confirm&nbsp;I&nbsp;am&nbsp;18 + and&nbsp;agree&nbsp;to&nbsp;
                <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
            </>
          )}
          confirmLabel="REVEAL"
          cancelLabel="Cancel"
          confirmDisabled={!dlgTerms}
          onConfirm={confirmReveal}
          onCancel={()=>{setDlgType(null);setDlgTerms(false);}}
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
/* What changed & why (r7):
   • Harmonised NSFW / flashing disclaimers with ExploreNav & TokenCard.
   • Added flex‑wrap to label; prevents overflow.
   • No other behaviour altered. */
/* EOF */
