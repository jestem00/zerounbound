/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenListingCard.jsx
  Rev :    r6    2025‑08‑01 UTC
  Summary: Enhanced listing card for the marketplace.  Fetches
           metadata from TzKT, resolves .tez domains for
           authors/creators, renders creators as clickable
           links to filter tokens by address, adds a “VIEW”
           button linking to the token detail page and displays
           hazard consent overlays (NSFW, flashing, scripts).
           Shows image, price, token id, authors, creators,
           MIME type and a buy button via MarketplaceBuyBar.  This
           revision hides the price in the buy button, displays
           the price with full precision (six decimals) in a
           contrasting accent colour and passes showPrice={false}
           to MarketplaceBuyBar.  It also formats prices
           consistently without rounding.
────────────────────────────────────────────────────────────*/

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';

// Use TzKT API base to fetch token metadata on the fly
import { TZKT_API } from '../config/deployTarget.js';
import MarketplaceBuyBar from './MarketplaceBuyBar.jsx';
import PixelButton from './PixelButton.jsx';

// Domain resolver and network key for .tez lookups
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';
import { NETWORK_KEY } from '../config/deployTarget.js';
// Utility to decode hex fields if metadata comes as hex (fallback)
import decodeHexFields from '../utils/decodeHexFields.js';

// Consent and hazard helpers for NSFW, flashing and scripts
import useConsent from '../hooks/useConsent.js';
import detectHazards from '../utils/hazards.js';

/*
 * Select a suitable data URI from the token metadata.  This helper
 * prioritises displayUri, then imageUri, then thumbnailUri and
 * finally artifactUri.  Only returns URIs that begin with
 * "data:"; other protocols are ignored in order to guarantee
 * fully on‑chain media.  See invariant I24 for rationale.
 */
const pickDataUri = (m = {}) => {
  if (!m || typeof m !== 'object') return '';
  const candidates = [m.displayUri, m.imageUri, m.thumbnailUri, m.artifactUri];
  for (const u of candidates) {
    if (typeof u === 'string' && /^data:/i.test(u.trim())) return u.trim();
  }
  return '';
};

/* A simple placeholder for tokens whose metadata has not loaded yet
 * or does not contain any on‑chain media.  This placeholder
 * preserves aspect ratio and ensures a consistent grid layout.
 */
const PLACEHOLDER = '/sprites/cover_default.svg';

/**
 * Minimal listing card for the marketplace.  Fetches token
 * metadata from the TzKT API and displays the primary image
 * (data URI) along with the token name (or tokenId) and price.
 * Includes a buy button via MarketplaceBuyBar.  Does not
 * depend on the full TokenCard component to avoid missing
 * dependencies in the explore bundle.
 *
 * @param {object} props component props
 * @param {string} props.contract KT1 address of the NFT contract
 * @param {string|number} props.tokenId token id within the contract
 * @param {number} [props.priceMutez] precomputed lowest price in mutez
 */
export default function TokenListingCard({ contract, tokenId, priceMutez }) {
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  // Consent flags for NSFW, flashing and scripts
  const [allowNSFW, setAllowNSFW] = useConsent('nsfw', false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);
  const scriptKey = `scripts:${contract}:${tokenId}`;
  const [allowScr, setAllowScr] = useConsent(scriptKey, false);
  useEffect(() => {
    let canceled = false;
    async function fetchMetadata() {
      setLoading(true);
      try {
        const url = `${TZKT_API}/v1/tokens?contract=${contract}&tokenId=${tokenId}&select=metadata,name`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (!canceled && Array.isArray(data) && data.length > 0) {
            let md = data[0].metadata || {};
            // metadata may be hex‑encoded; attempt to decode
            if (typeof md === 'string') {
              try {
                md = decodeHexFields(md);
              } catch {
                md = {};
              }
            }
            md.name = data[0].name || md.name;
            setMeta(md);
          }
        }
      } catch {
        /* ignore network errors */
      }
      if (!canceled) setLoading(false);
    }
    fetchMetadata();
    return () => {
      canceled = true;
    };
  }, [contract, tokenId]);

  // Derive authors and creators arrays from metadata (fallbacks)
  const authors = useMemo(() => {
    const m = meta || {};
    const src = m.authors ?? m.artists ?? [];
    if (Array.isArray(src)) return src;
    if (typeof src === 'string') {
      return src.split(/[,;]\s*/).filter((x) => x);
    }
    return [];
  }, [meta]);
  const creators = useMemo(() => {
    const m = meta || {};
    const src = m.creators ?? [];
    if (Array.isArray(src)) return src;
    if (typeof src === 'string') {
      return src.split(/[,;]\s*/).filter((x) => x);
    }
    return [];
  }, [meta]);

  // Domain cache for authors and creators
  const [domains, setDomains] = useState({});
  useEffect(() => {
    const addrs = new Set();
    authors.forEach((a) => { if (typeof a === 'string' && /^(tz|kt)/i.test(a.trim())) addrs.add(a.trim()); });
    creators.forEach((a) => { if (typeof a === 'string' && /^(tz|kt)/i.test(a.trim())) addrs.add(a.trim()); });
    addrs.forEach((addr) => {
      const key = addr.toLowerCase();
      if (domains[key] !== undefined) return;
      resolveTezosDomain(addr, NETWORK_KEY).then((name) => {
        setDomains((prev) => {
          if (prev[key] !== undefined) return prev;
          return { ...prev, [key]: name };
        });
      });
    });
  }, [authors, creators]);

  // Helper to shorten Tezos addresses
  const shortAddr = useCallback((val) => {
    const v = String(val || '');
    return v.length > 10 ? `${v.slice(0, 5)}…${v.slice(-4)}` : v;
  }, []);

  // Render a list of values (authors or creators).  When clickable
  // is true, tz/KT addresses are wrapped in an <a> tag that links
  // to a filtered explore page showing tokens by that admin.  If
  // clickable is false, addresses and names are rendered as plain
  // text.  Domain names take precedence over addresses.  Use
  // shortAddr() to abbreviate raw addresses.
  const renderEntries = useCallback((list, clickable) => {
    return list.map((val, idx) => {
      const v = String(val || '').trim();
      const key = v.toLowerCase();
      const resolved = domains[key];
      let content;
      if (resolved) {
        content = resolved;
      } else if (!/^(tz|kt)/i.test(v)) {
        content = v;
      } else {
        content = shortAddr(v);
      }
      const prefix = idx > 0 ? ', ' : '';
      if (clickable && /^(tz|kt)/i.test(v)) {
        return (
          <React.Fragment key={v}>
            {prefix}
            <a
              href={`/explore?cmd=tokens&admin=${v}`}
              style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'none' }}
            >
              {content}
            </a>
          </React.Fragment>
        );
      }
      return (
        <React.Fragment key={v}>
          {prefix}
          {content}
        </React.Fragment>
      );
    });
  }, [domains, shortAddr]);

  // Hazard detection for NSFW, flashing and scripts
  const hazards = useMemo(() => (meta ? detectHazards(meta) : { nsfw: false, flashing: false, scripts: false }), [meta]);
  const needsNSFW  = hazards.nsfw     && !allowNSFW;
  const needsFlash = hazards.flashing && !allowFlash;
  const needsScr   = hazards.scripts && !allowScr;
  const blocked    = needsNSFW || needsFlash;
  // Convert price in mutez to tez for display; leave null when unknown
  const priceXTZ = priceMutez != null
    ? (priceMutez / 1_000_000).toLocaleString(undefined, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      })
    : null;
  // Determine image URI; prefer on‑chain data URIs, fallback to placeholder
  const imageUri = useMemo(() => pickDataUri(meta) || PLACEHOLDER, [meta]);
  // Determine token name or fallback to id
  const title = meta?.name || `Token #${tokenId}`;
  return (
    <article
      style={{
        position: 'relative',
        width: '100%',
        border: '2px solid var(--zu-accent, #00c8ff)',
        background: 'var(--zu-bg, #000)',
        color: 'var(--zu-fg, #fff)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '330px',
      }}
    >
      {/* Hazard overlays */}
      {(needsNSFW || needsFlash) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            background: 'rgba(0,0,0,0.8)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.5rem',
            textAlign: 'center',
          }}
        >
          {needsNSFW && (
            <button
              type="button"
              onClick={() => setAllowNSFW(true)}
              style={{
                background: 'var(--zu-accent,#00c8ff)',
                border: '2px solid var(--zu-accent,#00c8ff)',
                padding: '0.4rem 0.8rem',
                fontFamily: 'Pixeloid Sans, monospace',
                cursor: 'pointer',
              }}
            >
              Reveal NSFW 🔞
            </button>
          )}
          {needsFlash && (
            <button
              type="button"
              onClick={() => setAllowFlash(true)}
              style={{
                background: 'var(--zu-accent,#00c8ff)',
                border: '2px solid var(--zu-accent,#00c8ff)',
                padding: '0.4rem 0.8rem',
                fontFamily: 'Pixeloid Sans, monospace',
                cursor: 'pointer',
              }}
            >
              Reveal Flashing 🚨
            </button>
          )}
        </div>
      )}
      {(!blocked && needsScr) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 9,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.5rem',
            textAlign: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => setAllowScr(true)}
            style={{
              background: 'var(--zu-accent,#00c8ff)',
              border: '2px solid var(--zu-accent,#00c8ff)',
              padding: '0.4rem 0.8rem',
              fontFamily: 'Pixeloid Sans, monospace',
              cursor: 'pointer',
            }}
          >
            Enable Scripts
          </button>
        </div>
      )}
      {/* Thumbnail */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1/1',
          background: 'var(--zu-bg-dim, #111)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Use img tag for data URIs; if no image, show placeholder */}
        <img
          src={imageUri}
          alt={title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      {/* Metadata section */}
      <div
        style={{
          background: 'var(--zu-bg-alt, #171717)',
          padding: '6px 8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          flex: '1 1 auto',
          borderTop: '2px solid var(--zu-accent, #00c8ff)',
        }}
      >
        <h4 style={{ margin: 0, fontSize: '.82rem', lineHeight: 1.15, fontFamily: 'Pixeloid Sans, monospace' }}>
          {title}
        </h4>
        {priceXTZ && (
          <p style={{ margin: 0, fontSize: '.68rem', lineHeight: 1.25, color: 'var(--zu-accent-sec,#6ff)' }}>
            {priceXTZ} ꜩ
          </p>
        )}
        {/* Token identifier to help users distinguish editions */}
        <p style={{ margin: 0, fontSize: '.6rem', lineHeight: 1.15, opacity: 0.8 }}>
          ID {tokenId}
        </p>
        {/* Authors and creators lines: display names with domain resolution.  Creators
           are clickable links to filter tokens by admin address. */}
        {authors.length > 0 && (
          <p style={{ margin: 0, fontSize: '.6rem', lineHeight: 1.2, opacity: 0.75 }}>
            Author{authors.length > 1 ? 's' : ''} 
            {renderEntries(authors, false)}
          </p>
        )}
        {creators.length > 0 && (
          <p style={{ margin: 0, fontSize: '.6rem', lineHeight: 1.2, opacity: authors.length > 0 ? 0.65 : 0.75 }}>
            Creator{creators.length > 1 ? 's' : ''} 
            {renderEntries(creators, true)}
          </p>
        )}
        {/* File type */}
        {meta?.mimeType && (
          <p style={{ margin: 0, fontSize: '.6rem', lineHeight: 1.2, opacity: 0.6 }}>
            {meta.mimeType}
          </p>
        )}
        {/* View button: navigate to token detail page */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
          <PixelButton
            size="sm"
            as="a"
            href={`/tokens/${contract}/${tokenId}`}
            title="View token detail"
          >
            VIEW
          </PixelButton>
        </div>
      </div>
      {/* Buy bar */}
      <div style={{ padding: '6px 8px 8px' }}>
        <MarketplaceBuyBar contractAddress={contract} tokenId={tokenId} showPrice={false} />
      </div>
    </article>
  );
}

TokenListingCard.propTypes = {
  contract  : PropTypes.string.isRequired,
  tokenId   : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  priceMutez: PropTypes.number,
};

/* What changed & why: r6 – Adjusted TokenListingCard to display the price
   with full precision and accent colour, and to hide the price inside
   the Buy button by passing showPrice={false} to MarketplaceBuyBar.
   Updated price formatting to avoid rounding and changed the Buy
   button label behaviour accordingly.  Also bumped the revision and
   summary to reflect these improvements. */