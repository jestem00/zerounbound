/*Developed by @jams2blues
  File: src/pages/my/tokens.jsx
  Rev:  r86
  Summary: Fix reverse DNS resolution by preserving tz-address case in
           creators/authors normalization (was lowercasing, which breaks
           Tezos Domains lookups). Tighten minted-by-me exclusion, keep
           ZeroContract typeHash gating, robust preview guard, /v1 base
           guard, and UX/pagination. No change to TokenCard.jsx.
*/

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styledPkg from 'styled-components';

import { useWallet } from '../../contexts/WalletContext.js';
import { TZKT_API, NETWORK_KEY } from '../../config/deployTarget.js';
import ExploreNav from '../../ui/ExploreNav.jsx';
import PixelHeading from '../../ui/PixelHeading.jsx';
import PixelButton from '../../ui/PixelButton.jsx';
import TokenCard from '../../ui/TokenCard.jsx';

import { jFetch } from '../../core/net.js';
import decodeHexFields, { decodeHexJson } from '../../utils/decodeHexFields.js';
import hashMatrix from '../../data/hashMatrix.json';

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

  // Prefer the connected wallet network when available to avoid
  // cross-network mismatches (e.g., viewing MAINNET with a build
  // that carries a ghostnet TZKT_API constant). Fallback to the
  // configured constant only when we cannot infer the wallet net.
  const byNet = net === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';

  if (typeof TZKT_API === 'string' && TZKT_API) {
    const base = TZKT_API.replace(/\/+$/, '');
    const constIsMain = /api\.tzkt\.io$/i.test(base) || /api\.tzkt\.io\/v1$/i.test(base);
    const constIsGhost = /ghostnet\.tzkt\.io$/i.test(base) || /ghostnet\.tzkt\.io\/v1$/i.test(base);
    // If constant matches wallet net, use it; else prefer byNet.
    if ((net === 'mainnet' && constIsMain) || (net === 'ghostnet' && constIsGhost)) {
      return base.endsWith('/v1') ? base : `${base}/v1`;
    }
  }
  return byNet;
}

/** Tight tz‑address check (tz1|tz2|tz3, 36‑char Base58) */
const isTz = (s) => typeof s === 'string' && /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/.test(s?.trim());

/**
 * Normalize a possibly messy creators/authors field into a clean array
 * of tz‑addresses while **preserving original case**. Case preservation
 * is required so downstream Tezos Domains reverse lookups succeed.
 * Deduplication is performed case‑insensitively.
 */
function normalizeCreatorsField(src) {
  const out = [];
  const seen = new Set(); // lowercased key for dedupe

  const pushIfAddr = (val) => {
    if (typeof val !== 'string') return;
    const parts = val
      .split(/[,\s;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    for (const p of parts) {
      if (isTz(p)) {
        const key = p.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(p); // preserve original case as seen in metadata
        }
      }
    }
  };

  if (Array.isArray(src)) {
    for (const v of src) {
      if (typeof v === 'string') {
        pushIfAddr(v);
      } else if (v && typeof v.address === 'string') {
        pushIfAddr(v.address);
      } else if (v && typeof v === 'object') {
        // scan any nested stringy fields for tz* substrings
        Object.values(v).forEach((x) => pushIfAddr(String(x || '')));
      }
    }
  } else if (typeof src === 'string') {
    // attempt JSON, else parse as delimited string
    try {
      const parsed = JSON.parse(src);
      if (Array.isArray(parsed)) return normalizeCreatorsField(parsed);
    } catch { /* noop */ }
    pushIfAddr(src);
  } else if (src && typeof src === 'object') {
    Object.values(src).forEach((x) => pushIfAddr(String(x || '')));
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
    const isBase64 = /;base64/i.test(header);

    // Accept non-base64 data URIs (e.g., image/svg+xml;utf8,...) without
    // deep signature checks. These are common for SVG/HTML and are safe in
    // our renderer which sanitizes/script-gates separately.
    if (!isBase64) return true;

    const b64  = uri.slice(comma + 1);
    let binary;
    if (typeof atob === 'function') {
      binary = atob(b64);
    } else {
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
    return true;
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
  const walletCtx = useWallet() || {};
  const address = walletCtx.walletAddress || walletCtx.address || '';
  const { toolkit } = walletCtx || {};
  const tzktV1 = useTzktV1Base(toolkit);

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

  /** Decode + normalise token metadata; validate preview; sanitize creators/authors for domain resolver */
  const prepareToken = useCallback((row) => {
    let meta = row?.metadata || {};
    try {
      // TzKT sometimes returns metadata as a hex JSON string. Decode that
      // first, then deep-decode any hex fields inside the resulting object.
      if (typeof meta === 'string') {
        const parsed = decodeHexJson(meta);
        if (parsed && typeof parsed === 'object') meta = parsed;
      }
      meta = decodeHexFields(meta || {});
    } catch { /* keep original */ }

    // sanitize creators/authors for downstream components (preserve case!)
    const creatorsNorm = normalizeCreatorsField(meta?.creators);
    const authorsNorm  = normalizeCreatorsField(meta?.authors ?? meta?.artists);

    if (creatorsNorm.length) meta.creators = creatorsNorm;
    if (authorsNorm.length)  meta.authors  = authorsNorm;

    if (!isValidPreview(meta)) return null;

    const contractAddr = row?.contract?.address || row?.contract;
    const creatorTop   = (row?.creator?.address || row?.creator || '').toString().toLowerCase();
    const firstMinter  = (row?.firstMinter?.address || row?.firstMinter || '').toString().toLowerCase();

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

    // direct or first-mint fields
    if (t._creator && t._creator === meLc) return true;
    if (t._firstMinter && t._firstMinter === meLc) return true;

    // metadata hints (creators/authors/artists)
    const meta = t.metadata || {};
    const arrays = [];
    if (Array.isArray(meta.creators)) arrays.push(...meta.creators);
    if (Array.isArray(meta.authors))  arrays.push(...meta.authors);
    if (Array.isArray(meta.artists))  arrays.push(...meta.artists);

    for (const a of arrays) {
      const s = typeof a === 'string'
        ? a
        : (a && typeof a.address === 'string')
          ? a.address
          : '';
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
    out.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));
    return out;
  }, [tzktV1, fetchTypeHashes, prepareToken]);

  /** Load both tabs’ data */
  const loadAll = useCallback(async (signal) => {
    if (!address) { resetAll(); return; }
    setPhase('loading'); setError(null); setVisible(24);

    try {
      // CREATIONS: strictly tokens minted by me (creator/firstMinter/metadata creators|authors)
      const minted = await fetchMintedBy(address);
      if (signal.aborted) return;

      // OWNED: balances where (a) ZeroContract, (b) NOT minted by me
      const balRows = await jFetch(
        `${tzktV1}/tokens/balances?account=${encodeURIComponent(address)}&balance.ne=0&limit=1000`
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
        const th = String(typeMapOwned.get(cAddr) || '');
        if (!VALID_TYPE_HASHES.has(th)) continue;

        // Metadata: prefer existing; else lookup for creator/firstMinter too
        let meta = tokObj?.metadata;
        let creator = tokObj?.creator;
        let firstMinter = tokObj?.firstMinter;
        if (!meta || (!creator && !firstMinter)) {
          const [row] = await jFetch(
            `${tzktV1}/tokens?contract=${cAddr}&tokenId=${tId}&limit=1&select=contract,tokenId,metadata,holdersCount,totalSupply,creator,firstMinter`
          ).catch(() => []);
          meta = row?.metadata ?? meta;
          creator = row?.creator ?? creator;
          firstMinter = row?.firstMinter ?? firstMinter;
        }

        const prepared = prepareToken({
          contract: { address: cAddr },
          tokenId: tId,
          metadata: meta,
          holdersCount: tokObj?.holdersCount,
          totalSupply: tokObj?.totalSupply,
          creator,
          firstMinter,
        });
        if (!prepared) continue;

        // Strict exclusion: anything I minted anywhere (creator OR firstMinter OR meta hints)
        if (mintedByUser(prepared, address)) continue;

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
  }, [address, tzktV1, fetchTypeHashes, prepareToken, resetAll, fetchMintedBy, mintedByUser]);

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

      {phase === 'loading' && address && (
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

/* What changed & why (r86):
   • Preserve case in creators/authors normalization so TokenCard’s
     reverse Tezos Domains lookups succeed on /my/tokens (names now
     resolve the same as on the token detail page).
   • Keep strict minted-by-me exclusion (creator | firstMinter | meta),
     ZeroContract typeHash gating, robust data-URI preview guard, and
     /v1 base enforcement. UX unchanged.
*/
