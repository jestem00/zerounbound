/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/tokens.jsx
  Rev :    r32    2025‑08‑02 UTC
  Summary: Combine account-owner filtering with balance checks.
           Tokens whose sole owner (account.address) is the burn
           address are immediately skipped; additionally, we still
           query non-zero balances to catch corner cases.  This
           resolves lingering burned tokens and maintains the full
           metadata/unified query logic.
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

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*─ Responsive grid layout matching explore pages (Invariant I105) ─*/
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

const BURN = 'tz1burnburnburnburnburnburnburjAYjjX';

export default function MyCreationsPage() {
  const { address } = useWalletContext() || {};

  const [creations, setCreations] = useState([]);
  const [countCreations, setCountCreations] = useState(0);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(10);

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

      const mintedRaw = await jFetch(
        `${TZKT_API}/v1/tokens?creator=${address}&limit=1000`,
      ).catch(() => []);

      const creatorsRaw = await jFetch(
        `${TZKT_API}/v1/tokens?metadata.creators.[*]=${address}&limit=1000`,
      ).catch(() => []);

      const authorsRaw = await jFetch(
        `${TZKT_API}/v1/tokens?metadata.authors.[*]=${address}&limit=1000`,
      ).catch(() => []);

      const mintedList = Array.isArray(mintedRaw) ? mintedRaw : [];
      const creatorsList = Array.isArray(creatorsRaw) ? creatorsRaw : [];
      const authorsList = Array.isArray(authorsRaw) ? authorsRaw : [];

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
      function addToken(contractAddress, tokenId, rawMeta, holdersCount, accountAddr) {
        const key = `${contractAddress}:${tokenId}`;
        if (seen.has(key)) return;
        seen.add(key);
        // Skip immediately if the sole account owner is burn
        if (accountAddr && accountAddr.toLowerCase() === BURN.toLowerCase()) return;
        let metadata;
        try {
          metadata = decodeHexFields(rawMeta || {});
        } catch {
          metadata = rawMeta || {};
        }
        tokens.push({
          contract: contractAddress,
          tokenId: String(tokenId),
          metadata,
          holdersCount,
        });
      }

      const addList = (list) => {
        for (const row of list) {
          if (cancelled) return;
          const supply = row.totalSupply;
          if (String(supply) === '0') continue;

          const c = row.contract?.address;
          const t = row.tokenId;
          const h = row.holdersCount;
          const meta = row.metadata ?? {};
          const accountAddr = row.account?.address;
          const info = contractInfo.get(c);
          const typeHash = String(info?.typeHash ?? info?.type_hash ?? '');
          if (!validTypeHashes.has(typeHash)) continue;
          addToken(c, t, meta, h, accountAddr);
        }
      };

      addList(mintedList);
      addList(creatorsList);
      addList(authorsList);

      // Second-stage check: filter tokens whose only non-zero balance is burn
      const filtered = [];
      await Promise.all(tokens.map(async (tok) => {
        if (cancelled) return;
        const balRaw = await jFetch(
          `${TZKT_API}/v1/tokens/balances?token.contract=${tok.contract}`
          + `&token.tokenId=${tok.tokenId}`
          + '&balance.ne=0'
          + '&select=account.address,balance'
          + '&limit=10',
        ).catch(() => []);
        const balances = Array.isArray(balRaw) ? balRaw : [];
        if (balances.length === 1) {
          const addr = balances[0].account?.address ?? '';
          if (addr.toLowerCase() === BURN.toLowerCase()) return;
        }
        filtered.push(tok);
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
        My Creations&nbsp;({countCreations})
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

/* What changed & why: r32 – Added a first-pass owner check using
   `row.account.address` to skip tokens immediately if the sole owner
   is the burn address.  This, combined with the existing non-zero
   balance check, ensures that destroyed tokens never reach the UI.
*/
/* EOF */
