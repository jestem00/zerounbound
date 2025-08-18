/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/explore/secondary.jsx
  Rev :    r12    2025‑08‑18 UTC
  Summary: Secondary‑market listings only (true resales).
           Aggregates listings like /explore/listings, then filters
           out primaries where the seller ∈ {creator, firstMinter,
           metadata.creators/authors}. Applies batch TzKT `/v1`
           lookups, ZeroContract type‑hash gating, preview/supply
           guards, and the same stale‑listing balance filter used by
           the primary Listings page. Leaves TokenListingCard intact.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import styledPkg from 'styled-components';

import ExploreNav from '../../ui/ExploreNav.jsx';
import LoadingSpinner from '../../ui/LoadingSpinner.jsx';
import TokenListingCard from '../../ui/TokenListingCard.jsx';

import { useWalletContext } from '../../contexts/WalletContext.js';
import { NETWORK_KEY } from '../../config/deployTarget.js';

import { jFetch } from '../../core/net.js';
import decodeHexFields from '../../utils/decodeHexFields.js';
import detectHazards from '../../utils/hazards.js';

import {
  listActiveCollections,
  listListingsForCollectionViaBigmap,
} from '../../utils/marketplaceListings.js';
import { getAllowedTypeHashList } from '../../utils/allowedHashes.js';
import { tzktBase } from '../../utils/tzkt.js';
import { filterStaleListings } from '../../core/marketplace.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── Layout ────────*/
const Grid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--col), 1fr));
  gap: 1.2rem;
  justify-content: stretch;
  --col: clamp(160px, 18vw, 220px); /* I105 */
`;
const Center = styled.div`
  text-align: center;
  margin: 1.25rem 0 1.75rem;
`;

/*──────── Helpers ────────*/

/** tolerant data‑URI test; supports base64 & utf8 (e.g. SVG/HTML) */
function hasRenderablePreview(m = {}) {
  const keys = [
    'displayUri', 'display_uri',
    'imageUri', 'image_uri', 'image',
    'thumbnailUri', 'thumbnail_uri',
    'artifactUri', 'artifact_uri',
    'mediaUri', 'media_uri',
  ];
  let uri = null;
  for (const k of keys) {
    const v = m && typeof m === 'object' ? m[k] : undefined;
    if (typeof v === 'string' && v.startsWith('data:')) { uri = v; break; }
  }
  if (!uri && Array.isArray(m.formats)) {
    for (const f of m.formats) {
      const cand = (f && (f.uri || f.url)) || '';
      if (typeof cand === 'string' && cand.startsWith('data:')) { uri = cand; break; }
    }
  }
  if (!uri) return false;
  return /^data:(image|audio|video|application\/svg\+xml|text\/html)/i.test(uri);
}

/** chunk helper */
const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/** dedupe by contract+tokenId (keep first/cheapest later) */
function uniqByPair(items) {
  const seen = new Set();
  const out  = [];
  for (const it of items) {
    const key = `${it.contract}|${it.tokenId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/** Normalize possibly‑JSON string → array of strings */
function toArray(src) {
  if (Array.isArray(src)) return src;
  if (typeof src === 'string') {
    try { const j = JSON.parse(src); return Array.isArray(j) ? j : [src]; }
    catch { return [src]; }
  }
  if (src && typeof src === 'object') return Object.values(src);
  return [];
}

/** address guard */
const isTz = (s) => typeof s === 'string' && /^tz[1-3][0-9A-Za-z]{33}$/i.test(s.trim());

/** Build tokenId → Set(minter addresses) map for a contract in batches. */
async function fetchMintedByMap(TZKT, contract, tokenIds) {
  const map = new Map(); // id (string) → Set(address)
  for (const slice of chunk(tokenIds, 40)) {
    const qs = new URLSearchParams({
      contract,
      'tokenId.in': slice.join(','),
      select: 'tokenId,creator,firstMinter,metadata',
      limit: String(slice.length),
    });
    // jFetch with retry depth returns JSON directly in our codebase (see listings page). 
    const rows = await jFetch(`${TZKT}/tokens?${qs}`, 2).catch(() => []);
    for (const r of rows || []) {
      const id = String(r.tokenId);
      const acc = new Set();
      const c1 = String(r.creator || '').trim();
      const c2 = String(r.firstMinter || '').trim();
      if (isTz(c1)) acc.add(c1.toLowerCase());
      if (isTz(c2)) acc.add(c2.toLowerCase());
      // metadata creators/authors (hex‑decoded & tolerant JSON)
      let md = r.metadata || {};
      try { md = decodeHexFields(md || {}); } catch { /* best effort */ }
      const creators = toArray(md.creators).concat(toArray(md.authors));
      for (const v of creators) {
        const s = typeof v === 'string' ? v : (v && (v.address || v.wallet)) || '';
        if (isTz(s)) acc.add(String(s).toLowerCase());
      }
      map.set(id, acc);
    }
  }
  return map;
}

/** Batch fetch token metadata + supply for a contract (for card acceptance). */
async function fetchTokenMetaBatch(TZKT, contract, ids) {
  const result = new Map(); // id -> { metadata, holdersCount, totalSupply }
  for (const slice of chunk(ids, 40)) {
    const qs = new URLSearchParams({
      contract,
      'tokenId.in': slice.join(','),
      select: 'tokenId,metadata,holdersCount,totalSupply',
      limit: String(slice.length),
    });
    const rows = await jFetch(`${TZKT}/tokens?${qs}`, 2).catch(() => []);
    for (const t of rows || []) {
      let md = t.metadata || {};
      try { md = decodeHexFields(md || {}); } catch {}
      if (md && typeof md.creators === 'string') {
        try { const j = JSON.parse(md.creators); if (Array.isArray(j)) md.creators = j; } catch {}
      }
      result.set(String(t.tokenId), {
        metadata: md,
        holdersCount: Number(t.holdersCount || t.holders_count || 0),
        totalSupply : Number(t.totalSupply  || t.total_supply  || 0),
      });
    }
  }
  return result;
}

/*──────── Component ────────*/
export default function SecondaryListingsPage() {
  const { toolkit } = useWalletContext() || {};
  const net = useMemo(() => {
    if (toolkit?._network?.type && /mainnet/i.test(toolkit._network.type)) return 'mainnet';
    return (NETWORK_KEY || 'ghostnet').toLowerCase().includes('mainnet') ? 'mainnet' : 'ghostnet';
  }, [toolkit]);

  // IMPORTANT: tzktBase() already includes `/v1` → do NOT append it again.
  const TZKT = useMemo(() => tzktBase(net), [net]);

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showCount, setCount]   = useState(24);
  const [items, setItems]       = useState([]); // [{contract, tokenId, priceMutez, metadata, contractName}]

  const allowedHashes = useMemo(() => new Set(getAllowedTypeHashList()), []);

  /** batch query: filter to ZeroContract family via typeHash */
  const filterAllowedContracts = useCallback(async (addrs) => {
    if (!addrs.length) return [];
    const out = [];
    for (const slice of chunk(addrs, 50)) {
      const qs = new URLSearchParams({
        'address.in': slice.join(','),
        select: 'address,typeHash,metadata',
        limit: String(slice.length),
      });
      const rows = await jFetch(`${TZKT}/contracts?${qs}`, 2).catch(() => []);
      for (const r of rows || []) {
        const th = Number(r?.typeHash ?? r?.type_hash);
        if (allowedHashes.has(th)) {
          out.push({ address: r.address, name: r?.metadata?.name || '' });
        }
      }
    }
    return out;
  }, [TZKT, allowedHashes]);

  useEffect(() => {
    let abort = false;

    async function load() {
      setLoading(true); setError(null);
      try {
        /* 1) discover collections with listings (unfiltered) */
        let candidates = await listActiveCollections(net, false).catch(() => []);
        if (!Array.isArray(candidates) || candidates.length === 0) candidates = [];

        /* 2) keep only ZeroContract family (typeHash filter) */
        const allowed = await filterAllowedContracts(candidates);

        /* 3) for each allowed contract, fetch listings via big‑map,
              drop stale sellers (TzKT balances), and retain only *secondary* sellers */
        const assembled = [];

        for (const { address: kt, name } of allowed) {
          // raw listings candidates (active, amount>0)
          const ls = await listListingsForCollectionViaBigmap(kt, net).catch(() => []);
          if (!Array.isArray(ls) || ls.length === 0) continue;

          // keep "active, amount>0" first
          let active = ls.filter((l) => Number(l.amount ?? l.available ?? 0) > 0 && (l.active ?? true));

          // stale‑listing filter (batched TzKT balance checks via helper used on primary page)
          active = await filterStaleListings(
            toolkit,
            active.map((l) => ({
              nftContract: kt,
              tokenId: Number(l.tokenId ?? l.token_id),
              seller: String(l.seller || ''),
              amount: Number(l.amount ?? 1),
              __src: l,
            })),
          ).catch(() => active).then((arr) => (arr[0]?.__src ? arr.map((x) => x.__src) : arr));

          if (!active.length) continue;

          // group by tokenId → list of {seller,price}
          const byId = new Map(); // id -> [{seller, price}]
          for (const l of active) {
            const id = Number(l.tokenId ?? l.token_id);
            if (!Number.isFinite(id)) continue;
            const price = Number(l.priceMutez ?? l.price);
            if (!Number.isFinite(price)) continue;
            const seller = String(l.seller || '').toLowerCase();
            if (!isTz(seller)) continue;
            const arr = byId.get(id) || [];
            arr.push({ seller, price });
            byId.set(id, arr);
          }
          if (!byId.size) continue;

          // fetch minted‑by addresses in batch for all tokenIds present
          const ids = [...byId.keys()];
          const mintedBy = await fetchMintedByMap(TZKT, kt, ids);

          // for each token, keep only listings whose seller is *not* original minter/creator
          const secondaries = [];
          for (const id of ids) {
            const sellers = byId.get(id) || [];
            const mintSet = mintedBy.get(String(id)) || new Set();
            const sec = sellers.filter((s) => !mintSet.has(s.seller));
            if (!sec.length) continue;
            // choose the *lowest* priced secondary listing for this token
            sec.sort((a, b) => a.price - b.price);
            secondaries.push({ id, seller: sec[0].seller, priceMutez: sec[0].price });
          }
          if (!secondaries.length) continue;

          // metadata batch & acceptance (preview, non‑zero supply, hazard)
          const metaMap = await fetchTokenMetaBatch(TZKT, kt, secondaries.map((s) => s.id));
          for (const { id, priceMutez } of secondaries) {
            const metaEntry = metaMap.get(String(id)) || {};
            const md        = metaEntry.metadata || {};
            const supply    = metaEntry.totalSupply ?? 0;
            if (!hasRenderablePreview(md)) continue;
            if (detectHazards(md).broken) continue;
            if (Number(supply) === 0) continue;
            assembled.push({
              contract: kt,
              tokenId : id,
              priceMutez,
              metadata: md,
              contractName: name || undefined,
            });
          }
        }

        // final dedupe/order
        const unique = uniqByPair(assembled);
        unique.sort((a, b) => b.tokenId - a.tokenId);

        if (!abort) {
          setItems(unique);
          setLoading(false);
        }
      } catch (err) {
        if (!abort) {
          setError((err && (err.message || String(err))) || 'Network error');
          setItems([]);
          setLoading(false);
        }
      }
    }

    load();
    return () => { abort = true; };
  }, [net, TZKT, filterAllowedContracts, toolkit]);

  const visible = useMemo(() => items.slice(0, showCount), [items, showCount]);

  return (
    <>
      <ExploreNav hideSearch />
      {loading && (
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      )}
      {!loading && error && (
        <p role="alert" style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          Could not load secondary listings. Please try again.
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          No secondary listings found.
        </p>
      )}
      {!loading && !error && items.length > 0 && (
        <>
          <Grid>
            {visible.map(({ contract, tokenId, priceMutez, metadata, contractName }) => (
              <TokenListingCard
                key={`${contract}-${tokenId}`}
                contract={contract}
                tokenId={tokenId}
                priceMutez={priceMutez}
                metadata={metadata}
                contractName={contractName}
              />
            ))}
          </Grid>
          {showCount < items.length && (
            <Center>
              <button
                type="button"
                onClick={() => setCount((n) => n + 24)}
                style={{
                  background: 'none',
                  border: '2px solid var(--zu-accent,#00c8ff)',
                  color: 'var(--zu-fg,#fff)',
                  padding: '0.4rem 1rem',
                  fontFamily: 'Pixeloid Sans, monospace',
                  cursor: 'pointer',
                }}
              >
                Load&nbsp;More&nbsp;🔻
              </button>
            </Center>
          )}
        </>
      )}
    </>
  );
}

/* What changed & why (r12):
   • True secondary listings only: seller is excluded if they match token
     creator, firstMinter or any address inside metadata creators/authors.
   • Reused the listings page’s stale‑listing filter (TzKT FA2 balance)
     so dead listings never render. 
   • Kept /v1 handling via tzktBase(); no double‑append, per invariant.
   • Type‑hash gate (ZeroContract only), preview & non‑zero supply guards,
     dedupe to lowest‑priced secondary per token, robust batching with jFetch.
   • TokenListingCard left untouched; page works with or without a wallet. */
