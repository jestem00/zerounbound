/*
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/u/[address].jsx
  Rev :    r1
  Summary: Minimal user landing page. Resolves .tez and X/Twitter
           alias, shows quick links and recent on‑chain activity via
           TzKT. SSR‑safe and network‑agnostic.
*/

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import styledPkg from 'styled-components';
import ExploreNav from '../../ui/ExploreNav.jsx';
import PixelButton from '../../ui/PixelButton.jsx';
import TokenCard from '../../ui/TokenCard.jsx';
import CollectionCard from '../../ui/CollectionCard.jsx';
import TokenListingCard from '../../ui/TokenListingCard.jsx';
import LoadingSpinner from '../../ui/LoadingSpinner.jsx';
import { tzktBase } from '../../utils/tzkt.js';
import { NETWORK_KEY } from '../../config/deployTarget.js';
import { useTezosDomain } from '../../utils/resolveTezosDomain.js';
import { discoverCreated } from '../../utils/contractDiscovery.js';
import countTokens from '../../utils/countTokens.js';
import listLiveTokenIds from '../../utils/listLiveTokenIds.js';
import { jFetch } from '../../core/net.js';
import decodeHexFields from '../../utils/decodeHexFields.js';
import detectHazards from '../../utils/hazards.js';
import hashMatrix from '../../data/hashMatrix.json';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { fetchOnchainListingsForSeller, filterStaleListings, marketplaceAddr } from '../../core/marketplace.js';
import { fetchSellerListingsViaTzkt } from '../../core/marketplaceHelper.js';
import { listActiveCollections, listListingsForCollectionViaBigmap } from '../../utils/marketplaceListings.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap = styled.main`
  width: 100%;
  max-width: none;
  margin: 0 auto;
  padding: clamp(12px, 2vw, 24px);
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
  color: var(--zu-fg);
`;
const Card = styled.section` border: 2px solid var(--zu-accent); padding: 1rem; background: var(--zu-bg-alt); `;
const Tabs = styled.div` display:flex; flex-wrap:wrap; gap:6px; margin-top:.25rem; `;
const Panel = styled.section` border: 2px solid var(--zu-accent); background: var(--zu-bg-alt); padding: 10px; `;
const Grid = styled.div`
  display:grid; gap:12px; margin-top:.5rem;
  grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 18vw, 220px), 1fr));
`;

// Helpers pulled in parity with explore/tokens.jsx
const ALLOWED_TYPE_HASHES = new Set(
  Object.keys(hashMatrix).filter((k) => /^-?\d+$/.test(k)).map((k) => Number(k))
);
const isDataUri = (str='') => typeof str === 'string'
  && /^data:(image|video|audio|text\/html|image\/svg\+xml)/i.test(str.trim());
function hasRenderablePreview(m = {}) {
  const keys = ['displayUri','display_uri','imageUri','image_uri','image','thumbnailUri','thumbnail_uri','artifactUri','artifact_uri','mediaUri','media_uri'];
  for (const k of keys) {
    const v = m && typeof m === 'object' ? m[k] : null;
    if (isDataUri(v) || (typeof v === 'string' && /^tezos-storage:/i.test(v.trim()))) return true;
  }
  if (Array.isArray(m?.formats)) {
    for (const f of m.formats) {
      const cand = f?.uri || f?.url;
      if (isDataUri(cand) || (typeof cand === 'string' && /^tezos-storage:/i.test(String(cand).trim()))) return true;
    }
  }
  return false;
}
const toArr = (src) => {
  if (Array.isArray(src)) return src;
  if (typeof src === 'string') { try { const j = JSON.parse(src); return Array.isArray(j) ? j : [src]; } catch { return [src]; } }
  if (src && typeof src === 'object') return Object.values(src);
  return [];
};
function mintedByUser(t = {}, addr = '') {
  if (!addr) return false;
  const A = String(addr).toLowerCase();
  const c = String(t.creator || '').toLowerCase();
  const f = String(t.firstMinter || '').toLowerCase();
  if (c === A || f === A) return true;
  const md = t.metadata || {};
  const creators = toArr(md.creators).map(String);
  const authors  = toArr(md.authors).map(String);
  return creators.some((x) => x.toLowerCase() === A) || authors.some((x) => x.toLowerCase() === A);
}

async function fetchAlias(addr) {
  try {
    const j = await jFetch(`/api/handle/${addr}`, 1);
    const alias = j?.alias || null;
    let handle = j?.handle || null;
    if (!handle && typeof alias === 'string' && alias.startsWith('@')) handle = alias.slice(1);
    return { alias, handle };
  } catch { return { alias: null, handle: null }; }
}

export default function UserPage() {
  const router = useRouter();
  const address = String(router.query.address || '');
  const [alias, setAlias] = useState('');
  const [handle, setHandle] = useState('');
  const domain = useTezosDomain(address, NETWORK_KEY);
  const base = tzktBase(NETWORK_KEY);
  // no ops list here; dashboard tabs are shown instead
  const [tab, setTab] = useState('collections'); // 'collections' | 'tokens' | 'listings'

  // collections state
  const [cols, setCols] = useState([]);
  const [colsLoad, setColsLoad] = useState(false);

  // tokens state (simple mint-by filter)
  const [toks, setToks] = useState([]);
  const [toksLoad, setToksLoad] = useState(false);

  // listings state (seller filter)
  const { toolkit } = useWalletContext() || {};
  const [lists, setLists] = useState([]);
  const [listsLoad, setListsLoad] = useState(false);

  useEffect(() => { if (address) fetchAlias(address).then((r)=>{ if (r?.alias) setAlias(r.alias); if (r?.handle) setHandle(r.handle); }); }, [address]);
  // lazy load tabs
  useEffect(() => {
    if (!address) return;
    // Collections
    if (tab === 'collections' && cols.length === 0 && !colsLoad) {
      setColsLoad(true);
      (async () => {
        try {
          const net = base.includes('ghostnet') ? 'ghostnet' : 'mainnet';
          const arr = await discoverCreated(address, net).catch(() => []);
          const filtered = [];
          // Filter out empty/broken collections by counting live tokens
          for (const c of (Array.isArray(arr) ? arr : [])) {
            try {
              const n = await countTokens(c.address, net);
              if (Number(n) > 0) filtered.push({ address: c.address, live: Number(n) });
            } catch { /* skip on error */ }
          }
          setCols(filtered);
        } finally { setColsLoad(false); }
      })();
    }
    // Tokens (admin-filter parity with explore/tokens)
    if (tab === 'tokens' && toks.length === 0 && !toksLoad) {
      setToksLoad(true);
      (async () => {
        try {
          const qs = [
            `${base}/tokens?creator=${encodeURIComponent(address)}&standard=fa2&limit=1000&sort.desc=firstTime`,
            `${base}/tokens?firstMinter=${encodeURIComponent(address)}&standard=fa2&limit=1000&sort.desc=firstTime`,
            `${base}/tokens?metadata.creators.contains=${encodeURIComponent(address)}&standard=fa2&limit=1000&sort.desc=firstTime`,
            `${base}/tokens?metadata.authors.contains=${encodeURIComponent(address)}&standard=fa2&limit=1000&sort.desc=firstTime`,
          ];
          const batches = await Promise.all(qs.map((u) => jFetch(u).catch(() => [])));
          const merged = [].concat(...batches.filter(Array.isArray));

          const out = [];
          const seen = new Set();
          for (const r of merged) {
            const typeHash = Number(r.contract?.typeHash ?? NaN);
            if (Number.isFinite(typeHash) && !ALLOWED_TYPE_HASHES.has(typeHash)) continue;
            const kt = r.contract?.address || r.contract;
            const id = Number(r.tokenId);
            if (!kt || !Number.isFinite(id)) continue;
            // normalize + guard (match explore)
            let md = r.metadata || {};
            try { md = decodeHexFields(md); } catch {}
            if (detectHazards(md).broken) continue;
            if (!hasRenderablePreview(md)) continue;
            if (Number(r.totalSupply || 0) === 0) continue;
            const t = { contract: kt, tokenId: id, metadata: md, creator: r.creator, firstMinter: r.firstMinter, firstTime: r.firstTime };
            if (!mintedByUser(t, address)) continue;
            const key = `${kt}:${id}`; if (seen.has(key)) continue; seen.add(key);
            out.push(t);
          }
          // Hide fully-burned via live-id sets (parity with explore)
          const net = base.includes('ghostnet') ? 'ghostnet' : 'mainnet';
          const byC = new Map();
          for (const t of out) {
            const set = byC.get(t.contract) || new Set();
            set.add(Number(t.tokenId)); byC.set(t.contract, set);
          }
          const keep = [];
          for (const [kt] of byC.entries()) {
            let live = [];
            try { live = await listLiveTokenIds(kt, net, false); } catch { live = []; }
            const liveSet = new Set(live.map(Number));
            for (const t of out) if (t.contract === kt && liveSet.has(Number(t.tokenId))) keep.push(t);
          }
          keep.sort((a, b) => (b.tokenId - a.tokenId) || (a.contract > b.contract ? -1 : 1));
          setToks(keep);
        } finally { setToksLoad(false); }
      })();
    }
    // Listings (seller address)
    if (tab === 'listings' && lists.length === 0 && !listsLoad) {
      setListsLoad(true);
      (async () => {
        try {
          const net = base.includes('ghostnet') ? 'ghostnet' : 'mainnet';
          const rawOn  = await fetchOnchainListingsForSeller({ toolkit: toolkit || { _network: { type: net } }, seller: address }).catch(() => []);
          const rawTzk = await fetchSellerListingsViaTzkt(address, net).catch(() => []);
          // Merge and dedupe by (contract, tokenId, seller, nonce)
          const merge = new Map();
          const push = (r) => {
            const kt  = r.contract || r.nftContract || r.nft_contract;
            const id  = Number(r.tokenId ?? r.token_id);
            const s   = String(r.seller || '');
            const n   = Number(r.nonce ?? r.listing_nonce ?? r.id ?? 0);
            if (!kt || !Number.isFinite(id)) return;
            const key = `${kt}|${id}|${s}|${n}`;
            if (!merge.has(key)) merge.set(key, r);
          };
          (rawOn || []).forEach(push);
          (rawTzk || []).forEach(push);

          // Fallback 1: query marketplace listings map filtered by seller
          try {
            const mkt = marketplaceAddr(net);
            if (mkt && /^KT1[0-9A-Za-z]{33}$/i.test(mkt)) {
              const idxRows = await jFetch(`${base}/contracts/${mkt}/bigmaps?select=path,ptr,id,active&limit=200`, 1).catch(() => []);
              const listingsPtr = (idxRows || []).reduce((ptr, r) => (ptr || ((r?.path === 'listings' || r?.name === 'listings') ? (r?.ptr ?? r?.id) : null)), null);
              if (Number.isFinite(Number(listingsPtr))) {
                const rows = await jFetch(`${base}/bigmaps/${listingsPtr}/keys?active=true&select=key,value&value.seller=${encodeURIComponent(address)}&limit=10000`, 1).catch(() => []);
                const addrFromKey = (key) => {
                  if (typeof key === 'string' && /^KT1[0-9A-Za-z]{33}$/i.test(key)) return key;
                  if (key && typeof key === 'object') {
                    if (key.address && /^KT1[0-9A-Za-z]{33}$/i.test(key.address)) return key.address;
                    if (key.value && /^KT1[0-9A-Za-z]{33}$/i.test(key.value)) return key.value;
                    if (Array.isArray(key)) {
                      for (const it of key) {
                        const v = addrFromKey(it); if (v) return v;
                      }
                    } else if (key.string && /^KT1[0-9A-Za-z]{33}$/i.test(key.string)) return key.string;
                  }
                  return '';
                };
                for (const entry of (rows || [])) {
                  const kt = addrFromKey(entry?.key);
                  const val = entry?.value;
                  if (!kt || !val || typeof val !== 'object') continue;
                  for (const [nonceKey, listing] of Object.entries(val)) {
                    if (!listing || typeof listing !== 'object') continue;
                    const id = Number(listing.token_id ?? listing.tokenId ?? listing?.token?.id);
                  const price = Number(listing.price ?? listing.priceMutez);
                  const amount = Number(listing.amount ?? listing.quantity ?? listing.amountTokens ?? 0);
                  const sellerField = listing.seller || listing.owner || listing.address || '';
                  const seller = typeof sellerField === 'string' ? sellerField : '';
                  const active = !!(listing.active ?? listing.is_active ?? true);
                  const nonce = Number(listing.nonce ?? listing.listing_nonce ?? nonceKey);
                  if (!Number.isFinite(id) || !Number.isFinite(price) || amount <= 0 || !active) continue;
                  if (!seller || seller.toLowerCase() !== address.toLowerCase()) continue;
                  push({ contract: kt, tokenId: id, priceMutez: price, amount, seller, nonce, active: true });
                  }
                }
              }
            }
          } catch { /* ignore */ }

          // Fallback 2: scan active collections and filter by seller (parity with Explore)
          try {
            // Avoid metadata-filtered discovery (causes 404 and misses). Use raw set.
            const candidates = await listActiveCollections(net, false).catch(() => []);
            for (const kt of candidates || []) {
              const rows = await listListingsForCollectionViaBigmap(kt, net).catch(() => []);
              for (const r of rows || []) {
                if (String(r?.seller || '').toLowerCase() === address.toLowerCase()) push(r);
              }
            }
          } catch { /* ignore */ }
          const raw = [...merge.values()];
          // Normalize + stale filter using marketplace helper
          // Extract true seller (never substitute page address);
          // Partial‑stock‑safe (≥1) like Explore
          const forFilter = (raw || [])
            .map((l) => ({
              nftContract: l.contract || l.nftContract || l.nft_contract,
              tokenId    : Number(l.tokenId ?? l.token_id),
              seller     : String(l.seller || l.owner || l.address || ''),
              amount     : 1,
              priceMutez : Number(l.priceMutez ?? l.price ?? 0),
              __src      : l,
            }))
            .filter((r) => r.seller && r.nftContract && Number.isFinite(r.tokenId) && Number.isFinite(r.priceMutez));
          const filtered = await filterStaleListings(toolkit, forFilter).catch(() => raw || []);
          const keep = (filtered || []).map((x) => x.__src || x);
          // group by (kt,id) pick lowest price and fetch metadata
          const byC = new Map();
          const price = new Map();          // global lowest price per (kt|id)
          const best  = new Map();          // global best listing row per (kt|id)
          const bestMine = new Map();       // seller-specific best listing per (kt|id)
          for (const r of keep) {
            const kt = r.contract || r.nftContract || r.nft_contract; const id = Number(r.tokenId ?? r.token_id);
            const p = Number(r.priceMutez ?? r.price ?? 0);
            if (!kt || !Number.isFinite(id) || !(p > 0)) continue;
            const k = `${kt}|${id}`;
            const prev = price.get(k);
            if (prev == null || p < prev) price.set(k, p);
            const prevBest = best.get(k);
            const s = String(r.seller || r.owner || r.address || '');
            const n = Number(r.nonce ?? r.listing_nonce ?? r.id ?? 0);
            if (!s || !Number.isFinite(n)) continue;
            if (!prevBest || p < prevBest.priceMutez) best.set(k, { priceMutez: p, seller: s, nonce: n, amount: Number(r.amount ?? 1) });

            // Track best listing for this dashboard's seller specifically
            if (s.toLowerCase() === address.toLowerCase()) {
              const prevMine = bestMine.get(k);
              if (!prevMine || p < prevMine.priceMutez) bestMine.set(k, { priceMutez: p, seller: s, nonce: n, amount: Number(r.amount ?? 1) });
            }
            const set = byC.get(kt) || new Set(); set.add(id); byC.set(kt, set);
          }
          const cards = [];
          for (const [kt, idSet] of byC.entries()) {
            const ids = [...idSet];
            const qs = new URLSearchParams({ contract: kt, 'tokenId.in': ids.join(','), select: 'tokenId,metadata,totalSupply' });
            const rows = await jFetch(`${base}/tokens?${qs}`, 2).catch(() => []);
            for (const t of rows || []) {
              let md = t.metadata || {}; try { md = decodeHexFields(md); } catch {}
              if (detectHazards(md).broken) continue; if (Number(t.totalSupply||0) === 0) continue;
              const k = `${kt}|${t.tokenId}`;
              // Display seller-specific price when present; fall back to global lowest
              const mine = bestMine.get(k);
              const pMutez = (mine?.priceMutez != null ? mine.priceMutez : (price.get(k) || 0));
              // Seed only when we have a canonical pair; prefer seller-specific seed
              const seed = (mine && mine.seller && Number.isFinite(mine.nonce)) ? mine : best.get(k);
              cards.push({
                contract: kt,
                tokenId: Number(t.tokenId),
                priceMutez: pMutez,
                metadata: md,
                initialListing: seed,
              });
            }
          }
          cards.sort((a, b) => b.tokenId - a.tokenId);
          try {
            if (typeof window !== 'undefined' && window.localStorage?.getItem('zu:debugListings') === '1') {
              // eslint-disable-next-line no-console
              console.info('[ListingsDbg] dashboard assembled', cards.map((c) => ({
                contract: c.contract, tokenId: c.tokenId, price: c.priceMutez,
                seed: c.initialListing ? { seller: c.initialListing.seller, nonce: c.initialListing.nonce, amount: c.initialListing.amount } : null,
              })));
            }
          } catch {}
          // Canonicalize seeds with resolver used by Explore
          const canonical = await Promise.all(cards.map(async (c) => {
            // Trust existing canonical seed for this seller
            if (c.initialListing && c.initialListing.seller && Number.isFinite(Number(c.initialListing.nonce))) {
              return c;
            }
            try {
              // Prefer this seller's listings only (no cross‑seller lowest)
              const sellerRows = await fetchSellerListingsViaTzkt(address, net).catch(() => []);
              const mineForToken = (sellerRows || []).filter((l) => (
                String(l.contract || l.nftContract || l.nft_contract) === String(c.contract)
                && Number(l.tokenId ?? l.token_id) === Number(c.tokenId)
              ));
              if (mineForToken.length) {
                const lowest = mineForToken.reduce((m, cur) => (Number(cur.priceMutez ?? cur.price) < Number(m.priceMutez ?? m.price) ? cur : m));
                const seed = {
                  seller    : String(lowest.seller || ''),
                  nonce     : Number(lowest.nonce ?? lowest.listing_nonce ?? lowest.id ?? 0),
                  priceMutez: Number(lowest.priceMutez ?? lowest.price ?? 0),
                  amount    : Number(lowest.amount ?? lowest.quantity ?? 1),
                };
                if (seed.seller && Number.isFinite(seed.nonce) && seed.priceMutez > 0) {
                  try {
                    if (typeof window !== 'undefined' && window.localStorage?.getItem('zu:debugListings') === '1') {
                      // eslint-disable-next-line no-console
                      console.info('[ListingsDbg] canonical seed (sellerRows)', { contract: c.contract, tokenId: c.tokenId, seed });
                    }
                  } catch {}
                  return { ...c, initialListing: seed };
                }
              }
              // Fallback once: unlocked lowest without stale filter, but only adopt if seller matches dashboard address
              const any = await fetchLowestListing({ toolkit, nftContract: c.contract, tokenId: c.tokenId, staleCheck: false }).catch(() => null);
              if (any && String(any.seller || '').toLowerCase() === String(address).toLowerCase()) {
                try {
                  if (typeof window !== 'undefined' && window.localStorage?.getItem('zu:debugListings') === '1') {
                    // eslint-disable-next-line no-console
                    console.info('[ListingsDbg] canonical seed (fallback any)', { contract: c.contract, tokenId: c.tokenId, seed: any });
                  }
                } catch {}
                return { ...c, initialListing: { ...any } };
              }
            } catch {}
            return c; // leave unseeded; card polling/JIT will resolve
          }));
          setLists(canonical);
        } finally { setListsLoad(false); }
      })();
    }
  }, [address, base, tab, cols.length, colsLoad, toks.length, toksLoad, lists.length, listsLoad, toolkit]);

  return (
    <>
      <ExploreNav />
      <Wrap>
        <Card>
          <h2 style={{ marginTop: 0 }}>Profile</h2>
          <div><strong>Address:</strong> <code>{address}</code></div>
          {domain && (<div><strong>.tez:</strong> {domain}</div>)}
          {alias && (
            <div>
              <strong>Alias:</strong>{' '}
              {handle || alias.startsWith('@') ? (
                <a
                  href={`https://twitter.com/${encodeURIComponent(handle || alias.replace(/^@/, ''))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--zu-accent-sec)', textDecoration: 'none' }}
                  title={`Open @${handle || alias.replace(/^@/, '')} on X`}
                >
                  {alias}
                </a>
              ) : (
                alias
              )}
            </div>
          )}
          <div style={{ marginTop: '.5rem' }}>
            <a href={`https://tzkt.io/${address}`} target="_blank" rel="noopener noreferrer">TzKT ↗</a>
            {' · '}
            <a href={`https://objkt.com/profile/${address}`} target="_blank" rel="noopener noreferrer">OBJKT ↗</a>
          </div>
        </Card>
        <Card>
          <h3 style={{ margin: '0 0 6px' }}>Dashboard</h3>
          <Tabs>
            <PixelButton size="xs" noActiveFx onClick={() => setTab('collections')} aria-pressed={tab==='collections'}>Collections</PixelButton>
            <PixelButton size="xs" noActiveFx onClick={() => setTab('tokens')} aria-pressed={tab==='tokens'}>Tokens</PixelButton>
            <PixelButton size="xs" noActiveFx onClick={() => setTab('listings')} aria-pressed={tab==='listings'}>Listings</PixelButton>
          </Tabs>

          {tab === 'collections' && (
            <Panel>
              {colsLoad && <div style={{ textAlign:'center', margin:'1rem 0' }}><LoadingSpinner /></div>}
              {!colsLoad && cols.length === 0 && <p style={{opacity:.9}}>No collections found for this admin.</p>}
              {!colsLoad && cols.length > 0 && (
                <Grid>
                  {cols.map((c) => (
                    <CollectionCard key={c.address} contract={{ address: c.address }} initialTokensCount={c.live} />
                  ))}
                </Grid>
              )}
            </Panel>
          )}

          {tab === 'tokens' && (
            <Panel>
              {toksLoad && <div style={{ textAlign:'center', margin:'1rem 0' }}><LoadingSpinner /></div>}
              {!toksLoad && toks.length === 0 && <p style={{opacity:.9}}>No tokens found for this creator.</p>}
              {!toksLoad && toks.length > 0 && (
                <Grid>
                  {toks.map((t) => (
                    <TokenCard
                      key={`${t.contract}:${t.tokenId}`}
                      contractAddress={t.contract}
                      token={{ tokenId: t.tokenId, metadata: t.metadata }}
                    />
                  ))}
                </Grid>
              )}
            </Panel>
          )}

          {tab === 'listings' && (
            <Panel>
              {listsLoad && <div style={{ textAlign:'center', margin:'1rem 0' }}><LoadingSpinner /></div>}
              {!listsLoad && lists.length === 0 && <p style={{opacity:.9}}>No active listings by this user.</p>}
              {!listsLoad && lists.length > 0 && (
                <Grid>
                  {lists.map((l) => (
                    <TokenListingCard
                      key={`${l.contract}:${l.tokenId}`}
                      contract={l.contract}
                      tokenId={l.tokenId}
                      priceMutez={l.priceMutez}
                      metadata={l.metadata}
                      initialListing={l.initialListing}
                      expectedSeller={address}
                    />
                  ))}
                </Grid>
              )}
            </Panel>
          )}
        </Card>
      </Wrap>
    </>
  );
}
