/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenListingCard.jsx
  Rev :    r1213    2025‑08‑10 UTC
  Summary: Keep working BUY; add FullscreenModal button like
           TokenCard. Preserve UX, styles, hazards & consent logic.
           Uses BuyDialog directly; no regressions.
────────────────────────────────────────────────────────────*/

import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
} from 'react';
import PropTypes from 'prop-types';

// API base and network key for TzKT queries and domain resolution
import { TZKT_API, NETWORK_KEY } from '../config/deployTarget.js';

// Pixel button for actions/nav
import PixelButton from './PixelButton.jsx';

// Domain resolver for .tez lookups
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';

// Helpers to decode hex-encoded metadata and detect hazards in media
import decodeHexFields from '../utils/decodeHexFields.js';
import useConsent from '../hooks/useConsent.js';
import detectHazards from '../utils/hazards.js';

// Script toggle and universal media renderer
import { EnableScriptsToggle } from './EnableScripts.jsx';
import RenderMedia from '../utils/RenderMedia.jsx';

// BUY flow – mirror the working token page bar
import BuyDialog from './BuyDialog.jsx';
import { useWalletContext } from '../contexts/WalletContext.js';
import { fetchLowestListing } from '../core/marketplace.js';

// Fullscreen viewer & confirmation dialog (match TokenCard behavior)
import FullscreenModal from './FullscreenModal.jsx';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';

/*
 * Select a suitable data URI from the token metadata.  Prioritises
 * displayUri, then imageUri, then thumbnailUri and finally artifactUri.
 * Only returns URIs that begin with "data:" to guarantee fully
 * on‑chain media.  See invariant I24 for rationale.
 */
const pickDataUri = (m = {}) => {
  if (!m || typeof m !== 'object') return '';
  const candidates = [m.displayUri, m.imageUri, m.thumbnailUri, m.artifactUri];
  for (const u of candidates) {
    if (typeof u === 'string' && /^data:/i.test(u.trim())) return u.trim();
  }
  return '';
};

/* A placeholder for tokens whose metadata has not loaded or does not
 * contain any on‑chain media.  Preserves aspect ratio and grid layout.
 */
const PLACEHOLDER = '/sprites/cover_default.svg';

/**
 * Minimal listing card for the marketplace.  Fetches token metadata
 * from the TzKT API and displays the primary image or video along
 * with the token name (or id) and price.  Includes a working BUY
 * button that opens the BuyDialog using the same parameters and
 * guards as the working MarketplaceBar implementation.  RenderMedia
 * handles images, videos and SVGs; scripts can be enabled by the user.
 *
 * Adds a fullscreen button & modal (like TokenCard) so mp4s and
 * other media can be viewed properly without relying on the native
 * control’s fullscreen icon.
 *
 * @param {object} props component props
 * @param {string} props.contract FA2 contract address
 * @param {string|number} props.tokenId token id within the contract
 * @param {number} [props.priceMutez] optional lowest price in mutez (for label only)
 */
export default function TokenListingCard({ contract, tokenId, priceMutez }) {
  const [meta, setMeta] = useState(null);
  const [, setLoading] = useState(true);

  // Wallet/toolkit for marketplace calls
  const { address: walletAddr, toolkit } = useWalletContext() || {};

  // Local state for lowest listing + dialog
  const [lowest, setLowest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  // Consent flags for NSFW, flashing and scripts
  const [allowNSFW, setAllowNSFW] = useConsent('nsfw', false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);
  // Use a dynamic key for script consent scoped per token
  const scriptKey = useMemo(() => `scripts:${contract}:${tokenId}`, [contract, tokenId]);
  const [allowScr, setAllowScr] = useConsent(scriptKey, false);

  // Fullscreen modal & script-confirm dialog (mirroring TokenCard)
  const [fsOpen, setFsOpen] = useState(false);
  const [cfrmScr, setCfrmScr] = useState(false);
  const [scrTerms, setScrTerms] = useState(false);
  const askEnableScripts = useCallback(() => { setScrTerms(false); setCfrmScr(true); }, []);
  const confirmScripts   = useCallback(() => {
    if (scrTerms) { setAllowScr(true); setCfrmScr(false); }
  }, [scrTerms, setAllowScr]);

  // Fetch token metadata on mount and whenever contract or tokenId changes
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
            // decode hex-encoded metadata if necessary
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
    return () => { canceled = true; };
  }, [contract, tokenId]);

  // Derive authors and creators arrays from metadata with fallbacks
  const authors = useMemo(() => {
    const m = meta || {};
    const src = m.authors ?? m.artists ?? [];
    if (Array.isArray(src)) return src;
    if (typeof src === 'string') return src.split(/[,;]\s*/).filter((x) => x);
    return [];
  }, [meta]);

  const creators = useMemo(() => {
    const m = meta || {};
    const src = m.creators ?? [];
    if (Array.isArray(src)) return src;
    if (typeof src === 'string') return src.split(/[,;]\s*/).filter((x) => x);
    return [];
  }, [meta]);

  // Resolve .tez domains for addresses in authors/creators lists
  const [domains, setDomains] = useState({});
  useEffect(() => {
    const addrs = new Set();
    authors.forEach((val) => {
      if (typeof val === 'string' && /^(tz|kt)/i.test(val.trim())) addrs.add(val.trim());
    });
    creators.forEach((val) => {
      if (typeof val === 'string' && /^(tz|kt)/i.test(val.trim())) addrs.add(val.trim());
    });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authors, creators]);

  // Helper to abbreviate long Tezos addresses
  const shortAddr = useCallback((val) => {
    const v = String(val || '');
    return v.length > 10 ? `${v.slice(0, 5)}…${v.slice(-4)}` : v;
  }, []);

  // Format and render a list of entries (authors/creators).
  const renderEntries = useCallback((list, clickable) => {
    return list.map((val, idx) => {
      const v = String(val || '').trim();
      const key = v.toLowerCase();
      const resolved = domains[key];
      let content;
      if (resolved) content = resolved;
      else if (!/^(tz|kt)/i.test(v)) content = v;
      else content = shortAddr(v);
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

  // Select a data URI from metadata for preview or fall back to placeholder
  const imageUri = useMemo(() => pickDataUri(meta) || PLACEHOLDER, [meta]);
  const title = meta?.name || `Token #${tokenId}`;

  // Convert mutez price to tez string with six decimal places (label only)
  const priceXTZ = useMemo(() => {
    if (priceMutez == null) return null;
    return (priceMutez / 1_000_000).toLocaleString(undefined, {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    });
  }, [priceMutez]);

  // Detect hazards from full metadata
  const hazards = useMemo(() => (
    meta ? detectHazards(meta) : { nsfw: false, flashing: false, scripts: false }
  ), [meta]);
  const needsNSFW = hazards.nsfw && !allowNSFW;
  const needsFlash = hazards.flashing && !allowFlash;
  const blocked = needsNSFW || needsFlash;
  const scriptHaz = hazards.scripts;

  // Fullscreen media source (mirror TokenCard logic)
  const artifactDataUri = useMemo(() => {
    const u = meta?.artifactUri;
    return (typeof u === 'string' && /^data:/i.test(u.trim())) ? u.trim() : '';
  }, [meta]);
  const fsUri = useMemo(() => {
    // Prefer artifact when scripts are allowed and the artifact is a data: URI
    return (scriptHaz && allowScr && artifactDataUri) ? artifactDataUri : imageUri;
  }, [scriptHaz, allowScr, artifactDataUri, imageUri]);

  // Fetch the lowest active listing – follow MarketplaceBar pattern
  useEffect(() => {
    let stop = false;
    async function run() {
      setBusy(true);
      try {
        // Support both call shapes used across repo:
        //   fetchLowestListing({ toolkit, nftContract, tokenId })
        //   fetchLowestListing(toolkit, { nftContract, tokenId })
        let res = null;
        try {
          res = await fetchLowestListing({ toolkit, nftContract: contract, tokenId });
        } catch {
          /* fall through to 2‑arg */
        }
        if (!res) {
          try {
            res = await fetchLowestListing(toolkit, { nftContract: contract, tokenId });
          } catch {
            /* ignore */
          }
        }
        if (!stop) setLowest(res || null);
      } finally {
        if (!stop) setBusy(false);
      }
    }
    run();
    const t = setInterval(run, 15_000);
    return () => { stop = true; clearInterval(t); };
  }, [toolkit, contract, tokenId]);

  const isSeller = useMemo(() => {
    if (!walletAddr || !lowest?.seller) return false;
    return String(walletAddr).toLowerCase() === String(lowest.seller).toLowerCase();
  }, [walletAddr, lowest]);

  const cardBuyDisabled = !toolkit || !lowest || lowest.priceMutez == null || isSeller;

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
      {/* Hazard overlays for NSFW and flashing; script hazards are toggled via EnableScriptsToggle */}
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

      {/* Thumbnail: always render via RenderMedia; script execution controlled by toggle */}
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
        <RenderMedia
          uri={imageUri}
          alt={title}
          allowScripts={allowScr}
          /* ensure fresh mount when scripts toggle */
          key={String(allowScr)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />

        {/* Block interactive scripts until user enables (matches TokenCard) */}
        {scriptHaz && !allowScr && !blocked && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 6,
              background: 'transparent',
              pointerEvents: 'all',
            }}
            aria-label="Scripts disabled overlay"
          />
        )}

        {/* Fullscreen button (matches TokenCard placement/behavior) */}
        <PixelButton
          size="xs"
          disabled={!(!scriptHaz || allowScr)}
          onClick={() => { (!scriptHaz || allowScr) ? setFsOpen(true) : askEnableScripts(); }}
          title={(!scriptHaz || allowScr) ? 'Fullscreen' : 'Enable scripts first'}
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '4px',
            opacity: (!scriptHaz || allowScr) ? 0.45 : 0.35,
            zIndex: 7,
          }}
        >
          ⛶
        </PixelButton>
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
        <h4
          style={{
            margin: 0,
            fontSize: '.82rem',
            lineHeight: 1.15,
            fontFamily: 'Pixeloid Sans, monospace',
          }}
        >
          {title}
        </h4>

        {priceXTZ && (
          <p
            style={{
              margin: 0,
              fontSize: '.68rem',
              lineHeight: 1.25,
              color: 'var(--zu-accent-sec,#6ff)',
            }}
          >
            {priceXTZ} ꜩ
          </p>
        )}

        <p
          style={{
            margin: 0,
            fontSize: '.6rem',
            lineHeight: 1.15,
            opacity: 0.8,
          }}
        >
          ID {tokenId}
        </p>

        {authors.length > 0 && (
          <p
            style={{
              margin: 0,
              fontSize: '.6rem',
              lineHeight: 1.2,
              opacity: 0.75,
            }}
          >
            Author{authors.length > 1 ? 's' : ''} 
            {renderEntries(authors, false)}
          </p>
        )}

        {creators.length > 0 && (
          <p
            style={{
              margin: 0,
              fontSize: '.6rem',
              lineHeight: 1.2,
              opacity: authors.length > 0 ? 0.65 : 0.75,
            }}
          >
            Creator{creators.length > 1 ? 's' : ''} 
            {renderEntries(creators, true)}
          </p>
        )}

        {meta?.mimeType && (
          <p
            style={{
              margin: 0,
              fontSize: '.6rem',
              lineHeight: 1.2,
              opacity: 0.6,
            }}
          >
            {meta.mimeType}
          </p>
        )}

        {scriptHaz && !blocked && (
          <div style={{ margin: '2px 0 0 0' }}>
            <EnableScriptsToggle
              enabled={allowScr}
              onToggle={allowScr ? () => setAllowScr(false) : askEnableScripts}
            />
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '4px',
          }}
        >
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

      {/* Buy bar: inline, compact – mirrors MarketplaceBar behavior; no style changes to wrapper */}
      <div style={{ padding: '6px 8px 8px' }}>
        <PixelButton
          size="sm"
          disabled={cardBuyDisabled}
          onClick={() => setBuyOpen(true)}
          title={
            isSeller
              ? 'You cannot buy your own listing'
              : lowest && lowest.priceMutez != null
                ? `Buy for ${(lowest.priceMutez / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ꜩ`
                : (busy ? '…' : 'No active listing')
          }
        >
          BUY
        </PixelButton>
      </div>

      {/* Buy dialog – pass BOTH legacy and current prop names for maximum compatibility */}
      {buyOpen && lowest && (
        <BuyDialog
          /* visibility flags */
          open
          isOpen
          onClose={() => setBuyOpen(false)}

          /* contract identifiers: cover all variants in use */
          contract={contract}
          nftContract={contract}
          contractAddress={contract}

          /* token & listing detail */
          tokenId={tokenId}
          priceMutez={lowest.priceMutez}
          seller={lowest.seller}
          nonce={lowest.nonce}
          listingNonce={lowest.nonce}
          amount={1}
          available={lowest.amount || 1}

          /* some versions expect a single listing object, others discrete props */
          listing={{
            seller: lowest.seller,
            priceMutez: lowest.priceMutez,
            nonce: lowest.nonce,
            amount: lowest.amount || 1,
          }}

          /* pass toolkit when required by dialog internals */
          toolkit={toolkit}
        />
      )}

      {/* Fullscreen modal (works for mp4, html, svg, etc.) */}
      <FullscreenModal
        open={fsOpen}
        onClose={() => setFsOpen(false)}
        uri={fsUri}
        mime={meta?.mimeType}
        allowScripts={scriptHaz && allowScr}
        scriptHazard={scriptHaz}
      />

      {/* Enable-scripts confirmation (matches TokenCard UX) */}
      {cfrmScr && (
        <PixelConfirmDialog
          open
          title="Enable scripts?"
          message={(
            <>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
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
    </article>
  );
}

TokenListingCard.propTypes = {
  contract  : PropTypes.string.isRequired,
  tokenId   : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  priceMutez: PropTypes.number,
};

/* What changed & why (r1213):
   • Added FullscreenModal button + modal (like TokenCard) for better
     mp4/fullscreen UX. Keeps native preview intact.
   • Kept working BUY dialog path; no visual regressions.
   • Added scripts confirm dialog; toggle now asks before enabling.
   • Added overlay to block interactive scripts until enabled. */
/* EOF */
