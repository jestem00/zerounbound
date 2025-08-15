/*Developed by @jams2blues
  File: src/ui/TokenListingCard.jsx
  Rev: r1219
  Summary: Accept prefetched metadata/contractName to avoid per‑card fetches.
           Use tzktBase(network) (no '/v1/v1' issues). Keep Buy, fullscreen,
           and consent UX parity with TokenCard. */

import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
} from 'react';
import PropTypes from 'prop-types';

import PixelButton from './PixelButton.jsx';
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';
import decodeHexFields from '../utils/decodeHexFields.js';
import useConsent from '../hooks/useConsent.js';
import detectHazards from '../utils/hazards.js';
import { EnableScriptsToggle } from './EnableScripts.jsx';
import RenderMedia from '../utils/RenderMedia.jsx';
import BuyDialog from './BuyDialog.jsx';
import { useWalletContext } from '../contexts/WalletContext.js';
import { fetchLowestListing } from '../core/marketplace.js';
import FullscreenModal from './FullscreenModal.jsx';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';

import { NETWORK_KEY } from '../config/deployTarget.js';
import { tzktBase as tzktV1Base } from '../utils/tzkt.js';

/*──────── Utilities ────────*/

/** Pick a usable on-chain data URI from metadata (supports underscore keys). */
const pickDataUri = (m = {}) => {
  if (!m || typeof m !== 'object') return '';
  const keys = [
    'displayUri','display_uri',
    'imageUri','image_uri','image',
    'thumbnailUri','thumbnail_uri',
    'artifactUri','artifact_uri',
    'mediaUri','media_uri',
  ];
  for (const k of keys) {
    const v = m[k];
    if (typeof v === 'string' && /^data:(image|video|audio|text\/html|image\/svg\+xml)/i.test(v.trim())) {
      return v.trim();
    }
  }
  if (Array.isArray(m.formats)) {
    for (const f of m.formats) {
      const cand = f?.uri || f?.url;
      if (typeof cand === 'string' && /^data:(image|video|audio|text\/html|image\/svg\+xml)/i.test(cand.trim())) {
        return cand.trim();
      }
    }
  }
  return '';
};

const PLACEHOLDER = '/sprites/cover_default.svg';

/*──────── Component ────────*/
export default function TokenListingCard({
  contract,
  tokenId,
  priceMutez,
  metadata: metadataProp,
  contractName,
}) {
  const [meta, setMeta] = useState(metadataProp || null);
  const [, setLoading] = useState(!metadataProp);

  // Wallet/toolkit for marketplace calls
  const { address: walletAddr, toolkit } = useWalletContext() || {};

  // Compute the correct TzKT v1 base once (no `/v1/v1` ever)
  const tzktV1 = useMemo(() => {
    const net = (toolkit && toolkit._network?.type && /mainnet/i.test(toolkit._network.type))
      ? 'mainnet'
      : (NETWORK_KEY || 'ghostnet');
    return tzktV1Base(net);
  }, [toolkit]);

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

  // Fullscreen modal & script-confirm dialog
  const [fsOpen, setFsOpen] = useState(false);
  const [cfrmScr, setCfrmScr] = useState(false);
  const [scrTerms, setScrTerms] = useState(false);
  const askEnableScripts = useCallback(() => { setScrTerms(false); setCfrmScr(true); }, []);
  const confirmScripts   = useCallback(() => {
    if (scrTerms) { setAllowScr(true); setCfrmScr(false); }
  }, [scrTerms, setAllowScr]);

  // If parent didn't pass metadata, fetch it.
  useEffect(() => {
    let canceled = false;
    if (metadataProp) { setMeta(metadataProp); setLoading(false); return () => {}; }
    async function fetchMetadata() {
      setLoading(true);
      try {
        const url = `${tzktV1}/tokens?contract=${contract}&tokenId=${tokenId}&select=metadata,name`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (!canceled && Array.isArray(data) && data.length > 0) {
            let md = data[0].metadata || {};
            try { md = decodeHexFields(md); } catch { /* best effort */ }
            if (data[0].name && !md.name) md.name = data[0].name;
            setMeta(md);
          }
        }
      } catch { /* ignore */ }
      if (!canceled) setLoading(false);
    }
    fetchMetadata();
    return () => { canceled = true; };
  }, [contract, tokenId, tzktV1, metadataProp]);

  // Derive authors and creators arrays from metadata with fallbacks
  const authors = useMemo(() => {
    const m = meta || {};
    const src = m.authors ?? m.artists ?? [];
    if (Array.isArray(src)) return src;
    if (typeof src === 'string') return src.split(/[,;]\s*/).filter(Boolean);
    return [];
  }, [meta]);

  const creators = useMemo(() => {
    const m = meta || {};
    let src = m.creators ?? [];
    if (typeof src === 'string') {
      try {
        const arr = JSON.parse(src);
        if (Array.isArray(arr)) src = arr;
      } catch { src = src.split(/[,;]\s*/); }
    }
    return Array.isArray(src) ? src : [];
  }, [meta]);

  // Resolve .tez domains for addresses in authors/creators lists
  const [domains, setDomains] = useState({});
  useEffect(() => {
    const addrs = new Set();
    const pushIfAddr = (val) => {
      if (!val) return;
      const s = typeof val === 'string'
        ? val
        : (val.address || val.wallet || '');
      if (/^(tz|kt)/i.test(String(s).trim())) addrs.add(String(s).trim());
    };
    authors.forEach(pushIfAddr);
    creators.forEach(pushIfAddr);
    addrs.forEach((addr) => {
      const key = addr.toLowerCase();
      if (domains[key] !== undefined) return;
      resolveTezosDomain(addr, NETWORK_KEY).then((name) => {
        setDomains((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: name }));
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authors, creators]);

  const shortAddr = useCallback((val) => {
    const v = String(val || '');
    return v.length > 10 ? `${v.slice(0, 5)}…${v.slice(-4)}` : v;
  }, []);

  const renderEntries = useCallback((list, clickable) => {
    return list.map((val, idx) => {
      const v = typeof val === 'string' ? val : (val?.address || val?.wallet || '');
      const key = String(v || '').toLowerCase();
      const resolved = domains[key];
      let content;
      if (resolved) content = resolved;
      else if (!/^(tz|kt)/i.test(v)) content = String(val);
      else content = shortAddr(v);
      const prefix = idx > 0 ? ', ' : '';
      if (clickable && /^(tz|kt)/i.test(v)) {
        return (
          <React.Fragment key={`${v}-${idx}`}>
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
        <React.Fragment key={`${v}-${idx}`}>
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

  // Fullscreen media source
  const artifactDataUri = useMemo(() => {
    const keys = ['artifactUri','artifact_uri','mediaUri','media_uri'];
    for (const k of keys) {
      const u = meta?.[k];
      if (typeof u === 'string' && /^data:/i.test(u.trim())) return u.trim();
    }
    return '';
  }, [meta]);
  const fsUri = useMemo(() => {
    return (hazards.scripts && allowScr && artifactDataUri) ? artifactDataUri : imageUri;
  }, [hazards.scripts, allowScr, artifactDataUri, imageUri]);

  // Lowest active listing (Buy)
  useEffect(() => {
    let stop = false;
    async function run() {
      setBusy(true);
      try {
        let res = null;
        try {
          res = await fetchLowestListing({ toolkit, nftContract: contract, tokenId });
        } catch { /* fall through */ }
        if (!res) {
          try {
            res = await fetchLowestListing(toolkit, { nftContract: contract, tokenId });
          } catch { /* ignore */ }
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
              Reveal&nbsp;NSFW&nbsp;🔞
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
              Reveal&nbsp;Flashing&nbsp;🚨
            </button>
          )}
        </div>
      )}

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
          key={String(allowScr)}  /* ensure fresh mount when toggled */
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />

        {hazards.scripts && !allowScr && !blocked && (
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

        <PixelButton
          size="xs"
          disabled={!(!hazards.scripts || allowScr)}
          onClick={() => { (!hazards.scripts || allowScr) ? setFsOpen(true) : askEnableScripts(); }}
          title={(!hazards.scripts || allowScr) ? 'Fullscreen' : 'Enable scripts first'}
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '4px',
            opacity: (!hazards.scripts || allowScr) ? 0.45 : 0.35,
            zIndex: 7,
          }}
        >
          ⛶
        </PixelButton>
      </div>

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

        {contractName && (
          <p style={{ margin: 0, fontSize: '.62rem', lineHeight: 1.2, opacity: 0.7 }}>
            {contractName}
          </p>
        )}

        {priceXTZ && (
          <p
            style={{
              margin: 0,
              fontSize: '.68rem',
              lineHeight: 1.25,
              color: 'var(--zu-accent-sec,#6ff)',
            }}
          >
            {priceXTZ}&nbsp;ꜩ
          </p>
        )}

        <p style={{ margin: 0, fontSize: '.6rem', lineHeight: 1.15, opacity: 0.8 }}>
          ID&nbsp;{tokenId}
        </p>

        {authors.length > 0 && (
          <p style={{ margin: 0, fontSize: '.6rem', lineHeight: 1.2, opacity: 0.75 }}>
            Author{authors.length > 1 ? 's' : ''}&nbsp;
            {renderEntries(authors, false)}
          </p>
        )}

        {creators.length > 0 && (
          <p style={{ margin: 0, fontSize: '.6rem', lineHeight: 1.2, opacity: authors.length > 0 ? 0.65 : 0.75 }}>
            Creator{creators.length > 1 ? 's' : ''}&nbsp;
            {renderEntries(creators, true)}
          </p>
        )}

        {meta?.mimeType && (
          <p style={{ margin: 0, fontSize: '.6rem', lineHeight: 1.2, opacity: 0.6 }}>
            {meta.mimeType}
          </p>
        )}

        {hazards.scripts && !blocked && (
          <div style={{ margin: '2px 0 0 0' }}>
            <EnableScriptsToggle
              enabled={allowScr}
              onToggle={allowScr ? () => setAllowScr(false) : askEnableScripts}
            />
          </div>
        )}

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

      {buyOpen && lowest && (
        <BuyDialog
          open
          isOpen
          onClose={() => setBuyOpen(false)}

          contract={contract}
          nftContract={contract}
          contractAddress={contract}

          tokenId={tokenId}
          priceMutez={lowest.priceMutez}
          seller={lowest.seller}
          nonce={lowest.nonce}
          listingNonce={lowest.nonce}
          amount={1}
          available={lowest.amount || 1}

          listing={{
            seller: lowest.seller,
            priceMutez: lowest.priceMutez,
            nonce: lowest.nonce,
            amount: lowest.amount || 1,
          }}

          toolkit={toolkit}
        />
      )}

      <FullscreenModal
        open={fsOpen}
        onClose={() => setFsOpen(false)}
        uri={fsUri}
        mime={meta?.mimeType}
        allowScripts={hazards.scripts && allowScr}
        scriptHazard={hazards.scripts}
      />

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
  contract    : PropTypes.string.isRequired,
  tokenId     : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  priceMutez  : PropTypes.number,
  metadata    : PropTypes.object,      // optional prefetched metadata
  contractName: PropTypes.string,      // optional label
};

/* What changed & why: r1219 – Added optional `metadata`/`contractName`
   props to skip per-card metadata fetch; ensured tzktBase is used
   without adding a second '/v1'; preserved BUY/Fullscreen/consent UX. */
