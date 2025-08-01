/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/tokens.jsx
  Rev :    r16    2025‑07‑31 UTC
  Summary: Fresh implementation of the My Tokens page.  The page
           distinguishes between NFTs minted by the connected
           wallet and NFTs currently owned.  Minted tokens are
           fetched directly via the TzKT creator endpoint, while
           owned tokens come from the FA2 balance endpoint.  Only
           ZeroContract deployments (v1–v4d) are included by
           verifying each contract’s typeHash against hashMatrix and
           ensuring the token’s artifact URI is fully on‑chain.
           Tokens load progressively into their respective lists to
           avoid long blank states.  Minted tokens do not appear in
           the Owned tab, even if still held.
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
 * token is considered on‑chain if its metadata contains at least one
 * URI field (artifact/display/image/thumbnail) starting with
 * “data:”.  Keys are tested in both camelCase and snake_case forms.
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
  return keys.some((k) => {
    const val = meta[k];
    return typeof val === 'string' && val.trim().toLowerCase().startsWith('data:');
  });
}

export default function MyTokens() {
  const { address } = useWalletContext() || {};
  const [filter, setFilter] = useState('creations');
  const [creations, setCreations] = useState([]);
  const [owned, setOwned] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(10);

  // Precompute valid type hashes from hashMatrix once.
  const validTypeHashes = useMemo(() => new Set(Object.keys(hashMatrix)), []);

  useEffect(() => {
    let cancelled = false;
    async function loadTokens() {
      if (!address) {
      // No wallet: clear state
        setCreations([]);
        setOwned([]);
        setVisible(10);
        setLoading(false);
        return;
      }
      // Reset state and begin loading
      setLoading(true);
      setCreations([]);
      setOwned([]);
      setVisible(10);
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
        // 3. Prepare a contract info map; fetch details on demand
        const contractInfo = new Map();
        // 4. Fetch wallet alias once for minted detection fallback
        let alias = '';
        try {
          const acc = await jFetch(`${TZKT_API}/v1/accounts/${address}`).catch(() => null);
          if (acc && acc.alias) alias = String(acc.alias);
        } catch {
          alias = '';
        }
        /**
         * Determine whether metadata indicates the user minted the token
         * via creators/authors arrays.  We classify as minted only if
         * the creators/authors array has a single entry equal to the
         * wallet or alias, or if the first entry matches the wallet.
         * This avoids misclassifying collaborator-minted tokens.
         */
        function metaMintedByWallet(meta) {
          const lowerAddr = address.toLowerCase();
          const aliasLower = alias ? alias.toLowerCase() : '';
          // direct keys handled via mintedKeys; arrays used as fallback
          const creators = Array.isArray(meta.creators) ? meta.creators : [];
          const authors  = Array.isArray(meta.authors)  ? meta.authors  : [];
          const candidates = creators.length ? creators : authors;
          if (!candidates || candidates.length === 0) return false;
          const first = String(candidates[0]).toLowerCase();
          if (candidates.length === 1) {
            if (first === lowerAddr) return true;
            if (aliasLower) {
              const nd = aliasLower.replace(/\.tez$/, '');
              if (first === aliasLower || first === nd) return true;
            }
            return false;
          }
          // When multiple creators exist, only count minted if the
          // wallet is the first creator
          if (first === lowerAddr) return true;
          if (aliasLower) {
            const nd = aliasLower.replace(/\.tez$/, '');
            if (first === aliasLower || first === nd) return true;
          }
          return false;
        }
        // 5. Asynchronously process a token and update state
        async function processToken(item, forceMint) {
          if (cancelled) return;
          // fetch contract detail if not cached
          let info = contractInfo.get(item.contract);
          if (!info) {
            try {
              info = await jFetch(`${TZKT_API}/v1/contracts/${item.contract}`).catch(() => null);
              contractInfo.set(item.contract, info);
            } catch {
              info = null;
              contractInfo.set(item.contract, null);
            }
          }
          if (!info) return;
          const typeHash = info.typeHash ?? info.type_hash;
          if (!typeHash || !validTypeHashes.has(String(typeHash))) return;
          // decode metadata
          let meta;
          try {
            meta = decodeHexFields(item.metadata || {});
          } catch {
            meta = item.metadata || {};
          }
          if (!isOnChain(meta)) return;
          // classify as minted if forced, mintedKeys contains key, or metadata fallback
          const key = `${item.contract}:${item.tokenId}`;
          const isMinted = forceMint || mintedKeys.has(key) || metaMintedByWallet(meta);
          if (isMinted) {
            setCreations((prev) => {
              if (prev.some((t) => t.contract === item.contract && t.tokenId === item.tokenId)) return prev;
              return [...prev, { contract: item.contract, tokenId: item.tokenId, metadata: meta }];
            });
          } else {
            setOwned((prev) => {
              if (mintedKeys.has(key) || prev.some((t) => t.contract === item.contract && t.tokenId === item.tokenId)) return prev;
              return [...prev, { contract: item.contract, tokenId: item.tokenId, metadata: meta }];
            });
          }
        }
        // 6. Stop loading; tokens will fill lists progressively
        setLoading(false);
        // 7. Kick off classification asynchronously for minted and owned tokens
        mintedQueue.forEach((item) => {
          // always mark minted tokens as forceMint
          processToken(item, true);
        });
        ownedQueue.forEach((item) => {
          processToken(item, false);
        });
      } catch (err) {
        console.error('MyTokens load error:', err);
        if (!cancelled) {
          setCreations([]);
          setOwned([]);
          setLoading(false);
        }
      }
    }
    loadTokens();
    return () => {
      cancelled = true;
    };
  }, [address, validTypeHashes]);

  // Choose which list to show based on the current filter
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
          My Creations ({creations.length})
        </PixelButton>
        <PixelButton
          style={{ background: 'var(--zu-accent-sec)', color: 'var(--zu-btn-fg)' }}
          warning={filter === 'owned'}
          onClick={() => setFilter('owned')}
        >
          My Owned ({owned.length})
        </PixelButton>
      </div>
      {loading && (
        <p style={{ marginTop: '0.8rem' }}>Fetching your tokens…</p>
      )}
      {!loading && currentList.length === 0 && (
        <p style={{ marginTop: '0.8rem' }}>
          {filter === 'creations'
            ? 'You have not minted any tokens yet.'
            : 'You do not own any tokens yet.'}
        </p>
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
    </div>
  );
}

/* What changed & why: r16 – Enhanced the My Tokens page to provide
   true progressive loading and more robust minted detection.
   Contract details are fetched lazily per token, metadata fallback
   logic recognises tokens minted via early contract versions
   (creators arrays), and tokens start to appear as soon as they
   are processed, rather than waiting for all network calls to
   complete.  Minted tokens never populate the Owned tab, and
   fully on‑chain filtering remains enforced. */
