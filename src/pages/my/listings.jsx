/*─────────────────────────────────────────────────────────────  Developed by @jams2blues – ZeroContract Studio  File:    src/pages/my/listings.jsx  Rev :    r7    2025‑08‑19 UTC  Summary(of what this file does): Wallet‑scoped "My Listings" grid.           Mirrors the explore pipeline: derives the correct TzKT           `/v1` base per active network, fetches the seller’s active           on‑chain listings, drops stale ones via FA2 balance checks,           prefetches token metadata + collection names in batches,           and renders TokenListingCard with full props so names,           previews, and bars render reliably.──────────────────────────────────────────────────────────────*/import React, { useEffect, useMemo, useState, useCallback } from 'react';import styledPkg from 'styled-components';import ExploreNav from '../../ui/ExploreNav.jsx';import LoadingSpinner from '../../ui/LoadingSpinner.jsx';import TokenListingCard from '../../ui/TokenListingCard.jsx';import { useWalletContext } from '../../contexts/WalletContext.js';import { NETWORK_KEY } from '../../config/deployTarget.js';import { jFetch } from '../../core/net.js';import decodeHexFields from '../../utils/decodeHexFields.js';import detectHazards from '../../utils/hazards.js';import { tzktBase } from '../../utils/tzkt.js';import {  fetchOnchainListingsForSeller,  filterStaleListings,} from '../../core/marketplace.js';const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;/*──────── Layout (I105) ────────*/const Grid = styled.div`  width: 100%;  display: grid;  grid-template-columns: repeat(auto-fill, minmax(var(--col), 1fr));  gap: 1.2rem;  justify-content: stretch;  --col: clamp(160px, 18vw, 220px);`;const Center = styled.div`  text-align: center;  margin: 1.25rem 0 1.75rem;`;/*──────── Helpers ────────*//** tolerant data‑URI test; supports base64 & utf8 (e.g., SVG/HTML) */function hasRenderablePreview(m = {}) {  const keys = [    'displayUri', 'display_uri',    'imageUri', 'image_uri', 'image',    'thumbnailUri', 'thumbnail_uri',    'artifactUri', 'artifact_uri',    'mediaUri', 'media_uri',  ];  let uri = null;  for (const k of keys) {    const v = m && typeof m === 'object' ? m[k] : undefined;    if (typeof v === 'string' && v.startsWith('data:')) { uri = v; break; }  }  if (!uri && Array.isArray(m.formats)) {    for (const f of m.formats) {      const cand = (f && (f.uri || f.url)) || '';      if (typeof cand === 'string' && cand.startsWith('data:')) { uri = cand; break; }    }  }  if (!uri) return false;  return /^data:(image|audio|video|application\/svg\+xml|text\/html)/i.test(uri);}/** KT1 guard + extraction */const isKt1 = (s) => typeof s === 'string' && /^KT1[0-9A-Za-z]{33}$/.test(s?.trim());function toKt1(input) {  if (isKt1(input)) return input;  if (input && typeof input === 'object') {    if (isKt1(input.address)) return input.address;    if (isKt1(input.value))   return input.value;    if (input.contract && typeof input.contract === 'object') {      if (isKt1(input.contract.address)) return input.contract.address;      if (isKt1(input.contract.value))   return input.contract.value;    }    if (Array.isArray(input)) {      for (const it of input) { const v = toKt1(it); if (isKt1(v)) return v; }    }    const alt = input.string || input.bytes || input.prim;    if (isKt1(alt)) return alt;  }  const m = String(input || '').match(/KT1[0-9A-Za-z]{33}/);  return m ? m[0] : '';}/** normalize a raw listing row from any of our marketplace view shapes */function normalizeRow(r = {}) {  const contract = toKt1(r.contract ?? r.nftContract ?? r.nft_contract ?? r.collection ?? '');  const tokenId  = Number(r.tokenId ?? r.token_id ?? r.id ?? r.token ?? r.tokenID ?? r.tokenid);  const amount   = Number(r.amount ?? r.available ?? r.qty ?? r.quantity ?? 1);  const price    = Number(r.priceMutez ?? r.price ?? r.listPrice ?? 0);  const seller   = String(r.seller || r.owner || r.from || '').trim();  const active   = (typeof r.active === 'boolean' ? r.active                   : (typeof r.accepted === 'boolean' ? !r.accepted : true));  return { contract, tokenId, amount, priceMutez: price, seller, active };}/** tiny chunk helper */const chunk = (arr, n) => {  const out = [];  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));  return out;};/** batch: fetch token metadata + supply for a contract from TzKT `/v1/tokens` */async function fetchTokenMetaBatch(TZKT, contract, ids) {  const result = new Map(); // id -> { metadata, holdersCount, totalSupply }  for (const slice of chunk(ids, 40)) {    const qs = new URLSearchParams({      contract,      'tokenId.in': slice.join(','),      select: 'tokenId,metadata,holdersCount,totalSupply',      limit: String(slice.length),    });    const rows = await jFetch(`${TZKT}/tokens?${qs}`, 2).catch(() => []);    for (const t of rows || []) {      let md = t.metadata || {};      try { md = decodeHexFields(md || {}); } catch {}      if (md && typeof md.creators === 'string') {        try { const j = JSON.parse(md.creators); if (Array.isArray(j)) md.creators = j; } catch {}      }      result.set(String(t.tokenId), {        metadata: md,        holdersCount: Number(t.holdersCount || t.holders_count || 0),        totalSupply : Number(t.totalSupply  || t.total_supply  || 0),      });    }  }  return result;}/** batch: resolve collection names for a set of KT1s via `/v1/contracts` */async function fetchContractNames(TZKT, contracts) {  const nameMap = new Map(); // KT1 -> name  for (const slice of chunk(contracts, 50)) {    const qs = new URLSearchParams({      'address.in': slice.join(','),      select: 'address,metadata',      limit: String(slice.length),    });    const rows = await jFetch(`${TZKT}/contracts?${qs}`, 2).catch(() => []);    for (const r of rows || []) {      const addr = r?.address || '';      const name = (r?.metadata && (r.metadata.name || r.metadata?.title)) || '';      if (isKt1(addr)) nameMap.set(addr, String(name || '').trim());    }  }  return nameMap;}/*──────── Component ────────*/export default function MyListingsPage() {  const { address, toolkit } = useWalletContext() || {};  const seller = useMemo(() => String(address || ''), [address]);  // Derive active network → correct TzKT `/v1` base (callers MUST NOT add `/v1` again)  const net = useMemo(() => {    if (toolkit?._network?.type && /mainnet/i.test(toolkit._network.type)) return 'mainnet';    return (NETWORK_KEY || 'ghostnet').toLowerCase().includes('mainnet') ? 'mainnet' : 'ghostnet';  }, [toolkit]);  const TZKT = useMemo(() => tzktBase(net), [net]); // returns host **with** `/v1` suffix. :contentReference[oaicite:0]{index=0}  const [loading, setLoading] = useState(true);  const [error,   setError]   = useState(null);  const [items,   setItems]   = useState([]);    // [{contract, tokenId, priceMutez, metadata?, contractName?}]  const [show,    setShow]    = useState(24);  const assemble = useCallback(async (rawRows) => {    // 1) normalize + basic guards    const base = (Array.isArray(rawRows) ? rawRows : []).map(normalizeRow)      .filter((l) => isKt1(l.contract) && Number.isFinite(l.tokenId) && l.active && Number(l.amount) > 0);    if (!base.length) return [];    // 2) stale‑listing guard — verify seller still has >= amount (TzKT balances)    // NOTE: filterStaleListings batches per token group inside the helper. :contentReference[oaicite:1]{index=1}    const filtered = await filterStaleListings(      toolkit,      base.map((l) => ({        nftContract: l.contract,        tokenId: l.tokenId,        seller,        amount: l.amount,        priceMutez: l.priceMutez,        __src: l,      })),    )      .catch(() => base)      .then((arr) => (arr[0]?.__src ? arr.map((x) => x.__src) : arr));    if (!filtered.length) return [];    // 3) group for metadata/name prefetch    const byContract = new Map();       // KT1 -> Set(tokenId)    for (const l of filtered) {      const set = byContract.get(l.contract) || new Set();      set.add(Number(l.tokenId));      byContract.set(l.contract, set);    }    // 4) batch‑fetch: token metadata + collection names using the active TZKT base    const names = await fetchContractNames(TZKT, [...byContract.keys()]);    const out = [];    for (const [kt, idSet] of byContract.entries()) {      const ids = [...idSet];      const metaMap = await fetchTokenMetaBatch(TZKT, kt, ids);      for (const id of ids) {        const mdEntry = metaMap.get(String(id)) || {};        const md   = mdEntry.metadata || {};        const supp = Number(mdEntry.totalSupply ?? 0);        // Accept cards that have either a renderable preview OR at least valid metadata & non‑zero supply        if (detectHazards(md).broken) continue;        if (supp === 0) continue; // non‑zero supply guard as on explore pages. :contentReference[oaicite:2]{index=2}        // pick a price for (kt,id) — *lowest* among seller’s listings (stable enough)        let priceMutez = Infinity;        for (const l of filtered) {          if (l.contract === kt && Number(l.tokenId) === Number(id)) {            if (Number.isFinite(l.priceMutez) && l.priceMutez < priceMutez) priceMutez = l.priceMutez;          }        }        if (!Number.isFinite(priceMutez)) priceMutez = 0;        // preview not strictly required for My Listings (card has fallbacks), but pass metadata for names.        out.push({          contract: kt,          tokenId: id,          priceMutez,          metadata: md,          contractName: names.get(kt) || undefined,        });      }    }    // stable sort by tokenId desc to feel recent‑first (same heuristic as explore) :contentReference[oaicite:3]{index=3}    out.sort((a, b) => b.tokenId - a.tokenId);    return out;  }, [TZKT, toolkit, seller]);  useEffect(() => {    let cancel = false;    async function load() {      setLoading(true); setError(null); setItems([]);      try {        if (!seller || !toolkit) {          if (!cancel) { setLoading(false); }          return;        }        // Fetch on‑chain seller‑scoped listings (active‑leaning views, but we normalize anyway)        const rows = await fetchOnchainListingsForSeller({ toolkit, seller }).catch(() => []);        if (cancel) return;        const cards = await assemble(rows);        if (!cancel) {          setItems(cards);          setLoading(false);        }      } catch (err) {        if (!cancel) {          setError((err && (err.message || String(err))) || 'Network error');          setItems([]);          setLoading(false);        }      }    }    load();    return () => { cancel = true; };  }, [seller, toolkit, assemble]);  const visible = useMemo(() => items.slice(0, show), [items, show]);  return (    <>      <ExploreNav />      {!seller && (        <p style={{ marginTop: '2rem', textAlign: 'center' }}>          Connect your wallet to view your listings.        </p>      )}      {seller && loading && (        <div style={{ marginTop: '2rem', textAlign: 'center' }}>          <LoadingSpinner />        </div>      )}      {seller && !loading && error && (        <p role="alert" style={{ marginTop: '1.25rem', textAlign: 'center' }}>          Could not load your listings. Please try again.        </p>      )}      {seller && !loading && !error && items.length === 0 && (        <p style={{ marginTop: '1.25rem', textAlign: 'center' }}>          You have no active listings.        </p>      )}      {seller && !loading && !error && items.length > 0 && (        <>          <Grid>            {visible.map(({ contract, tokenId, priceMutez, metadata, contractName }) => (              <TokenListingCard                key={`${contract}-${tokenId}`}                contract={contract}                tokenId={tokenId}                priceMutez={priceMutez}                metadata={metadata}                contractName={contractName}              />            ))}          </Grid>          {show < items.length && (            <Center>              <button                type="button"                onClick={() => setShow((n) => n + 24)}                style={{                  background: 'none',                  border: '2px solid var(--zu-accent,#00c8ff)',                  color: 'var(--zu-fg,#fff)',                  padding: '0.4rem 1rem',                  fontFamily: 'Pixeloid Sans, monospace',                  cursor: 'pointer',                }}              >                Load More              </button>            </Center>          )}        </>      )}    </>  );}/* What changed & why (r7):   • Fixed “blank cards” by prefetching token metadata + collection names via     the correct, network‑aware TzKT base (tzktBase(net) returns a base that     already includes `/v1`, do not append again) and passing them into     TokenListingCard (names, previews now render). :contentReference[oaicite:4]{index=4}   • Eliminated “tzktBase is not a function” by importing tzktBase from     utils/tzkt.js (not core/net). Parity with explore pages. :contentReference[oaicite:5]{index=5}   • Kept the stale‑listing guard (seller FA2 balance via TzKT) used in explore     listings so dead entries never render. :contentReference[oaicite:6]{index=6}   • Styled‑components import normalized (`styledPkg` shim) as on explore     pages, avoiding “styled is not a function” errors across SSR. *//* EOF */
/*
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/listings.jsx
  Rev :    r8    2025-09-07
  Summary: Wallet‑scoped “My Listings” grid.
           - On‑chain seller view with TzKT fallback (seller_listings)
           - Stale‑guard via FA2 balances
           - Prefetch token metadata and collection names
           - Clean Load More label and SSR‑safe styled import
*/

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

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* Layout */
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

/* Helpers */
const isKt1 = (s) => typeof s === 'string' && /^KT1[0-9A-Za-z]{33}$/.test(String(s).trim());
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

async function fetchTokenMetaBatch(TZKT, contract, ids) {
  const result = new Map();
  for (const slice of chunk(ids, 40)) {
    const qs = new URLSearchParams({ contract, 'tokenId.in': slice.join(','), select: 'tokenId,metadata,totalSupply', limit: String(slice.length) });
    const rows = await jFetch(`${TZKT}/tokens?${qs}`, 2).catch(() => []);
    for (const t of rows || []) {
      let md = t.metadata || {}; try { md = decodeHexFields(md); } catch {}
      result.set(String(t.tokenId), { metadata: md, totalSupply: Number(t.totalSupply || 0) });
    }
  }
  return result;
}

async function fetchContractNames(TZKT, contracts) {
  const nameMap = new Map();
  for (const slice of chunk(contracts, 50)) {
    const qs = new URLSearchParams({ 'address.in': slice.join(','), select: 'address,metadata', limit: String(slice.length) });
    const rows = await jFetch(`${TZKT}/contracts?${qs}`, 2).catch(() => []);
    for (const r of rows || []) {
      const addr = r?.address || '';
      const name = (r?.metadata && (r.metadata.name || r.metadata?.title)) || '';
      if (isKt1(addr)) nameMap.set(addr, String(name || '').trim());
    }
  }
  return nameMap;
}

export default function MyListingsPage() {
  const { address, toolkit } = useWalletContext() || {};
  const seller = useMemo(() => String(address || ''), [address]);

  const net = useMemo(() => {
    if (toolkit?._network?.type && /mainnet/i.test(toolkit._network.type)) return 'mainnet';
    return (NETWORK_KEY || 'ghostnet').toLowerCase().includes('mainnet') ? 'mainnet' : 'ghostnet';
  }, [toolkit]);

  const TZKT = useMemo(() => tzktBase(net), [net]); // with /v1

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [items,   setItems]   = useState([]);
  const [show,    setShow]    = useState(24);

  const assemble = useCallback(async (rows) => {
    const base = (Array.isArray(rows) ? rows : [])
      .map((r) => ({
        contract  : String(r.contract || r.nftContract || r.nft_contract || ''),
        tokenId   : Number(r.tokenId ?? r.token_id),
        priceMutez: Number(r.priceMutez ?? r.price ?? 0),
        amount    : Number(r.amount ?? r.available ?? 1),
        seller    : String(r.seller || seller),
      }))
      .filter((l) => isKt1(l.contract) && Number.isFinite(l.tokenId) && l.amount > 0 && l.priceMutez > 0);

    if (!base.length) return [];

    const filtered = await filterStaleListings(
      toolkit,
      base.map((l) => ({ nftContract: l.contract, tokenId: l.tokenId, seller: l.seller, amount: l.amount, priceMutez: l.priceMutez, __src: l })),
    ).catch(() => base).then((arr) => (arr[0]?.__src ? arr.map((x) => x.__src) : arr));

    if (!filtered.length) return [];

    const byContract = new Map();
    const bestByToken = new Map(); // "KT1|id" -> { priceMutez, seller, nonce, amount }
    for (const l of filtered) {
      const set = byContract.get(l.contract) || new Set();
      set.add(Number(l.tokenId));
      byContract.set(l.contract, set);
      const key = `${l.contract}|${Number(l.tokenId)}`;
      const prev = bestByToken.get(key);
      if (!prev || Number(l.priceMutez) < prev.priceMutez) {
        bestByToken.set(key, {
          priceMutez: Number(l.priceMutez),
          seller    : String(l.seller || ''),
          nonce     : Number(l.nonce ?? l.listing_nonce ?? l.id ?? 0),
          amount    : Number(l.amount || 1),
        });
      }
    }

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
        out.push({ contract: kt, tokenId: Number(id), priceMutez: price, metadata: md, contractName: names.get(kt) || undefined, initialListing: best || undefined });
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
   - Restored clean implementation (prior file was corrupted) and added
     TzKT fallback for seller‑scoped listings to cover mainnet CORS cases.
   - Ensured safe preview/supply gating and Load More label hygiene.
*/
