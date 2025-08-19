/* Developed by @jams2blues
   File: zerounbound/src/ui/TokenListingCard.jsx
   Rev:  r1246
   Summary: Parity with token page — consumes `initialListing`, shares the
            preflight+buy path, TzKT‑first refresh; preserves script overlay. */

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
import { jFetch } from '../core/net.js';

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
`;

const Thumb = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: var(--zu-bg-dim, #111);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; outline: none; overflow: hidden;
  border-radius: 0 !important;
  &:focus-visible { box-shadow: inset 0 0 0 3px rgba(0,200,255,.45); }
`;

/* Top-layer navigation overlay (enabled only for embedded docs) */
const NavOverlay = styled.a`
  position: absolute; inset: 0; z-index: 6;
  pointer-events: ${p => (p.$active ? 'auto' : 'none')};
  background: transparent; text-indent: -9999px;
`;

const FSBtn = styled(PixelButton).attrs({ noActiveFx: true })`
  position: absolute; bottom: 4px; right: 4px;
  opacity: .45; z-index: 7; &:hover { opacity: 1; }
`;

const Meta = styled.section`
  border-top: 2px solid var(--zu-accent, #00c8ff);
  background: var(--zu-bg-alt, #171717);
  padding: 8px; display: grid; gap: 6px 8px;
  grid-template-columns: 1fr;
  grid-template-areas:
    "title" "creators" "collection" "buy" "scripts";
  h4 { grid-area: title; margin: 0; font-size: .85rem; line-height: 1.15;
       font-family: 'Pixeloid Sans', monospace; }
`;

const Creators   = styled.p` grid-area: creators; margin: 0; font-size: .7rem; opacity: .9; word-break: break-word; `;
const Collection = styled.p` grid-area: collection; margin: 0; font-size: .7rem; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; a { color: var(--zu-accent-sec,#6ff); text-decoration: none; }`;
const BuyRow     = styled.div` grid-area: buy; display: flex; align-items: center; gap: 8px; `;
const Price      = styled.span` margin-left: auto; font-family: 'Pixeloid Sans', monospace; font-size: 1rem; line-height: 1; white-space: nowrap; `;
const ScriptsRow = styled.div` grid-area: scripts; `;

/*──────────────── utilities ────────────────────────────────────────────────*/
const PLACEHOLDER = '/sprites/cover_default.svg';

const toArray = (src) => {
  if (Array.isArray(src)) return src;
  if (typeof src === 'string') {
    try { const j = JSON.parse(src); return Array.isArray(j) ? j : [src]; }
    catch { return [src]; }
  }
  if (src && typeof src === 'object') return Object.values(src);
  return [];
};

const normalizeStr = (v) => (typeof v === 'string' ? v.trim() : '');

/** Select a data: URI if present, prioritizing common media fields for cards. */
const pickDataUri = (m = {}) => {
  if (!m || typeof m !== 'object') return '';
  const keys = [
    'displayUri','display_uri','imageUri','image_uri','image',
    'thumbnailUri','thumbnail_uri','artifactUri','artifact_uri',
    'mediaUri','media_uri','animation_url','animationUrl',
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

/** Best candidate for preview (safe; prefers non‑HTML), falling back to data: or remote. */
const pickPreviewUri = (m = {}) => {
  if (!m || typeof m !== 'object') return '';
  const data = pickDataUri(m);
  if (data && !/^data:text\/html/i.test(data)) return data;

  const keys = [
    'displayUri','display_uri','imageUri','image_uri','image',
    'thumbnailUri','thumbnail_uri','artifactUri','artifact_uri',
    'mediaUri','media_uri','animation_url','animationUrl',
  ];
  const allowedScheme = /^(data:|ipfs:|https?:|ar:|arweave:)/i;

  for (const k of keys) {
    const v = normalizeStr(m[k]);
    if (!v || !allowedScheme.test(v)) continue;
    if (/\.html?(\?|#|$)/i.test(v)) continue;
    return v;
  }

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

/** Canonical artifact/media for fullscreen (HTML allowed). */
const pickArtifactUri = (m = {}) => {
  if (!m || typeof m !== 'object') return '';
  const keys = [
    'artifactUri','artifact_uri','mediaUri','media_uri',
    'animation_url','animationUrl','displayUri','display_uri',
    'imageUri','image_uri','image','thumbnailUri','thumbnail_uri',
  ];
  const allowedScheme = /^(data:|ipfs:|https?:|ar:|arweave:)/i;
  for (const k of keys) {
    const v = normalizeStr(m[k]);
    if (v && allowedScheme.test(v)) return v;
  }
  let htmlCandidate = ''; let firstCandidate = '';
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
const NAME_TTL_MS = 10 * 60 * 1000;
const _nameCache = new Map();
const _inflight  = new Map();

async function _fetchJson(url, opts) {
  try {
    const r = await jFetch(url, opts);
    if (!r || !r.ok) return null;
    try { return await r.json(); } catch { return null; }
  } catch { return null; }
}

async function resolveContractName(tzktV1, kt1, signal) {
  const addr = String(kt1 || '').trim();
  if (!/^KT1[0-9A-Za-z]{33}$/i.test(addr)) return '';
  const key = `${tzktV1}::${addr}`;
  const now = Date.now();
  const hit = _nameCache.get(key);
  if (hit && hit.exp > now) return hit.value;
  if (_inflight.has(key)) return _inflight.get(key);

  const p = (async () => {
    const md = await _fetchJson(`${tzktV1}/contracts/${addr}?select=metadata`, { signal });
    const mdName = (md && (md.name || md.title || md.symbol) || '').toString().trim();
    if (mdName) { _nameCache.set(key,{value:mdName,exp:now+NAME_TTL_MS}); return mdName; }
    const alias = await _fetchJson(`${tzktV1}/contracts/${addr}?select=alias`, { signal });
    const aliasName = (typeof alias === 'string' ? alias : alias?.alias) || '';
    if (aliasName && aliasName.trim()) {
      _nameCache.set(key, { value: aliasName.trim(), exp: now + NAME_TTL_MS });
      return aliasName.trim();
    }
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
  contractName,
  initialListing,   // {seller, nonce, priceMutez, amount, active}
}) {
  const { address: walletAddr, toolkit } = useWalletContext() || {};
  const tzktV1 = useMemo(() => {
    const net = (toolkit && toolkit._network?.type && /mainnet/i.test(toolkit._network.type))
      ? 'mainnet'
      : (NETWORK_KEY || 'ghostnet');
    return tzktV1Base(net);
  }, [toolkit]);

  const [meta, setMeta]       = useState(metadataProp || null);
  const [collName, setCollName] = useState(contractName || '');
  const [lowest, setLowest]   = useState(initialListing || null);     // ← seed right away
  const [busy, setBusy]       = useState(false);

  const [buyOpen, setBuyOpen]     = useState(false);
  const [fsOpen, setFsOpen]       = useState(false);
  const [cfrmScr, setCfrmScr]     = useState(false);
  const [scrTerms, setScrTerms]   = useState(false);
  const [revealType, setRevealType] = useState(null);
  const [termsOk, setTermsOk]     = useState(false);

  const [allowNSFW, setAllowNSFW]   = useConsent('nsfw', false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);
  const scriptKey = useMemo(() => `scripts:${contract}:${tokenId}`, [contract, tokenId]);
  const [allowScr, setAllowScr]     = useConsent(scriptKey, false);
  const askEnableScripts = useCallback(() => { setScrTerms(false); setCfrmScr(true); }, []);
  const confirmScripts   = useCallback(() => { if (scrTerms) { setAllowScr(true); setCfrmScr(false); } }, [scrTerms, setAllowScr]);

  /* resolve collection name (best effort) */
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      if (contractName) { if (!cancelled) setCollName(contractName); return; }
      if (!cancelled) setCollName('');
      try {
        const n = await resolveContractName(tzktV1, contract, ac.signal);
        if (!cancelled && n) setCollName(n);
      } catch {}
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [contract, contractName, tzktV1]);

  /* fetch metadata (only when not supplied by prop) */
  useEffect(() => {
    if (metadataProp) { setMeta(metadataProp); return undefined; }
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const url = `${tzktV1}/tokens?contract=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(String(tokenId))}&select=metadata,name`;
        const res = await jFetch(url, { signal: ac.signal });
        if (res && res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data) && data.length > 0) {
            let md = data[0]?.metadata || {};
            try { md = decodeHexFields(md); } catch {}
            if (data[0]?.name && !md.name) md.name = data[0].name;
            setMeta(md);
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [contract, tokenId, tzktV1, metadataProp]);

  /* hazards + URIs */
  const hazards = useMemo(
    () => (meta ? detectHazards(meta) : { nsfw: false, flashing: false, scripts: false }),
    [meta],
  );
  const needsNSFW = hazards.nsfw && !allowNSFW;
  const needsFlash = hazards.flashing && !allowFlash;
  const blocked = needsNSFW || needsFlash;

  const previewUri = useMemo(() => (pickPreviewUri(meta) || PLACEHOLDER), [meta]);
  const artifactUri = useMemo(() => pickArtifactUri(meta), [meta]);
  const fsUri = useMemo(() => artifactUri || previewUri || PLACEHOLDER, [artifactUri, previewUri]);

  /* market polling — TzKT first (core handles fallbacks) */
  useEffect(() => {
    let stop = false;
    async function run() {
      if (!toolkit) return;
      setBusy(true);
      try {
        const res = await fetchLowestListing({
          toolkit, nftContract: contract, tokenId, staleCheck: true,
        });
        if (!stop && res) setLowest(res);
      } finally {
        if (!stop) setBusy(false);
      }
    }
    // immediate refresh, but keep initialListing until something better arrives
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

  const domainsRef = useRef({});
  const [domainsState, setDomainsState] = useState({});
  useEffect(() => {
    const toLookup = []; const seen = new Set();
    creators.forEach((v) => {
      const s = typeof v === 'string' ? v : (v?.address || v?.wallet || '');
      const addr = String(s || '').trim();
      if (!/^tz/i.test(addr)) return;
      const key = addr.toLowerCase();
      if (seen.has(key)) return; seen.add(key);
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
  }, [creators]);

  const fmtCreator = useCallback((v) => {
    const s = typeof v === 'string' ? v : (v?.address || v?.wallet || '');
    const key = String(s || '').toLowerCase();
    const dom = domainsRef.current[key] ?? domainsState[key];
    if (dom) return dom;
    if (!/^(tz|kt)/i.test(String(s))) return String(v);
    return _shortAddr(String(s));
  }, [domainsState]);

  const goDetail = useCallback(() => { window.location.href = tokenHref; }, [tokenHref]);

  const onKey = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (blocked) setRevealType(needsNSFW ? 'nsfw' : 'flash');
      else goDetail();
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

  const onThumbClickCapture = useCallback((e) => {
    if (e.target?.closest?.('[data-no-nav="true"],button,[role="button"],a,input,select,textarea,label')) return;
    if (blocked) {
      e.preventDefault(); e.stopPropagation();
      setRevealType(needsNSFW ? 'nsfw' : 'flash');
      return;
    }
    if (!isMediaControlsHit(e)) { e.stopPropagation(); goDetail(); }
  }, [blocked, needsNSFW, isMediaControlsHit, goDetail]);

  const previewMime = useMemo(() => {
    const m = String(meta?.mimeType || meta?.mime || '').toLowerCase().trim();
    if (m) return m;
    const u = String(previewUri || '').toLowerCase();
    if (!u) return '';
    if (u.startsWith('data:')) {
      const head = u.slice(5);
      const at = Math.min(...[head.indexOf(';'), head.indexOf(','), head.length].filter(n => n >= 0));
      return head.slice(0, at);
    }
    if (/\.svg(\?|#|$)/i.test(u)) return 'image/svg+xml';
    if (/\.html?(\?|#|$)/i.test(u)) return 'text/html';
    return '';
  }, [meta, previewUri]);

  const overlayActive = useMemo(
    () => !blocked && hazards.scripts && allowScr && /^(image\/svg\+xml|text\/html)\b/.test(previewMime),
    [blocked, hazards.scripts, allowScr, previewMime],
  );

  /*────────────────────── render ───────────────────────────────────────────*/
  return (
    <Card aria-label={`Token listing card for ${title}`}>
      <Thumb
        className="preview-1x1"
        role="link"
        tabIndex={0}
        aria-label={`View ${title}`}
        onClickCapture={onThumbClickCapture}
        onClick={onThumbClick}
        onKeyDown={onKey}
      >
        {!blocked ? (
          previewUri && previewUri !== PLACEHOLDER ? (
            <RenderMedia
              uri={previewUri}
              mime={meta?.mimeType || meta?.mime || undefined}
              allowScripts={hazards.scripts && allowScr}
              onInvalid={() => {}}
              style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', borderRadius: 0, display: 'block' }}
            />
          ) : (
            <img
              src={PLACEHOLDER}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 0, display: 'block' }}
            />
          )
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0 8px', flexDirection: 'column' }}>
            {needsNSFW && (
              <PixelButton
                size="xs" warning noActiveFx
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRevealType('nsfw'); }}
                aria-label="Reveal NSFW content (confirmation required)" title="Reveal NSFW content"
              >NSFW&nbsp;🔞</PixelButton>
            )}
            {needsFlash && (
              <PixelButton
                size="xs" warning noActiveFx
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRevealType('flash'); }}
                aria-label="Reveal flashing content (confirmation required)" title="Reveal flashing content"
              >Flashing&nbsp;🚨</PixelButton>
            )}
          </div>
        )}

        <NavOverlay
          href={tokenHref}
          $active={overlayActive}
          aria-label={`Open ${title}`}
          title={title}
          tabIndex={-1}
          aria-hidden={!overlayActive}
        >
          Open {title}
        </NavOverlay>

        <FSBtn
          data-no-nav="true"
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
          onMouseDown={(e) => { e.stopPropagation(); }}
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
                    <a href={`/explore?cmd=tokens&admin=${encodeURIComponent(s)}`} style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'none' }}>
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

        <BuyRow>
          <PixelButton
            size="xs" noActiveFx
            disabled={cardBuyDisabled}
            onMouseDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBuyOpen(true); }}
            title={
              isSeller
                ? 'You cannot buy your own listing'
                : lowest && lowest.priceMutez != null
                  ? `Buy for ${(lowest.priceMutez / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ꜩ`
                  : (busy ? '…' : 'No active listing')
            }
            aria-label="Open buy dialog"
          >BUY</PixelButton>

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
          tokenId={tokenId}
          priceMutez={lowest.priceMutez}
          seller={lowest.seller}
          nonce={lowest.nonce}
          amount={1}
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

      {cfrmScr && (
        <PixelConfirmDialog
          open
          title="Enable scripts?"
          message={(
            <>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
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
                <input type="checkbox" checked={termsOk} onChange={(e) => setTermsOk(e.target.checked)} />
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
  initialListing: PropTypes.shape({
    seller: PropTypes.string, nonce: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    priceMutez: PropTypes.number, amount: PropTypes.number, active: PropTypes.bool,
  }),
};

TokenListingCard.defaultProps = {
  priceMutez  : undefined,
  metadata    : null,
  contractName: '',
  initialListing: null,
};

/* What changed & why (r1246):
   • Uses initialListing (SSR/TzKT) to seed price/seller/nonce (parity with
     token page) and refreshes via core fetchLowestListing (TzKT‑first).
   • Buy flow strictly reuses BuyDialog → core builder (v1–v4e).
   • Keeps top‑layer nav overlay + fullscreen/script gating intact. */
// EOF
