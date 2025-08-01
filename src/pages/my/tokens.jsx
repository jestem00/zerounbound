/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    zerounbound/src/pages/my/tokens.jsx
  Rev :    r44    2025‑08‑01 UTC
  Summary: Unified minted/firstMinter query with creator parsing.
           This revision returns to the efficient r34 scanning
           approach while incorporating lessons from later
           experiments.  Tokens minted by the connected wallet are
           fetched via both the `creator` and `firstMinter`
           parameters and merged.  Tokens referencing the wallet
           in metadata.creators or authors fields are also
           included.  During token ingestion we decode
           metadata from hex and parse any JSON‑encoded
           creators arrays to ensure tokens like ID 1 on v2
           contracts are found.  Live‑balance filtering remains to
           exclude burn‑only tokens.  Heavy contract‑wide scans
           have been removed for responsiveness.
─────────────────────────────────────────────────────────────*/

import React, {
  useState, useEffect, useMemo,
} from 'react';
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

/* styled-components factory import (Invariant I23) */
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*─ Responsive grid layout matching explore pages (Invariant I105) ─*/
const Grid = styled.div
 `display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(clamp(160px, 18vw, 220px), 1fr)
  );
  gap: 1rem;
  width: 100%;
  margin-top: 1rem;`
;

// Burn address used to filter out destroyed tokens in balance checks
const BURN = 'tz1burnburnburnburnburnburnburjAYjjX';

export default function MyCreationsPage() {
  const { address } = useWalletContext() || {};

  const [creations, setCreations] = useState([]);
  const [countCreations, setCountCreations] = useState(0);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(10);

  // Cache valid type hashes from hashMatrix (performance guard)
  const validTypeHashes = useMemo(() => new Set(Object.keys(hashMatrix)), []);

  useEffect(() => {
    if (!address) {
      setCreations([]);
      setCountCreations(0);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setCreations([]);
      setVisible(10);
      setCountCreations(0);

      // Fetch tokens minted by this address via both creator and
      // firstMinter parameters.  Some contract versions record the
      // initial minter under `firstMinter` while others populate
      // `creator`.  We merge both results to ensure completeness.
      const mintedCreatorRaw = await jFetch(
        `${TZKT_API}/v1/tokens?creator=${address}&limit=1000`,
      ).catch(() => []);
      const mintedFirstRaw = await jFetch(
        `${TZKT_API}/v1/tokens?firstMinter=${address}&limit=1000`,
      ).catch(() => []);

      // Fetch tokens referencing this address in metadata.creators
      // or authors arrays.  These queries work only when the
      // underlying metadata stores creators as an array.  We also
      // merge these results below.
      const creatorsRaw = await jFetch(
        `${TZKT_API}/v1/tokens?metadata.creators.[*]=${address}&limit=1000`,
      ).catch(() => []);
      const authorsRaw = await jFetch(
        `${TZKT_API}/v1/tokens?metadata.authors.[*]=${address}&limit=1000`,
      ).catch(() => []);

      // Normalise lists and deduplicate minted tokens.  Use a Map
      // keyed by contract:tokenId so duplicates across creator and
      // firstMinter results collapse.  When duplicates occur we
      // arbitrarily keep the first occurrence.
      const mintedCreatorList = Array.isArray(mintedCreatorRaw) ? mintedCreatorRaw : [];
      const mintedFirstList  = Array.isArray(mintedFirstRaw)  ? mintedFirstRaw  : [];
      const creatorsList     = Array.isArray(creatorsRaw)     ? creatorsRaw     : [];
      const authorsList      = Array.isArray(authorsRaw)      ? authorsRaw      : [];

      const mintedMap = new Map();
      for (const row of [...mintedCreatorList, ...mintedFirstList]) {
        const c = row.contract?.address;
        const t = row.tokenId;
        if (!c || t === undefined || t === null) continue;
        const key = `${c}:${t}`;
        if (!mintedMap.has(key)) mintedMap.set(key, row);
      }
      const mintedList = Array.from(mintedMap.values());

      // Build a set of all involved contract addresses so we can
      // fetch typeHash information in batches.  Filtering by
      // typeHash prevents unsupported FA2/FA1.2 contracts from
      // polluting the list.
      const contractSet = new Set([
        ...mintedList.map((r) => r.contract?.address),
        ...creatorsList.map((r) => r.contract?.address),
        ...authorsList.map((r) => r.contract?.address),
      ].filter(Boolean));

      const contractInfo = new Map();
      const CHUNK = 50;
      const contractArray = [...contractSet];
      for (let i = 0; i < contractArray.length; i += CHUNK) {
        if (cancelled) return;
        const slice = contractArray.slice(i, i + CHUNK);
        const query = slice.join(',');
        const res = await jFetch(
          `${TZKT_API}/v1/contracts?address.in=${query}&select=address,typeHash&limit=${slice.length}`,
        ).catch(() => []);
        const arr = Array.isArray(res) ? res : [];
        for (const row of arr) {
          contractInfo.set(row.address, row);
        }
      }

      const seen = new Set();
      const tokens = [];

      // Add a token from a TzKT row into our working list.  This
      // function deduplicates tokens, decodes metadata (including
      // hex fields) and parses JSON‑encoded creators arrays.  It
      // also filters out zero‑supply tokens and contracts not in
      // our hashMatrix.
      function addToken(row) {
        const contractAddress = row.contract?.address;
        const tokenId = String(row.tokenId);
        const key = `${contractAddress}:${tokenId}`;
        if (seen.has(key)) return;
        seen.add(key);
        // Skip zero supply outright; burned tokens will be further
        // filtered in a second pass via live balances.
        const supply = row.totalSupply;
        if (String(supply) === '0') return;
        // Type hash guard – exclude any contract not in our hashMatrix
        const info = contractInfo.get(contractAddress);
        const typeHash = String(info?.typeHash ?? '');
        if (!validTypeHashes.has(typeHash)) return;
        // Decode metadata and parse JSON‑encoded creators if needed
        let metadata;
        try {
          metadata = decodeHexFields(row.metadata || {});
        } catch {
          metadata = row.metadata || {};
        }
        if (metadata && typeof metadata.creators === 'string') {
          try {
            const parsed = JSON.parse(metadata.creators);
            if (Array.isArray(parsed)) metadata.creators = parsed;
          } catch {
            /* ignore parse errors */
          }
        }
        tokens.push({
          contract: contractAddress,
          tokenId,
          metadata,
          holdersCount: row.holdersCount,
        });
      }

      // Helper to process each list returned from TzKT
      const addList = (list) => {
        for (const row of list) {
          if (cancelled) return;
          addToken(row);
        }
      };

      // Merge minted, creators and authors lists
      addList(mintedList);
      addList(creatorsList);
      addList(authorsList);

      // Second‑stage filtering: exclude tokens whose only non‑burn
      // holder is the canonical burn address.  Instead of relying on
      // totalMinted vs totalBurned, we inspect live balances and
      // require at least one positive balance belonging to an address
      // other than the burn address.  This logic mirrors
      // listLiveTokenIds.js and resolves corner cases where TzKT
      // metadata fields are incomplete or stale.
      const filtered = [];
      await Promise.all(tokens.map(async (tok) => {
        if (cancelled) return;
        try {
          const balRaw = await jFetch(
            `${TZKT_API}/v1/tokens/balances?token.contract=${tok.contract}` +
            `&token.tokenId=${tok.tokenId}` +
            `&balance.ne=0` +
            `&select=account.address,balance` +
            `&limit=10`,
          ).catch(() => []);
          const balances = Array.isArray(balRaw) ? balRaw : [];
          let hasLiveHolder = false;
          for (const b of balances) {
            const addr = b?.account?.address ?? b['account.address'] ?? '';
            if (addr && addr.toLowerCase() !== BURN.toLowerCase()) {
              hasLiveHolder = true;
              break;
            }
          }
          if (hasLiveHolder) filtered.push(tok);
        } catch {
          // On any error fallback to including the token so that we
          // never accidentally hide a legitimate item.  This is a
          // defensive choice given intermittent API failures.
          filtered.push(tok);
        }
      }));

      if (!cancelled) {
        setCreations(filtered);
        setCountCreations(filtered.length);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [address, validTypeHashes]);

  const visibleTokens = creations.slice(0, visible);
  const loadMore = () => setVisible((v) => v + 10);

  return (
    <div>
      <ExploreNav hideSearch={false} />
      <PixelHeading level={3} style={{ marginTop: '1rem' }}>
        My Creations ({countCreations})
      </PixelHeading>
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
                token={{
                  tokenId: Number(t.tokenId),
                  metadata: t.metadata || {},
                  holdersCount: t.holdersCount,
                }}
              />
            ))}
          </Grid>
          {visible < creations.length && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <PixelButton onClick={loadMore}>Load More 🔻</PixelButton>
            </div>
          )}
        </>
      )}
      {!loading && visibleTokens.length === 0 && (
        <p style={{ marginTop: '0.8rem' }}>No creations match your criteria.</p>
      )}
    </div>
  );
}

/* What changed & why: r44 – Unified minted/firstMinter query with
   creator parsing.  This version reverts to the efficient r34
   approach of fetching tokens minted by the wallet and those
   referencing it in metadata.creators/authors while merging
   minted tokens across both creator and firstMinter fields.  The
   addToken helper now parses JSON‑encoded creators arrays when
   present.  Live‑balance filtering and typeHash guards are
   retained to exclude burn‑only tokens and unsupported
   contracts.  Heavy contract‑wide scans have been removed for
   responsiveness. */
/* EOF */