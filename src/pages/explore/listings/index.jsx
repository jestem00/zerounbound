/*
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/explore/listings/index.jsx
  Rev:     r16   2025-09-07
  Summary: Explore → Listings grid for all active ZeroSum listings.
           - ZeroContract allow‑list (typeHash)
           - Accept tezos-storage: and data: for previews (v4b default)
           - Partial‑stock‑safe seller balance checks via TzKT
           - Stable lowest‑price selection and ordering
*/

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import styledPkg from 'styled-components';

import ExploreNav       from '../../../ui/ExploreNav.jsx';
import LoadingSpinner   from '../../../ui/LoadingSpinner.jsx';
import TokenListingCard from '../../../ui/TokenListingCard.jsx';

import { useWalletContext } from '../../../contexts/WalletContext.js';
import { NETWORK_KEY }      from '../../../config/deployTarget.js';
import { jFetch }           from '../../../core/net.js';

import decodeHexFields from '../../../utils/decodeHexFields.js';
import detectHazards   from '../../../utils/hazards.js';
import { hasRenderablePreview as hasRenderableMedia } from '../../../utils/mediaPreview.js';
import { tzktBase }    from '../../../utils/tzkt.js';

import {
  listActiveCollections,
  listListingsForCollectionViaBigmap,
} from '../../../utils/marketplaceListings.js';

import { marketplaceAddr }        from '../../../core/marketplace.js';
import { getAllowedTypeHashList } from '../../../utils/allowedHashes.js';

// styled-components import guard (v5/v6 ESM/CJS)
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* layout */
const Grid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--col), 1fr));
  gap: 1.2rem;
  justify-content: stretch;
  --col: clamp(160px, 18vw, 220px);
`;
const Center = styled.div`
  text-align: center;
  margin: 1.25rem 0 1.75rem;
`;

/* helpers */
function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
function uniqByPair(items) { const seen = new Set(); const out = []; for (const it of items) { const key = `${it.contract}|${it.tokenId}`; if (seen.has(key)) continue; seen.add(key); out.push(it); } return out; }

/** Batch‑check sellers for a (contract, tokenId) via TzKT balances. */
async function keepSellersWithBalanceAtLeast(TZKT, nftContract, tokenId, sellers, minUnits = 1) {
  const unique = [...new Set((sellers || []).filter(Boolean))];
  if (unique.length === 0) return new Set();
  const kept = new Set();
  const CHUNK = 50;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const qs = new URLSearchParams({
      'account.in'    : slice.join(','),
      'token.contract': nftContract,
      'token.tokenId' : String(tokenId),
      select          : 'account,balance',
      limit           : String(slice.length),
    });
    const rows = await jFetch(`${TZKT}/tokens/balances?${qs}`, 1).catch(() => []);
    for (const r of rows || []) {
      const addr = r?.account?.address || r?.account;
      const bal  = Number(r?.balance ?? 0);
      if (typeof addr === 'string' && bal >= minUnits) kept.add(addr);
    }
  }
  return kept;
}

/** Discover collections with listings via TzKT when needed. */
async function discoverActiveCollectionsViaTzkt(TZKT, net, mktAddr) {
  try {
    const market = String(mktAddr || marketplaceAddr(net) || '').trim();
    if (!/^KT1[0-9A-Za-z]{33}$/.test(market)) return [];
    const maps = await jFetch(`${TZKT}/contracts/${market}/bigmaps`, 1).catch(() => []);
    let ptr = null;
    if (Array.isArray(maps)) {
      const active   = maps.find((m) => (m.path || m.name) === 'listings_active');
      const listings = maps.find((m) => (m.path || m.name) === 'listings');
      if (active) ptr = active.ptr ?? active.id; else if (listings) ptr = listings.ptr ?? listings.id;
    }
    if (ptr == null) return [];
    const rows = await jFetch(`${TZKT}/bigmaps/${ptr}/keys?limit=5000&active=true`, 1).catch(() => []);
    const out = new Set();
    for (const r of rows || []) {
      const s = JSON.stringify(r?.key || r);
      const m = s && s.match(/KT1[0-9A-Za-z]{33}/);
      if (m && m[0]) out.add(m[0]);
    }
    return [...out];
  } catch { return []; }
}

export default function ListingsPage() {
  const router = useRouter();
  const { toolkit } = useWalletContext() || {};

  const net = useMemo(() => {
    if (toolkit?._network?.type && /mainnet/i.test(toolkit._network.type)) return 'mainnet';
    const key = (NETWORK_KEY || 'ghostnet').toLowerCase();
    return key.includes('mainnet') ? 'mainnet' : 'ghostnet';
  }, [toolkit]);

  const TZKT = useMemo(() => tzktBase(net), [net]); // includes /v1

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [showCount, setCount] = useState(24);
  const [items, setItems]     = useState([]);

  const adminFilter = useMemo(() => {
    const v = router?.query?.admin;
    return typeof v === 'string' ? v.trim() : '';
  }, [router?.query?.admin]);

  const allowedHashes = useMemo(() => new Set(getAllowedTypeHashList()), []);

  const filterAllowedContracts = useCallback(async (addrs) => {
    if (!Array.isArray(addrs) || addrs.length === 0) return [];
    const out = [];
    for (const slice of chunk(addrs, 50)) {
      const qs = new URLSearchParams({ 'address.in': slice.join(','), select: 'address,typeHash,metadata', limit: String(slice.length) });
      const rows = await jFetch(`${TZKT}/contracts?${qs}`, 2).catch(() => []);
      for (const r of rows || []) {
        const th = Number(r?.typeHash ?? r?.type_hash);
        if (allowedHashes.has(th)) out.push({ address: String(r.address), name: (r.metadata && r.metadata.name) || '' });
      }
    }
    return out;
  }, [TZKT, allowedHashes]);

  const fetchTokenMetaBatch = useCallback(async (contract, ids) => {
    const result = new Map();
    if (!contract || !Array.isArray(ids) || ids.length === 0) return result;
    for (const slice of chunk(ids, 40)) {
      const qs = new URLSearchParams({ contract, 'tokenId.in': slice.join(','), select: 'tokenId,metadata,holdersCount,totalSupply', limit: String(slice.length) });
      const rows = await jFetch(`${TZKT}/tokens?${qs}`, 2).catch(() => []);
      for (const t of rows || []) {
        let md = (t && t.metadata) || {};
        try { md = decodeHexFields(md || {}); } catch {}
        if (md && typeof md.creators === 'string') { try { const j = JSON.parse(md.creators); if (Array.isArray(j)) md.creators = j; } catch {} }
        result.set(String(t.tokenId), {
          metadata: md,
          holdersCount: Number(t.holdersCount || t.holders_count || 0),
          totalSupply : Number(t.totalSupply  || t.total_supply  || 0),
        });
      }
    }
    return result;
  }, [TZKT]);

  useEffect(() => {
    let abort = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 1) discover candidate collections
        let candidates = await listActiveCollections(net, false).catch(() => []);
        if (!Array.isArray(candidates)) candidates = [];

        // 2) supplement via marketplace big‑maps
        const marketplaceCandidates = await discoverActiveCollectionsViaTzkt(TZKT, net, undefined).catch(() => []);
        if (Array.isArray(marketplaceCandidates) && marketplaceCandidates.length) {
          for (const kt of marketplaceCandidates) if (!candidates.includes(kt)) candidates.push(kt);
        }

        // 3) keep only ZeroContract family
        const allowed = await filterAllowedContracts(candidates);

        // 4) per collection: active listings with stock >= 1
        const byContract = new Map();
        const best       = new Map(); // "KT1|id" -> { priceMutez, seller, nonce, amount }
        const names      = new Map();

        for (const { address: kt, name } of allowed) {
          names.set(kt, name || '');
          const ls = await listListingsForCollectionViaBigmap(kt, net).catch(() => []);
          if (!Array.isArray(ls) || ls.length === 0) continue;

          let active = ls.filter((l) => {
            const amt = Number(l?.amount ?? l?.available ?? 0);
            const isActive = (l?.active ?? true) !== false;
            const idOk = Number.isFinite(Number(l?.tokenId ?? l?.token_id));
            const seller = String(l?.seller || '').trim();
            const sellerOk = adminFilter ? (seller.toLowerCase() === adminFilter.toLowerCase()) : true;
            return amt > 0 && isActive && idOk && sellerOk;
          });
          if (active.length === 0) continue;

          const sellersById = new Map();
          for (const l of active) {
            const id = Number(l.tokenId ?? l.token_id);
            const s  = String(l.seller || '');
            const set = sellersById.get(id) || new Set();
            if (s) set.add(s);
            sellersById.set(id, set);
          }

          const keptById = new Map();
          for (const [id, sellersSet] of sellersById.entries()) {
            const keepSet = await keepSellersWithBalanceAtLeast(TZKT, kt, id, [...sellersSet], 1);
            keptById.set(id, keepSet);
          }

          const byId = new Map();
          for (const l of active) {
            const id       = Number(l.tokenId ?? l.token_id);
            const price    = Number(l.priceMutez ?? l.price);
            const seller   = String(l.seller || '');
            const keepSet  = keptById.get(id);
            if (!seller || !keepSet || !keepSet.has(seller)) continue;
            if (!Number.isFinite(price) || price <= 0) continue;
            const key = adminFilter ? `${id}|${seller.toLowerCase()}` : String(id);
            const prev = byId.get(key);
            if (!prev || price < prev.priceMutez) byId.set(key, { ...l, tokenId: id, priceMutez: price });
          }
          if (byId.size === 0) continue;

          const set = byContract.get(kt) || new Set();
          for (const [, row] of byId.entries()) {
            const id = Number(row.tokenId);
            set.add(id);
            best.set(`${kt}|${id}`, {
              priceMutez: Number(row.priceMutez),
              seller    : String(row.seller || ''),
              nonce     : Number(row.nonce ?? row.listing_nonce ?? row.id ?? 0),
              amount    : Number(row.amount ?? row.quantity ?? 1),
            });
          }
          byContract.set(kt, set);
        }

        // 5) metadata pass and card assembly
        const assembled = [];
        for (const [kt, idSet] of byContract.entries()) {
          const ids = [...idSet];
          const metaMap = await fetchTokenMetaBatch(kt, ids);
          for (const id of ids) {
            const key        = `${kt}|${id}`;
            const bestRow    = best.get(key);
            const priceMutez = bestRow?.priceMutez;
            const metaEntry  = metaMap.get(String(id)) || {};
            const md         = metaEntry.metadata || {};
            const supply     = Number(metaEntry.totalSupply ?? 0);
            if (!Number.isFinite(priceMutez)) continue;
            if (!hasRenderableMedia(md, { allowTezosStorage: true })) continue;
            if (detectHazards(md)?.broken) continue;
            if (supply === 0) continue;
            assembled.push({
              contract     : kt,
              tokenId      : id,
              priceMutez   : priceMutez,
              metadata     : md,
              contractName : names.get(kt) || undefined,
              initialListing: bestRow ? { ...bestRow } : undefined,
            });
          }
        }

        const unique = uniqByPair(assembled);
        unique.sort((a, b) => b.tokenId - a.tokenId);
        if (!abort) { setItems(unique); setLoading(false); }
      } catch (err) {
        if (!abort) { setError((err && (err.message || String(err))) || 'Network error'); setItems([]); setLoading(false); }
      }
    }
    load();
    return () => { abort = true; };
  }, [net, TZKT, filterAllowedContracts, fetchTokenMetaBatch, adminFilter]);

  const visible = useMemo(() => items.slice(0, showCount), [items, showCount]);

  return (
    <>
      <ExploreNav />
      {loading && (
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      )}
      {!loading && error && (
        <p role="alert" style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          Could not load listings. Please try again.
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          No active listings found.
        </p>
      )}
      {!loading && !error && items.length > 0 && (
        <>
          <Grid>
            {visible.map(({ contract, tokenId, priceMutez, metadata, contractName, initialListing }) => (
              <TokenListingCard
                key={`${contract}-${tokenId}`}
                contract={contract}
                tokenId={tokenId}
                priceMutez={priceMutez}
                metadata={metadata}
                contractName={contractName}
                initialListing={initialListing}
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
                Load More
              </button>
            </Center>
          )}
        </>
      )}
    </>
  );
}

/* What changed & why (r16):
   - Replaced corrupted file with clean module to fix import/export parsing error
   - Accepted tezos-storage: URIs for v4b tokens
   - Retained allow‑list and stock‑safe checks
*/
