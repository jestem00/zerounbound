/*──────── src/ui/TokenCard.jsx ──────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenCard.jsx
  Rev :    r16    2025‑09‑09
  Summary: unobtrusive “⚡ Enable‑scripts” button top‑left;
           SVG previews now shown even when scripts disabled.
──────────────────────────────────────────────────────────────*/
import {
  useState, useMemo, useCallback,
} from 'react';
import PropTypes      from 'prop-types';
import styledPkg      from 'styled-components';

import useConsent         from '../hooks/useConsent.js';
import detectHazards      from '../utils/hazards.js';
import RenderMedia        from '../utils/RenderMedia.jsx';
import { getIntegrityInfo } from '../constants/integrityBadges.js';
import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import PixelButton        from './PixelButton.jsx';
import MakeOfferBtn       from './MakeOfferBtn.jsx';
import IntegrityBadge     from './IntegrityBadge.jsx';
import { shortKt }        from '../utils/formatAddress.js';
import countAmount        from '../utils/countAmount.js';

const PLACEHOLDER = '/sprites/cover_default.svg';
const VALID_DATA  = /^data:/i;

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*── helpers ────────────────────────────────────────────────*/
const pickDataUri = (m = {}) => [
  m.displayUri,
  m.imageUri,
  m.thumbnailUri,
  m.artifactUri,
].find((u) => typeof u === 'string' && VALID_DATA.test(u.trim())) || '';

/*── styled shells ─────────────────────────────────────────*/
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
  &:focus { outline: 2px solid var(--zu-accent-sec,#ff0); }
`;

const ThumbWrap = styled.div`
  flex: 0 0 auto;
  position: relative;
  width: 100%;
  background: var(--zu-bg-dim,#111);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  ${({ $aspect }) => $aspect ? `aspect-ratio:${$aspect};` : ''}
`;

const Obf = styled.div`
  position: absolute; inset: 0;
  background: rgba(0,0,0,.85);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; text-align: center; font-size: .75rem;
  z-index: 9;
  p{margin:0;width:80%;}
`;

const Meta = styled.section`
  background: var(--zu-bg-alt,#171717);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 78px;
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

/* compact Make‑Offer button */
const OfferWrap = styled.div`
  transform: scale(.60);
  transform-origin: left center;
  flex: 0 0 auto;
`;

/*──────── component ───────────────────────────────────────*/
export default function TokenCard({
  token,
  contractAddress,
  contractName = '',
}) {
  const meta = token.metadata || {};

  const integrity  = useMemo(() => checkOnChainIntegrity(meta), [meta]);
  const { label }  = useMemo(() => getIntegrityInfo(integrity.status), [integrity.status]);

  /* consent */
  const [allowNSFW,    setAllowNSFW]    = useConsent('nsfw',    false);
  const [allowFlash,   setAllowFlash]   = useConsent('flash',   false);
  const [allowScripts, setAllowScripts] = useConsent('scripts', false);

  const { nsfw, flashing, scripts: scriptHaz } = detectHazards(meta);
  const hidden   = (nsfw && !allowNSFW) || (flashing && !allowFlash);
  const isSvg    = (meta.mimeType || '').toLowerCase() === 'image/svg+xml';

  /* preview */
  const preview       = pickDataUri(meta);
  const [thumbOk, setThumbOk] = useState(true);
  const showPlaceholder = !thumbOk || !preview;
  const onInvalid      = useCallback(() => setThumbOk(false), []);

  const aspect = (meta.width && meta.height) ? `${meta.width}/${meta.height}` : '';

  /* price / editions */
  const priceMutez = token.price || null;
  const priceTez   = priceMutez ? (priceMutez / 1_000_000).toFixed(2) : null;
  const editions   = countAmount(token);

  /* nav helpers */
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

  const authorArr = meta.authors || meta.artists || meta.creators || [];

  const keyHandler = (e) => {
    if (e.key === 'Enter' || e.key === ' ') openLarge(e);
  };

  /* script‑consent prompt */
  const requestScriptConsent = () => {
    const ok = window.confirm(
      'This token embeds executable HTML/JS.\n'
      + 'Running scripts could be harmful. Proceed only if you fully trust the author.\n\n'
      + 'By clicking “OK” you agree to the Terms of Service.',
    );
    if (ok) setAllowScripts(true);
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={openLarge}
      onKeyDown={keyHandler}
      aria-label={`Open token ${meta.name || token.tokenId}`}
    >
      <ThumbWrap $aspect={aspect}>
        {/* integrity badge */}
        <span title={label} style={{ position: 'absolute', top: 4, right: 4, zIndex: 11 }}>
          <IntegrityBadge status={integrity.status} />
        </span>

        {/* enable‑scripts button (always visible, unobtrusive) */}
        {scriptHaz && !allowScripts && (
          <PixelButton
            size="xs"
            warning
            title="Enable scripts"
            style={{ position: 'absolute', top: 4, left: 4, zIndex: 11 }}
            onClick={(e) => { e.stopPropagation(); requestScriptConsent(); }}
          >
            ⚡
          </PixelButton>
        )}

        {/* NSFW / flashing blocker */}
        {hidden && (
          <Obf onClick={openLarge}>
            <p>{nsfw && 'NSFW'}{nsfw && flashing ? ' / ' : ''}{flashing && 'Flashing'}</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <PixelButton
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  if (nsfw)    setAllowNSFW(true);
                  if (flashing)setAllowFlash(true);
                }}
              >
                Unhide
              </PixelButton>
              <PixelButton
                size="sm"
                onClick={(e) => { e.stopPropagation(); openLarge(e); }}
              >
                View
              </PixelButton>
            </div>
          </Obf>
        )}

        {/* script‑blocking overlay for non‑SVG HTML/JS media */}
        {scriptHaz && !allowScripts && !hidden && !isSvg && (
          <Obf onClick={openLarge}>
            <p>Executable media detected.</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <PixelButton
                size="sm"
                warning
                onClick={(e) => { e.stopPropagation(); requestScriptConsent(); }}
              >
                Allow scripts
              </PixelButton>
              <PixelButton
                size="sm"
                onClick={(e) => { e.stopPropagation(); openLarge(e); }}
              >
                View
              </PixelButton>
            </div>
          </Obf>
        )}

        {/* actual preview */}
        {!hidden && !showPlaceholder && (
          <RenderMedia
            uri={preview}
            mime={meta.mimeType}
            alt={meta.name}
            allowScripts={scriptHaz && allowScripts}
            style={{
              width: '100%',
              height: 'auto',
              objectFit: 'contain',
              objectPosition: 'top center',
            }}
            onInvalid={onInvalid}
          />
        )}
        {!hidden && showPlaceholder && (
          <img
            src={PLACEHOLDER}
            alt=""
            style={{ width: '60%', opacity: 0.45, alignSelf: 'flex-start' }}
          />
        )}
      </ThumbWrap>

      <Meta>
        <h4>
          <a
            href={`/largeview/${contractAddress}/${token.tokenId}`}
            onClick={openLarge}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            {meta.name || `#${token.tokenId}`}
          </a>
        </h4>

        {authorArr.length > 0 && <p>By {authorArr.join(', ')}</p>}

        <PriceRow>
          {priceTez && <span>{priceTez} ꜩ</span>}
          <OfferWrap>
            <MakeOfferBtn contract={contractAddress} tokenId={token.tokenId} />
          </OfferWrap>
        </PriceRow>

        <StatRow>
          <Addr href={`/contracts/${contractAddress}`} onClick={openContract}>
            {contractName || shortKt(contractAddress)}
          </Addr>
          <span>ID {token.tokenId}</span>
          <span>×{editions}</span>
        </StatRow>
      </Meta>
    </Card>
  );
}

TokenCard.propTypes = {
  token: PropTypes.shape({
    tokenId     : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    metadata    : PropTypes.object,
    price       : PropTypes.number,
    totalSupply : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  contractAddress: PropTypes.string.isRequired,
  contractName   : PropTypes.string,
};
/* EOF */
