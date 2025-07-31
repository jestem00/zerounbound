/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenCard.jsx
  Rev :    r38    2025‑07‑26 UTC
  Summary: Enhanced TokenCard to resolve .tez domain names for
           authors, creators and collection addresses. Uses
           resolveTezosDomain() with NETWORK_KEY to support both
           mainnet and ghostnet. Falls back to truncated tz
           addresses when no domain is set. Preserves all
           existing features such as hazard consent, script
           toggles, previews, and offer actions.
──────────────────────────────────────────────────────────────*/

import {
  useState, useMemo, useEffect, useCallback,
} from 'react';
import PropTypes        from 'prop-types';
import styledPkg        from 'styled-components';

import useConsent                from '../hooks/useConsent.js';
import detectHazards             from '../utils/hazards.js';
import RenderMedia               from '../utils/RenderMedia.jsx';
import { getIntegrityInfo }      from '../constants/integrityBadges.js';
import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import PixelButton               from './PixelButton.jsx';
import MakeOfferBtn              from './MakeOfferBtn.jsx';
import IntegrityBadge            from './IntegrityBadge.jsx';
import { useWalletContext }      from '../contexts/WalletContext.js';
import { EnableScriptsToggle }   from './EnableScripts.jsx';
import FullscreenModal           from './FullscreenModal.jsx';
import PixelConfirmDialog        from './PixelConfirmDialog.jsx';
import countAmount               from '../utils/countAmount.js';
import { shortAddr }            from '../utils/formatAddress.js';
// Import domain resolver and network constant
import { resolveTezosDomain }    from '../utils/resolveTezosDomain.js';
import { NETWORK_KEY }           from '../config/deployTarget.js';

const PLACEHOLDER = '/sprites/cover_default.svg';
const VALID_DATA  = /^data:/i;

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helpers ───────────────────────────────────────────*/
const pickDataUri = (m = {}) => (
  [m.displayUri, m.imageUri, m.thumbnailUri, m.artifactUri]
    .find((u) => typeof u === 'string' && VALID_DATA.test(u.trim())) || ''
);

/* robust array coercions */
const toArray = (src) => {
  if (Array.isArray(src)) return src;
  if (typeof src === 'string') {
    try { const j = JSON.parse(src); return Array.isArray(j) ? j : [src]; }
    catch { return [src]; }
  }
  if (src && typeof src === 'object') return Object.values(src);
  return [];
};

const authorArray   = (m = {}) => toArray(m.authors);
const creatorArray  = (m = {}) => toArray(m.creators);

const isCreator = (meta = {}, addr = '') =>
  !!addr && creatorArray(meta).some((a) => String(a).toLowerCase() === addr.toLowerCase());

const hrefFor = (addr = '') => `/explore?cmd=tokens&admin=${addr}`;

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
  aspect-ratio: 1/1;
  background: var(--zu-bg-dim,#111);
  display: flex;
  justify-content: center;
  align-items: center;
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
  padding: 6px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  border-top: 2px solid var(--zu-accent,#00c8ff);

  h4{margin:0;font-size:.82rem;line-height:1.15;font-family:'Pixeloid Sans',monospace;}
  p {margin:0;font-size:.68rem;line-height:1.25;}
`;

const Stat = styled.span`
  display:block;white-space:nowrap;font-size:.65rem;opacity:.85;
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

  /* consent flags */
  const scriptKey  = `scripts:${contractAddress}:${token.tokenId}`;
  const [allowNSFW,  setAllowNSFW]  = useConsent('nsfw',  false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);
  const [allowScr,   setAllowScr]   = useConsent(scriptKey, false);

  const { nsfw, flashing, scripts: scriptHaz } = detectHazards(meta);

  const needsNSFW  = nsfw     && !allowNSFW;
  const needsFlash = flashing && !allowFlash;
  const blocked    = needsNSFW || needsFlash;

  /* auto‑enable scripts when viewer == creator/admin */
  useEffect(() => {
    if (!scriptHaz || allowScr) return;
    const adminMatch = contractAdmin
      && walletAddress
      && contractAdmin.toLowerCase() === walletAddress.toLowerCase();
    if (adminMatch || isCreator(meta, walletAddress)) setAllowScr(true);
  }, [scriptHaz, allowScr, walletAddress, contractAdmin, meta, setAllowScr]);

  /* UI states */
  const preview      = pickDataUri(meta);
  const artifactSvg  = (typeof meta.artifactUri === 'string' && VALID_DATA.test(meta.artifactUri.trim()))
    ? meta.artifactUri.trim()
    : '';
  const fsUri        = (scriptHaz && allowScr && artifactSvg) ? artifactSvg : preview;

  const [thumbOk, setThumbOk]   = useState(true);
  const [fs,      setFs]        = useState(false);

   /* reveal dialog */
  const [revealType, setRevealType] = useState(null);   // 'nsfw' | 'flash' | null
  const [termsOk,    setTermsOk]    = useState(false);

  /* author / creator merge + “more…” toggle */
  const authors  = authorArray(meta);
  const creators = creatorArray(meta);
  // Determine whether the creators line should be displayed separately
  const showCreatorsLine = creators.length > 0 && authors.join() !== creators.join();
  // Track whether the full list of authors or creators should be displayed
  const [showAllAuthors, setShowAllAuthors] = useState(false);
  const [showAllCreators, setShowAllCreators] = useState(false);

  /* domain name cache for addresses used in this card */
  const [domains, setDomains] = useState({});

  // Collect unique addresses to resolve: authors, creators, contractAddress
  useEffect(() => {
    const addrs = new Set();
    // Do not lowercase addresses here; keep the original case so that
    // reverse-record lookups work correctly. The resolver handles
    // caching using a lowercase key internally.
    authors.forEach(a => { if (a) addrs.add(a); });
    creators.forEach(a => { if (a) addrs.add(a); });
    if (contractAddress) addrs.add(contractAddress);
    addrs.forEach(addr => {
      if (domains[addr?.toLowerCase()] !== undefined) return;
      (async () => {
        const name = await resolveTezosDomain(addr, NETWORK_KEY);
        // Debug: log each resolution attempt and result
        console.debug('[TokenCard] resolved domain', { addr, network: NETWORK_KEY, name });
        setDomains(prev => {
          const key = addr?.toLowerCase();
          if (!key || prev[key] !== undefined) return prev;
          return { ...prev, [key]: name };
        });
      })();
    });
  }, [authors, creators, contractAddress]);

  /* Format a single author/creator entry. Look up the lower‑cased
   * address in the domain cache first; if a .tez name exists, return it.
   * Otherwise, return domains or human names verbatim, and truncate
   * raw addresses via shortAddr(). */
  const formatEntry = useCallback((val) => {
    if (!val || typeof val !== 'string') return String(val || '');
    const v = val.trim();
    const name = domains[v.toLowerCase()];
    if (name) return name;
    // If it looks like a domain (contains a dot) or does not start with tz/KT,
    // treat it as a user‑supplied name and return verbatim.
    if (v.includes('.') || !/^(tz|kt)/i.test(v)) return v;
    // Otherwise, abbreviate the address using the shared helper.
    return shortAddr(v);
  }, [domains]);

  /* Render a list of entries with optional “More” toggle. When not showing
   * the full list and more than three items exist, a clickable arrow is
   * appended to reveal all entries. */
  const renderEntryList = useCallback((list, showAll, toggle) => {
    const display = showAll ? list : list.slice(0, 3);
    const elems = display.map((item, idx) => {
      const prefix = idx > 0 ? ', ' : '';
      // Only render a hyperlink for address-like entries. Names and domains
      // are displayed as plain text.
      const isAddr = typeof item === 'string' && /^(tz|kt)/i.test(item.trim());
      const content = formatEntry(item);
      return isAddr ? (
        <a
          key={item}
          href={hrefFor(item)}
          style={{ color:'var(--zu-accent-sec,#6ff)', textDecoration:'none', wordBreak:'break-all' }}
        >
          {prefix}{content}
        </a>
      ) : (
        <span key={item} style={{ wordBreak:'break-all' }}>
          {prefix}{content}
        </span>
      );
    });
    if (list.length > 3 && !showAll) {
      elems.push(
        <>
          …&nbsp;
          <button
            type="button"
            aria-label="Show all entries"
            onClick={() => toggle(true)}
            style={{ background:'none', border:'none', color:'inherit', font:'inherit', cursor:'pointer', padding:0 }}
          >🔻More</button>
        </>
      );
    }
    return elems;
  }, [formatEntry]);

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
  const [cfrmScr,   setCfrmScr]   = useState(false);
  const [scrTerms,  setScrTerms]  = useState(false);
  const askEnableScripts = () => { setScrTerms(false); setCfrmScr(true); };
  const confirmScripts   = () => { if (scrTerms) { setAllowScr(true); setCfrmScr(false); } };

  const askReveal = (type) => { setRevealType(type); setTermsOk(false); };
  const doReveal  = () => {
    if (!termsOk) return;
    if (revealType === 'nsfw')  setAllowNSFW(true);
    if (revealType === 'flash') setAllowFlash(true);
    setRevealType(null); setTermsOk(false);
  };

  /*──────── render ─*/
  return (
    <>
      <Card>
        {/* preview */}
        <ThumbWrap>
          {!blocked && preview && !showPlaceholder(preview, thumbOk) && (
            <RenderMedia
              uri={preview}
              mime={meta.mimeType}
              allowScripts={scriptHaz && allowScr}
              onInvalid={() => setThumbOk(false)}
              style={{ width:'100%', height:'100%', objectFit:'contain', objectPosition:'center' }}
            />
          )}

          {!blocked && showPlaceholder(preview, thumbOk) && (
            <img src={PLACEHOLDER} alt="" style={{ width:'60%', opacity:.45 }} />
          )}

          {blocked && (
            <CenterWrap style={{ height:'100%', flexDirection:'column', gap:'6px', padding:'0 8px' }}>
              {needsNSFW && (
                <PixelButton size="sm" warning onClick={() => askReveal('nsfw')}>
                  NSFW&nbsp;🔞
                </PixelButton>
              )}
              {needsFlash && (
                <PixelButton size="sm" warning onClick={() => askReveal('flash')}>
                  Flashing&nbsp;🚨
                </PixelButton>
              )}
            </CenterWrap>
          )}

          {scriptHaz && !allowScr && !blocked && <Blocker />}

          <FSBtn
            size="xs"
            disabled={!(!scriptHaz || allowScr)}
            onClick={() => { (!scriptHaz || allowScr) ? setFs(true) : askEnableScripts(); }}
            title={(!scriptHaz || allowScr) ? 'Fullscreen' : 'Enable scripts first'}
          >⛶</FSBtn>
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

          {/* Authors line */}
          {authors.length > 0 && (
            <p style={{ wordBreak:'break-all' }}>
              Author(s)&nbsp;
              {renderEntryList(authors, showAllAuthors, setShowAllAuthors)}
            </p>
          )}
          {/* Creators line */}
          {creators.length > 0 && (
            <p style={{ wordBreak:'break-all', opacity: authors.length > 0 ? 0.8 : 1 }}>
              Creator(s)&nbsp;
              {renderEntryList(creators, showAllCreators, setShowAllCreators)}
            </p>
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

          <div style={{ marginTop:'4px' }}>
            <MakeOfferBtn contract={contractAddress} tokenId={token.tokenId} label="OFFER" />
          </div>

          <p style={{ marginTop:'4px' }}>
            Collection:&nbsp;
            <a
              href={`/contracts/${contractAddress}`}
              style={{ color:'var(--zu-accent-sec,#6ff)', textDecoration:'none' }}
            >
              {contractName || formatEntry(contractAddress)}
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
      {cfrmScr && (
        <PixelConfirmDialog
          open
          title="Enable scripts?"
          message={(
            <>
              <label style={{ display:'flex',gap:'6px',alignItems:'center',marginBottom:'8px' }}>
                <input
                  type="checkbox"
                  checked={scrTerms}
                  onChange={(e) => setScrTerms(e.target.checked)}
                />
                I&nbsp;agree&nbsp;to&nbsp;
                <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
              Executable HTML / JS can be harmful. Proceed only if you trust the author.
            </>
          )}
          confirmLabel="OK"
          cancelLabel="Cancel"
          confirmDisabled={!scrTerms}
          onConfirm={confirmScripts}
          onCancel={() => setCfrmScr(false)}
        />
      )}

      {/* hazard reveal confirm */}
      {revealType && (
        <PixelConfirmDialog
          open
          title={`Reveal ${revealType === 'nsfw' ? 'NSFW' : 'flashing‑hazard'} content?`}
          message={(
            <>
              {revealType === 'nsfw' ? (
                <p style={{ margin:'0 0 8px' }}>
                  This asset is flagged as <strong>Not‑Safe‑For‑Work (NSFW)</strong>. It may
                  contain explicit nudity, sexual content, graphic violence or other
                  mature themes. Viewer discretion is advised.
                </p>
              ) : (
                <p style={{ margin:'0 0 8px' }}>
                  This asset contains <strong>rapid flashing or strobing effects</strong>{' '}
                  which may trigger seizures for people with photosensitive epilepsy.
                  Learn more&nbsp;
                  <a href="https://kb.daisy.org/publishing/docs/metadata/schema.org/accessibilityHazard.html#value"
                     target="_blank" rel="noopener noreferrer">
                    here
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
                  checked={termsOk}
                  onChange={(e) => setTermsOk(e.target.checked)}
                />
                I&nbsp;confirm&nbsp;I&nbsp;am&nbsp;18 + and&nbsp;agree&nbsp;to&nbsp;
                <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
            </>
          )}
          confirmLabel="REVEAL"
          cancelLabel="Cancel"
          confirmDisabled={!termsOk}
          onConfirm={doReveal}
          onCancel={() => { setRevealType(null); setTermsOk(false); }}
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

/* What changed & why (r38):
   • Added in-component Tezos Domains lookup: a domains state caches
     resolved .tez names for authors, creators and the collection
     address. Lookups are launched via resolveTezosDomain() with
     NETWORK_KEY to support both mainnet and ghostnet.
   • Introduced formatEntry() and renderEntryList() to render
     Author(s) and Creator(s) lines: .tez domains and custom names
     display in full, Tezos addresses are abbreviated via shortAddr(),
     and long lists show a “More” toggle.
   • Collection link uses formatEntry() on the contract address to
     display a resolved domain or an abbreviated address.
   • Removed the on‑chain fallback from resolveTezosDomain() to avoid
     bigmap 404 errors; all resolutions use the GraphQL API with
     caching.
   • Maintained all existing features: hazard toggles, consent flows,
     script and fullscreen controls, previews, and offer button.
*/
/* EOF */