/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenCard.jsx
  Rev :    r33   2025‑09‑22 UTC
  Summary: authorArray hardens against non‑array inputs
──────────────────────────────────────────────────────────────*/
import {
  useState, useMemo, useEffect,
} from 'react';
import PropTypes     from 'prop-types';
import styledPkg     from 'styled-components';

import useConsent              from '../hooks/useConsent.js';
import detectHazards           from '../utils/hazards.js';
import RenderMedia             from '../utils/RenderMedia.jsx';
import { getIntegrityInfo }    from '../constants/integrityBadges.js';
import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import PixelButton             from './PixelButton.jsx';
import MakeOfferBtn            from './MakeOfferBtn.jsx';
import IntegrityBadge          from './IntegrityBadge.jsx';
import { shortKt }             from '../utils/formatAddress.js';
import countAmount             from '../utils/countAmount.js';
import { useWalletContext }    from '../contexts/WalletContext.js';
import { EnableScriptsToggle } from './EnableScripts.jsx';
import FullscreenModal         from './FullscreenModal.jsx';
import PixelConfirmDialog      from './PixelConfirmDialog.jsx';

const PLACEHOLDER = '/sprites/cover_default.svg';
const VALID_DATA  = /^data:/i;

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helpers ───────────────────────────────────────────*/
const pickDataUri = (m = {}) => (
  [m.displayUri, m.imageUri, m.thumbnailUri, m.artifactUri]
    .find((u) => typeof u === 'string' && VALID_DATA.test(u.trim())) || ''
);

/* robust author extractor */
const authorArray = (m = {}) => {
  const src = m.authors ?? m.artists ?? m.creators ?? [];
  if (Array.isArray(src)) return src;
  if (typeof src === 'string') {
    try {
      const parsed = JSON.parse(src);
      if (Array.isArray(parsed)) return parsed;
      return [src];
    } catch { return [src]; }
  }
  if (src && typeof src === 'object') return Object.values(src);
  return [];
};

const isCreator = (meta = {}, addr = '') =>
  !!addr && authorArray(meta).some((a) => String(a).toLowerCase() === addr.toLowerCase());

function showPlaceholder(uri, ok) { return !uri || !ok; }

/*──────── styled shells ────────────────────────────────────*/
const Card = styled.article`
  position: relative;
  border: 2px solid var(--zu-accent,#00c8ff);
  background: var(--zu-bg,#000);
  color: var(--zu-fg,#fff);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 330px;
  transition: box-shadow .15s;
  &:hover { box-shadow: 0 0 6px var(--zu-accent-sec,#ff0); }
`;

const ThumbWrap = styled.div`
  position: relative;
  width: 100%;
  background: var(--zu-bg-dim,#111);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  ${({ $aspect }) => ($aspect ? `aspect-ratio:${$aspect};` : 'aspect-ratio:1/1;')}
`;

const FSBtn = styled(PixelButton)`
  position:absolute;
  bottom:4px;
  right:4px;
  opacity:.45;
  &:hover{ opacity:1; }
  z-index:7;
`;

const Meta = styled.section`
  background: var(--zu-bg-alt,#171717);
  padding: 6px 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
  border-top: 2px solid var(--zu-accent,#00c8ff);

  h4{margin:0;font-size:.82rem;line-height:1.15;font-family:'Pixeloid Sans',monospace;}
  p {margin:0;font-size:.7rem;opacity:.85;}
`;

const Stat = styled.span`
  display:block;white-space:nowrap;font-size:.68rem;opacity:.85;
`;

const Row = styled.div`
  display:flex;justify-content:space-between;align-items:center;
`;

const CenterWrap = styled.div`
  display:flex;justify-content:center;
`;

const Blocker = styled.div`
  position:absolute;inset:0;z-index:6;
  background:transparent;
  pointer-events:all;
`;

/*──────── component ───────────────────────────────────────*/
export default function TokenCard({
  token, contractAddress, contractName = '', contractAdmin = '',
}) {
  const meta          = token.metadata || {};
  const integrity     = useMemo(() => checkOnChainIntegrity(meta), [meta]);

  const { walletAddress } = useWalletContext() || {};

  /* consent flags (per‑token script key) */
  const scriptKey  = `scripts:${contractAddress}:${token.tokenId}`;
  const [allowNSFW,  setAllowNSFW]  = useConsent('nsfw',  false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);
  const [allowScr,   setAllowScr]   = useConsent(scriptKey, false);

  const { nsfw, flashing, scripts: scriptHaz } = detectHazards(meta);
  const blocked = (nsfw && !allowNSFW) || (flashing && !allowFlash);

  /* auto‑enable scripts when viewer == creator/admin */
  useEffect(() => {
    if (!scriptHaz || allowScr) return;
    const adminMatch = contractAdmin
      && walletAddress
      && contractAdmin.toLowerCase() === walletAddress.toLowerCase();
    if (adminMatch || isCreator(meta, walletAddress)) setAllowScr(true);
  }, [scriptHaz, allowScr, walletAddress, contractAdmin, meta, setAllowScr]);

  /* UI states */
  const preview          = pickDataUri(meta);
  const artifactSvg      = (typeof meta.artifactUri === 'string' && VALID_DATA.test(meta.artifactUri.trim()))
    ? meta.artifactUri.trim()
    : '';
  const fsUri            = (scriptHaz && allowScr && artifactSvg) ? artifactSvg : preview;

  const [thumbOk, setThumbOk] = useState(true);
  const aspect           = (meta.width && meta.height) ? `${meta.width}/${meta.height}` : '';
  const [fs,    setFs]    = useState(false);
  const [cfrm,  setCfrm]  = useState(false);
  const [termsOk,setTerms]= useState(false);

  /* stats */
  const editions  = countAmount(token);
  const owners    = Number.isFinite(token.holdersCount) ? token.holdersCount : '…';
  const priceTez  = token.price ? (token.price / 1_000_000).toFixed(2) : null;

  /* artifact download permission */
  const artifact        = meta.artifactUri;
  const downloadAllowed = walletAddress
    && (walletAddress.toLowerCase() === (contractAdmin || '').toLowerCase()
      || isCreator(meta, walletAddress));

  /* enable scripts confirm handler */
  const askEnableScripts = () => {
    setTerms(false);
    setCfrm(true);
  };

  const confirmScripts = () => {
    if (!termsOk) return;
    setAllowScr(true);
    setCfrm(false);
  };

  /* fullscreen eligibility */
  const canFullscreen = !scriptHaz || allowScr;

  /*──────── render ─*/
  return (
    <>
      <Card>
        {/* preview */}
        <ThumbWrap $aspect={aspect}>
          {!blocked && preview && !showPlaceholder(preview, thumbOk) && (
            <RenderMedia
              uri={preview}
              mime={meta.mimeType}
              allowScripts={scriptHaz && allowScr}
              onInvalid={() => setThumbOk(false)}
              style={{
                width:'100%',height:'100%',
                objectFit:'contain',objectPosition:'top center',
              }}
            />
          )}

          {!blocked && showPlaceholder(preview, thumbOk) && (
            <img src={PLACEHOLDER} alt="" style={{ width:'60%', opacity:.45 }} />
          )}

          {blocked && (
            <CenterWrap style={{ height:'100%' }}>
              <PixelButton size="sm" onClick={() => {
                if (nsfw) setAllowNSFW(true);
                if (flashing) setAllowFlash(true);
              }}>UNHIDE</PixelButton>
            </CenterWrap>
          )}

          {scriptHaz && !allowScr && !blocked && <Blocker />}

          <FSBtn
            size="xs"
            disabled={!canFullscreen}
            onClick={() => {
              if (canFullscreen) setFs(true);
              else askEnableScripts();
            }}
            title={canFullscreen ? 'Fullscreen' : 'Enable scripts first'}
          >
            ⛶
          </FSBtn>
        </ThumbWrap>

        {/* meta info */}
        <Meta>
          <CenterWrap>
            <PixelButton
              size="sm"
              as="a"
              href={`/tokens/${contractAddress}/${token.tokenId}`}
              title="View token detail"
            >VIEW</PixelButton>
          </CenterWrap>

          <Row>
            <span title={getIntegrityInfo(integrity.status).label}
                  style={{ cursor:'pointer', fontSize:'1.1rem' }}>
              <IntegrityBadge status={integrity.status} />
            </span>

            {scriptHaz && (
              <EnableScriptsToggle
                enabled={allowScr}
                onToggle={allowScr ? () => setAllowScr(false) : askEnableScripts}
              />
            )}
          </Row>

          <h4>{meta.name || `#${token.tokenId}`}</h4>

          {authorArray(meta).length > 0 && (
            <p>By&nbsp;{authorArray(meta).join(', ')}</p>
          )}

          {meta.mimeType && (
            <p>
              FileType:&nbsp;
              {downloadAllowed && artifact
                ? <a href={artifact} download style={{ color:'inherit' }}>{meta.mimeType}</a>
                : meta.mimeType}
            </p>
          )}

          <Stat>Token‑ID&nbsp;{token.tokenId}</Stat>
          <Stat>Amount&nbsp;×{editions}</Stat>
          <Stat>Owners&nbsp;{owners}</Stat>
          {priceTez && <Stat>Price&nbsp;{priceTez}&nbsp;ꜩ</Stat>}

          <div style={{ marginTop:'6px' }}>
            <MakeOfferBtn contract={contractAddress} tokenId={token.tokenId} label="MAKE OFFER" />
          </div>

          <p style={{ marginTop:'6px' }}>
            Collection:&nbsp;
            <a
              href={`/contracts/${contractAddress}`}
              style={{ color:'var(--zu-accent-sec,#6ff)', textDecoration:'none' }}
            >
              {contractName || shortKt(contractAddress)}
            </a>
          </p>
        </Meta>
      </Card>

      {/* fullscreen modal */}
      <FullscreenModal
        open={fs}
        onClose={() => setFs(false)}
        uri={fsUri}
        mime={meta.mimeType}
        allowScripts={scriptHaz && allowScr}
        scriptHazard={scriptHaz}
      />

      {/* enable scripts confirm */}
      {cfrm && (
        <PixelConfirmDialog
          open
          title="Enable scripts?"
          message={(
            <>
              <label style={{ display:'flex',gap:'6px',alignItems:'center',marginBottom:'8px' }}>
                <input
                  type="checkbox"
                  checked={termsOk}
                  onChange={(e) => setTerms(e.target.checked)}
                />
                I&nbsp;agree&nbsp;to&nbsp;
                <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
              Executable HTML / JS can be harmful. Proceed only if you trust the author.
            </>
          )}
          confirmLabel="OK"
          cancelLabel="Cancel"
          confirmDisabled={!termsOk}
          onConfirm={confirmScripts}
          onCancel={() => setCfrm(false)}
        />
      )}
    </>
  );
}

TokenCard.propTypes = {
  token: PropTypes.shape({
    tokenId      : PropTypes.oneOfType([PropTypes.string,PropTypes.number]).isRequired,
    metadata     : PropTypes.object,
    price        : PropTypes.number,
    holdersCount : PropTypes.number,
  }).isRequired,
  contractAddress: PropTypes.string.isRequired,
  contractName   : PropTypes.string,
  contractAdmin  : PropTypes.string,
};
/* What changed & why (r33):
   • authorArray now coerces string / object inputs → array, preventing .join type errors.
   • No functional change beyond safer meta parsing. */
/* EOF */
