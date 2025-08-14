/*Developed by @jams2blues
  File: src/pages/my/tokens.jsx
  Rev:  r81
  Summary: Solid "My Tokens" fix. Creations = tokens actually minted by me
           (creator|firstMinter|creators/authors match). Owned excludes any
           minted-by-me and any admin’d collections. Adds creators cleanup
           to prevent Tezos Domains 400s; robust ZeroContract gating. */

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

/** Tight tz‑address check (tz1|tz2|tz3) */
const isTz = (s) => typeof s === 'string' && /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/.test(s);

/** Normalize a possibly messy creators/authors field into a clean array of tz‑addresses (lowercased). */
function normalizeCreatorsField(src) {
  const out = [];
  const push = (v) => {
    if (typeof v !== 'string') return;
    // split on commas, semicolons, or whitespace/newlines
    const parts = v.split(/[,\s;]+/).map((x) => x.trim()).filter(Boolean);
    for (const p of parts) {
      if (isTz(p)) out.push(p.toLowerCase());
    }
  };

  if (Array.isArray(src)) {
    for (const v of src) {
      if (typeof v === 'string') push(v);
      else if (v && typeof v.address === 'string') push(v.address);
      else if (v && typeof v === 'object') {
        // flatten any object-ish creators
        Object.values(v).forEach((x) => push(String(x || '')));
      }
    }
  } else if (typeof src === 'string') {
    // if JSON array string, try parse; else split directly
    try {
      const parsed = JSON.parse(src);
      if (Array.isArray(parsed)) return normalizeCreatorsField(parsed);
    } catch { /* noop */ }
    push(src);
  } else if (src && typeof src === 'object') {
    Object.values(src).forEach((x) => push(String(x || '')));
  }
  return out;
}

/** Robust preview validation for on‑chain data URIs (JPEG/PNG/APNG/GIF/BMP/WebP). */
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
    if (!addrs || addrs.length === 0) return new Map();
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

  /** Decode + normalise token metadata; validate preview; sanitize creators for domain resolver */
  const prepareToken = useCallback((row) => {
    let meta = row?.metadata || {};
    try {
      meta = decodeHexFields(meta || {});
    } catch { /* keep original */ }

    // sanitize creators/authors for downstream components
    const creatorsNorm = normalizeCreatorsField(meta?.creators);
    const authorsNorm  = normalizeCreatorsField(meta?.authors ?? meta?.artists);

    if (creatorsNorm.length) meta.creators = creatorsNorm;
    if (authorsNorm.length)  meta.authors  = authorsNorm;

    if (!isValidPreview(meta)) return null;

    const contractAddr = row?.contract?.address || row?.contract;
    const creatorTop   = (row?.creator?.address || row?.creator || '').toString().toLowerCase();
    const firstMinter  = (row?.firstMinter || '').toString().toLowerCase();

    return {
      contract: contractAddr,
      tokenId: String(row?.tokenId ?? row?.id ?? ''),
      metadata: meta,
      holdersCount: Number(row?.holdersCount ?? 0),
      totalSupply: Number(row?.totalSupply ?? 0),
      _creator: creatorTop,
      _firstMinter: firstMinter,
    };
  }, []);

  /** minted‑by‑user predicate */
  const mintedByUser = useCallback((t, me) => {
    if (!t || !me) return false;
    const meLc = me.toLowerCase();
    if (t._creator && t._creator === meLc) return true;
    if (t._firstMinter && t._firstMinter === meLc) return true;

    const meta = t.metadata || {};
    const arrays = [];
    if (Array.isArray(meta.creators)) arrays.push(...meta.creators);
    if (Array.isArray(meta.authors))  arrays.push(...meta.authors);
    if (Array.isArray(meta.artists))  arrays.push(...meta.artists);
    for (const a of arrays) {
      const s = typeof a === 'string' ? a : (a && a.address) ? a.address : '';
      if (s && s.toLowerCase() === meLc) return true;
    }
    return false;
  }, []);

  /** Fetch tokens minted by a wallet across ZeroContracts (creator/firstMinter/metadata authors). */
  const fetchMintedBy = useCallback(async (me) => {
    const urls = [
      `${tzktV1}/tokens?creator=${encodeURIComponent(me)}&limit=1000&select=contract,tokenId,metadata,holdersCount,totalSupply,creator,firstMinter`,
      `${tzktV1}/tokens?firstMinter=${encodeURIComponent(me)}&limit=1000&select=contract,tokenId,metadata,holdersCount,totalSupply,creator,firstMinter`,
      `${tzktV1}/tokens?metadata.creators.[*]=${encodeURIComponent(me)}&limit=1000&select=contract,tokenId,metadata,holdersCount,totalSupply,creator,firstMinter`,
      `${tzktV1}/tokens?metadata.authors.[*]=${encodeURIComponent(me)}&limit=1000&select=contract,tokenId,metadata,holdersCount,totalSupply,creator,firstMinter`,
    ];
    const results = await Promise.all(urls.map((u) => jFetch(u).catch(() => [])));
    const all = results.flat().filter(Boolean);

    // typeHash gating
    const cSet = new Set(all.map((r) => r?.contract?.address || r?.contract).filter(Boolean));
    const typeMap = await fetchTypeHashes([...cSet]);

    const seen = new Set();
    const out = [];
    for (const row of all) {
      const addr = row?.contract?.address || row?.contract;
      const tId  = row?.tokenId;
      if (!addr || tId == null) continue;
      const th = String(typeMap.get(addr) || '');
      if (!VALID_TYPE_HASHES.has(th)) continue;

      const t = prepareToken(row);
      if (!t) continue;
      if (String(t.totalSupply) === '0') continue;

      const key = `${addr}:${String(tId)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    // newest first by tokenId (best we can without firstTime in select)
    out.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));
    return out;
  }, [tzktV1, fetchTypeHashes, prepareToken]);

  /** Load both tabs’ data */
  const loadAll = useCallback(async (signal) => {
    if (!address) { resetAll(); return; }
    setPhase('loading'); setError(null); setVisible(24);

    try {
      // Admin collections (for excluding from "Owned")
      const createdContracts = await discoverCreated(address, network);
      if (signal.aborted) return;
      const adminSet = new Set((createdContracts || []).map((c) => c.address));

      // CREATIONS: strictly tokens minted by me (creator/firstMinter/metadata creators|authors)
      const minted = await fetchMintedBy(address);
      if (signal.aborted) return;

      // OWNED: balances where (a) ZeroContract, (b) not admin collection, (c) NOT minted by me
      const balRows = await jFetch(
        `${tzktV1}/tokens/balances?account=${address}&balance.ne=0&limit=1000`
      ).catch(() => []);
      const balances = Array.isArray(balRows) ? balRows : [];

      const ownedAddrSet = new Set();
      const ownedTriples = [];
      for (const r of balances) {
        const contract = r?.token?.contract?.address;
        const tokenId = r?.token?.tokenId;
        if (!contract || tokenId == null) continue;
        ownedAddrSet.add(contract);
        ownedTriples.push([contract, tokenId, r?.token]);
      }
      const typeMapOwned = await fetchTypeHashes([...ownedAddrSet]);

      const seenO = new Set();
      const finalOwned = [];
      for (const [cAddr, tId, tokObj] of ownedTriples) {
        // Only ZeroContract collections
        const th = String(typeMapOwned.get(cAddr) || '');
        if (!VALID_TYPE_HASHES.has(th)) continue;
        // Exclude tokens from collections the user administers
        if (adminSet.has(cAddr)) continue;

        // Metadata: prefer existing; else lookup
        let meta = tokObj?.metadata;
        if (!meta) {
          const [row] = await jFetch(
            `${tzktV1}/tokens?contract=${cAddr}&tokenId=${tId}&limit=1&select=contract,tokenId,metadata,holdersCount,totalSupply,creator,firstMinter`
          ).catch(() => []);
          meta = row?.metadata;
        }

        // Build a minimal row object to reuse prepareToken + mintedByUser predicate
        const prepared = prepareToken({
          contract: { address: cAddr },
          tokenId: tId,
          metadata: meta,
          holdersCount: tokObj?.holdersCount,
          totalSupply: tokObj?.totalSupply,
          creator: tokObj?.creator,
          firstMinter: tokObj?.firstMinter,
        });
        if (!prepared) continue;
        if (mintedByUser(prepared, address)) continue; // exclude anything I minted anywhere
        const key = `${cAddr}:${String(tId)}`;
        if (seenO.has(key)) continue;
        seenO.add(key);
        finalOwned.push(prepared);
      }
      finalOwned.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));

      if (!signal.aborted) {
        setCreations(minted);
        setOwned(finalOwned);
        setCountCreations(minted.length);
        setCountOwned(finalOwned.length);
        setPhase('ready');
      }
    } catch (err) {
      if (!signal.aborted) {
        setPhase('error');
        setError((err && (err.message || String(err))) || 'Network error');
      }
    }
  }, [address, network, tzktV1, fetchTypeHashes, prepareToken, resetAll, fetchMintedBy, mintedByUser]);

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

/* What changed & why (r81):
   • Creations logic: replaced admin-based sweep with a strict minted‑by‑me
     aggregator (creator, firstMinter, metadata creators/authors). Only
     ZeroContract (v1–v4e) tokens pass, deduped + preview‑validated.
   • Owned logic: exclude (a) any collection I admin and (b) any token I
     minted anywhere — fixes “My Owned” showing my own works.
   • Added creators/authors normalization (split commas/newlines, lc + tz‑guard)
     to prevent malformed Tezos Domains reverse‑lookup queries (400s).
   • Kept wallet/network‑aware TzKT v1 base, counts, pagination, and UX states. */
/* EOF */
