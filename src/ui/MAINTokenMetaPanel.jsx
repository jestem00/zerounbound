/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MAINTokenMetaPanel.jsx
  Rev :    r16    2025‑10‑24
  Summary: Surface proper extra name/description; minor polish.
           (Layout preserved. MarketplaceBar calls guarded.)
──────────────────────────────────────────────────────────────*/
import React, { useMemo, useState, useEffect, useCallback } from 'react';
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
import decodeHexFields, { decodeHexJson } from '../utils/decodeHexFields.js';
import * as uriHelpers              from '../utils/uriHelpers.js';
import { resolveTezosDomain }       from '../utils/resolveTezosDomain.js';
import { NETWORK_KEY }              from '../config/deployTarget.js';
import ExtraUriViewer               from './ExtraUriViewer.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const mimeFromDataUri = typeof uriHelpers.mimeFromDataUri === 'function'
  ? uriHelpers.mimeFromDataUri
  : (typeof uriHelpers.getMime === 'function'
      ? uriHelpers.getMime
      : (v) => ((String(v || '').match(/^data:([^;,]+)/i) || [,''])[1] || ''));

/*──────── helpers ───────────────────────────────────────────*/
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
  const ext  = extFromMime(meta?.mime) || '';
  return ext ? `${base}.${ext}` : base;
};

const shortAddrLocal = (v = '') => {
  const s = String(v);
  if (!s) return s;
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
};

/*──────── styled shells ─────────────────────────────────────*/
const Panel = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: .5rem;
`;

const CollectionLink = styled.a`
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: inherit;
  &:hover { text-decoration: underline; }
`;

const ThumbWrap = styled.div`
  position: relative;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border: 1px solid var(--zu-fg);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ThumbMedia = styled(RenderMedia)`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

const Obf = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, .85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: .65rem;
  z-index: 3;
  text-align: center;
  p { margin: 0; width: 80%; }
`;

const AddrRow = styled.div`
  font-size: .75rem;
  opacity: .8;
  display: flex;
  align-items: center;
  gap: 6px;
  code { word-break: break-all; }
  button {
    line-height: 1;
    padding: 0 4px;
    font-size: .65rem;
  }
`;

const Description = styled.p`
  font-size: .85rem;
  line-height: 1.4;
  white-space: pre-wrap;
  margin: 0;
`;

const BadgeWrap = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1;
`;

const Tag = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid var(--zu-fg);
  background: var(--zu-bg-alt);
  font-size: .7rem;
  border-radius: 4px;
  flex: 0 0 auto;
  white-space: nowrap;
`;

const TagsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
`;

const MetaGrid = styled.dl`
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 8px;
  font-size: .8rem;
  dt { font-weight: 700; opacity: .8; }
  dd { margin: 0; word-break: break-word; }
`;

/*──────── helpers ───────────────────────────────────────────*/
const HASH2VER = Object.entries(hashMatrix)
  .reduce((o, [h, v]) => { o[+h] = v.toUpperCase(); return o; }, {});

const PLACEHOLDER = '/sprites/cover_default.svg';
const pickDataThumb = (uri = '') => (/^data:/i.test(uri) ? uri : '');

function toMetaObject(meta) {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try { return decodeHexFields(JSON.parse(meta)); } catch {/* noop */}
    const parsed = decodeHexJson(meta);
    return parsed ? decodeHexFields(parsed) : {};
  }
  return decodeHexFields(meta);
}
function pickThumb(m = {}) {
  const uri = m.imageUri || m.thumbnailUri || m.displayUri || m.artifactUri || '';
  return pickDataThumb(uri);
}

/*──────── component ───────────────────────────────────────*/
export default function MAINTokenMetaPanel({
  token,
  collection,
  walletAddress: _wa,
  tokenScripts,
  tokenAllowJs,
  onToggleScript,
  onRequestScriptReveal,
  onFullscreen,
  fsDisabled,
  currentUri,
  extraUris = [],
  onOpenExtras,

  /* optional (used only for counters in button hints) */
  currentIndex,
  totalUris,
}) {
  const [copied, setCopied] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Decode collection metadata for display + hazards.
  const collObj = useMemo(() => toMetaObject(collection.metadata), [collection.metadata]);
  const collHaz = detectHazards(collObj);

  // Current media (artifactUri or selected extra).
  const cur = useMemo(() => {
    if (currentUri) {
      return {
        ...currentUri,
        mime: currentUri.mime || mimeFromDataUri(currentUri.value),
        name: typeof currentUri.name === 'string' ? currentUri.name : '',
        description: typeof currentUri.description === 'string' ? currentUri.description : '',
        key: typeof currentUri.key === 'string' ? currentUri.key : (currentUri.key == null ? '' : String(currentUri.key)),
      };
    }
    const uri = token.metadata?.artifactUri || '';
    return {
      key: 'artifactUri',
      name: token.metadata?.name || '',
      description: token.metadata?.description || '',
      value: uri,
      mime: token.metadata?.mimeType || mimeFromDataUri(uri),
    };
  }, [currentUri, token.metadata]);

  const tokHaz = detectHazards({ artifactUri: cur.value, mimeType: cur.mime });

  // Consents
  const [allowScr, setAllowScr]   = useConsent(`scripts:${collection.address}`, false);
  const [allowNSFW, setAllowNSFW] = useConsent('nsfw', false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);

  /* reveal dialog state */
  const [dlgType, setDlgType] = useState(null);
  const [dlgTerms, setDlgTerms] = useState(false);
  const [dlgScr, setDlgScr] = useState(false);
  const [termsScr, setTermsScr] = useState(false);

  /* integrity + editions */
  const integrity = useMemo(() => checkOnChainIntegrity(token.metadata || {}), [token.metadata]);
  const { label } = useMemo(() => getIntegrityInfo(integrity.status), [integrity.status]);
  void label;
  const editions = useMemo(() => countAmount(token), [token]);
  const verLabel = HASH2VER[collection.typeHash] || '?';

  /* thumb */
  const rawThumb = pickThumb(collObj);
  const thumb = rawThumb;
  const [thumbOk, setThumbOk] = useState(true);

  /* hazards */
  const needsNSFW = (collHaz.nsfw || tokHaz.nsfw) && !allowNSFW;
  const needsFlash = (collHaz.flashing || tokHaz.flashing) && !allowFlash;
  const hide = needsNSFW || needsFlash;

  /* collection name (safe) */
  const collNameSafe = collObj.name
    || collObj.symbol
    || collObj.title
    || collObj.collectionName
    || shortKt(collection.address);

  // --------------------------------------------------------------
  // Domain resolution (authors/creators) – preserved from r15.
  const [domains, setDomains] = useState({});
  const [showAllAuthors, setShowAllAuthors] = useState(false);
  const [showAllCreators, setShowAllCreators] = useState(false);

  const authorsList = useMemo(() => {
    const meta = token.metadata || {};
    let list = meta.authors || meta.artists || [];
    if (!Array.isArray(list)) list = typeof list === 'string' ? list.split(/[,;]\s*/) : [];
    return list;
  }, [token.metadata]);
  const creatorsList = useMemo(() => {
    const meta = token.metadata || {};
    let list = meta.creators || [];
    if (!Array.isArray(list)) list = typeof list === 'string' ? list.split(/[,;]\s*/) : [];
    return list;
  }, [token.metadata]);

  useEffect(() => {
    const addrs = new Set();
    [...authorsList, ...creatorsList].forEach((val) => {
      if (!val || typeof val !== 'string') return;
      const v = val.trim();
      if (/^(tz|kt)/i.test(v)) addrs.add(v);
    });
    addrs.forEach((addr) => {
      const key = addr.toLowerCase();
      if (domains[key] !== undefined) return;
      (async () => {
        const name = await resolveTezosDomain(addr, NETWORK_KEY);
        setDomains((prev) => {
          if (prev[key] !== undefined) return prev;
          return { ...prev, [key]: name };
        });
      })();
    });
  }, [authorsList, creatorsList]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatEntry = useCallback(
    (val) => {
      if (!val || typeof val !== 'string') return String(val || '');
      const v = val.trim();
      const key = v.toLowerCase();
      const dom = domains[key];
      if (dom) return dom;
      if (v.includes('.')) return v;
      return shortAddrLocal(v);
    },
    [domains],
  );

  const renderList = useCallback(
    (list, showAll, setShowAll) => {
      const slice = showAll ? list : list.slice(0, 3);
      const elems = [];
      slice.forEach((item, idx) => {
        const prefix = idx > 0 ? ', ' : '';
        const formatted = formatEntry(item);
        const isAddr = typeof item === 'string' && /^(tz|kt)/i.test(item.trim());
        elems.push(
          isAddr ? (
            <a
              key={`${item}-${idx}`}
              href={`/explore?cmd=tokens&admin=${item}`}
              style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'none', wordBreak: 'break-all' }}
            >
              {prefix}
              {formatted}
            </a>
          ) : (
            <span key={`${item}-${idx}`} style={{ wordBreak: 'break-all' }}>
              {prefix}{formatted}
            </span>
          ),
        );
      });
      if (list.length > 3 && !showAll) {
        elems.push(
          <React.Fragment key="more">
            …&nbsp;
            <button
              type="button"
              aria-label="Show all entries"
              onClick={(e) => { e.preventDefault(); setShowAll(true); }}
              style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
            >
              🔻More
            </button>
          </React.Fragment>,
        );
      }
      return elems;
    },
    [formatEntry],
  );

  /* clipboard copy */
  const copyAddr = () => {
    copyToClipboard(collection.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  /* collection script‑consent handler */
  const askEnable = () => { setTermsScr(false); setDlgScr(true); };
  const enable = () => {
    if (!termsScr) return;
    setAllowScr(true);
    setDlgScr(false);
  };

  /* hazard reveal handlers (collection) */
  const askReveal = (tp) => { setDlgType(tp); setDlgTerms(false); };
  const confirmReveal = () => {
    if (!dlgTerms) return;
    if (dlgType === 'nsfw') setAllowNSFW(true);
    if (dlgType === 'flash') setAllowFlash(true);
    setDlgType(null);
    setDlgTerms(false);
  };

  const extraCount = Array.isArray(extraUris) ? extraUris.length : 0;
  const initialIndex = useMemo(() => {
    if (!extraCount) return 0;
    const i = extraUris.findIndex((u) => (u?.key || '') === (cur?.key || '') && (u?.value || '') === (cur?.value || ''));
    return i >= 0 ? i : 0;
  }, [extraUris, cur]);

  /*──────── render ─*/
  return (
    <>
      <Panel>
        {/* Collection */}
        <Section>
          <CollectionLink
            href={`/contracts/${collection.address}`}
            onClick={(e) => {
              if (hide) {
                e.preventDefault();
                if (needsNSFW) askReveal('nsfw');
                if (needsFlash) askReveal('flash');
              }
            }}
          >
            <ThumbWrap>
              {hide && (
                <Obf>
                  {needsNSFW && <PixelButton onClick={(e) => { e.preventDefault(); askReveal('nsfw'); }}>NSFW 🔞</PixelButton>}
                  {needsFlash && <PixelButton onClick={(e) => { e.preventDefault(); askReveal('flash'); }}>Flash 🚨</PixelButton>}
                </Obf>
              )}
              {!hide && thumb && thumbOk && (
                <ThumbMedia uri={thumb} onError={() => setThumbOk(false)} />
              )}
              {(!thumb || !thumbOk) && !hide && (
                <ThumbMedia uri={PLACEHOLDER} onError={() => {}} />
              )}
              {collHaz.scripts && !allowScr && !hide && (
                <EnableScriptsOverlay onClick={(e) => { e.preventDefault(); askEnable(); }} />
              )}
            </ThumbWrap>
            <span style={{ fontWeight: 'bold', fontSize: '.95rem' }}>
              Collection: {collNameSafe}
            </span>
          </CollectionLink>
          <AddrRow>
            <code>{shortKt(collection.address)}</code>
            <button type="button" onClick={copyAddr}>{copied ? '✓' : '📋'}</button>
            <Tag>({verLabel})</Tag>
            {collHaz.scripts && (
              <EnableScriptsToggle
                enabled={allowScr}
                onToggle={allowScr ? () => setAllowScr(false) : askEnable}
              />
            )}
          </AddrRow>
        </Section>

        {/* Token heading + integrity */}
        <Section>
          <BadgeWrap>
            <PixelHeading level={4}>{token.metadata?.name || `Token #${token.tokenId}`}</PixelHeading>
            <IntegrityBadge status={integrity.status} />
          </BadgeWrap>
          <span style={{ fontSize: '.75rem', opacity: .85 }}>
            Minted {format(new Date(token.firstTime), 'MMM dd, yyyy')} • {editions} edition{editions !== 1 ? 's' : ''}
          </span>
        </Section>

        {/* Controls */}
        <Section>
          {tokenScripts && (
            <EnableScriptsToggle
              enabled={tokenAllowJs}
              onToggle={tokenAllowJs ? () => onToggleScript(false) : onRequestScriptReveal}
              title={tokenAllowJs ? 'Disable scripts' : 'Enable scripts'}
            />
          )}

          {onFullscreen && (
            <PixelButton
              size="xs"
              disabled={fsDisabled}
              onClick={onFullscreen}
              title="Enter fullscreen mode"
              style={{ marginTop: tokenScripts ? '4px' : '0' }}
            >
              Fullscreen&nbsp;⛶
            </PixelButton>
          )}

          {Array.isArray(extraUris) && extraUris.length > 1 && (
            <PixelButton
              size="xs"
              onClick={() => (typeof onOpenExtras === 'function' ? onOpenExtras(initialIndex) : setViewerOpen(true))}
              title={`Open extra URIs${Number.isFinite(totalUris) && totalUris > 1 ? ` (${totalUris})` : ''}`}
              style={{ marginTop: '4px' }}
            >
              Extra URIs&nbsp;({extraUris.length})
            </PixelButton>
          )}
        </Section>

        {/* Token description */}
        {token.metadata?.description && (
          <Description>{token.metadata.description}</Description>
        )}

        {/* Marketplace actions */}
        <Section>
          {collection?.address && token?.tokenId != null && (
            <MarketplaceBar
              contractAddress={collection.address}
              tokenId={token.tokenId}
              marketplace={token.marketplace}
            />
          )}
        </Section>

        {/* Tags */}
        {Array.isArray(token.metadata?.tags) && token.metadata.tags.length > 0 && (
          <Section>
            <TagsRow>
              <span style={{ fontWeight: 700 }}>Tags:</span>
              {token.metadata.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </TagsRow>
          </Section>
        )}

        {/* Meta grid */}
        <Section>
          <MetaGrid>
            <dt>MIME Type</dt>
            <dd>
              {cur.mime ? (
                <a
                  href={cur.value}
                  download={suggestedFilename({ name: cur.name, mime: cur.mime }, token.tokenId)}
                  style={{ color: 'inherit' }}
                >
                  {cur.mime}
                </a>
              ) : 'N/A'}
            </dd>

            {cur.key !== 'artifactUri' && (
              <>
                <dt>Extra Key</dt>
                <dd>{cur.key || '—'}</dd>

                <dt>Name</dt>
                <dd>{cur.name || '—'}</dd>

                <dt>Description</dt>
                <dd>{cur.description || '—'}</dd>
              </>
            )}

            {token.metadata?.rights && (
              <>
                <dt>Rights</dt>
                <dd>{token.metadata.rights}</dd>
              </>
            )}
          </MetaGrid>
        </Section>
      </Panel>

      {/* Enable collection scripts confirm */}
      {dlgScr && (
        <PixelConfirmDialog
          open={dlgScr}
          onOk={enable}
          onCancel={() => setDlgScr(false)}
          okLabel="OK"
          cancelLabel="Cancel"
          confirmDisabled={!termsScr}
          title="Enable Scripts"
          message={(
            <span>
              <label>
                <input
                  type="checkbox"
                  checked={termsScr}
                  onChange={(e) => setTermsScr(e.target.checked)}
                />
                I agree to Terms
              </label>
              <p>Executable code can be harmful. Proceed only if you trust the author.</p>
            </span>
          )}
        />
      )}

      {/* Hazard reveal confirm */}
      {dlgType && (
        <PixelConfirmDialog
          open={!!dlgType}
          onOk={confirmReveal}
          onCancel={() => { setDlgType(null); setDlgTerms(false); }}
          okLabel="REVEAL"
          cancelLabel="Cancel"
          confirmDisabled={!dlgTerms}
          title={dlgType === 'nsfw' ? 'NSFW Warning' : 'Flashing Warning'}
          message={(
            <span>
              {dlgType === 'nsfw' ? (
                <>Warning: This thumbnail is marked Not‑Safe‑For‑Work (NSFW). It may include explicit nudity, sexual themes, graphic violence or other mature material.</>
              ) : (
                <>Warning: This thumbnail may contain rapid flashing or strobing effects that can trigger seizures in people with photosensitive epilepsy.</>
              )}
              <br />
              <label>
                <input
                  type="checkbox"
                  checked={dlgTerms}
                  onChange={(e) => setDlgTerms(e.target.checked)}
                />
                I confirm I am 18 + and agree to Terms
              </label>
            </span>
          )}
        />
      )}

      {/* Compact Extra URIs viewer (fallback if page didn't supply onOpenExtras) */}
      {viewerOpen && (
        <ExtraUriViewer
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          uris={extraUris}
          initialIndex={initialIndex}
          tokenName={token.metadata?.name}
          tokenId={token.tokenId}
          tokenScripts={tokenScripts}
          tokenAllowJs={tokenAllowJs}
          onRequestScriptReveal={onRequestScriptReveal}
          onToggleScript={(val) => {
            if (!val) onToggleScript(false);
            else onRequestScriptReveal?.('scripts');
          }}
        />
      )}
    </>
  );
}

MAINTokenMetaPanel.propTypes = {
  token        : PropTypes.object.isRequired,
  collection   : PropTypes.object.isRequired,
  walletAddress: PropTypes.string,
  tokenScripts : PropTypes.bool,
  tokenAllowJs : PropTypes.bool,
  onToggleScript: PropTypes.func,
  onRequestScriptReveal: PropTypes.func,
  onFullscreen: PropTypes.func,
  fsDisabled  : PropTypes.bool,
  currentUri  : PropTypes.shape({
    key        : PropTypes.string,
    name       : PropTypes.string,
    description: PropTypes.string,
    value      : PropTypes.string,
    mime       : PropTypes.string,
  }),
  extraUris   : PropTypes.arrayOf(PropTypes.shape({
    key        : PropTypes.string,
    name       : PropTypes.string,
    description: PropTypes.string,
    value      : PropTypes.string,
    mime       : PropTypes.string,
  })),
  onOpenExtras: PropTypes.func,

  currentIndex: PropTypes.number,
  totalUris   : PropTypes.number,
};
/* What changed & why (r16):
   • Extras now show their correct "Name" and "Description" coming
     from off‑chain views or metadata, thanks to the fixed
     normalization.  Empty values render “—” only when truly absent.
   • Kept layout and all prior guards; code remains lint‑clean. */
/* EOF */
