/* Developed by @jams2blues
   File: src/ui/TokenListingCard.jsx
   Rev:  r1242
   Summary: Stop TzKT 404 flood, memoize name resolver via jFetch,
            coalesce lookups (TTL), switch all HTTP calls to core/net.js,
            minor a11y/title polish. */

import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';

import PixelButton from './PixelButton.jsx';
import useConsent from '../hooks/useConsent.js';
import detectHazards from '../utils/hazards.js';
import { EnableScriptsToggle } from './EnableScripts.jsx';
import RenderMedia from '../utils/RenderMedia.jsx';
import BuyDialog from './BuyDialog.jsx';
import FullscreenModal from './FullscreenModal.jsx';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';
import { shortKt, shortAddr as _shortAddr } from '../utils/formatAddress.js';

import { useWalletContext } from '../contexts/WalletContext.js';
import { fetchLowestListing } from '../core/marketplace.js';
import decodeHexFields from '../utils/decodeHexFields.js';
import { NETWORK_KEY } from '../config/deployTarget.js';
import { tzktBase as tzktV1Base } from '../utils/tzkt.js';
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';
import { jFetch } from '../core/net.js'; // I40: centralized HTTP

// styled-components import may be ESM/CJS — normalize reference:
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────────────── styled shells ────────────────────────────────────────────*/
const Card = styled.article`
  position: relative;
  width: 100%;
  border: 2px solid var(--zu-accent, #00c8ff);
  background: var(--zu-bg, #000);
  color: var(--zu-fg, #fff);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: box-shadow .15s;
  &:hover { box-shadow: 0 0 6px var(--zu-accent-sec, #ff0); }
  /* NOTE: no &:active translate to avoid inner CTA “jump” */
`;

const Thumb = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;          /* strict 1:1 square */
  background: var(--zu-bg-dim, #111);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  outline: none;
  overflow: hidden;             /* perfect square; no bleed */
  border-radius: 0 !important;  /* absolutely no rounding */
  &:focus-visible { box-shadow: inset 0 0 0 3px rgba(0,200,255,.45); }
`;

const FSBtn = styled(PixelButton).attrs({ noActiveFx: true })`
  position: absolute;
  bottom: 4px;
  right: 4px;
  opacity: .45;
  z-index: 7; /* keep above tile click layer */
  &:hover { opacity: 1; }
`;

const Meta = styled.section`
  border-top: 2px solid var(--zu-accent, #00c8ff);
  background: var(--zu-bg-alt, #171717);
  padding: 8px;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-areas:
    "title"
    "creators"
    "collection"
    "buy"
    "scripts";
  gap: 6px 8px;

  h4 {
    grid-area: title;
    margin: 0;
    font-size: .85rem;
    line-height: 1.15;
    font-family: 'Pixeloid Sans', monospace;
  }
`;

const Creators = styled.p`
  grid-area: creators;
  margin: 0;
  font-size: .7rem;
  opacity: .9;
  word-break: break-word;
`;

const Collection = styled.p`
  grid-area: collection;
  margin: 0;
  font-size: .7rem;
  opacity: .85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  a { color: var(--zu-accent-sec, #6ff); text-decoration: none; }
`;

/* BUY row now contains BUY on the left and the price flush-right */
const BuyRow = styled.div`
  grid-area: buy;
  display: flex;
  align-items: center;
  gap: 8px;
`;

/* Price moved into the BuyRow; keep mono font; push to far right */
const Price = styled.span`
  margin-left: auto;
  font-family: 'Pixeloid Sans', monospace;
  font-size: 1rem;
  line-height: 1;
  white-space: nowrap;
`;

const ScriptsRow = styled.div` grid-area: scripts; `;

/*──────────────── utilities ────────────────────────────────────────────────*/
const PLACEHOLDER = '/sprites/cover_default.svg';

const toArray = (src) => {
  if (Array.isArray(src)) return src;
  if (typeof src === 'string') {
    try {
      const j = JSON.parse(src);
      return Array.isArray(j) ? j : [src];
    } catch {
      return [src];
    }
  }
  if (src && typeof src === 'object') return Object.values(src);
  return [];
};

const normalizeStr = (v) => (typeof v === 'string' ? v.trim() : '');

/** Select a data: URI if present, prioritizing common media fields for cards. */
const pickDataUri = (m = {}) => {
  if (!m || typeof m !== 'object') return '';
  const keys = [
    'displayUri', 'display_uri',
    'imageUri', 'image_uri', 'image',
    'thumbnailUri', 'thumbnail_uri',
    'artifactUri', 'artifact_uri',
    'mediaUri', 'media_uri',
    'animation_url', 'animationUrl',
  ];
  const dataRegex = /^data:(image|video|audio|text\/html|image\/svg\+xml)/i;

  for (const k of keys) {
    const v = normalizeStr(m[k]);
    if (v && dataRegex.test(v)) return v;
  }
  if (Array.isArray(m.formats)) {
    for (const f of m.formats) {
      const cand = normalizeStr(f?.uri || f?.url);
      if (cand && dataRegex.test(cand)) return cand;
    }
  }
  return '';
};

/** Best candidate for preview (safe; prefers non-HTML), falling back to data: or remote. */
const pickPreviewUri = (m = {}) => {
  if (!m || typeof m !== 'object') return '';
  const data = pickDataUri(m);
  if (data && !/^data:text\/html/i.test(data)) return data;

  const keys = [
    'displayUri', 'display_uri',
    'imageUri', 'image_uri', 'image',
    'thumbnailUri', 'thumbnail_uri',
    'artifactUri', 'artifact_uri',
    'mediaUri', 'media_uri',
    'animation_url', 'animationUrl',
  ];
  const allowedScheme = /^(data:|ipfs:|https?:|ar:|arweave:)/i;

  // 1) metadata fields (skip obvious HTML for preview safety)
  for (const k of keys) {
    const v = normalizeStr(m[k]);
    if (!v || !allowedScheme.test(v)) continue;
    if (/\.html?(\?|#|$)/i.test(v)) continue;
    return v;
  }

  // 2) formats array (skip text/html)
  if (Array.isArray(m.formats)) {
    for (const f of m.formats) {
      const uri = normalizeStr(f?.uri || f?.url);
      const mime = normalizeStr(f?.mime || f?.mimeType);
      if (!uri || !allowedScheme.test(uri)) continue;
      if (mime && /^text\/html\b/i.test(mime)) continue;
      if (!mime && /\.html?(\?|#|$)/i.test(uri)) continue;
      return uri;
    }
  }

  return '';
};

/** Best candidate for the canonical artifact/media (can be HTML).
 *  Used for Fullscreen (FS) where interactive artifacts are allowed
 *  *only* after explicit scripts consent, enforced elsewhere.
 */
const pickArtifactUri = (m = {}) => {
  if (!m || typeof m !== 'object') return '';
  const keys = [
    'artifactUri', 'artifact_uri',
    'mediaUri', 'media_uri',
    'animation_url', 'animationUrl',
    'displayUri', 'display_uri',
    'imageUri', 'image_uri', 'image',
    'thumbnailUri', 'thumbnail_uri',
  ];
  const allowedScheme = /^(data:|ipfs:|https?:|ar:|arweave:)/i;

  // Prefer explicit artifact/media/animation fields first (HTML allowed here).
  for (const k of keys) {
    const v = normalizeStr(m[k]);
    if (v && allowedScheme.test(v)) return v;
  }

  // Check formats; prefer HTML-like if present, else first valid.
  let htmlCandidate = '';
  let firstCandidate = '';
  if (Array.isArray(m.formats)) {
    for (const f of m.formats) {
      const uri = normalizeStr(f?.uri || f?.url);
      const mime = normalizeStr(f?.mime || f?.mimeType || f?.type);
      if (!uri || !allowedScheme.test(uri)) continue;

      const isHtmlLike =
        /^text\/html\b/i.test(mime) ||
        /^application\/x-directory\b/i.test(mime) ||
        /\.html?(\?|#|$)/i.test(uri);

      if (isHtmlLike && !htmlCandidate) htmlCandidate = uri;
      if (!firstCandidate) firstCandidate = uri;
    }
  }
  return htmlCandidate || firstCandidate || '';
};

/*──────────────── name‑resolver (no 404s; deduped; TTL) ────────────────────*/
/** In‑memory cache & inflight deduper for contract names. */
const NAME_TTL_MS = 10 * 60 * 1000; // 10 minutes
const _nameCache = new Map();       // key → { value: string, exp: number }
const _inflight = new Map();        // key → Promise<string>

async function _fetchJson(url, opts) {
  try {
    const r = await jFetch(url, opts);
    if (!r || !r.ok) return null;      // 4xx/5xx → null (silent)
    try { return await r.json(); } catch { return null; }
  } catch {
    return null;
  }
}

/** Best‑effort TZIP‑16/alias resolver without hitting 404 endpoints.
 *  Strategy:
 *   1) GET /contracts/{KT1}?select=metadata  → use name/title/symbol if present (200 even if empty).
 *   2) GET /contracts/{KT1}?select=alias     → fallback to TzKT alias if set (also 200/null).
 *  Results memoized for NAME_TTL_MS and coalesced across concurrent calls.
 */
async function resolveContractName(tzktV1, kt1, signal) {
  const addr = String(kt1 || '').trim();
  if (!/^KT1[0-9A-Za-z]{33}$/i.test(addr)) return '';

  const key = `${tzktV1}::${addr}`;
  const now = Date.now();

  const hit = _nameCache.get(key);
  if (hit && hit.exp > now) return hit.value;

  if (_inflight.has(key)) return _inflight.get(key);

  const p = (async () => {
    // 1) metadata (safe; no 404)
    const md = await _fetchJson(`${tzktV1}/contracts/${addr}?select=metadata`, { signal });
    const mdName = (md && (md.name || md.title || md.symbol) || '').toString().trim();
    if (mdName) {
      const value = mdName;
      _nameCache.set(key, { value, exp: now + NAME_TTL_MS });
      return value;
    }

    // 2) alias fallback (safe; no 404)
    const alias = await _fetchJson(`${tzktV1}/contracts/${addr}?select=alias`, { signal });
    const aliasName = (typeof alias === 'string' ? alias : alias?.alias) || '';
    if (aliasName && aliasName.trim()) {
      const value = aliasName.trim();
      _nameCache.set(key, { value, exp: now + NAME_TTL_MS });
      return value;
    }

    // negative cache for a shorter period to avoid refetch storms
    _nameCache.set(key, { value: '', exp: now + 3 * 60 * 1000 });
    return '';
  })().finally(() => { _inflight.delete(key); });

  _inflight.set(key, p);
  return p;
}

/*──────────────── component ────────────────────────────────────────────────*/
export default function TokenListingCard({
  contract,
  tokenId,
  priceMutez,
  metadata: metadataProp,
  contractName, // optional; we fetch if missing or stale for the current contract
}) {
  /* wallet / network context */
  const { address: walletAddr, toolkit } = useWalletContext() || {};
  const tzktV1 = useMemo(() => {
    const net = (toolkit && toolkit._network?.type && /mainnet/i.test(toolkit._network.type))
      ? 'mainnet'
      : (NETWORK_KEY || 'ghostnet');
    return tzktV1Base(net); // includes /v1; do not append again
  }, [toolkit]);

  /* local metadata state (if not provided via props) */
  const [meta, setMeta] = useState(metadataProp || null);

  /* resolved collection name (best‑effort) */
  const [collName, setCollName] = useState(contractName || '');

  // Single authoritative effect handles both prop-provided names + fetch on contract change.
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      // If prop supplied and belongs to this contract, prefer it (no network calls).
      if (contractName) {
        if (!cancelled) setCollName(contractName);
        return;
      }
      // Clear previous name on contract change to avoid stale carryover.
      if (!cancelled) setCollName('');

      try {
        const n = await resolveContractName(tzktV1, contract, ac.signal);
        if (!cancelled && n) setCollName(n);
      } catch {
        /* best effort; silent per I43/I14 backoff handled in jFetch */
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [contract, contractName, tzktV1]);

  /* market polling (lowest listing) */
  const [lowest, setLowest] = useState(null);
  const [busy, setBusy] = useState(false);

  /* dialogs / flags */
  const [buyOpen, setBuyOpen] = useState(false);
  const [fsOpen, setFsOpen] = useState(false);
  const [cfrmScr, setCfrmScr] = useState(false);
  const [scrTerms, setScrTerms] = useState(false);

  /* NEW: hazard reveal confirm (parity w/ TokenCard.jsx) */
  const [revealType, setRevealType] = useState(null); // 'nsfw' | 'flash' | null
  const [termsOk, setTermsOk] = useState(false);

  /* consent — per-feature and per-token (no global toggle for scripts) */
  const [allowNSFW, setAllowNSFW] = useConsent('nsfw', false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);
  const scriptKey = useMemo(() => `scripts:${contract}:${tokenId}`, [contract, tokenId]);
  const [allowScr, setAllowScr] = useConsent(scriptKey, false);
  const askEnableScripts = useCallback(() => { setScrTerms(false); setCfrmScr(true); }, []);
  const confirmScripts = useCallback(() => { if (scrTerms) { setAllowScr(true); setCfrmScr(false); } }, [scrTerms, setAllowScr]);

  /* fetch metadata (only when not supplied by prop) */
  useEffect(() => {
    if (metadataProp) { setMeta(metadataProp); return undefined; }

    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        // Request both name + metadata; name is used as a fallback title
        const url = `${tzktV1}/tokens?contract=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(String(tokenId))}&select=metadata,name`;
        const res = await jFetch(url, { signal: ac.signal });
        if (res && res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data) && data.length > 0) {
            let md = data[0]?.metadata || {};
            try { md = decodeHexFields(md); } catch { /* best effort */ }
            if (data[0]?.name && !md.name) md.name = data[0].name;
            setMeta(md);
          }
        }
      } catch {
        /* ignore — card remains functional with fallbacks; jFetch handles backoff */
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [contract, tokenId, tzktV1, metadataProp]);

  /* derived hazards + URIs (done after meta is known) */
  const hazards = useMemo(
    () => (meta ? detectHazards(meta) : { nsfw: false, flashing: false, scripts: false }),
    [meta],
  );
  const needsNSFW = hazards.nsfw && !allowNSFW;
  const needsFlash = hazards.flashing && !allowFlash;
  const blocked = needsNSFW || needsFlash;

  const previewUri = useMemo(
    () => (pickPreviewUri(meta) || PLACEHOLDER),
    [meta],
  );

  const artifactUri = useMemo(
    () => pickArtifactUri(meta),
    [meta],
  );

  const fsUri = useMemo(() => {
    // If scripts are required and not enabled, we won't open FS anyway (button asks to enable).
    // When allowed, prefer artifact/media; otherwise fall back to preview.
    return artifactUri || previewUri || PLACEHOLDER;
  }, [artifactUri, previewUri]);

  /* market polling (lowest listing every 15s) */
  useEffect(() => {
    let stop = false;
    async function run() {
      if (!toolkit) return;
      setBusy(true);
      try {
        let res = null;
        // Support both signatures (historical API shape)
        try { res = await fetchLowestListing({ toolkit, nftContract: contract, tokenId }); }
        catch { /* fall through */ }
        if (!res) {
          try { res = await fetchLowestListing(toolkit, { nftContract: contract, tokenId }); }
          catch { /* noop */ }
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

  /* seller + price */
  const isSeller = useMemo(() => {
    if (!walletAddr || !lowest?.seller) return false;
    return String(walletAddr).toLowerCase() === String(lowest.seller).toLowerCase();
  }, [walletAddr, lowest]);

  const effectiveMutez = (typeof priceMutez === 'number' ? priceMutez : lowest?.priceMutez);
  const priceXTZ = useMemo(() => {
    if (effectiveMutez == null) return null;
    // Always show 6 fractional digits per spec
    return (effectiveMutez / 1_000_000).toLocaleString(undefined, {
      minimumFractionDigits: 6, maximumFractionDigits: 6,
    });
  }, [effectiveMutez]);

  const cardBuyDisabled = !toolkit || !lowest || lowest.priceMutez == null || isSeller;

  /* title + routing */
  const title = meta?.name || `Token #${tokenId}`;
  const tokenHref = useMemo(
    () => `/tokens/${encodeURIComponent(contract)}/${encodeURIComponent(String(tokenId))}`,
    [contract, tokenId],
  );

  /* creators/authors (domain‑aware) */
  const creators = useMemo(() => {
    const raw = toArray(meta?.creators);
    return raw.length ? raw : toArray(meta?.authors || meta?.artists);
  }, [meta]);

  // Cache for domains we've looked up to prevent redundant network calls.
  const domainsRef = useRef({});
  const [domainsState, setDomainsState] = useState({});
  useEffect(() => {
    const toLookup = [];
    const seen = new Set();
    creators.forEach((v) => {
      const s = typeof v === 'string' ? v : (v?.address || v?.wallet || '');
      const addr = String(s || '').trim();
      if (!/^tz/i.test(addr)) return;
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
          setDomainsState((prev) => ({ ...prev, [key]: domainsRef.current[key] })); // trigger rerender once
        }
      }).catch(() => {
        domainsRef.current[key] = '';
        setDomainsState((prev) => ({ ...prev, [key]: '' }));
      });
    });
  }, [creators]);

  const fmtCreator = useCallback((v) => {
    const s = typeof v === 'string' ? v : (v?.address || v?.wallet || '');
    const key = String(s || '').toLowerCase();
    const dom = domainsRef.current[key] ?? domainsState[key];
    if (dom) return dom;
    if (!/^(tz|kt)/i.test(String(s))) return String(v);
    return _shortAddr(String(s));
  }, [domainsState]);

  /* navigation: let native video controls work; click elsewhere navigates.
     IMPORTANT: if blocked by NSFW/Flashing, do not navigate. */
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
    const band = Math.max(34, Math.min(64, r.height * 0.22));   // heuristic control band
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

  /*────────────────────── render ───────────────────────────────────────────*/
  return (
    <Card aria-label={`Token listing card for ${title}`}>
      {/* clickable 1:1 tile; media fits without cropping and with 0 radius */}
      <Thumb
        className="preview-1x1"
        role="link"
        tabIndex={0}
        aria-label={`View ${title}`}
        onClick={onThumbClick}
        onKeyDown={onKey}
      >
        {!blocked ? (
          previewUri && previewUri !== PLACEHOLDER ? (
            <RenderMedia
              uri={previewUri}
              mime={meta?.mimeType || meta?.mime || undefined}
              allowScripts={hazards.scripts && allowScr /* only if both flagged and enabled */}
              onInvalid={() => { /* keep placeholder under */ }}
              /* Longest edge snaps to tile edges; no rounding. */
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                objectPosition: 'center',
                borderRadius: 0,
                display: 'block',
              }}
            />
          ) : (
            <img
              src={PLACEHOLDER}
              alt="" /* decorative placeholder */
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 0, display: 'block' }}
            />
          )
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '6px', padding: '0 8px', flexDirection: 'column',
          }}>
            {needsNSFW && (
              <PixelButton
                size="xs"
                warning
                noActiveFx
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRevealType('nsfw'); }}
                aria-label="Reveal NSFW content (confirmation required)"
                title="Reveal NSFW content"
              >
                NSFW&nbsp;🔞
              </PixelButton>
            )}
            {needsFlash && (
              <PixelButton
                size="xs"
                warning
                noActiveFx
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRevealType('flash'); }}
                aria-label="Reveal flashing content (confirmation required)"
                title="Reveal flashing content"
              >
                Flashing&nbsp;🚨
              </PixelButton>
            )}
          </div>
        )}

        <FSBtn
          size="xs"
          aria-label={
            blocked
              ? (needsNSFW ? 'NSFW locked — confirm to view' : 'Flashing locked — confirm to view')
              : (!hazards.scripts || allowScr ? 'Open fullscreen' : 'Enable scripts first')
          }
          title={
            blocked
              ? (needsNSFW ? 'NSFW locked — confirm to view' : 'Flashing locked — confirm to view')
              : (!hazards.scripts || allowScr ? 'Fullscreen' : 'Enable scripts first')
          }
          disabled={blocked || (hazards.scripts && !allowScr)}
          onMouseDown={(e) => { e.stopPropagation(); }} // prevent tile click on press
          onClick={(e) => {
            e.preventDefault(); e.stopPropagation();
            if (blocked) { setRevealType(needsNSFW ? 'nsfw' : 'flash'); return; }
            (!hazards.scripts || allowScr) ? setFsOpen(true) : askEnableScripts();
          }}
        >
          ⛶
        </FSBtn>
      </Thumb>

      <Meta>
        <h4 title={title}>{title}</h4>

        {creators.length > 0 && (
          <Creators>
            Creator(s):{' '}
            {creators.map((c, i) => {
              const s = typeof c === 'string' ? c : (c?.address || c?.wallet || '');
              const content = fmtCreator(c);
              const pref = i ? ', ' : '';
              return /^(tz|kt)/i.test(String(s))
                ? (
                  <span key={`${String(s)}_${i}`}>
                    {pref}
                    <a
                      href={`/explore?cmd=tokens&admin=${encodeURIComponent(s)}`}
                      style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'none' }}
                    >
                      {content}
                    </a>
                  </span>
                )
                : <span key={`${String(content)}_${i}`}>{pref}{content}</span>;
            })}
          </Creators>
        )}

        <Collection>
          Collection:&nbsp;
          <a href={`/contracts/${encodeURIComponent(contract)}`} title={collName || shortKt(contract)}>
            {collName || shortKt(contract)}
          </a>
        </Collection>

        {/* BUY row with price flush-right */}
        <BuyRow>
          <PixelButton
            size="xs"                 /* small as requested */
            noActiveFx                /* do not “shrink” on press */
            disabled={cardBuyDisabled}
            onMouseDown={(e) => { e.stopPropagation(); }}  /* prevent tile click */
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBuyOpen(true); }}
            title={
              isSeller
                ? 'You cannot buy your own listing'
                : lowest && lowest.priceMutez != null
                  ? `Buy for ${(lowest.priceMutez / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ꜩ`
                  : (busy ? '…' : 'No active listing')
            }
            aria-label="Open buy dialog"
          >
            BUY
          </PixelButton>

          <Price aria-live="polite">
            {priceXTZ ? `${priceXTZ} ꜩ` : (busy ? '…' : '—')}
          </Price>
        </BuyRow>

        <ScriptsRow>
          {hazards.scripts && (
            <EnableScriptsToggle
              enabled={allowScr}
              onToggle={allowScr ? () => setAllowScr(false) : askEnableScripts}
            />
          )}
        </ScriptsRow>
      </Meta>

      {buyOpen && lowest && (
        <BuyDialog
          open
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
          listing={{ seller: lowest.seller, priceMutez: lowest.priceMutez, nonce: lowest.nonce, amount: lowest.amount || 1 }}
          toolkit={toolkit}
        />
      )}

      <FullscreenModal
        open={fsOpen}
        onClose={() => setFsOpen(false)}
        uri={fsUri}
        mime={meta?.mimeType || meta?.mime || undefined}
        allowScripts={hazards.scripts && allowScr}
        scriptHazard={hazards.scripts}
      />

      {/* Enable scripts confirm */}
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

      {/* NSFW / Flashing reveal confirm (parity with TokenCard.jsx) */}
      {revealType && (
        <PixelConfirmDialog
          open
          title={`Reveal ${revealType === 'nsfw' ? 'NSFW' : 'flashing‑hazard'} content?`}
          message={(
            <>
              {revealType === 'nsfw'
                ? <p style={{ margin: '0 0 8px' }}>This asset is flagged as <strong>Not‑Safe‑For‑Work (NSFW)</strong>. Viewer discretion is advised.</p>
                : <p style={{ margin: '0 0 8px' }}>This asset contains <strong>rapid flashing or strobing effects</strong>.</p>}
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="checkbox"
                  checked={termsOk}
                  onChange={(e) => setTermsOk(e.target.checked)}
                />
                I&nbsp;confirm&nbsp;I&nbsp;am&nbsp;18 + and&nbsp;agree&nbsp;to&nbsp;<a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
            </>
          )}
          confirmLabel="REVEAL"
          cancelLabel="Cancel"
          confirmDisabled={!termsOk}
          onConfirm={() => {
            if (revealType === 'nsfw') setAllowNSFW(true);
            if (revealType === 'flash') setAllowFlash(true);
            setRevealType(null);
            setTermsOk(false);
          }}
          onCancel={() => { setRevealType(null); setTermsOk(false); }}
        />
      )}
    </Card>
  );
}

TokenListingCard.propTypes = {
  contract    : PropTypes.string.isRequired,
  tokenId     : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  priceMutez  : PropTypes.number,
  metadata    : PropTypes.object,
  contractName: PropTypes.string,
};

TokenListingCard.defaultProps = {
  priceMutez  : undefined,
  metadata    : null,
  contractName: '',
};

/* What changed & why (r1242):
   • Eliminated 404‑prone /contracts/{KT1}/metadata probe.
   • Name resolver now uses /contracts?select=metadata→alias (200‑safe), memoized with TTL & inflight dedupe.
   • Switched all HTTP to core/net.js jFetch (I40), silent/back‑off aware.
   • Kept preview safety & consent gating; minor a11y/title polish. */
