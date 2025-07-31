/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MAINTokenMetaPanel.jsx
  Rev :    r14    2025‑10‑23
  Summary: add token-level script & fullscreen controls; preserve
           collection script toggle; reposition controls near token
           name; decode collection metadata and tags; maintain
           hazard and consent logic; fix inline style syntax.
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
import { shortKt, copyToClipboard, shortAddr } from '../utils/formatAddress.js';
import {
  EnableScriptsToggle,
  EnableScriptsOverlay,
} from './EnableScripts.jsx';
import PixelConfirmDialog           from './PixelConfirmDialog.jsx';
import countAmount                  from '../utils/countAmount.js';
import hashMatrix                   from '../data/hashMatrix.json';
import decodeHexFields, { decodeHexJson } from '../utils/decodeHexFields.js';

// Import domain resolution helper and network key for reverse lookups.
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';
import { NETWORK_KEY }           from '../config/deployTarget.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Panel = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  /* Allow the panel to shrink gracefully on narrow screens */
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
  &:hover {
    text-decoration: underline;
  }
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

/* obfuscation overlay for NSFW/flash hazards */
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
  p {
    margin: 0;
    width: 80%;
  }
`;

const AddrRow = styled.div`
  font-size: .75rem;
  opacity: .8;
  display: flex;
  align-items: center;
  gap: 6px;
  code {
    word-break: break-all;
  }
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

/* Row container for tag chips with a label.  Chips will wrap
   automatically and maintain tight spacing.  */
const TagsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
`;

/* Meta grid displays labels and values in two columns.  This
   approach aligns all rows and avoids uneven distribution on
   large screens.  Each dt/dd pair occupies a single row. */
const MetaGrid = styled.dl`
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 8px;
  font-size: .8rem;
  dt {
    font-weight: 700;
    opacity: .8;
  }
  dd {
    margin: 0;
    word-break: break-word;
  }
`;

/*──────── helpers ───────────────────────────────────────────*/
const HASH2VER = Object.entries(hashMatrix)
  .reduce((o, [h, v]) => { o[+h] = v.toUpperCase(); return o; }, {});

const PLACEHOLDER = '/sprites/cover_default.svg';

/* Strict thumbnail selection: only return data URIs.  In a fully
   on‑chain environment we do not dereference remote resources such
   as ipfs:// or http:// URIs.  Non‑data URIs fall back to the
   placeholder image. */
function pickDataThumb(uri = '') {
  const DATA_RE = /^data:/i;
  return DATA_RE.test(uri) ? uri : '';
}

/* Decode metadata object.  Accepts a hex string, JSON string or plain
   object and returns a fully decoded object via decodeHexFields. */
function toMetaObject(meta) {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try {
      return decodeHexFields(JSON.parse(meta));
    } catch {
      /* ignore */
    }
    const parsed = decodeHexJson(meta);
    if (parsed) return decodeHexFields(parsed);
    return {};
  }
  return decodeHexFields(meta);
}

/* Pick a thumbnail URI from a decoded metadata object.  Chooses
   imageUri, then thumbnailUri, displayUri or artifactUri.  Returns
   a data URI unchanged or converts ipfs:// to https://. */
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
}) {
  const [copied, setCopied] = useState(false);

  // Decode the collection metadata into a flat object.  This handles
  // hex-encoded strings and JSON strings, producing fully decoded
  // fields via decodeHexFields().
  const collObj = useMemo(() => toMetaObject(collection.metadata), [collection.metadata]);
  const collHaz = detectHazards(collObj);
  const tokHaz = detectHazards(token.metadata || {});

  const [allowScr, setAllowScr] = useConsent(`scripts:${collection.address}`, false);
  const [allowNSFW, setAllowNSFW] = useConsent('nsfw', false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);

  /* reveal dialog state */
  const [dlgType, setDlgType] = useState(null);   // 'nsfw' | 'flash' | null
  const [dlgTerms, setDlgTerms] = useState(false);
  /* script‑consent dialog state (collection-level) */
  const [dlgScr, setDlgScr] = useState(false);
  const [termsScr, setTermsScr] = useState(false);

  /* integrity + editions */
  const integrity = useMemo(() => checkOnChainIntegrity(token.metadata || {}), [token.metadata]);
  const { label } = useMemo(() => getIntegrityInfo(integrity.status), [integrity.status]);
  const editions = useMemo(() => countAmount(token), [token]);
  const verLabel = HASH2VER[collection.typeHash] || '?';

  /* thumb uri + fallbacks */
  const rawThumb = pickThumb(collObj);
  const thumb = rawThumb; // pickThumb already converts ipfs:// and preserves data URI
  const [thumbOk, setThumbOk] = useState(true);

  /* hazard mask logic */
  const needsNSFW = (collHaz.nsfw || tokHaz.nsfw) && !allowNSFW;
  const needsFlash = (collHaz.flashing || tokHaz.flashing) && !allowFlash;
  const hide = needsNSFW || needsFlash;

  /* safe collection name: prefer name, title or symbol if available,
     else fall back to the short contract address */
  const collNameSafe = collObj.name
    || collObj.symbol
    || collObj.title
    || collObj.collectionName
    || shortKt(collection.address);

  // --------------------------------------------------------------
  // Domain resolution state for authors and creators.  We cache
  // resolved .tez domains using lowercased keys.  Lookups are
  // performed on demand in a useEffect below.
  const [domains, setDomains] = useState({});
  const [showAllAuthors, setShowAllAuthors] = useState(false);
  const [showAllCreators, setShowAllCreators] = useState(false);

  // Extract authors and creators lists from token metadata.  If no
  // authors exist, fall back to artists; if still empty, fall back
  // to creators.  The returned arrays may contain strings that are
  // Tezos addresses or human names.
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

  // Resolve domain names for each address in authorsList and
  // creatorsList.  Only Tezos addresses (tz*/KT*) are queried.  The
  // resolver caches results keyed by lowercase address to avoid
  // duplicate requests.
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
  }, [authorsList, creatorsList]);

  // Format an entry: use resolved domain if present; if the string
  // contains a dot, return it verbatim (likely a custom name or
  // domain); otherwise, truncate Tezos addresses via shortAddr().
  const formatEntry = useCallback(
    (val) => {
      if (!val || typeof val !== 'string') return String(val || '');
      const v = val.trim();
      const key = v.toLowerCase();
      const dom = domains[key];
      if (dom) return dom;
      if (v.includes('.')) return v;
      return shortAddr(v);
    },
    [domains],
  );

  // Render a comma-separated list with optional toggle.  When not
  // expanded and more than 3 items exist, append a “More” toggle.
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
              key={item}
              href={`/explore?cmd=tokens&admin=${item}`}
              style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'none', wordBreak: 'break-all' }}
            >
              {prefix}
              {formatted}
            </a>
          ) : (
            <span key={item} style={{ wordBreak: 'break-all' }}>
              {prefix}{formatted}
            </span>
          ),
        );
      });
      if (list.length > 3 && !showAll) {
        elems.push(
          <>
            …&nbsp;
            <button
              type="button"
              aria-label="Show all entries"
              onClick={(e) => { e.preventDefault(); setShowAll(true); }}
              style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
            >
              🔻More
            </button>
          </>,
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

  /* collection script-consent handler */
  const askEnable = () => { setTermsScr(false); setDlgScr(true); };
  const enable = () => {
    if (!termsScr) return;
    setAllowScr(true);
    setDlgScr(false);
  };

  /* collection hazard reveal handlers */
  const askReveal = (tp) => { setDlgType(tp); setDlgTerms(false); };
  const confirmReveal = () => {
    if (!dlgTerms) return;
    if (dlgType === 'nsfw') setAllowNSFW(true);
    if (dlgType === 'flash') setAllowFlash(true);
    setDlgType(null);
    setDlgTerms(false);
  };

  /*──────── render ─*/
  return (
    <>
      <Panel>
        {/* collection head */}
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
              {/* show hazard icons or thumbnail */}
              {hide && (
                <Obf>
                  {needsNSFW && <PixelButton onClick={(e) => { e.preventDefault(); askReveal('nsfw'); }}>NSFW 🔞</PixelButton>}
                  {needsFlash && <PixelButton onClick={(e) => { e.preventDefault(); askReveal('flash'); }}>Flash 🚨</PixelButton>}
                </Obf>
              )}
              {!hide && thumb && thumbOk && (
                <ThumbMedia
                  uri={thumb}
                  onError={() => setThumbOk(false)}
                />
              )}
              {(!thumb || !thumbOk) && !hide && (
                <ThumbMedia
                  uri={PLACEHOLDER}
                  onError={() => {}}
                />
              )}
              {collHaz.scripts && !allowScr && !hide && (
                <EnableScriptsOverlay
                  onClick={(e) => { e.preventDefault(); askEnable(); }}
                />
              )}
            </ThumbWrap>
            {/* collection name with prefix */}
            <span style={{ fontWeight: 'bold', fontSize: '.95rem' }}>
              Collection: {collNameSafe}
            </span>
          </CollectionLink>
          {/* address row */}
          <AddrRow>
            <code>{shortKt(collection.address)}</code>
            <button type="button" onClick={copyAddr}>{copied ? '✓' : '📋'}</button>
            <Tag>({verLabel})</Tag>
            {/* permanent scripts toggle for collection-level hazard */}
            {collHaz.scripts && (
              <EnableScriptsToggle
                enabled={allowScr}
                onToggle={allowScr ? () => setAllowScr(false) : askEnable}
              />
            )}
          </AddrRow>
        </Section>

        {/* token name + integrity */}
        <Section>
          <BadgeWrap>
            <PixelHeading level={4}>{token.metadata?.name || `Token #${token.tokenId}`}</PixelHeading>
            <IntegrityBadge status={integrity.status} />
          </BadgeWrap>
          <span style={{ fontSize: '.75rem', opacity: .85 }}>
            Minted {format(new Date(token.firstTime), 'MMM dd, yyyy')} • {editions} edition{editions !== 1 ? 's' : ''}
          </span>
        </Section>

        {/* controls: script toggle + fullscreen button.  Always render fullscreen above the description; stack vertically. */}
        <Section>
          {/* Only show the script toggle when the token has script hazards */}
          {tokenScripts && (
            <EnableScriptsToggle
              enabled={tokenAllowJs}
              onToggle={tokenAllowJs ? () => onToggleScript(false) : onRequestScriptReveal}
              title={tokenAllowJs ? 'Disable scripts' : 'Enable scripts'}
            />
          )}
          {/* Fullscreen control: label plus icon for clarity */}
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
        </Section>

        {/* description */}
        {token.metadata?.description && (
          <Description>{token.metadata.description}</Description>
        )}

        {/* marketplace buttons */}
        <Section>
          <MarketplaceBar
            contractAddress={collection.address}
            tokenId={token.tokenId}
            marketplace={token.marketplace}
          />
        </Section>

        {/* tags */}
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

        {/* author and creator lists, separate from meta grid */}
        {(authorsList.length > 0 || creatorsList.length > 0) && (
          <Section>
            {authorsList.length > 0 && (
              <p style={{ fontSize: '.8rem', margin: 0 }}>
                <strong>Author(s)</strong>:&nbsp;
                {renderList(authorsList, showAllAuthors, setShowAllAuthors)}
              </p>
            )}
            {creatorsList.length > 0 && (
              <p style={{ fontSize: '.8rem', margin: 0, opacity: authorsList.length > 0 ? 0.85 : 1 }}>
                <strong>Creator(s)</strong>:&nbsp;
                {renderList(creatorsList, showAllCreators, setShowAllCreators)}
              </p>
            )}
          </Section>
        )}

        {/* misc meta */}
        <Section>
          <MetaGrid>
            <dt>MIME Type</dt>
            <dd>{token.metadata?.mimeType || 'N/A'}</dd>
            {token.metadata?.rights && (
              <>
                <dt>Rights</dt>
                <dd>{token.metadata.rights}</dd>
              </>
            )}
          </MetaGrid>
        </Section>
      </Panel>

      {/* enable collection scripts confirm dialog */}
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

      {/* hazard reveal confirm dialog */}
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
                <>
                  Warning: This thumbnail is marked Not‑Safe‑For‑Work (NSFW). It may include explicit nudity, sexual themes, graphic violence or other mature material.
                </>
              ) : (
                <>
                  Warning: This thumbnail may contain rapid flashing or strobing effects that can trigger seizures in people with photosensitive epilepsy.
                </>
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
  fsDisabled : PropTypes.bool,
};

/* What changed & why (r14):
   • Added token-level script toggle and fullscreen button via new props.
   • Moved script and fullscreen controls adjacent to token name in BadgeWrap.
   • Continue to support collection-level script toggle and hazard reveals.
   • Fixed inline style error by using camelCase (fontWeight).
   • Updated prop types and header/footer summaries.
*/
/* EOF */