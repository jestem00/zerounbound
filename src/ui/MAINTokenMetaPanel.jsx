/* Developed by @jams2blues
   File: src/ui/MAINTokenMetaPanel.jsx
   Rev : r26
   Summary: Restore collection header (thumb + link), address row with
            version tag and copy, minted date + editions, downloadable
            MIME with rights — while keeping rarity rank/traits, script
            toggle, fullscreen, share sprite and Extra URIs entry. */

import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';
import { format } from 'date-fns';

import PixelHeading   from './PixelHeading.jsx';
import PixelButton    from './PixelButton.jsx';
import RenderMedia    from '../utils/RenderMedia.jsx';
import IntegrityBadge from './IntegrityBadge.jsx';
import MarketplaceBar from './MarketplaceBar.jsx';
import ShareDialog    from './ShareDialog.jsx';

import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import { EnableScriptsToggle }   from './EnableScripts.jsx';
import countAmount               from '../utils/countAmount.js';
import hashMatrix                from '../data/hashMatrix.json';
import { shortKt, shortAddr, copyToClipboard } from '../utils/formatAddress.js';
import { mimeFromDataUri } from '../utils/uriHelpers.js';
import { preferredExt }    from '../constants/mimeTypes.js';
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';
import { NETWORK_KEY } from '../config/deployTarget.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

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

const BadgeWrap = styled.span`
  display: inline-flex; align-items: center; gap: 6px;
`;

const TagsRow = styled.div`
  display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
`;

const Tag = styled.span`
  display: inline-block; padding: 2px 8px; border: 1px solid var(--zu-fg);
  background: var(--zu-bg-alt); font-size: .7rem; border-radius: 4px; white-space: nowrap;
`;

const TraitGrid = styled.div`
  display: flex; flex-wrap: wrap; gap: 6px;`;

const Trait = styled.div`
  border: 1px solid var(--zu-fg); padding: 4px 6px; background: var(--zu-bg-alt);
  font-size: .7rem; border-radius: 4px; display: flex; flex-direction: column; align-items: flex-start;`;

const TraitPct = styled.span`font-size: .65rem; opacity: .7;`;

const MetaGrid = styled.dl`
  display: grid; grid-template-columns: max-content 1fr; gap: 4px 8px;
  dt { font-weight: 700; opacity: .8; }
  dd { margin: 0; word-break: break-word; }
`;

/* Restored: compact collection header with thumb + link */
const CollectionLink = styled.a`
  display: flex; align-items: center; gap: 8px; text-decoration: none; color: inherit;
  &:hover { text-decoration: underline; }
`;
const ThumbWrap = styled.div`
  position: relative; width: 32px; height: 32px; flex: 0 0 32px;
  border: 1px solid var(--zu-fg); display: flex; align-items: center; justify-content: center;
`;
const ThumbMedia = styled(RenderMedia)`
  width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated;
`;
const AddrRow = styled.div`
  font-size: .75rem; opacity: .8; display: flex; align-items: center; gap: 6px;
  code { word-break: break-all; }
  button { line-height: 1; padding: 0 4px; font-size: .65rem; }
`;
const Description = styled.p`
  font-size: .85rem; line-height: 1.4; white-space: pre-wrap; margin: 0;
`;

/* util: downloadable filename from token name + mime */
function cleanFilename(s = '') {
  return String(s).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 96) || 'download';
}
function suggestedFilename(meta = {}, tokenId) {
  const base = cleanFilename(meta?.name || `token-${tokenId ?? ''}`) || 'download';
  const ext  = preferredExt(meta?.mime || '') || '';
  return ext ? `${base}.${ext}` : base;
}

function pickThumb(m = {}) {
  const uri = m.imageUri || m.thumbnailUri || m.displayUri || m.artifactUri || '';
  return typeof uri === 'string' && uri.startsWith('data:') ? uri : '';
}

export default function MAINTokenMetaPanel({
  token,
  collection,
  walletAddress: _walletAddress,
  tokenScripts,
  tokenAllowJs,
  onToggleScript,
  onRequestScriptReveal,
  onFullscreen,
  currentUri,
  extraUris = [],
  onOpenExtras,
  fsDisabled,
  rarity,
}) {
  const meta = token?.metadata || {};
  const integrity = useMemo(() => checkOnChainIntegrity(meta), [meta]);
  const editions  = useMemo(() => countAmount(token), [token]);

  // Creators/authors: show beneath title. Resolve domains best-effort.
  const creatorsRaw = useMemo(() => {
    const v = meta?.creators ?? meta?.authors ?? meta?.artists;
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      try { const j = JSON.parse(v); return Array.isArray(j) ? j : [v]; }
      catch { return [v]; }
    }
    if (v && typeof v === 'object') return Object.values(v);
    return [];
  }, [meta]);

  const [domainsState, setDomainsState] = useState({});
  const domainsRef = React.useRef({});
  React.useEffect(() => {
    const toLookup = [];
    const seen = new Set();
    creatorsRaw.forEach((c) => {
      const s = typeof c === 'string' ? c : (c?.address || c?.wallet || '');
      const addr = String(s || '').trim();
      if (!/^tz/i.test(addr)) return; // only tz addrs get domains
      const key = addr.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      if (domainsRef.current[key] === undefined) toLookup.push(addr);
    });
    if (toLookup.length === 0) return;
    toLookup.forEach((addr) => {
      const key = addr.toLowerCase();
      domainsRef.current[key] = domainsRef.current[key] ?? null;
      resolveTezosDomain(addr, NETWORK_KEY).then((name) => {
        if (domainsRef.current[key] === null) {
          domainsRef.current[key] = name || '';
          setDomainsState((prev) => ({ ...prev, [key]: domainsRef.current[key] }));
        }
      }).catch(() => {
        domainsRef.current[key] = '';
        setDomainsState((prev) => ({ ...prev, [key]: '' }));
      });
    });
  }, [creatorsRaw]);

  const fmtCreator = React.useCallback((v) => {
    const s = typeof v === 'string' ? v : (v?.address || v?.wallet || '');
    const key = String(s || '').toLowerCase();
    const dom = domainsRef.current[key] ?? domainsState[key];
    if (dom) return dom;
    if (!/^(tz|kt)/i.test(String(s))) return String(v);
    return shortAddr(String(s));
  }, [domainsState]);

  // Share dialog
  const [shareOpen, setShareOpen] = useState(false);

  const cur = useMemo(() => {
    if (currentUri && currentUri.value) return currentUri;
    return {
      key: 'artifactUri',
      name: meta?.name || '',
      description: meta?.description || '',
      value: meta?.artifactUri || '',
      mime: meta?.mimeType || mimeFromDataUri(meta?.artifactUri || ''),
    };
  }, [currentUri, meta]);

  const hasExtras = Array.isArray(extraUris) && extraUris.length > 1;

  // Collection header bits
  const collMeta   = collection?.metadata || {};
  const collThumb  = pickThumb(collMeta) || '/sprites/cover_default.svg';
  const collName   = collMeta.name || collMeta.symbol || collMeta.title || collMeta.collectionName || shortKt(collection?.address || '');
  const HASH2VER   = useMemo(() => (Object.entries(hashMatrix)
    .reduce((o, [h, v]) => { o[+h] = String(v).toUpperCase(); return o; }, {})), []);
  const verLabel   = HASH2VER?.[collection?.typeHash] || '?';

  return (
    <Panel>
      {/* Collection head: thumb + name + address/version */}
      {collection?.address && (
        <Section>
          <CollectionLink href={`/contracts/${collection.address}`}>
            <ThumbWrap>
              <ThumbMedia uri={collThumb} />
            </ThumbWrap>
            <span style={{ fontWeight: 'bold', fontSize: '.95rem' }}>
              Collection: {collName}
            </span>
          </CollectionLink>
          <AddrRow>
            <code>{shortKt(collection.address)}</code>
            <button type="button" onClick={() => copyToClipboard(collection.address)} title="Copy contract address">📋</button>
            <Tag>({verLabel})</Tag>
          </AddrRow>
        </Section>
      )}
      {/* Title + integrity */}
      <Section>
        <BadgeWrap>
          <PixelHeading level={4}>{meta?.name || `Token #${token?.tokenId}`}</PixelHeading>
          <IntegrityBadge status={integrity.status} />
        </BadgeWrap>
        {(token?.firstTime != null) && (
          <span style={{ fontSize: '.75rem', opacity: .85 }}>
            Minted {format(new Date(token.firstTime), 'MMM dd, yyyy')} • {editions} edition{editions !== 1 ? 's' : ''}
          </span>
        )}
        {creatorsRaw.length > 0 && (
          <div style={{ fontSize: '.8rem' }}>
            <strong>Creator(s):</strong>{' '}
            {creatorsRaw.map((c, i) => {
              const raw = typeof c === 'string' ? c : (c?.address || c?.wallet || '');
              const pref = i ? ', ' : '';
              const href = /^tz/i.test(raw || '') ? `/u/${encodeURIComponent(raw)}`
                         : /^KT1/i.test(raw || '') ? `/contracts/${encodeURIComponent(raw)}`
                         : null;
              const content = fmtCreator(c);
              return href ? (
                <span key={`${String(raw)}_${i}`}>
                  {pref}
                  <a href={href} style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'none' }}>
                    {content}
                  </a>
                </span>
              ) : (
                <span key={`${String(content)}_${i}`}>{pref}{content}</span>
              );
            })}
          </div>
        )}
      </Section>

      {/* Controls: scripts toggle, fullscreen, share, extras */}
      <Section>
        {tokenScripts && (
          <EnableScriptsToggle
            enabled={!!tokenAllowJs}
            onToggle={tokenAllowJs ? () => onToggleScript(false) : onRequestScriptReveal}
            title={tokenAllowJs ? 'Disable scripts' : 'Enable scripts'}
          />
        )}

        {typeof onFullscreen === 'function' && (
          <PixelButton
            size="xs"
            disabled={!!fsDisabled}
            onClick={onFullscreen}
            title="Enter fullscreen mode"
            style={{ marginTop: tokenScripts ? '4px' : '0' }}
          >
            FULLSCREEN
          </PixelButton>
        )}

        <PixelButton
          size="xs"
          onClick={() => setShareOpen(true)}
          title="Share this token"
          style={{ marginTop: '4px' }}
        >
          <img src="/sprites/share.png" alt="" aria-hidden="true" style={{ width: 12, height: 12, marginRight: 6, verticalAlign: '-2px' }} />
          SHARE
        </PixelButton>

        {hasExtras && (
          <PixelButton
            size="xs"
            onClick={() => (typeof onOpenExtras === 'function' ? onOpenExtras(0) : null)}
            title="Open extra URIs"
            style={{ marginTop: '4px' }}
          >
            Extra URIs ({extraUris.length})
          </PixelButton>
        )}
      </Section>

      {/* Description */}
      {meta?.description && (
        <Section>
          <Description>{meta.description}</Description>
        </Section>
      )}

      {/* MIME + details for current URI */}
      <Section>
        <MetaGrid>
          <dt>MIME Type</dt>
          <dd>
            {cur?.mime ? (
              <a
                href={cur?.value}
                download={suggestedFilename({ name: cur?.name || meta?.name, mime: cur?.mime }, token?.tokenId)}
                style={{ color: 'inherit' }}
              >
                {cur.mime}
              </a>
            ) : (meta?.mimeType || 'N/A')}
          </dd>
          {/* When viewing an extra URI, surface its friendly fields */}
          {cur?.key && cur.key !== 'artifactUri' && (
            <>
              <dt>Key</dt>
              <dd><code>{cur.key}</code></dd>
            </>
          )}
          {cur?.name && cur.key !== 'artifactUri' && (
            <>
              <dt>Name</dt>
              <dd>{cur.name}</dd>
            </>
          )}
          {cur?.description && cur.key !== 'artifactUri' && (
            <>
              <dt>Description</dt>
              <dd>{cur.description}</dd>
            </>
          )}
          {meta?.rights && (
            <>
              <dt>Rights</dt>
              <dd>{meta.rights}</dd>
            </>
          )}
        </MetaGrid>
      </Section>

      {/* Marketplace bar (guard network calls when missing identifiers) */}
      {collection?.address && token?.tokenId != null && (
        <Section>
          <MarketplaceBar
            contractAddress={collection.address}
            tokenId={token.tokenId}
            marketplace={token.marketplace}
          />
        </Section>
      )}

      {/* Rarity rank */}
      {rarity && typeof rarity.rank === 'number' && (
        <Section>
          <span style={{ fontSize: '.8rem' }}>Rank {rarity.rank} / {rarity.total}</span>
        </Section>
      )}

      {/* Attributes: prefer rarity.traits when available; fall back to meta.attributes */}
      {(() => {
        const traits = Array.isArray(rarity?.traits) ? rarity.traits : null;
        const attrs  = Array.isArray(meta?.attributes) ? meta.attributes : null;
        if (traits && traits.length > 0) {
          return (
            <Section>
              <span style={{ fontWeight: 700 }}>Attributes:</span>
              <TraitGrid>
                {traits.map((t) => (
                  <Trait key={`${t.name}:${t.value}`}>
                    <strong>{t.value}</strong>
                    <span style={{ opacity: .8 }}>{t.name}</span>
                    <TraitPct>{t.pct.toFixed(2).replace(/\.00$/, '')}%</TraitPct>
                  </Trait>
                ))}
              </TraitGrid>
            </Section>
          );
        }
        if (attrs && attrs.length > 0) {
          return (
            <Section>
              <span style={{ fontWeight: 700 }}>Attributes:</span>
              <TraitGrid>
                {attrs.map((a, i) => (
                  <Trait key={`${a.name}_${a.value}_${i}`}>
                    <strong>{a.value}</strong>
                    <span style={{ opacity: .8 }}>{a.name}</span>
                    <TraitPct>—</TraitPct>
                  </Trait>
                ))}
              </TraitGrid>
            </Section>
          );
        }
        return null;
      })()}

      {/* Tags */}
      {Array.isArray(meta?.tags) && meta.tags.length > 0 && (
        <Section>
          <TagsRow>
            <span style={{ fontWeight: 700 }}>Tags:</span>
            {meta.tags.map((t) => (<Tag key={t}>{t}</Tag>))}
          </TagsRow>
        </Section>
      )}

      {/* Share dialog */}
      {shareOpen && (
        <ShareDialog
          open
          onClose={() => setShareOpen(false)}
          name={meta?.name}
          creators={Array.isArray(meta?.creators) ? meta.creators : []}
          addr={collection?.address}
          tokenId={token?.tokenId}
          previewUri={cur?.value}
          variant="view"
          downloadUri={cur?.value}
          downloadMime={cur?.mime}
          downloadName={cur?.name || meta?.name}
        />
      )}
    </Panel>
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
  rarity      : PropTypes.shape({
    rank  : PropTypes.number,
    total : PropTypes.number,
    traits: PropTypes.arrayOf(PropTypes.shape({
      name : PropTypes.string,
      value: PropTypes.string,
      pct  : PropTypes.number,
    })),
  }),
  currentIndex: PropTypes.number,
  totalUris   : PropTypes.number,
};
