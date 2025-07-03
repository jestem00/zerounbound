/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenCard.jsx
  Rev :    r5     2025‑08‑24
  Summary: creators alias + author‑fallback
──────────────────────────────────────────────────────────────*/
import {
  useState, useMemo, useCallback,
}                         from 'react';
import PropTypes          from 'prop-types';
import styledPkg          from 'styled-components';

import useConsent         from '../hooks/useConsent.js';
import detectHazards      from '../utils/hazards.js';
import RenderMedia        from '../utils/RenderMedia.jsx';
import { getIntegrityInfo } from '../constants/integrityBadges.js';
import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import PixelButton        from './PixelButton.jsx';
import IntegrityBadge     from './IntegrityBadge.jsx';
import { shortKt }        from '../utils/formatAddress.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Card = styled.article`
  position: relative;
  border: 2px solid var(--zu-accent,#00c8ff);
  background: var(--zu-bg,#000);
  color: var(--zu-fg,#fff);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: box-shadow .15s;
  &:hover { box-shadow: 0 0 6px var(--zu-accent-sec,#ff0); }
`;

const ThumbWrap = styled.div`
  flex: 0 0 100%;
  position: relative;
  width: 100%;
  background: var(--zu-bg-dim,#111);
  display: flex;
  justify-content: center;
  align-items: center;
  aspect-ratio: ${({ $aspect }) => $aspect || '1/1'};
`;

const Obf = styled.div`
  position: absolute; inset: 0;
  background: rgba(0,0,0,.85);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; text-align: center; font-size: .75rem; z-index: 5;
  p{margin:0;width:80%;}
`;

const Meta = styled.section`
  background: var(--zu-bg-alt,#171717);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 70px;
  h4{margin:0;font-size:.82rem;line-height:1.15;font-family:'Pixeloid Sans',monospace;}
  p {margin:0;font-size:.7rem;opacity:.85;}
`;

const StatRow = styled.div`
  display:flex;justify-content:space-between;align-items:center;font-size:.7rem;
`;

const Addr = styled.a`
  font-size:.65rem;opacity:.7;text-decoration:none;color:inherit;
  &:hover{text-decoration:underline;}
`;

const PriceRow = styled.div`
  font-size:.75rem;display:flex;align-items:center;gap:6px;margin-top:2px;
  span{white-space:nowrap;}
`;

/*──────── helpers ───────────────────────────────────────────*/
const ipfsToHttp = (u='') => u.replace(/^ipfs:\/\//,'https://ipfs.io/ipfs/');

/*──────── component ─────────────────────────────────────────*/
export default function TokenCard({
  token,
  contractAddress,
  contractName = '',
}) {
  const meta = token.metadata || {};

  /* integrity badge */
  const integrity = useMemo(() => checkOnChainIntegrity(meta), [meta]);
  const { label } = useMemo(
    () => getIntegrityInfo(integrity.status),
  [integrity.status]);

  /* user‑consent gating */
  const [allowNSFW,    setAllowNSFW]    = useConsent('nsfw',    false);
  const [allowFlash,   setAllowFlash]   = useConsent('flash',   false);
  const [allowScripts, setAllowScripts] = useConsent('scripts', false);

  /* hazards */
  const { nsfw, flashing, scripts } = detectHazards(meta);
  const hidden = (nsfw && !allowNSFW) || (flashing && !allowFlash);

  /* script hazard extra checks */
  const htmlRegex   = /\.(html?|js)(\?.*)?$/i;
  const artUri      = meta.artifactUri || '';
  const displayUri  = meta.displayUri  || '';
  const extraScript = htmlRegex.test(artUri) || htmlRegex.test(displayUri)
    || /^data:text\/html/i.test(artUri);
  const scriptHaz   = scripts || extraScript;

  /* preview pick */
  const preview = ipfsToHttp(
    meta.displayUri || meta.imageUri || meta.artifactUri || '',
  );

  const [thumbOk, setThumbOk] = useState(true);
  const onInvalid = useCallback(()=>setThumbOk(false),[]);

  /* aspect ratio */
  const aspect =
    meta.width && meta.height
      ? `${meta.width}/${meta.height}`
      : '1/1';

  /* price placeholder */
  const priceMutez = token.price ?? token.listPrice ?? null;
  const priceTez   = priceMutez ? (priceMutez / 1_000_000).toFixed(2) : null;

  /* author fallback (authors → creators → artists) */
  const authorsArr = meta.authors
    ?? meta.creators
    ?? meta.artists
    ?? [];
  const authorsTxt = Array.isArray(authorsArr) ? authorsArr.join(', ') : authorsArr;

  /* navigation */
  const openLarge = (e) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    window.open(`/largeview/${contractAddress}/${token.tokenId}`, '_blank');
  };
  const openContract = (e) => {
    e.stopPropagation();
    e.preventDefault();
    window.location.href = `/contracts/${contractAddress}`;
  };

  if (!thumbOk) return null;

  return (
    <Card onClick={openLarge}>
      <ThumbWrap $aspect={aspect}>
        <span title={label}
              style={{ position:'absolute', top:4, right:4, zIndex:6 }}>
          <IntegrityBadge status={integrity.status} />
        </span>

        {hidden && (
          <Obf>
            <p>{nsfw && 'NSFW'}{nsfw && flashing ? ' / ' : ''}{flashing && 'Flashing'}</p>
            <PixelButton size="sm" onClick={(e)=>{
              e.stopPropagation();
              if (nsfw)    setAllowNSFW(true);
              if (flashing)setAllowFlash(true);
            }}>Unhide</PixelButton>
          </Obf>
        )}

        {!hidden && (
          <RenderMedia
            uri={preview}
            mime={meta.mimeType}
            alt={meta.name}
            allowScripts={scriptHaz && allowScripts}
            style={{ width:'100%', height:'100%', objectFit:'contain' }}
            onInvalid={onInvalid}
          />
        )}

        {scriptHaz && !allowScripts && !hidden && (
          <Obf>
            <p>Executable media detected.</p>
            <PixelButton size="sm" warning onClick={(e)=>{
              e.stopPropagation();
              if (window.confirm(
                'This token embeds executable code (HTML/JS).\n'
                + 'Enable scripts ONLY if you fully trust the author.\n'
                + 'ZeroContract Studio is not liable for any signatures\n'
                + 'or wallet prompts triggered by this media.',
              )) {
                setAllowScripts(true);
              }
            }}>Allow scripts</PixelButton>
          </Obf>
        )}
      </ThumbWrap>

      <Meta>
        <h4>
          <a href={`/largeview/${contractAddress}/${token.tokenId}`}
             onClick={openLarge}
             style={{ color:'inherit', textDecoration:'none' }}>
            {meta.name || `#${token.tokenId}`}
          </a>
        </h4>

        {authorsTxt && (
          <p>By {authorsTxt}</p>
        )}

        {priceTez && (
          <PriceRow>
            <span>{priceTez} ꜩ</span>
            <PixelButton size="xs" warning
              onClick={(e)=>{e.stopPropagation(); /* TODO make‑offer wiring */}}>
              Make Offer
            </PixelButton>
          </PriceRow>
        )}

        <StatRow>
          <Addr href={`/contracts/${contractAddress}`} onClick={openContract}>
            {contractName || shortKt(contractAddress)}
          </Addr>
          <span>ID {token.tokenId}</span>
        </StatRow>
      </Meta>
    </Card>
  );
}

TokenCard.propTypes = {
  token           : PropTypes.shape({
    tokenId : PropTypes.oneOfType([PropTypes.string,PropTypes.number]).isRequired,
    metadata: PropTypes.oneOfType([PropTypes.object,PropTypes.string]),
    price   : PropTypes.number,
    listPrice: PropTypes.number,
  }).isRequired,
  contractAddress : PropTypes.string.isRequired,
  contractName    : PropTypes.string,
};
/* What changed & why (r5):
   • Displays creators/artists when authors absent.
   • Price alias `listPrice` recognised.
   • Hex‑metadata now decoded upstream so fields render.
   • No visual regressions; keeps I106 gating intact. */
/* EOF */
