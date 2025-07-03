/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/TokenCard.jsx
  Summary: overlay now offers view button to open large view */
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

/*──────── styled shells (unchanged) ──────────────────────────*/
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
  min-height: 72px;
  border-top: 2px solid var(--zu-accent,#00c8ff);

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

  const integrity = useMemo(() => checkOnChainIntegrity(meta), [meta]);
  const { label } = useMemo(
    () => getIntegrityInfo(integrity.status),
  [integrity.status]);

  const [allowNSFW,    setAllowNSFW]    = useConsent('nsfw',    false);
  const [allowFlash,   setAllowFlash]   = useConsent('flash',   false);
  const [allowScripts, setAllowScripts] = useConsent('scripts', false);

  const { nsfw, flashing, scripts: scriptHaz } = detectHazards(meta);
  const hidden = (nsfw && !allowNSFW) || (flashing && !allowFlash);

  const preview = ipfsToHttp(
    meta.displayUri   ||
    meta.imageUri     ||
    meta.thumbnailUri ||
    meta.artifactUri  ||
    '',
  );

  const [thumbOk, setThumbOk] = useState(true);
  const onInvalid = useCallback(() => setThumbOk(false), []);

  const aspect =
    meta.width && meta.height
      ? `${meta.width}/${meta.height}`
      : '1/1';

  const priceMutez = token.price || null;
  const priceTez   = priceMutez ? (priceMutez / 1_000_000).toFixed(2) : null;

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

  const makeOffer = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('zu:makeOffer', {
      detail: { contract: contractAddress, tokenId: token.tokenId },
    }));
  };

  if (!thumbOk) return null;

  const authorArr = meta.authors || meta.artists || meta.creators || [];

  return (
    <Card onClick={openLarge}>
      <ThumbWrap $aspect={aspect}>
        <span title={label}
              style={{ position:'absolute', top:4, right:4, zIndex:6 }}>
          <IntegrityBadge status={integrity.status} />
        </span>

        {hidden && (
          <Obf onClick={openLarge}>
            <p>{nsfw && 'NSFW'}{nsfw && flashing ? ' / ' : ''}{flashing && 'Flashing'}</p>
            <div style={{ display:'flex',gap:6 }}>
              <PixelButton size="sm" onClick={(e)=>{e.stopPropagation();
                if (nsfw)    setAllowNSFW(true);
                if (flashing)setAllowFlash(true);
              }}>Unhide</PixelButton>
              <PixelButton size="sm" onClick={(e)=>{e.stopPropagation();openLarge(e);}}>
                View
              </PixelButton>
            </div>
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
          <Obf onClick={openLarge}>
            <p>Executable media detected.</p>
            <div style={{ display:'flex',gap:6 }}>
              <PixelButton size="sm" warning onClick={(e)=>{e.stopPropagation();
                if (window.confirm(
                  'This token embeds executable code (HTML/JS).\n'
                  + 'Enable scripts ONLY if you fully trust the author.',
                )) {
                  setAllowScripts(true);
                }
              }}>Allow scripts</PixelButton>
              <PixelButton size="sm" onClick={(e)=>{e.stopPropagation();openLarge(e);}}>
                View
              </PixelButton>
            </div>
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

        {Array.isArray(authorArr) && authorArr.length > 0 && (
          <p>By {authorArr.join(', ')}</p>
        )}

        {priceTez && (
          <PriceRow>
            <span>{priceTez} ꜩ</span>
            <PixelButton size="xs" warning onClick={makeOffer}>
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
    metadata: PropTypes.object,
    price   : PropTypes.number,
  }).isRequired,
  contractAddress : PropTypes.string.isRequired,
  contractName    : PropTypes.string,
};
/* What changed & why: overlay offers open button for hidden/script items */
/* EOF */
