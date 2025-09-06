/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/listings.jsx
  Rev :    r8    2025‑09‑06 UTC
  Summary: Wallet‑scoped "My Listings" grid. Mirrors the Explore
           pipeline: derives the correct TzKT `/v1` base per active
           network, fetches the seller’s active listings (on‑chain
           view + TzKT fallbacks), filters stale via FA2 balances
           (partial‑stock‑safe), prefetches token metadata + names,
           and renders TokenListingCard with seeded listings.
──────────────────────────────────────────────────────────────*/

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
import { tzktBase } from '../../utils/tzkt.js';
import { fetchOnchainListingsForSeller, filterStaleListings } from '../../core/marketplace.js';
import { fetchSellerListingsViaTzkt } from '../../core/marketplaceHelper.js';

// styled-components import may be ESM/CJS — normalize reference
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── Layout (I105) ────────*/
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

/*──────── Helpers ────────*/
/** tolerant data‑URI test; supports base64 & utf8 (e.g., SVG/HTML) */
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

/** KT1 guard + extraction */
const isKt1 = (s) => typeof s === 'string' && /^KT1[0-9A-Za-z]{33}$/.test(s?.trim());
function toKt1(input) {
  if (isKt1(input)) return input;
  if (input && typeof input === 'object') {
    if (isKt1(input.address)) return input.address;
    if (isKt1(input.value))   return input.value;
    if (input.contract && typeof input.contract === 'object') {
      if (isKt1(input.contract.address)) return input.contract.address;
      if (isKt1(input.contract.value))   return input.contract.value;
    }
    if (Array.isArray(input)) {
      for (const it of input) { const v = toKt1(it); if (isKt1(v)) return v; }
    }
    const alt = input.string || input.bytes || input.prim;
    if (isKt1(alt)) return alt;
  }
  const m = String(input || '').match(/KT1[0-9A-Za-z]{33}/);
  return m ? m[0] : '';
}

/** normalise one listing row from any of our marketplace view shapes */
function normalizeRow(r = {}) {
  const contract = toKt1(r.contract ?? r.nftContract ?? r.nft_contract ?? r.collection ?? '');
  const tokenId  = Number(r.tokenId ?? r.token_id ?? r.id ?? r.token ?? r.tokenID ?? r.tokenid);
  const amount   = Number(r.amount ?? r.available ?? r.qty ?? r.quantity ?? 1);
  const price    = Number(r.priceMutez ?? r.price ?? r.listPrice ?? 0);
  const seller   = String(r.seller || r.owner || r.from || '').trim();
  const active   = (typeof r.active === 'boolean' ? r.active : (typeof r.accepted === 'boolean' ? !r.accepted : true));
  return { contract, tokenId, amount, priceMutez: price, seller, active };
}

/** tiny chunk helper */
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

/** batch: fetch token metadata + supply for a contract from TzKT `/v1/tokens` */
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
      let md = t?.metadata || {};
      try { md = decodeHexFields(md || {}); } catch {}
      result.set(String(t.tokenId), {
        metadata: md,
        holdersCount: Number(t.holdersCount || t.holders_count || 0),
        totalSupply : Number(t.totalSupply || t.total_supply || 0),
      });
    }
  }
  return result;
}

/** batch: fetch contract names (best‑effort) */
async function fetchContractNames(TZKT, addrs = []) {
  const map = new Map();
  for (const slice of chunk(addrs, 50)) {
    const qs = new URLSearchParams({ 'address.in': slice.join(','), select: 'address,metadata', limit: String(slice.length) });
    const rows = await jFetch(`${TZKT}/contracts?${qs}`, 2).catch(() => []);
    for (const r of rows || []) {
      const name = (r?.metadata?.name || r?.metadata?.collectionName || r?.metadata?.title || '').trim();
      map.set(String(r.address), name || '');
    }
  }
  return map;
}

export default function MyListingsPage() {
  const { address: seller, toolkit } = useWalletContext() || {};
  const net = useMemo(() => {
    if (toolkit?.['_network']?.type && /mainnet/i.test(toolkit._network.type)) return 'mainnet';
    const key = (NETWORK_KEY || 'ghostnet').toLowerCase();
    return key.includes('mainnet') ? 'mainnet' : 'ghostnet';
  }, [toolkit]);
  const TZKT = useMemo(() => tzktBase(net), [net]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [show, setShow] = useState(24);
  const [items, setItems] = useState([]);

  const assemble = useCallback(async (rawRows) => {
    if (!Array.isArray(rawRows) || rawRows.length === 0) return [];
    // Normalise & keep only plausible rows
    const rows = rawRows.map(normalizeRow).filter((r) => isKt1(r.contract) && Number.isFinite(r.tokenId) && r.priceMutez > 0 && r.amount > 0 && r.active);

    // Partial‑stock‑safe stale filter (≥1)
    const filtered = await filterStaleListings(toolkit, rows.map((l) => ({
      nftContract: l.contract, tokenId: Number(l.tokenId), seller: String(seller), amount: 1, priceMutez: Number(l.priceMutez), __src: l,
    }))).catch(() => rows);
    const keep = (filtered || []).map((x) => x.__src || x);

    // Compute best (lowest) price per token and group ids per contract
    const bestByToken = new Map();
    const byContract = new Map();
    for (const r of keep) {
      const id = Number(r.tokenId); const kt = r.contract;
      const prev = bestByToken.get(`${kt}|${id}`);
      if (!prev || Number(r.priceMutez) < Number(prev.priceMutez)) bestByToken.set(`${kt}|${id}`, r);
      const set = byContract.get(kt) || new Set(); set.add(id); byContract.set(kt, set);
    }
    if (byContract.size === 0) return [];

    const names = await fetchContractNames(TZKT, [...byContract.keys()]);
    const out = [];
    for (const [kt, idSet] of byContract.entries()) {
      const metaMap = await fetchTokenMetaBatch(TZKT, kt, [...idSet]);
      for (const id of idSet) {
        const mdEntry = metaMap.get(String(id)) || {};
        const md = mdEntry.metadata || {};
        const supply = Number(mdEntry.totalSupply || 0);
        if (detectHazards(md).broken) continue;
        if (supply === 0) continue;
        const best = bestByToken.get(`${kt}|${Number(id)}`) || null;
        const price = best?.priceMutez ?? 0;
        out.push({
          contract: kt,
          tokenId: Number(id),
          priceMutez: price,
          metadata: md,
          contractName: names.get(kt) || undefined,
          initialListing: best || undefined,
        });
      }
    }
    out.sort((a, b) => b.tokenId - a.tokenId);
    return out;
  }, [TZKT, toolkit, seller]);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true); setError(null); setItems([]);
      try {
        if (!seller || !toolkit) { setLoading(false); return; }
        let rows = await fetchOnchainListingsForSeller({ toolkit, seller }).catch(() => []);
        if (!Array.isArray(rows) || rows.length === 0) rows = await fetchSellerListingsViaTzkt(seller, net).catch(() => []);
        if (cancel) return;
        const cards = await assemble(rows);
        if (!cancel) { setItems(cards); setLoading(false); }
      } catch (err) {
        if (!cancel) { setError((err && (err.message || String(err))) || 'Network error'); setItems([]); setLoading(false); }
      }
    }
    load();
    return () => { cancel = true; };
  }, [seller, toolkit, net, assemble]);

  const visible = useMemo(() => items.slice(0, show), [items, show]);

  return (
    <>
      <ExploreNav />
      {!seller && (
        <p style={{ marginTop: '2rem', textAlign: 'center' }}>
          Connect your wallet to view your listings.
        </p>
      )}

      {seller && loading && (
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      )}

      {seller && !loading && error && (
        <p role="alert" style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          Could not load your listings. Please try again.
        </p>
      )}

      {seller && !loading && !error && items.length === 0 && (
        <p style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          You have no active listings.
        </p>
      )}

      {seller && !loading && !error && items.length > 0 && (
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
          {show < items.length && (
            <Center>
              <button
                type="button"
                onClick={() => setShow((n) => n + 24)}
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

/* What changed & why (r8):
   - Restored a valid module (was corrupted with concatenated header/imports).
   - Added TzKT fallback for seller‑scoped listings (mainnet CORS/disabled views).
   - Implemented partial‑stock stale guard (≥1) and seeded TokenListingCard.
   - Batched metadata & contract name prefetch; guarded previews/supply.
   - SSR‑safe styled import; clean "Load More" label and layout.
*/

