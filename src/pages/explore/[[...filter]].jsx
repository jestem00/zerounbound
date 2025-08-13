/* Developed by @jams2blues
  File:    src/pages/explore/[[...filter]].jsx
  Rev:     r12
  Summary: Definitive fix for Explore grid admin filter. Implements the
           robust, multi-stage discovery and admin-verification logic from
           the centralized contractDiscovery utility to find all v1-v4e contracts.
*/

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
import detectHazards from '../../utils/hazards.js';
import { TZKT_API, NETWORK_KEY } from '../../config/deployTarget.js';
import { discoverCreated } from '../../utils/contractDiscovery.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── constants ─────────────────────────────────────────*/
const FETCH_STEP    = 48;
const FIRST_FAST    = 24;
const DESIRED_BATCH = 24;
const RUNAWAY_LIMIT = 10_000;
const BURN  = 'tz1burnburnburnburnburnburnburjAYjjX';
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
/*──────── helpers ───────────────────────────────────────────*/
const isZeroToken = (t) => {
  if (!t || !t.metadata) return true;
  if (Number(t.totalSupply) === 0) return true;
  if (t.account?.address === BURN) return true;
  const meta = decodeHexFields(t.metadata);
  const pickPreview = (m = {}) => {
    const keys = [
      'displayUri','display_uri', 'imageUri','image_uri','image',
      'thumbnailUri','thumbnail_uri', 'artifactUri','artifact_uri', 'mediaUri','media_uri',
    ];
    for (const k of keys) {
      const v = m && typeof m === 'object' ? m[k] : undefined;
      if (typeof v === 'string' && v.startsWith('data:')) return v;
    }
    if (Array.isArray(m.formats)) {
      for (const f of m.formats) {
        const cand = f?.uri || f?.url;
        if (typeof cand === 'string' && cand.startsWith('data:')) return cand;
      }
    }
    return '';
  };
  const preview = pickPreview(meta);
  if (!preview) return true;
  if (detectHazards(meta).broken) return true;
  t.metadata = meta;
  return false;
};

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

/*──────── component ─────────────────────────────────────────*/
export default function ExploreGrid() {
  const router = useRouter();
  const { toolkit } = useWalletContext() || {};
  const { admin: adminFilter = '' } = router.query;
  const isTokensMode = (router.query?.filter?.[0] === 'tokens') || (router.query?.cmd === 'tokens');
  
  const TZKT = useTzktV1Base(toolkit);
  const networkName = useMemo(() => TZKT.includes('ghostnet') ? 'ghostnet' : 'mainnet', [TZKT]);

  const [collections, setCollections] = useState([]);
  const [tokens, setTokens]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [offset, setOffset]           = useState(0);
  const [end, setEnd]                 = useState(false);
  const seenColl = useRef(new Set());
  const seenTok = useRef(new Set());

  const fetchAdminCollections = useCallback(async () => {
      if (!adminFilter || !/tz[1-3][1-9A-HJ-NP-Za-km-z]{33}/.test(adminFilter)) return [];
      const created = await discoverCreated(adminFilter, networkName);
      // Per user request, filter out empty collections on this page
      return created.filter(c => Number(c.tokensCount) > 0);
  }, [networkName, adminFilter]);

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
        'contract.metadata.version.in': 'ZeroContractV1,ZeroContractV2,ZeroContractV2a,ZeroContractV2b,ZeroContractV2c,ZeroContractV2d,ZeroContractV2e,ZeroContractV3,ZeroContractV4,ZeroContractV4a,ZeroContractV4b,ZeroContractV4c,ZeroContractV4d,ZeroContractV4e',
      });
      return jFetch(`${TZKT}/tokens?${qs}`).catch(() => []);
  }, [TZKT]);

  const loadMore = useCallback(async () => {
    if (loading || end) return;
    setLoading(true);
    
    let newItems;
    if (isTokensMode) {
        newItems = await fetchBatchTokens(offset);
    } else {
        newItems = await fetchBatchCollections(offset);
    }

    if (!newItems || newItems.length === 0) {
      setEnd(true);
    } else {
      const uniqueNewItems = newItems.filter(item => {
        const key = isTokensMode ? `${item.contract?.address}_${item.tokenId}` : item.address;
        const seenSet = isTokensMode ? seenTok.current : seenColl.current;
        if (seenSet.has(key)) return false;
        seenSet.add(key);
        return isTokensMode ? !isZeroToken(item) : true;
      });

      if (isTokensMode) {
          setTokens(prev => [...prev, ...uniqueNewItems]);
      } else {
          setCollections(prev => [...prev, ...uniqueNewItems]);
      }
      setOffset(prev => prev + newItems.length);
      if (newItems.length < FETCH_STEP) setEnd(true);
    }
    setLoading(false);
  }, [loading, end, offset, isTokensMode, fetchBatchTokens, fetchBatchCollections]);

  useEffect(() => {
    setCollections([]);
    setTokens([]);
    setOffset(0);
    setEnd(false);
    seenColl.current.clear();
    seenTok.current.clear();
    setLoading(true);

    if (adminFilter && !isTokensMode) {
      fetchAdminCollections().then(data => {
        setCollections(data);
        setEnd(true);
        setLoading(false);
      });
    } else {
        loadMore();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminFilter, isTokensMode, TZKT]);
  
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
            <CollectionCard key={c.address} contract={c} />
          ))
    ),
    [isTokensMode, tokens, collections],
  );

  return (
    <Wrap>
      <ExploreNav />
      {adminFilter && (
        <p style={{ textAlign: 'center', fontSize: '.8rem', margin: '6px 0 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
          Showing collections created by&nbsp;
          <code style={{ fontSize: '.8rem' }}>{adminFilter}</code>
          <button type="button" aria-label="Clear filter" onClick={() => router.push('/explore')} style={{ background: 'none', border: 'none', fontSize: '1rem', cursor: 'pointer', lineHeight: 1, marginTop: '-2px' }}>
            ❌
          </button>
        </p>
      )}
      <GridWrap>{cardList}</GridWrap>
      {!end && !adminFilter && (
        <Center>
          <PixelButton type="button" onClick={loadMore} disabled={loading} size="sm">
            {loading ? 'Loading…' : 'Load More 🔻'}
          </PixelButton>
        </Center>
      )}
    </Wrap>
  );
}

/* What changed & why (r12):
   • Replaced flawed admin filter with the definitive discovery logic from the
     centralized contractDiscovery utility, ensuring parity with My Collections.
   • Fixed ReferenceError by importing `useRef` from React.
   • Hardened TzKT base URL construction to be wallet-aware and always use /v1.
   • Streamlined data fetching logic and removed redundant fallbacks. */