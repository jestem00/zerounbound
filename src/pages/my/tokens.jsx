/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/tokens.jsx
  Rev :    r18    2025‑07‑31 UTC
  Summary: Optimised My Tokens page with accelerated loading.
           Contract details are fetched in bulk using a single
           address.in query for all unique contracts, reducing
           network round‑trips.  Tokens are filtered to only
           include fully on‑chain NFTs (data URIs only) and any
           token with an ipfs:// URI is ignored immediately.  The
           page computes counts based on fully on‑chain tokens,
           not the total minted or owned tokens, and populates
           minted and owned tabs progressively.  Minted tokens
           never appear in the Owned tab.  See footer for more
           details.
─────────────────────────────────────────────────────────────*/

import React, { useState, useEffect, useMemo } from 'react';
import styledPkg from 'styled-components';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API } from '../../config/deployTarget.js';
import ExploreNav from '../../ui/ExploreNav.jsx';
import PixelHeading from '../../ui/PixelHeading.jsx';
import PixelButton from '../../ui/PixelButton.jsx';
import TokenCard from '../../ui/TokenCard.jsx';
import { jFetch } from '../../core/net.js';
import decodeHexFields from '../../utils/decodeHexFields.js';
import hashMatrix from '../../data/hashMatrix.json';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

// Responsive grid layout matching explore pages (Invariant I105)
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 18vw, 220px), 1fr));
  gap: 1rem;
  width: 100%;
  margin-top: 1rem;
`;

/**
 * Determine if a token’s metadata qualifies as fully on‑chain.  A
 * token is considered fully on‑chain if its metadata contains at
 * least one URI field (artifact/display/image/thumbnail) that
 * begins with the "data:" scheme.  Additionally, if any URI
 * begins with "ipfs:" the token is immediately disqualified.
 * Tokens failing this check are excluded from both lists.
 *
 * @param {object} meta decoded token metadata
 * @returns {boolean}
 */
function isOnChain(meta = {}) {
  const keys = [
    'artifactUri', 'artifact_uri',
    'displayUri', 'display_uri',
    'imageUri', 'image_uri',
    'thumbnailUri', 'thumbnail_uri',
  ];
  let hasData = false;
  for (const k of keys) {
    const val = meta[k];
    if (typeof val === 'string') {
      const s = val.trim().toLowerCase();
      if (s.startsWith('ipfs:')) {
        // any IPFS URI disqualifies the token
        return false;
      }
      if (s.startsWith('data:')) {
        hasData = true;
      }
    }
  }
  return hasData;
}

export default function MyTokens() {
  const { address } = useWalletContext() || {};
  const [filter, setFilter] = useState('creations');
  const [creations, setCreations] = useState([]);
  const [owned, setOwned] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(10);
  // Maintain counts separately so the UI can show totals instantly.
  const [countCreations, setCountCreations] = useState(0);
  const [countOwned, setCountOwned] = useState(0);

  // Precompute valid type hashes from hashMatrix once.
  const validTypeHashes = useMemo(() => new Set(Object.keys(hashMatrix)), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!address) {
        // No wallet: reset all state
        setCreations([]);
        setOwned([]);
        setCountCreations(0);
        setCountOwned(0);
        setVisible(10);
        setLoading(false);
        return;
      }
      // Initialise state
      setLoading(true);
      setCreations([]);
      setOwned([]);
      setVisible(10);
      setCountCreations(0);
      setCountOwned(0);
      try {
        // 1. Fetch tokens minted by the wallet via the creator filter
        const mintedRaw = await jFetch(
          `${TZKT_API}/v1/tokens?creator=${address}&limit=1000&select=contract.address,tokenId,token.metadata`,
        ).catch(() => []);
        const mintedList = Array.isArray(mintedRaw) ? mintedRaw : [];
        const mintedKeys = new Set();
        const mintedQueue = [];
        mintedList.forEach((row) => {
          const c = row.contract?.address ?? row['contract.address'];
          const id = row.tokenId ?? row['tokenId'];
          const meta = row.token?.metadata ?? row['token.metadata'] ?? {};
          if (!c || id == null) return;
          mintedKeys.add(`${c}:${id}`);
          mintedQueue.push({ contract: c, tokenId: String(id), metadata: meta });
        });
        // 2. Fetch balances to identify currently owned tokens
        const balancesRaw = await jFetch(
          `${TZKT_API}/v1/tokens/balances?account=${address}&balance.ne=0&token.standard=fa2&limit=1000&select=token.contract.address,token.tokenId,token.metadata`,
        ).catch(() => []);
        const balanceList = Array.isArray(balancesRaw) ? balancesRaw : [];
        const ownedQueue = [];
        balanceList.forEach((row) => {
          const c = row.token?.contract?.address ?? row['token.contract.address'];
          const id = row.token?.tokenId ?? row['token.tokenId'];
          const meta = row.token?.metadata ?? row['token.metadata'] ?? {};
          if (!c || id == null) return;
          ownedQueue.push({ contract: c, tokenId: String(id), metadata: meta });
        });
        // 3. Fetch wallet alias once for minted detection fallback
        let alias = '';
        try {
          const acc = await jFetch(`${TZKT_API}/v1/accounts/${address}`).catch(() => null);
          if (acc && acc.alias) alias = String(acc.alias);
        } catch {
          alias = '';
        }
        // 4. Build contract info map by fetching all unique contracts at once.
        const allContractsSet = new Set();
        mintedQueue.forEach((t) => allContractsSet.add(t.contract));
        ownedQueue.forEach((t) => allContractsSet.add(t.contract));
        const allContracts = Array.from(allContractsSet);
        const contractInfo = new Map();
        // Determine the maximum group size for the address.in query. We use 50
        // addresses per request to avoid exceeding typical URL length limits.
        const groupSize = 50;
        for (let i = 0; i < allContracts.length; i += groupSize) {
          if (cancelled) return;
          const group = allContracts.slice(i, i + groupSize);
          try {
            const query = group.join(',');
            const res = await jFetch(
              `${TZKT_API}/v1/contracts?address.in=${query}&select=address,typeHash&limit=${group.length}`,
            ).catch(() => []);
            const arr = Array.isArray(res) ? res : [];
            arr.forEach((row) => {
              const addr = row.address;
              contractInfo.set(addr, row);
            });
          } catch {
            // On failure, fallback to individual fetch per address in this group
            await Promise.all(
              group.map(async (addr) => {
                if (contractInfo.has(addr)) return;
                try {
                  const detail = await jFetch(
                    `${TZKT_API}/v1/contracts/${addr}?select=address,typeHash`,
                  ).catch(() => null);
                  if (detail) contractInfo.set(addr, detail);
                } catch {
                  // ignore
                }
              }),
            );
          }
        }
        /**
         * Determine whether metadata indicates the user minted the token
         * via creators/authors arrays.  We classify as minted only if
         * the creators/authors array has a single entry equal to the
         * wallet or alias, or if the first entry matches the wallet.
         * This avoids misclassifying collaborator‑minted tokens.
         */
        function metaMintedByWallet(meta) {
          const lowerAddr = address.toLowerCase();
          const aliasLower = alias ? alias.toLowerCase() : '';
          const creators = Array.isArray(meta.creators) ? meta.creators : [];
          const authors = Array.isArray(meta.authors) ? meta.authors : [];
          const candidates = creators.length ? creators : authors;
          if (!candidates || candidates.length === 0) return false;
          const first = String(candidates[0] ?? '').toLowerCase();
          if (candidates.length === 1) {
            if (first === lowerAddr) return true;
            if (aliasLower) {
              const nd = aliasLower.replace(/\.tez$/, '');
              if (first === aliasLower || first === nd) return true;
            }
            return false;
          }
          if (first === lowerAddr) return true;
          if (aliasLower) {
            const nd = aliasLower.replace(/\.tez$/, '');
            if (first === aliasLower || first === nd) return true;
          }
          return false;
        }
        // 5. Compute counts based on fully on‑chain tokens and
        //    minted fallback detection.  Minted count includes only
        //    tokens from mintedQueue whose contracts are valid and
        //    whose metadata passes the on‑chain filter.  Owned count
        //    includes tokens from ownedQueue that are not in mintedKeys
        //    and that pass the same validations.  Tokens minted via
        //    the creators/authors fallback are classified as
        //    creations, not owned.
        let mintedCountFOC = 0;
        let ownedCountFOC = 0;
        // count minted tokens
        for (const item of mintedQueue) {
          const info = contractInfo.get(item.contract);
          const typeHash = info?.typeHash ?? info?.type_hash;
          if (!typeHash || !validTypeHashes.has(String(typeHash))) continue;
          // decode to check for on‑chain URIs
          let meta;
          try {
            meta = decodeHexFields(item.metadata || {});
          } catch {
            meta = item.metadata || {};
          }
          if (!isOnChain(meta)) continue;
          mintedCountFOC += 1;
        }
        // count owned tokens
        for (const item of ownedQueue) {
          const key = `${item.contract}:${item.tokenId}`;
          if (mintedKeys.has(key)) continue;
          const info = contractInfo.get(item.contract);
          const typeHash = info?.typeHash ?? info?.type_hash;
          if (!typeHash || !validTypeHashes.has(String(typeHash))) continue;
          let meta;
          try {
            meta = decodeHexFields(item.metadata || {});
          } catch {
            meta = item.metadata || {};
          }
          if (!isOnChain(meta)) continue;
          // fallback minted detection
          const isMintFallback = metaMintedByWallet(meta);
          if (isMintFallback) {
            mintedCountFOC += 1;
          } else {
            ownedCountFOC += 1;
          }
        }
        setCountCreations(mintedCountFOC);
        setCountOwned(ownedCountFOC);
        // 6. Stop loading now; tokens will populate progressively.
        setLoading(false);
        // 7. Process minted tokens first; they always go into creations.
        mintedQueue.forEach(async (item) => {
          if (cancelled) return;
          const info = contractInfo.get(item.contract);
          const typeHash = info?.typeHash ?? info?.type_hash;
          if (!typeHash || !validTypeHashes.has(String(typeHash))) return;
          // decode metadata
          let meta;
          try {
            meta = decodeHexFields(item.metadata || {});
          } catch {
            meta = item.metadata || {};
          }
          if (!isOnChain(meta)) return;
          setCreations((prev) => {
            if (prev.some((t) => t.contract === item.contract && t.tokenId === item.tokenId)) return prev;
            return [...prev, { contract: item.contract, tokenId: item.tokenId, metadata: meta }];
          });
        });
        // 8. Process owned tokens; skip tokens that are minted or have invalid contract
        ownedQueue.forEach(async (item) => {
          if (cancelled) return;
          const key = `${item.contract}:${item.tokenId}`;
          if (mintedKeys.has(key)) return; // minted tokens handled above
          const info = contractInfo.get(item.contract);
          const typeHash = info?.typeHash ?? info?.type_hash;
          if (!typeHash || !validTypeHashes.has(String(typeHash))) return;
          let meta;
          try {
            meta = decodeHexFields(item.metadata || {});
          } catch {
            meta = item.metadata || {};
          }
          if (!isOnChain(meta)) return;
          // fallback minted detection by metadata arrays
          const isMintedFallback = metaMintedByWallet(meta);
          if (isMintedFallback) {
            setCreations((prev) => {
              if (prev.some((t) => t.contract === item.contract && t.tokenId === item.tokenId)) return prev;
              return [...prev, { contract: item.contract, tokenId: item.tokenId, metadata: meta }];
            });
          } else {
            setOwned((prev) => {
              if (prev.some((t) => t.contract === item.contract && t.tokenId === item.tokenId)) return prev;
              return [...prev, { contract: item.contract, tokenId: item.tokenId, metadata: meta }];
            });
          }
        });
      } catch (err) {
        console.error('MyTokens load error:', err);
        if (!cancelled) {
          setCreations([]);
          setOwned([]);
          setCountCreations(0);
          setCountOwned(0);
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [address, validTypeHashes]);

  // Determine which list to show based on the current filter
  const currentList = filter === 'creations' ? creations : owned;
  const visibleTokens = currentList.slice(0, visible);
  const loadMore = () => setVisible((v) => v + 10);

  return (
    <div>
      <ExploreNav hideSearch={false} />
      <PixelHeading level={3} style={{ marginTop: '1rem' }}>
        My Tokens
      </PixelHeading>
      <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.4rem' }}>
        <PixelButton
          style={{ background: 'var(--zu-accent-sec)', color: 'var(--zu-btn-fg)' }}
          warning={filter === 'creations'}
          onClick={() => setFilter('creations')}
        >
          My Creations ({countCreations})
        </PixelButton>
        <PixelButton
          style={{ background: 'var(--zu-accent-sec)', color: 'var(--zu-btn-fg)' }}
          warning={filter === 'owned'}
          onClick={() => setFilter('owned')}
        >
          My Owned ({countOwned})
        </PixelButton>
      </div>
      {loading && (
        <p style={{ marginTop: '0.8rem' }}>Fetching your tokens…</p>
      )}
      {!loading && visibleTokens.length > 0 && (
        <>
          <Grid>
            {visibleTokens.map((t) => (
              <TokenCard
                key={`${t.contract}:${t.tokenId}`}
                contractAddress={t.contract}
                token={{ tokenId: Number(t.tokenId), metadata: t.metadata || {} }}
              />
            ))}
          </Grid>
          {visible < currentList.length && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <PixelButton onClick={loadMore}>Load More 🔻</PixelButton>
            </div>
          )}
        </>
      )}
      {!loading && visibleTokens.length === 0 && (
        <p style={{ marginTop: '0.8rem' }}>Loading your tokens…</p>
      )}
    </div>
  );
}

/* What changed & why: r18 – Improved the My Tokens page by
   recalculating counts based only on fully on‑chain tokens.  Minted
   and owned counts now reflect tokens that will actually appear in
   the UI, excluding any off‑chain or invalid contracts and applying
   the metadata fallback check.  The core performance optimisations
   introduced in r17 (bulk contract fetch and ipfs filtering) remain
   unchanged. */
