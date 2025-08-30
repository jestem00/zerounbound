/*
Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  DevelopedÃ¢â‚¬Â¯byÃ¢â‚¬Â¯@jams2blues Ã¢â‚¬â€œÃ¢â‚¬Â¯ZeroContractÃ‚Â Studio
  File:    src/ui/MAINTokenMetaPanel.jsx
  Rev :    r17    2025Ã¢â‚¬â€˜10Ã¢â‚¬â€˜26
  Summary: add unobtrusive Extra URI viewer entry point;
           preserve existing layout; guard MarketplaceBar calls
           until contract & tokenId exist to avoid TzKT 400s.
           r17: when offÃ¢â‚¬â€˜chain views do not provide name/description
           values, hide those rows rather than showing Ã¢â‚¬Å“Ã¢â‚¬â€Ã¢â‚¬Â, while
           always displaying the ExtraÃ‚Â Key.
Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬*/

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import PropTypes                    from 'prop-types';
import { format }                   from 'date-fns';
import styledPkg                    from 'styled-components';

import PixelHeading                 from './PixelHeading.jsx';
import PixelButton                  from './PixelButton.jsx';
import RenderMedia                  from '../utils/RenderMedia.jsx';
import IntegrityBadge               from './IntegrityBadge.jsx';
import MarketplaceBar               from './MarketplaceBar.jsx';
import ShareDialog                  from './ShareDialog.jsx';

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
// Robust MIME helper import (supports either mimeFromDataUri or getMime)
import * as uriHelpers              from '../utils/uriHelpers.js';

// Import domain resolution helper and network key for reverse lookups.
import { resolveTezosDomain }       from '../utils/resolveTezosDomain.js';
import { NETWORK_KEY }              from '../config/deployTarget.js';

/* NEW: compact modal for extra URIs (fallback if page doesn't supply onOpenExtras) */
import ExtraUriViewer               from './ExtraUriViewer.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
// Safe MIME extractor supporting both older/newer helper names.
const mimeFromDataUri = typeof uriHelpers.mimeFromDataUri === 'function'
  ? uriHelpers.mimeFromDataUri
  : (typeof uriHelpers.getMime === 'function'
      ? uriHelpers.getMime
      : (v) => ((String(v || '').match(/^data:([^;,]+)/i) || [,''])[1] || ''));

/*Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬*/
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

// generic address shortener (fallback when nonÃ¢â‚¬â€˜KT/tz strings appear)
const shortAddrLocal = (v = '') => {
  const s = String(v);
  if (!s) return s;
  return s.length > 12 ? `${s.slice(0, 6)}Ã¢â‚¬Â¦${s.slice(-4)}` : s;
};

/*Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ styled shells Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬*/
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
  /* ensure crisp scaling for tiny raster thumbs */
  image-rendering: pixelated;
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

/* Row container for tag chips with a label. */
const TagsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
`;

/* Meta grid for labels/values. */
const MetaGrid = styled.dl`
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 8px;
  font-size: .8rem;
  dt { font-weight: 700; opacity: .8; }
  dd { margin: 0; word-break: break-word; }
`;

/*Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬*/
const HASH2VER = Object.entries(hashMatrix)
  .reduce((o, [h, v]) => { o[+h] = v.toUpperCase(); return o; }, {});

const PLACEHOLDER = '/sprites/cover_default.svg';

/* Strict thumbnail selection: only return data URIs. */
function pickDataThumb(uri = '') {
  return /^data:/i.test(uri) ? uri : '';
}

/* Decode metadata object from hex/JSON/object to plain object. */
function toMetaObject(meta) {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try { return decodeHexFields(JSON.parse(meta)); } catch {/*noop*/}
    const parsed = decodeHexJson(meta);
    return parsed ? decodeHexFields(parsed) : {};
  }
  return decodeHexFields(meta);
}

/* Pick a thumbnail URI from a decoded metadata object. */
function pickThumb(m = {}) {
  const uri = m.imageUri || m.thumbnailUri || m.displayUri || m.artifactUri || '';
  return pickDataThumb(uri);
}

/*Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ component Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬*/
export default function MAINTokenMetaPanel({
  token,
  collection,
  walletAddress: _wa,
  tokenScripts,
  tokenAllowJs,
  onToggleScript: PropTypes.func,
  onToggleScript: PropTypes.func,
  onToggleScript: PropTypes.func,
  onRequestScriptReveal: PropTypes.func,
  onToggleScript: PropTypes.func,
  onRequestScriptReveal,
  onFullscreen,
  currentUri,
  /* pass the whole set of URIs so we can optionally open a compact viewer */
  extraUris = [],
  /* page-level viewer open function */
  onOpenExtras,
  fsDisabled,
}) {
  const [copied, setCopied] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareAlias, setShareAlias] = useState('');

  // Decode collection metadata for display + hazards.
  const collObj = useMemo(() => toMetaObject(collection.metadata), [collection.metadata]);
  const collHaz = detectHazards(collObj);

  // Current media (artifactUri or selected extra).  Use provided currentUri when available.
  const cur = useMemo(() => {
    if (currentUri) {
      return { ...currentUri, mime: currentUri.mime || mimeFromDataUri(currentUri.value) };
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

  // Consents (shared keys with the rest of the app).
  const [allowScr, setAllowScr] = useConsent(`scripts:${collection.address}`, false);
  const [allowNSFW, setAllowNSFW] = useConsent('nsfw', false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);

  /* reveal dialog state */
  const [dlgType, setDlgType] = useState(null);
  const [dlgTerms, setDlgTerms] = useState(false);
  /* scriptÃ¢â‚¬â€˜consent dialog state (collection-level) */
  const [dlgScr, setDlgScr] = useState(false);
  const [termsScr, setTermsScr] = useState(false);

  /* integrity + editions */
  const integrity = useMemo(() => checkOnChainIntegrity(token.metadata || {}), [token.metadata]);
  const { label } = useMemo(() => getIntegrityInfo(integrity.status), [integrity.status]);
  void label;
  const editions = useMemo(() => countAmount(token), [token]);
  const verLabel = HASH2VER[collection.typeHash] || '?';

  /* thumb uri + fallbacks */
  const rawThumb = pickThumb(collObj);
  const thumb = rawThumb;
  const [thumbOk, setThumbOk] = useState(true);

  /* hazard mask logic across collection + token */
  const needsNSFW = (collHaz.nsfw || tokHaz.nsfw) && !allowNSFW;
  const needsFlash = (collHaz.flashing || tokHaz.flashing) && !allowFlash;
  const hide = needsNSFW || needsFlash;

  /* safe collection name (fall back to short KT1) */
  const collNameSafe = collObj.name
    || collObj.symbol
    || collObj.title
    || collObj.collectionName
    || shortKt(collection.address);

  // Domain resolution state for authors and creators.
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

  // Resolve @handle for primary creator when opening Share.
  useEffect(() => {
    if (!shareOpen) return;
    let cancelled = false;
    const firstAddr = (() => {
      const all = [...creatorsList, ...authorsList];
      for (const v of all) {
        if (typeof v !== 'string') continue;
        const s = v.trim();
        if (/^tz[1-3][0-9A-Za-z]{33}$/i.test(s)) return s;
      }
      return '';
    })();
    if (!firstAddr) { setShareAlias(''); return; }
    (async () => {
      try {
        const res = await fetch(`/api/handle/${firstAddr}`);
        const j = await res.json();
        if (!cancelled) setShareAlias(j?.alias || '');
      } catch { if (!cancelled) setShareAlias(''); }
    })();
    return () => { cancelled = true; };
  }, [shareOpen, creatorsList, authorsList]);

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
            Ã¢â‚¬Â¦Ã‚Â 
            <button
              type="button"
              aria-label="Show all entries"
              onClick={(e) => { e.preventDefault(); setShowAll(true); }}
              style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
            >
              Ã°Å¸â€Â»More
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

  const extraCount = Array.isArray(extraUris) ? extraUris.length : 0;
  const initialIndex = useMemo(() => {
    if (!extraCount) return 0;
    const i = extraUris.findIndex((u) => (u?.key || '') === (cur?.key || '') && (u?.value || '') === (cur?.value || ''));
    return i >= 0 ? i : 0;
  }, [extraUris, cur]);

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
                  {needsNSFW && <PixelButton onClick={(e) => { e.preventDefault(); askReveal('nsfw'); }}>NSFWÃ‚Â Ã°Å¸â€Å¾</PixelButton>}
                  {needsFlash && <PixelButton onClick={(e) => { e.preventDefault(); askReveal('flash'); }}>FlashÃ‚Â Ã°Å¸Å¡Â¨</PixelButton>}
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
              Collection:Ã‚Â {collNameSafe}
            </span>
          </CollectionLink>
          {/* address row */}
          <AddrRow>
            <code>{shortKt(collection.address)}</code>
            <button type="button" onClick={copyAddr}>{copied ? 'Ã¢Å“â€œ' : 'Ã°Å¸â€œâ€¹'}</button>
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
            <PixelHeading level={4}>{token.metadata?.name || `TokenÃ‚Â #${token.tokenId}`}</PixelHeading>
            <IntegrityBadge status={integrity.status} />
          </BadgeWrap>
          <span style={{ fontSize: '.75rem', opacity: .85 }}>
            MintedÃ‚Â {format(new Date(token.firstTime), 'MMMÃ‚Â dd,Ã‚Â yyyy')}Ã‚Â Ã¢â‚¬Â¢Ã‚Â {editions}Ã‚Â edition{editions !== 1 ? 's' : ''}
          </span>
        </Section>

        {/* controls: script toggle + fullscreen + extras entry */}
        <Section>
          {/* Only show the script toggle when the token has script hazards */}
          {tokenScripts && (
            <EnableScriptsToggle
              enabled={tokenAllowJs}
              onToggle={tokenAllowJs ? () => onToggleScript(false) : onRequestScriptReveal}
              title={tokenAllowJs ? 'Disable scripts' : 'Enable scripts'}
            />
          )}
          {/* Fullscreen control */}
          {onFullscreen && (
            <PixelButton
              size="xs"
              disabled={fsDisabled}
              onClick={onFullscreen}
              title="Enter fullscreen mode"
              style={{ marginTop: tokenScripts ? '4px' : '0' }}
            >
              FULLSCREEN
            </PixelButton>
          )}

          {/* Share */}
          <PixelButton
            size="xs"
            onClick={() => setShareOpen(true)}
            title="Share this token"
            style={{ marginTop: '4px' }}
          >
            <img src="/sprites/share.png" alt="" aria-hidden="true" style={{ width: 12, height: 12, marginRight: 6, verticalAlign: '-2px' }} />
            SHARE
          </PixelButton>

          {/* small entry point for Extra URIs (only if any exist) */}
          {Array.isArray(extraUris) && extraUris.length > 1 && (
            <PixelButton
              size="xs"
              onClick={() => (typeof onOpenExtras === 'function' ? onOpenExtras(initialIndex) : setViewerOpen(true))}
              title="Open extra URIs"
              style={{ marginTop: '4px' }}
            >
              Extra URIs ({extraUris.length})
            </PixelButton>
          )}
        </Section>
        {/* description */}
        {token.metadata?.description && (
          <Description>{token.metadata.description}</Description>
        )}

        {/* marketplace buttons (guarded to avoid empty TzKT queries) */}
        <Section>
          {collection?.address && token?.tokenId != null && (
            <MarketplaceBar
              contractAddress={collection.address}
              tokenId={token.tokenId}
              marketplace={token.marketplace}
            />
          )}
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

        {/* misc meta */}
        <Section>
          <MetaGrid>
            <dt>MIMEÃ‚Â Type</dt>
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
            {/*
              Only render extraÃ¢â‚¬â€˜URI name and description rows when values are
              present.  This avoids showing Ã¢â‚¬Å“Ã¢â‚¬â€Ã¢â‚¬Â for missing fields, reducing
              confusion when offÃ¢â‚¬â€˜chain views do not provide friendly
              name/description values (e.g. when RPCs return empty strings).
              The ExtraÃ‚Â Key is always displayed for nonÃ¢â‚¬â€˜artifact URIs.
            */}
            {/* Always show the ExtraÃ‚Â Key for nonÃ¢â‚¬â€˜artifact URIs. */}
            {cur.key !== 'artifactUri' && (
              <>
                <dt>ExtraÃ‚Â Key</dt>
                <dd>{cur.key}</dd>
                {/* Only show Name when nonÃ¢â‚¬â€˜empty to avoid redundant blank labels */}
                {cur.name && (
                  <>
                    <dt>Name</dt>
                    <dd>{cur.name}</dd>
                  </>
                )}
                {/* Only show Description when nonÃ¢â‚¬â€˜empty */}
                {cur.description && (
                  <>
                    <dt>Description</dt>
                    <dd>{cur.description}</dd>
                  </>
                )}
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
                IÃ‚Â agreeÃ‚Â to Terms
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
                  Warning: This thumbnail is marked NotÃ¢â‚¬â€˜SafeÃ¢â‚¬â€˜ForÃ¢â‚¬â€˜Work (NSFW). It may include explicit nudity, sexual themes, graphic violence or other mature material.
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
                IÃ‚Â confirmÃ‚Â IÃ‚Â amÃ‚Â 18Ã¢â‚¬Â¯+Ã‚Â andÃ‚Â agreeÃ‚Â toÃ‚Â Terms
              </label>
            </span>
          )}
        />
      )}

      {/* fallback: compact Extra URIs viewer (only if page didn't supply onOpenExtras) */}
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

      {shareOpen && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          name={token?.metadata?.name}
          creators={Array.isArray(token?.metadata?.creators) ? token.metadata.creators : []}
          addr={collection?.address}
          tokenId={token?.tokenId}
          previewUri={currentUri?.value}
          artistAlias={shareAlias}
          variant="view"
          downloadUri={currentUri?.value}
          downloadMime={currentUri?.mime}
          downloadName={currentUri?.name || token?.metadata?.name}
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
     displays Name and Description values when present.
   Ã¢â‚¬Â¢ Otherwise preserves layout and existing behaviour from r15. */

