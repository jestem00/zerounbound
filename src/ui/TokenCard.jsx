/*Developed by @jams2blues
  File: src/ui/TokenCard.jsx
  Rev:  r45
  Summary: Listing card. Separate Author(s)/Creator(s) rows, remove Owners,
           preserve r44 features; fix click‑through to detail when scripts
           enabled via full‑tile anchor; keep universal download & KT1 link. */

import {
  useState, useMemo, useEffect, useCallback,
} from 'react';
import PropTypes        from 'prop-types';
import styledPkg        from 'styled-components';

import useConsent                from '../hooks/useConsent.js';
import detectHazards             from '../utils/hazards.js';
import RenderMedia               from '../utils/RenderMedia.jsx';
import ShareDialog               from './ShareDialog.jsx';
import { getIntegrityInfo }      from '../constants/integrityBadges.js';
import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import PixelButton               from './PixelButton.jsx';
import MakeOfferBtn              from './MakeOfferBtn.jsx';
import IntegrityBadge            from './IntegrityBadge.jsx';
import { useWallet }             from '../contexts/WalletContext.js';
import { EnableScriptsToggle }   from './EnableScripts.jsx';
import FullscreenModal           from './FullscreenModal.jsx';
import PixelConfirmDialog        from './PixelConfirmDialog.jsx';
import countAmount               from '../utils/countAmount.js';
import { shortAddr }             from '../utils/formatAddress.js';
import { resolveTezosDomain }    from '../utils/resolveTezosDomain.js';
import decodeHexFields, { decodeHexJson } from '../utils/decodeHexFields.js';
import { TZKT_API, NETWORK_KEY } from '../config/deployTarget.js';

const PLACEHOLDER = '/sprites/cover_default.svg';
const VALID_DATA  = /^data:/i;

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helpers ───────────────────────────────────────────*/
const pickDataUri = (m = {}) => (
  [m.displayUri, m.imageUri, m.thumbnailUri, m.artifactUri]
    .find((u) => typeof u === 'string' && VALID_DATA.test(u.trim())) || ''
);

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
  !!addr && creatorArray(meta).some((a) => String(a).toLowerCase() === String(addr).toLowerCase());

const isTz = (s) => typeof s === 'string' && /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/i.test(s?.trim());
const isKt = (s) => typeof s === 'string' && /^KT1[0-9A-Za-z]{33}$/i.test(s?.trim());

const hrefFor = (addr = '') => {
  const extra = (NETWORK_KEY && String(NETWORK_KEY).toLowerCase() !== 'mainnet')
    ? `&net=${encodeURIComponent(NETWORK_KEY)}`
    : '';
  return `/explore/tokens?admin=${addr}${extra}`;
};

/*── TzKT helpers to resolve a collection name from KT1 ──*/
const COLL_NAME_CACHE = new Map(); // lc(KT1) -> name
const apiBase = `${String(TZKT_API || '').replace(/\/+$/, '')}/v1`;

async function fetchCollectionName(kt1) {
  if (!isKt(kt1)) return '';
  const key = kt1.toLowerCase();
  if (COLL_NAME_CACHE.has(key)) return COLL_NAME_CACHE.get(key);

  let name = '';
  try {
    // Try big-map metadata/content first (often hex-encoded JSON).
    try {
      const r1 = await fetch(
        `${apiBase}/contracts/${encodeURIComponent(kt1)}/bigmaps/metadata/keys?key=content&select=value&limit=1`,
        { cache: 'no-store' },
      );
      if (r1.ok) {
        const arr = await r1.json();
        const raw = Array.isArray(arr) ? arr[0] : null;
        const parsed = decodeHexJson(typeof raw === 'string' ? raw : '');
        if (parsed && typeof parsed === 'object') {
          const m = decodeHexFields(parsed);
          name = String(m.name || m.collectionName || m.title || '').trim();
        }
      }
    } catch { /* ignore */ }

    // Fallback: contract metadata field.
    if (!name) {
      const r2 = await fetch(`${apiBase}/contracts/${encodeURIComponent(kt1)}`, { cache: 'no-store' });
      if (r2.ok) {
        const obj = await r2.json();
        const m = decodeHexFields(obj?.metadata || {});
        name = String(m.name || m.collectionName || m.title || '').trim();
      }
    }
  } catch { /* network issues → empty */ }

  COLL_NAME_CACHE.set(key, name);
  return name;
}

/*── filename helpers for universal downloads ──*/
const sanitizeFilename = (s) =>
  String(s || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();

const extFromMime = (mt) => {
  const mime = String(mt || '').toLowerCase();
  if (!mime) return '';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'audio/mpeg') return 'mp3';
  if (mime === 'text/html') return 'html';
  if (mime === 'application/pdf') return 'pdf';
  const main = mime.split(';', 1)[0];
  const tail = main.split('/')[1] || '';
  return tail.replace(/\+.*$/, '') || '';
};

const suggestedFilename = (meta = {}, tokenId) => {
  const base = sanitizeFilename(meta?.name || `token-${tokenId ?? ''}`) || 'download';
  const ext  = extFromMime(meta?.mimeType) || '';
  return ext ? `${base}.${ext}` : base;
};

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
  aspect-ratio: 1 / 1;  /* strict square */
  background: var(--zu-bg-dim,#111);
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  outline: none;
  &:focus-visible { box-shadow: inset 0 0 0 3px rgba(0,200,255,.45); }
`;

/* Full-tile invisible <a> that restores navigation when scripts are enabled.
   Stacks above the preview media but below floating controls. */
const LinkCover = styled.a`
  position: absolute;
  inset: 0;
  z-index: 6;             /* FS button is z:7 → stays above */
  text-decoration: none;
  /* Keep it focusable only via container key handlers; avoid duplicate focus rings. */
  outline: none;
`;

const FSBtn = styled(PixelButton)`
  position:absolute;
  bottom:4px;
  right:4px;
  opacity:.45;
  &:hover{ opacity:1; }
  z-index:7; /* above preview + LinkCover */
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

/* Single row for Token-ID (#) ⟷ Amount (×n) */
const StatRow = styled.div`
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:8px;
`;

/*──────── component ───────────────────────────────────────*/
export default function TokenCard({
  token, contractAddress, contractName = '', contractAdmin = '',
}) {
  const meta          = token.metadata || {};
  const integrity     = useMemo(() => checkOnChainIntegrity(meta), [meta]);

  const { walletAddress } = useWallet() || {};

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
    ? meta.artifactUri.trim() : '';
  const fsUri        = (scriptHaz && allowScr && artifactSvg) ? artifactSvg : preview;

  const [thumbOk, setThumbOk]   = useState(true);
  const [fs,      setFs]        = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  /* reveal dialog */
  const [revealType, setRevealType] = useState(null);   // 'nsfw' | 'flash' | null
  const [termsOk,    setTermsOk]    = useState(false);

  /* author / creator lists with link + drawer (single-line labels; separate rows) */
  const authors  = toArray(meta.authors);
  const creators = toArray(meta.creators);
  const [showAllAuthors, setShowAllAuthors] = useState(false);
  const [showAllCreators, setShowAllCreators] = useState(false);

  /* domains */
  const [domains, setDomains] = useState({});
  useEffect(() => {
    const addrs = new Set();
    authors.forEach(a => { if (typeof a === 'string' && isTz(a)) addrs.add(a.trim()); });
    creators.forEach(a => { if (typeof a === 'string' && isTz(a)) addrs.add(a.trim()); });

    addrs.forEach(addr => {
      const key = addr?.toLowerCase();
      if (!key || domains[key] !== undefined) return;
      (async () => {
        const name = await resolveTezosDomain(addr, NETWORK_KEY);
        setDomains(prev => (prev[key] !== undefined ? prev : { ...prev, [key]: name }));
      })();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authors.join('|'), creators.join('|')]);

  const formatEntry = useCallback((val) => {
    if (!val || typeof val !== 'string') return String(val || '');
    const v = val.trim();
    const name = domains[v.toLowerCase()];
    if (name) return name;
    if (v.includes('.') || !/^(tz|kt)/i.test(v)) return v;
    return shortAddr(v);
  }, [domains]);

  const renderEntryList = useCallback((list, showAll, toggle) => {
    const display = showAll ? list : list.slice(0, 3);
    const elems = display.map((item, idx) => {
      const prefix = idx > 0 ? ', ' : '';
      const isAddr = typeof item === 'string' && /^(tz|kt)/i.test(item.trim());
      const content = formatEntry(item);
      return isAddr ? (
        <a
          key={`${item}_${idx}`}
          href={hrefFor(item)}
          style={{ color:'var(--zu-accent-sec,#6ff)', textDecoration:'none', wordBreak:'break-word', overflowWrap:'anywhere' }}
        >
          {prefix}{content}
        </a>
      ) : (
        <span key={`${String(item)}_${idx}`} style={{ wordBreak:'break-word', overflowWrap:'anywhere' }}>
          {prefix}{content}
        </span>
      );
    });
    if (list.length > 3 && !showAll) {
      elems.push(
        <span key="more">
          …&nbsp;
          <button
            type="button"
            aria-label="Show all entries"
            onClick={(e) => { e.preventDefault(); toggle(true); }}
            style={{ background:'none', border:'none', color:'inherit', font:'inherit', cursor:'pointer', padding:0 }}
          >🔻More</button>
        </span>
      );
    }
    return elems;
  }, [formatEntry]);

  /* stats (card layout removes Owners here per user request) */
  const editions  = countAmount(token);

  /* artifact download (universal) */
  const artifact        = meta.artifactUri;
  const downloadAllowed = Boolean(artifact && String(artifact).trim());
  const fname           = useMemo(() => suggestedFilename(meta, token.tokenId), [meta, token.tokenId]);

  /* enable scripts confirm handler */
  const [cfrmScr,   setCfrmScr]   = useState(false);
  const [scrTerms,  setScrTerms]  = useState(false);
  const askEnableScripts = () => { setScrTerms(false); setCfrmScr(true); };
  const confirmScripts   = () => { if (scrTerms) { setAllowScr(true); setCfrmScr(false); } };

  /* navigation helpers (tile = link; keep video controls functional). 
     IMPORTANT: if blocked by NSFW/Flashing, do not navigate. */
  const tokenHref = `/tokens/${contractAddress}/${token.tokenId}`;
  const goDetail = useCallback(() => { window.location.href = tokenHref; }, [tokenHref]);

  const onKey = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (blocked) {
        setRevealType(needsNSFW ? 'nsfw' : 'flash');
      } else {
        goDetail();
      }
    }
  }, [blocked, needsNSFW, goDetail]);

  const isMediaControlsHit = useCallback((e) => {
    const v = e.target?.closest?.('video, audio');
    if (!v) return false;
    const r = v.getBoundingClientRect?.(); if (!r) return true;
    const band = Math.max(34, Math.min(64, r.height * 0.22));
    const yFromBottom = r.bottom - (e.clientY ?? 0);
    return yFromBottom <= band;
  }, []);

  const onThumbClick = useCallback((e) => {
    if (blocked) {
      e.preventDefault();
      setRevealType(needsNSFW ? 'nsfw' : 'flash');
      return;
    }
    if (!isMediaControlsHit(e)) goDetail();
  }, [blocked, needsNSFW, goDetail, isMediaControlsHit]);

  /* collection name: resolve from KT1 when no prop is provided */
  const [collectionName, setCollectionName] = useState(contractName || '');
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (contractName && contractName.trim()) { setCollectionName(contractName.trim()); return; }
      const name = await fetchCollectionName(contractAddress);
      if (!cancel) setCollectionName(name || '');
    })();
    return () => { cancel = true; };
  }, [contractAddress, contractName]);

  const collectionLabel = collectionName && collectionName.trim()
    ? collectionName.trim()
    : shortAddr(contractAddress);

  /* Is the preview scripted and currently allowed? 
     If yes, overlay a full‑tile <a> so clicks always route to detail,
     avoiding event capture by iframes/interactive HTML. */
  const scriptedPreviewActive = Boolean(scriptHaz && allowScr);

  return (
    <>
      <Card>
        {/* preview (1:1 clickable tile) */}
        <ThumbWrap
          className="preview-1x1"
          role="link"
          tabIndex={0}
          aria-label="View token detail"
          onClick={onThumbClick}
          onKeyDown={onKey}
        >
          {!blocked && preview && !(!thumbOk || !preview) && (
            <RenderMedia
              uri={preview}
              mime={meta.mimeType}
              allowScripts={scriptHaz && allowScr}
              onInvalid={() => setThumbOk(false)}
              /* No inline sizing — CSS .preview-1x1 enforces contain fit for IMG/VIDEO */
            />
          )}

          {!blocked && (!preview || !thumbOk) && (
            <img src={PLACEHOLDER} alt="" style={{ width:'60%', opacity:.45 }} />
          )}

          {blocked && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
              justifyContent:'center', gap:'6px', padding:'0 8px', flexDirection:'column' }}>
              {nsfw && !allowNSFW && (
                <PixelButton size="sm" warning onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRevealType('nsfw'); }}>
                  NSFW&nbsp;🔞
                </PixelButton>
              )}
              {flashing && !allowFlash && (
                <PixelButton size="sm" warning onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRevealType('flash'); }}>
                  Flashing&nbsp;🚨
                </PixelButton>
              )}
            </div>
          )}

          {/* When scripts are enabled on a scripted preview, mount a cover link
              so the entire tile remains a reliable navigation target. */}
          {!blocked && scriptedPreviewActive && (
            <LinkCover
              href={tokenHref}
              aria-label="Go to token details"
              title="Open token details"
            />
          )}

          <FSBtn
            size="xs"
            disabled={!(!scriptHaz || allowScr)}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); (!scriptHaz || allowScr) ? setFs(true) : askEnableScripts(); }}
            title={(!scriptHaz || allowScr) ? 'Fullscreen' : 'Enable scripts first'}
          >⛶</FSBtn>
        </ThumbWrap>

        {/* meta info (re‑ordered; uncluttered) */}
        <Meta>
          {/* ⭐ + scripts toggle (if any) */}
          <Row>
            <span title={getIntegrityInfo(integrity.status).label} style={{ cursor:'pointer', fontSize:'1.1rem' }}>
              <IntegrityBadge status={integrity.status} />
            </span>
            {scriptHaz && (
              <EnableScriptsToggle
                enabled={allowScr}
                onToggle={allowScr ? () => setAllowScr(false) : askEnableScripts}
              />
            )}
          </Row>

          {/* Token name */}
          <h4 style={{ wordBreak:'break-word', overflowWrap:'anywhere' }}>
            {meta.name || `#${token.tokenId}`}
          </h4>

          {/* Author(s) — own row */}
          {authorArray(meta).length > 0 && (
            <p style={{ wordBreak:'break-word', overflowWrap:'anywhere' }}>
              <strong>Author(s)</strong>&nbsp;
              {renderEntryList(authorArray(meta), showAllAuthors, setShowAllAuthors)}
            </p>
          )}

          {/* Creator(s) — own row (always show if present, even if same as authors) */}
          {creatorArray(meta).length > 0 && (
            <p style={{ wordBreak:'break-word', overflowWrap:'anywhere' }}>
              <strong>Creator(s)</strong>&nbsp;
              {renderEntryList(creatorArray(meta), showAllCreators, setShowAllCreators)}
            </p>
          )}

          {/* FileType with universal download */}
          {meta.mimeType && (
            <p>
              <strong>FileType</strong>:&nbsp;
              {downloadAllowed
                ? (
                  <a
                    href={artifact}
                    download={fname}
                    title={`Download ${fname}`}
                    style={{ color: 'inherit' }}
                  >
                    {meta.mimeType}
                  </a>
                )
                : meta.mimeType}
            </p>
          )}

          {/* Token‑ID & Amount on a single compact row */}
          <StatRow>
            <Stat>Token‑ID&nbsp;{token.tokenId}</Stat>
            <Stat>Amount&nbsp;×{editions}</Stat>
          </StatRow>

          {/* Offer CTA */}
          <div style={{ marginTop:'4px' }}>
            <MakeOfferBtn contract={contractAddress} tokenId={token.tokenId} label="OFFER" />
          </div>

          {/* Share CTA */}
          <div style={{ marginTop: '4px' }}>
            <PixelButton
              size="xs"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFs(false); setShareOpen(true); }}
              title="Share this token"
            >
              <img src="/sprites/share.png" alt="" aria-hidden="true" style={{ width: 12, height: 12, marginRight: 6, verticalAlign: '-2px' }} />
              SHARE
            </PixelButton>
          </div>
          {/* Collection (clickable; KT1 fallback) */}
          <p style={{ marginTop:'4px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            <strong>Collection</strong>:&nbsp;
            <a href={`/contracts/${contractAddress}`} style={{ color:'var(--zu-accent-sec,#6ff)', textDecoration:'none' }}>
              {collectionLabel}
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
                <input type="checkbox" checked={scrTerms} onChange={(e) => setScrTerms(e.target.checked)} />
                I&nbsp;agree&nbsp;to&nbsp;<a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
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
              {revealType === 'nsfw'
                ? <p style={{ margin:'0 0 8px' }}>This asset is flagged as <strong>Not‑Safe‑For‑Work (NSFW)</strong>. Viewer discretion is advised.</p>
                : <p style={{ margin:'0 0 8px' }}>This asset contains <strong>rapid flashing or strobing effects</strong>.</p>}
              <label style={{ display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap' }}>
                <input type="checkbox" checked={termsOk} onChange={(e) => setTermsOk(e.target.checked)} />
                I&nbsp;confirm&nbsp;I&nbsp;am&nbsp;18 + and&nbsp;agree&nbsp;to&nbsp;<a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
            </>
          )}
          confirmLabel="REVEAL"
          cancelLabel="Cancel"
          confirmDisabled={!termsOk}
          onConfirm={() => { if (revealType==='nsfw') setAllowNSFW(true); if (revealType==='flash') setAllowFlash(true); setRevealType(null); setTermsOk(false); }}
          onCancel={() => { setRevealType(null); setTermsOk(false); }}
        />
      )}

      {/* share dialog */}
      {shareOpen && (
        <ShareDialog
          open
          onClose={() => setShareOpen(false)}
          name={meta?.name}
          creators={creatorArray(meta)}
          addr={contractAddress}
          tokenId={token?.tokenId}
          previewUri={`/api/snapshot/${contractAddress}/${token?.tokenId}`}
          downloadUri={meta?.artifactUri}
          downloadMime={meta?.mimeType}
          downloadName={meta?.name}
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
    holdersCount : PropTypes.oneOfType([PropTypes.number,PropTypes.string]),
  }).isRequired,
  contractAddress: PropTypes.string.isRequired,
  contractName   : PropTypes.string,
  contractAdmin  : PropTypes.string,
};

/* What changed & why (r45):
   • Authors/Creators now always render on separate rows; improved wrapping.
   • Removed Owners from the card (kept on ContractMetaPanel).
   • Kept order: ⭐ + scripts toggle → name → Author(s) → Creator(s) →
     FileType (download) → Token‑ID & Amount (inline) → Offer → Collection.
   • Fixed “can’t click preview when scripts are enabled” by adding a z‑layered
     full‑tile <a> cover for scripted previews; FS button remains accessible.
   • Preserved r44 behaviours: clickable author/creator filters with .tez
     reverse lookup, universal download naming, KT1‑name resolver, NSFW/Flash
     reveal, and fullscreen modal. */
//EOF