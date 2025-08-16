/*Developed by @jams2blues
  File: src/pages/explore/[[...filter]].jsx
  Rev:  r14
  Summary: Enforce 0‑token exclusion, remove dead vars, pass initialTokensCount,
           and guard rendering via hideIfEmpty to keep explore grid clean. */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import { useRouter } from 'next/router';
import styledPkg from 'styled-components';

import CollectionCard from '../../ui/CollectionCard.jsx';
import TokenCard from '../../ui/TokenCard.jsx';
import ExploreNav from '../../ui/ExploreNav.jsx';
import PixelButton from '../../ui/PixelButton.jsx';
import { useWalletContext } from '../../contexts/WalletContext.js';
import hashMatrix from '../../data/hashMatrix.json';
import { jFetch } from '../../core/net.js';
import decodeHexFields from '../../utils/decodeHexFields.js';
import { TZKT_API, NETWORK_KEY } from '../../config/deployTarget.js';
import { discoverCreated } from '../../utils/contractDiscovery.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── constants ─────────────────────────────────────────*/
const FETCH_STEP  = 48;
const FIRST_FAST  = 24;
const BURN        = 'tz1burnburnburnburnburnburnburjAYjjX';
const VERSION_HASHES_NUM = Object.keys(hashMatrix)
  .filter((k) => /^-?\d+$/.test(k))
  .join(',');

/*──────── styled shells ─────────────────────────────────────*/
const Wrap = styled.main`
  width:100%;
  padding:1rem;
  max-width:1440px;
  margin:0 auto;
`;
const GridWrap = styled.div`
  --col: clamp(160px,18vw,220px);
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(var(--col),1fr));
  gap:10px;
`;
const Center = styled.div`
  text-align:center;
  margin:1.4rem 0 2rem;
`;

/*──────── preview helpers ───────────────────────────────────*/
/** Return first media/data preview URI from metadata or empty string. */
function pickPreview(m = {}) {
  const keys = [
    'displayUri','display_uri',
    'imageUri','image_uri','image',
    'thumbnailUri','thumbnail_uri',
    'artifactUri','artifact_uri',
    'mediaUri','media_uri',
  ];
  for (const k of keys) {
    const v = m && typeof m === 'object' ? m[k] : undefined;
    if (typeof v === 'string' && /^data:(image|audio|video)\//i.test(v)) return v;
  }
  if (Array.isArray(m.formats)) {
    for (const f of m.formats) {
      const cand = f?.uri || f?.url;
      if (typeof cand === 'string' && /^data:(image|audio|video)\//i.test(cand)) return cand;
    }
  }
  return '';
}

/** Robust data‑URI validator (mirrors contract/token pages logic). */
function isValidDataPreview(uri) {
  try {
    if (typeof uri !== 'string' || !uri.startsWith('data:')) return false;
    const comma = uri.indexOf(',');
    if (comma < 0) return false;
    const header = uri.slice(5, comma);
    const semi = header.indexOf(';');
    const mime = (semi >= 0 ? header.slice(0, semi) : header).toLowerCase();
    const b64  = uri.slice(comma + 1);

    let binary;
    if (typeof atob === 'function') binary = atob(b64);
    else {
      // SSR: Node side
      // eslint-disable-next-line no-undef
      const buf = Buffer.from(b64, 'base64');
      binary = String.fromCharCode.apply(null, buf);
    }
    const bytes = new Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;

    if (mime === 'image/jpeg') {
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
             bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
    }
    if (mime === 'image/png' || mime === 'image/apng') {
      const headerOk = bytes[0] === 0x89 && bytes[1] === 0x50 &&
                       bytes[2] === 0x4e && bytes[3] === 0x47;
      // quick IEND scan
      let hasIEND = false;
      for (let i = bytes.length - 8; i >= 0; i--) {
        if (bytes[i] === 0x49 && bytes[i + 1] === 0x45 && bytes[i + 2] === 0x4e && bytes[i + 3] === 0x44) {
          hasIEND = true; break;
        }
      }
      return headerOk && hasIEND;
    }
    if (mime === 'image/gif') {
      const hdr = binary.slice(0, 6);
      return hdr === 'GIF87a' || hdr === 'GIF89a';
    }
    if (mime === 'image/bmp') {
      return bytes[0] === 0x42 && bytes[1] === 0x4d;
    }
    if (mime === 'image/webp') {
      return binary.slice(0, 4) === 'RIFF' && binary.slice(8, 12) === 'WEBP';
    }
    return true; // accept audio/video/svg and other types
  } catch {
    return false;
  }
}

/** Decode metadata, enforce on‑chain preview presence, exclude burns/zero‑supply. */
function normalizeAndAcceptToken(t) {
  if (!t) return null;
  if (Number(t.totalSupply) === 0) return null;
  if (t.account?.address === BURN) return null;

  let meta = t.metadata || {};
  try { meta = decodeHexFields(meta || {}); } catch { /* keep raw */ }
  const preview = pickPreview(meta);
  if (!preview) return null;
  if (!isValidDataPreview(preview)) return null;

  return { ...t, metadata: meta };
}

/*──────── tzkt base selector ───────────────────────────────*/
function useTzktV1Base(toolkit) {
  const net = useMemo(() => {
    if (toolkit?._network?.type) {
      return /mainnet/i.test(toolkit._network.type) ? 'mainnet' : 'ghostnet';
    }
    return (NETWORK_KEY || '').toLowerCase().includes('mainnet') ? 'mainnet' : 'ghostnet';
  }, [toolkit]);

  if (typeof TZKT_API === 'string' && TZKT_API.length > 0) {
      const base = TZKT_API.replace(/\/+$/, '');
      if (base.endsWith('/v1')) return base;
      return `${base}/v1`;
  }
  return net === 'mainnet' ? 'https://api.tzkt.io/v1' : 'https://api.ghostnet.tzkt.io/v1';
}

/*──────── helpers ──────────────────────────────────────────*/
function filterNonEmptyCollections(rows = []) {
  return (rows || []).filter((c) => Number(c?.tokensCount ?? c?.tokens_count ?? 0) > 0);
}

/*──────── component ─────────────────────────────────────────*/
export default function ExploreGrid() {
  const router = useRouter();
  const { toolkit } = useWalletContext() || {};
  const seg0 = Array.isArray(router.query.filter)
    ? (router.query.filter[0] || '').toString().toLowerCase()
    : '';
  const isTokensMode = seg0 === 'tokens' || String(router.query?.cmd || '').toLowerCase() === 'tokens';
  const adminFilter = String(router.query?.admin || '').trim();

  const TZKT = useTzktV1Base(toolkit);
  const networkName = useMemo(() => TZKT.includes('ghostnet') ? 'ghostnet' : 'mainnet', [TZKT]);

  const [collections, setCollections] = useState([]);
  const [tokens, setTokens]           = useState([]);
  const [loading, setLoading]         = useState(false);
  const [offset, setOffset]           = useState(0);
  const [end, setEnd]                 = useState(false);
  const [fetching, setFetching]       = useState(false); // inner guard
  const seenColl = useRef(new Set());
  const seenTok = useRef(new Set());

  /*──── admin collections (creator/initiator aware) ────────*/
  const fetchAdminCollections = useCallback(async () => {
    if (!adminFilter || !/^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/i.test(adminFilter)) return [];
    const created = await discoverCreated(adminFilter, networkName);
    // Per product needs on Explore: hide empty collections (tokensCount > 0 only)
    return filterNonEmptyCollections(created || []);
  }, [networkName, adminFilter]);

  /*──── pagination fetchers ─────────────────────────────────*/
  const fetchBatchCollections = useCallback(async (currentOffset) => {
    const qs = new URLSearchParams({
      limit: String(FETCH_STEP),
      offset: String(currentOffset),
      'sort.desc': 'lastActivityTime',
      'typeHash.in': VERSION_HASHES_NUM,
      'tokensCount.gt': '0',
    });
    return jFetch(`${TZKT}/contracts?${qs}`).catch(() => []);
  }, [TZKT]);

  const fetchBatchTokens = useCallback(async (currentOffset) => {
    const qs = new URLSearchParams({
      limit: String(FETCH_STEP),
      offset: String(currentOffset),
      'sort.desc': 'firstTime',
      'contract.metadata.version.in':
        [
          'ZeroContractV1',
          'ZeroContractV2','ZeroContractV2a','ZeroContractV2b','ZeroContractV2c','ZeroContractV2d','ZeroContractV2e',
          'ZeroContractV3',
          'ZeroContractV4','ZeroContractV4a','ZeroContractV4b','ZeroContractV4c','ZeroContractV4d','ZeroContractV4e',
        ].join(','),
    });
    return jFetch(`${TZKT}/tokens?${qs}`).catch(() => []);
  }, [TZKT]);

  /** Core loader (works for initial + "Load more"). */
  const loadPage = useCallback(async (initial = false) => {
    if (fetching || end) return;
    setFetching(true);
    if (!initial) setLoading(true);

    const currentOffset = initial ? 0 : offset;
    const rows = isTokensMode
      ? await fetchBatchTokens(currentOffset)
      : (adminFilter ? await fetchAdminCollections() : await fetchBatchCollections(currentOffset));

    if (!rows || rows.length === 0) {
      setEnd(true);
      setFetching(false);
      setLoading(false);
      if (initial) {
        // ensure we reset state when initial returns empty
        setCollections([]); setTokens([]);
        setOffset(0);
      }
      return;
    }

    if (isTokensMode) {
      const fresh = [];
      for (const t of rows) {
        const key = `${t.contract?.address}_${t.tokenId}`;
        if (seenTok.current.has(key)) continue;
        // token‑level acceptance (preview present, valid data, not burn)
        const norm = normalizeAndAcceptToken(t);
        if (!norm) continue;
        seenTok.current.add(key);
        fresh.push(norm);
      }
      setTokens((prev) => [...prev, ...fresh]);
      setOffset((prev) => prev + rows.length);
      if (rows.length < FETCH_STEP) setEnd(true);
    } else {
      // collections
      let fresh = adminFilter ? rows : filterNonEmptyCollections(rows);
      if (!adminFilter) {
        // unique + allowed hashes already enforced by query; just dedupe
        fresh = fresh.filter((c) => {
          if (!c?.address) return false;
          if (seenColl.current.has(c.address)) return false;
          seenColl.current.add(c.address);
          return true;
        });
      }
      setCollections((prev) => [...prev, ...fresh]);
      if (!adminFilter) {
        setOffset((prev) => prev + rows.length);
        if (rows.length < FETCH_STEP) setEnd(true);
      } else {
        // admin filter lists all at once
        setEnd(true);
      }
    }

    setFetching(false);
    setLoading(false);
  }, [fetching, end, offset, isTokensMode, adminFilter, fetchBatchTokens, fetchBatchCollections, fetchAdminCollections]);

  /*──── reset & first paint ─────────────────────────────────*/
  useEffect(() => {
    // reset state whenever mode/admin/network flips
    setCollections([]); setTokens([]);
    setOffset(0); setEnd(false);
    setLoading(false); setFetching(false);
    seenColl.current.clear(); seenTok.current.clear();

    // initial batch (do NOT set loading=true before calling; that would block)
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTokensMode, adminFilter, TZKT]);

  /*──── auto prefetch when tokens mode starves quickly ─────*/
  useEffect(() => {
    if (isTokensMode && !end && !loading && tokens.length < FIRST_FAST && offset > 0) {
      loadPage(false);
    }
  }, [isTokensMode, end, loading, tokens.length, offset, loadPage]);

  const cardList = useMemo(
    () => (
      isTokensMode
        ? tokens.map((t) => (
            <TokenCard
              key={`${t.contract?.address}_${t.tokenId}`}
              token={t}
              contractAddress={t.contract?.address}
            />
          ))
        : collections.map((c) => (
            <CollectionCard
              key={c.address}
              contract={c}
              initialTokensCount={Number(c.tokensCount ?? c.tokens_count ?? NaN)}
              hideIfEmpty
            />
          ))
    ),
    [isTokensMode, tokens, collections],
  );

  return (
    <Wrap>
      <ExploreNav />
      {!!adminFilter && !isTokensMode && (
        <p
          style={{
            textAlign: 'center',
            fontSize: '.8rem',
            margin: '6px 0 0',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          Showing collections created by&nbsp;
          <code style={{ fontSize: '.8rem' }}>{adminFilter}</code>
          <button
            type="button"
            aria-label="Clear filter"
            onClick={() => (isTokensMode ? null : router.push('/explore'))}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1rem',
              cursor: 'pointer',
              lineHeight: 1,
              marginTop: '-2px',
            }}
          >
            ❌
          </button>
        </p>
      )}
      <GridWrap>{cardList}</GridWrap>
      {!end && !adminFilter && (
        <Center>
          <PixelButton
            type="button"
            onClick={() => loadPage(false)}
            disabled={loading || fetching}
            size="sm"
          >
            {loading || fetching ? 'Loading…' : 'Load More 🔻'}
          </PixelButton>
        </Center>
      )}
    </Wrap>
  );
}

/* What changed & why (r14):
   • Enforced 0‑token exclusion both in-query and post‑fetch.
   • Removed dead constants; simplified token acceptance.
   • Passed initialTokensCount and hideIfEmpty to CollectionCard so
     Explore never shows empty collections even if stats drift.
*/
