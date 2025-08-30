/* Developed by @jams2blues
   File: src/ui/MAINTokenMetaPanel.jsx
   Rev : r21
   Summary: add rarity rank and trait chips; keep script toggle,
            fullscreen, share, and extra-URIs entry. */

import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';

import PixelHeading   from './PixelHeading.jsx';
import PixelButton    from './PixelButton.jsx';
import RenderMedia    from '../utils/RenderMedia.jsx';
import IntegrityBadge from './IntegrityBadge.jsx';
import MarketplaceBar from './MarketplaceBar.jsx';
import ShareDialog    from './ShareDialog.jsx';

import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import { EnableScriptsToggle }   from './EnableScripts.jsx';

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

  // Share dialog
  const [shareOpen, setShareOpen] = useState(false);

  const cur = useMemo(() => {
    if (currentUri && currentUri.value) return currentUri;
    return {
      key: 'artifactUri',
      name: meta?.name || '',
      description: meta?.description || '',
      value: meta?.artifactUri || '',
      mime: meta?.mimeType || '',
    };
  }, [currentUri, meta]);

  const hasExtras = Array.isArray(extraUris) && extraUris.length > 1;

  return (
    <Panel>
      {/* Title + integrity */}
      <Section>
        <BadgeWrap>
          <PixelHeading level={4}>{meta?.name || `Token #${token?.tokenId}`}</PixelHeading>
          <IntegrityBadge status={integrity.status} />
        </BadgeWrap>
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
          <p style={{ fontSize: '.85rem', lineHeight: 1.4, whiteSpace: 'pre-wrap', margin: 0 }}>{meta.description}</p>
        </Section>
      )}

      {/* MIME + preview of current URI */}
      <Section>
        <MetaGrid>
          <dt>MIME Type</dt>
          <dd>{cur.mime || meta?.mimeType || 'N/A'}</dd>
        </MetaGrid>
        {cur?.value && (
          <RenderMedia uri={cur.value} style={{ width: 96, height: 96, objectFit: 'contain' }} />
        )}
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

      {/* Attributes with rarity percentages */}
      {rarity?.traits && rarity.traits.length > 0 && (
        <Section>
          <span style={{ fontWeight: 700 }}>Attributes:</span>
          <TraitGrid>
            {rarity.traits.map((t) => (
              <Trait key={`${t.name}:${t.value}`}>
                <strong>{t.value}</strong>
                <span style={{ opacity: .8 }}>{t.name}</span>
                <TraitPct>{t.pct.toFixed(2).replace(/\.00$/, '')}%</TraitPct>
              </Trait>
            ))}
          </TraitGrid>
        </Section>
      )}

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
};

