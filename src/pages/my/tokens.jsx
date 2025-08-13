/* Developed by @jams2blues
   File:    src/pages/my/tokens.jsx
   Rev:     r80
   Summary: Definitive fix for My Tokens. Uses admin‑based discovery
            (v1–v4e) via `discoverCreated`, includes factory‑originated
            contracts (initiator workaround), and cleanly separates
            “My Creations” (admin‑owned collections) from “My Owned”
            (balances where admin ≠ user). Network‑aware TzKT, robust
            preview validation, dedupe, and pagination. */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styledPkg from 'styled-components';

import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API, NETWORK_KEY } from '../../config/deployTarget.js';
import ExploreNav from '../../ui/ExploreNav.jsx';
import PixelHeading from '../../ui/PixelHeading.jsx';
import PixelButton from '../../ui/PixelButton.jsx';
import TokenCard from '../../ui/TokenCard.jsx';

import { jFetch } from '../../core/net.js';
import decodeHexFields from '../../utils/decodeHexFields.js';
import hashMatrix from '../../data/hashMatrix.json';
import { discoverCreated } from '../../utils/contractDiscovery.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*───────────────────────────────────────────────────────────*
 * Layout
 *───────────────────────────────────────────────────────────*/
const Wrap = styled.main`
  width: 100%;
  padding: 0 1rem 1.5rem;
  max-width: 1440px;
  margin: 0 auto;
`;
const Tabs = styled.div`
  display:flex; gap:.6rem; margin-top: 1rem; flex-wrap:wrap;
`;
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(clamp(160px, 18vw, 220px), 1fr)
  );
  gap: 1rem;
  width: 100%;
  margin-top: 1rem;
`;
const Center = styled.div`
  text-align:center;
  margin:1.4rem 0 2rem;
`;
const Subtle = styled.p`
  margin: 0.6rem 0 0;
  opacity: 0.8;
`;

/*───────────────────────────────────────────────────────────*
 * Helpers
 *───────────────────────────────────────────────────────────*/
function useTzktV1Base(toolkit) {
  const net = useMemo(() => {
    const walletNetwork = (toolkit?._network?.type || '').toLowerCase();
    if (walletNetwork.includes('mainnet')) return 'mainnet';
    if (walletNetwork.includes('ghostnet')) return 'ghostnet';
    return (NETWORK_KEY || 'mainnet').toLowerCase();
  }, [toolkit]);

  if (typeof TZKT_API === 'string' && TZKT_API) {
    const base = TZKT_API.replace(/\/+$/, '');
    return base.endsWith('/v1') ? base : `${base}/v1`;
  }
  return net === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';
}

/** Robust preview validation for on‑chain data URIs (JPEG/PNG/APNG/GIF/BMP/WebP) */
function isValidPreview(m = {}) {
  const keys = [
    'artifactUri', 'artifact_uri',
    'displayUri', 'display_uri',
    'imageUri',   'image',
    'thumbnailUri','thumbnail_uri',
    'mediaUri',   'media_uri',
  ];
  const mediaRe = /^data:(image\/|video\/|audio\/)/i;
  // Pick the first preview data URI
  let uri = null;
  for (const k of keys) {
    const v = m && typeof m === 'object' ? m[k] : undefined;
    if (typeof v === 'string') {
      const val = v.trim();
      if (mediaRe.test(val)) { uri = val; break; }
    }
  }
  if (!uri && Array.isArray(m.formats)) {
    for (const fmt of m.formats) {
      if (fmt && typeof fmt === 'object') {
        const candidates = [];
        if (fmt.uri) candidates.push(String(fmt.uri));
        if (fmt.url) candidates.push(String(fmt.url));
        for (const cand of candidates) {
          const val = cand.trim();
          if (mediaRe.test(val)) { uri = val; break; }
        }
      }
      if (uri) break;
    }
  }
  if (!uri) return false;
  try {
    const comma = uri.indexOf(',');
    if (comma < 0) return false;
    const header = uri.slice(5, comma);
    const semi = header.indexOf(';');
    const mime = (semi >= 0 ? header.slice(0, semi) : header).toLowerCase();
    const b64  = uri.slice(comma + 1);
    let binary;
    if (typeof atob === 'function') binary = atob(b64);
    else {
      // SSR safety: Buffer may exist in Node
      // eslint-disable-next-line no-undef
      const buf = Buffer.from(b64, 'base64');
      binary = String.fromCharCode.apply(null, buf);
    }
    const bytes = [];
    for (let i = 0; i < binary.length; i++) bytes.push(binary.charCodeAt(i) & 0xff);

    if (mime === 'image/jpeg') {
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
             bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
    }
    if (mime === 'image/png' || mime === 'image/apng') {
      const headerOk = bytes[0] === 0x89 && bytes[1] === 0x50 &&
                       bytes[2] === 0x4e && bytes[3] === 0x47;
      let hasIEND = false;
      for (let i = bytes.length - 8; i >= 0; i--) {
        if (bytes[i] === 0x49 && bytes[i + 1] === 0x45 &&
            bytes[i + 2] === 0x4e && bytes[i + 3] === 0x44) {
          hasIEND = true;
          break;
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
    return true; // accept other media types (audio/video/svg…)
  } catch {
    return false;
  }
}

/** Numeric typeHash set (ZeroContract v1–v4e) from hashMatrix */
const VALID_TYPE_HASHES = new Set(
  Object.keys(hashMatrix).filter((k) => /^-?\d+$/.test(k))
);

/*───────────────────────────────────────────────────────────*
 * Component
 *───────────────────────────────────────────────────────────*/
export default function MyTokens() {
  const { address, toolkit } = useWalletContext() || {};
  const tzktV1 = useTzktV1Base(toolkit);
  const network = useMemo(
    () => (tzktV1.includes('ghostnet') ? 'ghostnet' : 'mainnet'),
    [tzktV1]
  );

  const [tab, setTab] = useState('creations'); // 'creations' | 'owned'
  const [creations, setCreations] = useState([]);
  const [owned, setOwned] = useState([]);
  const [countCreations, setCountCreations] = useState(0);
  const [countOwned, setCountOwned] = useState(0);
  const [phase, setPhase] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState(24);

  const resetAll = useCallback(() => {
    setCreations([]); setOwned([]);
    setCountCreations(0); setCountOwned(0);
    setPhase('idle'); setError(null); setVisible(24);
  }, []);

  /** Fetch contracts’ typeHash in chunks and build a map */
  const fetchTypeHashes = useCallback(async (addrs) => {
    const map = new Map();
    const CHUNK = 50;
    for (let i = 0; i < addrs.length; i += CHUNK) {
      const slice = addrs.slice(i, i + CHUNK);
      const q = new URLSearchParams({
        'address.in': slice.join(','),
        select: 'address,typeHash',
        limit: String(slice.length),
      });
      const res = await jFetch(`${tzktV1}/contracts?${q}`).catch(() => []);
      const arr = Array.isArray(res) ? res : [];
      for (const row of arr) map.set(row.address, String(row.typeHash ?? ''));
    }
    return map;
  }, [tzktV1]);

  /** Decode + normalise token metadata; validate preview */
  const prepareToken = useCallback((row) => {
    let meta = row?.metadata || {};
    try {
      meta = decodeHexFields(meta || {});
    } catch { /* keep original */ }
    if (meta && typeof meta.creators === 'string') {
      try {
        const parsed = JSON.parse(meta.creators);
        if (Array.isArray(parsed)) meta.creators = parsed;
      } catch { /* ignore */ }
    }
    if (!isValidPreview(meta)) return null;
    const contract = row?.contract?.address || row?.contract;
    return {
      contract,
      tokenId: String(row?.tokenId ?? row?.id ?? ''),
      metadata: meta,
      holdersCount: Number(row?.holdersCount ?? 0),
      totalSupply: Number(row?.totalSupply ?? 0),
    };
  }, []);

  /** Load both tabs’ data with admin‑based logic */
  const loadAll = useCallback(async (signal) => {
    if (!address) { resetAll(); return; }
    setPhase('loading'); setError(null); setVisible(24);
    try {
      // 1) Discover all ZeroContract collections created/administered by the user.
      //    This utility embodies the initiator‑vs‑sender workaround required
      //    for factory‑originated contracts (v4e), ensuring parity with
      //    My Collections / Explore admin filter.  (see refs)  ➜
      //    • explore/[[...filter]].jsx (uses discoverCreated)
      //    • OBJKT.comFixeditforus.txt (initiator/sender)
      const created = await discoverCreated(address, network);
      if (signal.aborted) return;
      const adminSet = new Set((created || []).map((c) => c.address));

      // 2) Fetch typeHash for all admin collections; only keep ZeroContracts.
      const createdAddrs = [...adminSet];
      const typeMapCreated = await fetchTypeHashes(createdAddrs);
      const createdZeroAddrs = createdAddrs.filter((a) =>
        VALID_TYPE_HASHES.has(String(typeMapCreated.get(a) || ''))
      );

      // 3) Enumerate tokens for *My Creations* across user‑admin’d collections.
      const tempCreations = [];
      for (const kt of createdZeroAddrs) {
        if (signal.aborted) return;
        const rows = await jFetch(
          `${tzktV1}/tokens?contract=${kt}&limit=10000`
        ).catch(() => []);
        const arr = Array.isArray(rows) ? rows : [];
        for (const row of arr) {
          const t = prepareToken(row);
          if (!t) continue;
          // Skip fully burned tokens (supply 0)
          if (Number(t.totalSupply) === 0) continue;
          tempCreations.push(t);
        }
      }
      // Deduplicate (defensive) and newest‑first
      const seenC = new Set();
      const finalCreations = [];
      for (const t of tempCreations) {
        const key = `${t.contract}:${t.tokenId}`;
        if (seenC.has(key)) continue; seenC.add(key);
        finalCreations.push(t);
      }
      finalCreations.sort((a, b) =>
        Number(b.tokenId) - Number(a.tokenId)
      );

      // 4) Fetch balances for *My Owned* and filter out collections the user administers.
      const balRows = await jFetch(
        `${tzktV1}/tokens/balances?account=${address}&balance.ne=0&limit=1000`
      ).catch(() => []);
      const balances = Array.isArray(balRows) ? balRows : [];
      // Collect unique contract addresses from balances
      const ownedAddrSet = new Set();
      const ownedPairs = [];
      for (const r of balances) {
        const contract = r?.token?.contract?.address;
        const tokenId = r?.token?.tokenId;
        if (!contract || tokenId == null) continue;
        ownedAddrSet.add(contract);
        ownedPairs.push([contract, tokenId, r?.token]);
      }
      // Fetch typeHash for owned contracts once
      const typeMapOwned = await fetchTypeHashes([...ownedAddrSet]);
      const finalOwned = [];
      const seenO = new Set();
      for (const [cAddr, tId, tokenObj] of ownedPairs) {
        // Only ZeroContract collections
        const th = String(typeMapOwned.get(cAddr) || '');
        if (!VALID_TYPE_HASHES.has(th)) continue;
        // Exclude tokens from collections the user currently administers
        if (adminSet.has(cAddr)) continue;

        // Metadata: prefer already present, else lookup
        let meta = tokenObj?.metadata;
        if (!meta) {
          const [row] = await jFetch(
            `${tzktV1}/tokens?contract=${cAddr}&tokenId=${tId}&limit=1`
          ).catch(() => []);
          meta = row?.metadata;
        }
        const prepared = prepareToken({ contract: { address: cAddr }, tokenId: tId, metadata: meta, holdersCount: tokenObj?.holdersCount, totalSupply: tokenObj?.totalSupply });
        if (!prepared) continue;
        const key = `${cAddr}:${String(tId)}`;
        if (seenO.has(key)) continue; seenO.add(key);
        finalOwned.push(prepared);
      }
      finalOwned.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));

      if (!signal.aborted) {
        setCreations(finalCreations);
        setOwned(finalOwned);
        setCountCreations(finalCreations.length);
        setCountOwned(finalOwned.length);
        setPhase('ready');
      }
    } catch (err) {
      if (!signal.aborted) {
        setPhase('error');
        setError((err && (err.message || String(err))) || 'Network error');
      }
    }
  }, [address, network, tzktV1, fetchTypeHashes, prepareToken, resetAll]);

  useEffect(() => {
    const controller = new AbortController();
    loadAll(controller.signal);
    return () => controller.abort();
  }, [loadAll]);

  const list = tab === 'creations' ? creations : owned;
  const visibleList = list.slice(0, visible);
  const hasMore = visible < list.length;

  return (
    <Wrap>
      <ExploreNav hideSearch={false} />
      <PixelHeading level={3} style={{ marginTop: '1rem' }}>
        My&nbsp;Tokens
      </PixelHeading>

      <Tabs>
        <PixelButton
          warning={tab === 'creations'}
          onClick={() => { setTab('creations'); setVisible(24); }}
          size="sm"
        >
          My&nbsp;Creations&nbsp;({countCreations})
        </PixelButton>
        <PixelButton
          warning={tab === 'owned'}
          onClick={() => { setTab('owned'); setVisible(24); }}
          size="sm"
        >
          My&nbsp;Owned&nbsp;({countOwned})
        </PixelButton>
      </Tabs>

      {!address && (
        <Subtle>Connect your wallet to see your tokens.</Subtle>
      )}

      {phase === 'loading' && (
        <Subtle>Fetching your tokens…</Subtle>
      )}

      {phase === 'error' && (
        <Subtle role="alert">Could not load tokens. Please try again shortly.</Subtle>
      )}

      {phase === 'ready' && visibleList.length === 0 && (
        <Subtle>No tokens found for this tab.</Subtle>
      )}

      {phase === 'ready' && visibleList.length > 0 && (
        <>
          <Grid>
            {visibleList.map((t) => (
              <TokenCard
                key={`${t.contract}:${t.tokenId}`}
                contractAddress={t.contract}
                token={{
                  tokenId: Number(t.tokenId),
                  metadata: t.metadata || {},
                  holdersCount: t.holdersCount,
                }}
              />
            ))}
          </Grid>

          {hasMore && (
            <Center>
              <PixelButton
                onClick={() => setVisible((v) => v + 24)}
                size="sm"
              >
                Load More 🔻
              </PixelButton>
            </Center>
          )}
        </>
      )}
    </Wrap>
  );
}

/* What changed & why (r80):
   • Rewrote discovery: “Creations” now enumerates tokens from all
     collections the wallet administers using discoverCreated (parity
     with My Collections / Explore admin filter) to include v4e and
     factory‑originated contracts (initiator workaround). 
   • “Owned” now strictly lists balances where the collection admin
     ≠ wallet (no metadata‑based exclusions), matching product spec.
   • Added network‑aware TzKT base, robust data‑URI preview validation,
     numeric typeHash filtering, dedupe, pagination, and clear states. */
/* EOF */
