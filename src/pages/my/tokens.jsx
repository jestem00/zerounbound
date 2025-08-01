/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/tokens.jsx
  Rev :    r45    2025‑08‑XX UTC
  Summary: Added a second tab to display NFTs owned (purchased or
           gifted) by the connected wallet.  The page now fetches
           both creations (minted or authored by the wallet) and
           owned tokens.  For owned tokens, it queries the
           /v1/tokens/balances endpoint, filters out tokens where
           the wallet is the creator or firstMinter, decodes
           metadata, parses JSON‑encoded creators arrays, validates
           on‑chain media previews (JPEG/PNG/GIF/BMP/WebP) and
           excludes unsupported contracts or zero‑supply tokens.
           A tab selector allows switching between “My Creations”
           and “My Owned”, with live counts and infinite scroll.
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
    margin-top: 1rem;`;

// Burn address used to filter out destroyed tokens in balance checks
const BURN = 'tz1burnburnburnburnburnburnburjAYjjX';

export default function MyTokensPage() {
  const { address } = useWalletContext() || {};
  // Tab state: 'creations' or 'owned'
  const [tab, setTab] = useState('creations');
  // Lists for creations and owned tokens
  const [creations, setCreations] = useState([]);
  const [owned, setOwned] = useState([]);
  // Counts for tabs
  const [countCreations, setCountCreations] = useState(0);
  const [countOwned, setCountOwned] = useState(0);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(10);
  // Cache valid type hashes from hashMatrix (performance guard)
  const validTypeHashes = useMemo(() => new Set(Object.keys(hashMatrix)), []);

  useEffect(() => {
    if (!address) {
      setCreations([]);
      setOwned([]);
      setCountCreations(0);
      setCountOwned(0);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setCreations([]);
      setOwned([]);
      setVisible(10);
      setCountCreations(0);
      setCountOwned(0);
      // Helper: validate data URI previews (JPEG/PNG/GIF/BMP/WebP)
      const isValidPreview = (m = {}) => {
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
          const b64 = uri.slice(comma + 1);
          let binary;
          if (typeof atob === 'function') {
            binary = atob(b64);
          } else {
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
      };
      // === Fetch creations ===
      const mintedCreatorRaw = await jFetch(
        `${TZKT_API}/v1/tokens?creator=${address}&limit=1000`,
      ).catch(() => []);
      const mintedFirstRaw = await jFetch(
        `${TZKT_API}/v1/tokens?firstMinter=${address}&limit=1000`,
      ).catch(() => []);
      const creatorsRaw = await jFetch(
        `${TZKT_API}/v1/tokens?metadata.creators.[*]=${address}&limit=1000`,
      ).catch(() => []);
      const authorsRaw = await jFetch(
        `${TZKT_API}/v1/tokens?metadata.authors.[*]=${address}&limit=1000`,
      ).catch(() => []);
      const mCreat = Array.isArray(mintedCreatorRaw) ? mintedCreatorRaw : [];
      const mFirst = Array.isArray(mintedFirstRaw)  ? mintedFirstRaw  : [];
      const cList  = Array.isArray(creatorsRaw)     ? creatorsRaw     : [];
      const aList  = Array.isArray(authorsRaw)      ? authorsRaw      : [];
      // Dedup minted
      const mintedMap = new Map();
      for (const row of [...mCreat, ...mFirst]) {
        const cAddr = row.contract?.address;
        const tId   = row.tokenId;
        if (!cAddr || tId === undefined || tId === null) continue;
        const key = `${cAddr}:${tId}`;
        if (!mintedMap.has(key)) mintedMap.set(key, row);
      }
      const mintedList = Array.from(mintedMap.values());
      // Build contract set for creations
      const contractSet = new Set([
        ...mintedList.map((r) => r.contract?.address),
        ...cList.map((r) => r.contract?.address),
        ...aList.map((r) => r.contract?.address),
      ].filter(Boolean));
      const contractInfo = new Map();
      const CHUNK = 50;
      const cArr = [...contractSet];
      for (let i = 0; i < cArr.length; i += CHUNK) {
        if (cancelled) return;
        const slice = cArr.slice(i, i + CHUNK);
        const q = slice.join(',');
        const res = await jFetch(
          `${TZKT_API}/v1/contracts?address.in=${q}&select=address,typeHash&limit=${slice.length}`,
        ).catch(() => []);
        const arr = Array.isArray(res) ? res : [];
        for (const row of arr) contractInfo.set(row.address, row);
      }
      const seenMint = new Set();
      const tempCreations = [];
      const addMinted = (row) => {
        const cAddr = row.contract?.address;
        const tIdStr = String(row.tokenId);
        const key = `${cAddr}:${tIdStr}`;
        if (seenMint.has(key)) return;
        seenMint.add(key);
        const supply = row.totalSupply;
        if (String(supply) === '0') return;
        const info = contractInfo.get(cAddr);
        const typeHash = String(info?.typeHash ?? '');
        if (!validTypeHashes.has(typeHash)) return;
        let meta;
        try {
          meta = decodeHexFields(row.metadata || {});
        } catch {
          meta = row.metadata || {};
        }
        if (meta && typeof meta.creators === 'string') {
          try {
            const parsed = JSON.parse(meta.creators);
            if (Array.isArray(parsed)) meta.creators = parsed;
          } catch {/* ignore */}
        }
        // Validate preview
        if (!isValidPreview(meta)) return;
        tempCreations.push({
          contract: cAddr,
          tokenId: tIdStr,
          metadata: meta,
          holdersCount: row.holdersCount,
        });
      };
      const processList = (list) => {
        for (const row of list) {
          if (cancelled) return;
          addMinted(row);
        }
      };
      processList(mintedList);
      processList(cList);
      processList(aList);
      // Live-balance filtering for creations
      const filteredCreations = [];
      await Promise.all(tempCreations.map(async (tok) => {
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
          let hasLive = false;
          for (const b of balances) {
            const addr = b?.account?.address ?? b['account.address'] ?? '';
            if (addr && addr.toLowerCase() !== BURN.toLowerCase()) {
              hasLive = true;
              break;
            }
          }
          if (hasLive) filteredCreations.push(tok);
        } catch {
          filteredCreations.push(tok);
        }
      }));
      setCreations(filteredCreations);
      setCountCreations(filteredCreations.length);
      // === Fetch owned tokens ===
      const balRaw = await jFetch(
        `${TZKT_API}/v1/tokens/balances?account=${address}&balance.ne=0&limit=1000`,
      ).catch(() => []);
      const balList = Array.isArray(balRaw) ? balRaw : [];
      const seenOwned = new Set();
      const tempOwned = [];
      const ownedContractSet = new Set();
      for (const row of balList) {
        const t = row.token || {};
        const cAddr = t.contract?.address;
        const tId = t.tokenId;
        if (!cAddr || tId === undefined || tId === null) continue;
        const key = `${cAddr}:${tId}`;
        if (seenOwned.has(key)) continue;
        seenOwned.add(key);
        tempOwned.push({ raw: row, cAddr, tId });
        ownedContractSet.add(cAddr);
      }
      // Fetch typeHash for owned contracts
      const ownedInfo = new Map();
      const oArr = [...ownedContractSet];
      for (let i = 0; i < oArr.length; i += CHUNK) {
        if (cancelled) return;
        const slice = oArr.slice(i, i + CHUNK);
        const q = slice.join(',');
        const res = await jFetch(
          `${TZKT_API}/v1/contracts?address.in=${q}&select=address,typeHash&limit=${slice.length}`,
        ).catch(() => []);
        const arr = Array.isArray(res) ? res : [];
        for (const row of arr) ownedInfo.set(row.address, row);
      }
      const finalOwned = [];
      await Promise.all(tempOwned.map(async ({ raw, cAddr, tId }) => {
        if (cancelled) return;
        const info = ownedInfo.get(cAddr);
        const typeHash = String(info?.typeHash ?? '');
        if (!validTypeHashes.has(typeHash)) return;
        const tokenObj = raw.token || {};
        const creator = tokenObj.creator?.address ?? tokenObj.creator;
        const firstMinter = tokenObj.firstMinter;
        // Skip if wallet minted this token via creator or firstMinter
        if (creator && typeof creator === 'string' && creator.toLowerCase() === address.toLowerCase()) return;
        if (firstMinter && typeof firstMinter === 'string' && firstMinter.toLowerCase() === address.toLowerCase()) return;
        // Supply check (zero supply tokens are burned)
        const supply = tokenObj.totalSupply;
        if (String(supply) === '0') return;
        // Metadata
        let meta = tokenObj.metadata;
        if (!meta || typeof meta === 'string') {
          try {
            const [tokDetail] = await jFetch(
              `${TZKT_API}/v1/tokens?contract=${cAddr}&tokenId=${tId}&limit=1`,
            ).catch(() => []);
            if (tokDetail) meta = tokDetail.metadata;
          } catch {/* ignore */}
        }
        try {
          meta = decodeHexFields(meta || {});
        } catch {
          meta = meta || {};
        }
        if (meta && typeof meta.creators === 'string') {
          try {
            const parsed = JSON.parse(meta.creators);
            if (Array.isArray(parsed)) meta.creators = parsed;
          } catch {/* ignore */}
        }
        // Skip tokens where the user appears in metadata.creators or metadata.authors
        {
          const cr = meta?.creators;
          const au = meta?.authors ?? meta?.artists;
          const arr = [];
          if (Array.isArray(cr)) arr.push(...cr);
          else if (typeof cr === 'string') arr.push(cr);
          else if (cr && typeof cr === 'object') arr.push(...Object.values(cr));
          if (Array.isArray(au)) arr.push(...au);
          else if (typeof au === 'string') arr.push(au);
          else if (au && typeof au === 'object') arr.push(...Object.values(au));
          for (const a of arr) {
            const s = String(a).toLowerCase();
            if (s === address.toLowerCase()) return;
          }
        }
        // Validate preview
        if (!isValidPreview(meta)) return;
        finalOwned.push({
          contract: cAddr,
          tokenId: String(tId),
          metadata: meta,
          holdersCount: tokenObj.holdersCount ?? 0,
        });
      }));
      setOwned(finalOwned);
      setCountOwned(finalOwned.length);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [address, validTypeHashes]);
  // Visible list based on tab
  const currentList = tab === 'creations' ? creations : owned;
  const visibleTokens = currentList.slice(0, visible);
  const loadMore = () => setVisible((v) => v + 10);
  return (
    <div>
      <ExploreNav hideSearch={false} />
      {/* Tab buttons */}
      <div style={{ display:'flex', gap:'0.6rem', marginTop:'1rem' }}>
        <PixelButton warning={tab==='creations'} onClick={() => { setTab('creations'); setVisible(10); }}>
          My Creations ({countCreations})
        </PixelButton>
        <PixelButton warning={tab==='owned'} onClick={() => { setTab('owned'); setVisible(10); }}>
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
                token={{
                  tokenId: Number(t.tokenId),
                  metadata: t.metadata || {},
                  holdersCount: t.holdersCount,
                }}
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
        <p style={{ marginTop: '0.8rem' }}>No tokens match your criteria.</p>
      )}
    </div>
  );
}

/* What changed & why: r45 – Added “My Owned” tab that lists
   NFTs held by the wallet but not minted by it.  The component now
   queries the /v1/tokens/balances endpoint, filters out tokens
   where the wallet is the creator or firstMinter, decodes
   metadata, parses JSON‑encoded creators arrays, validates on‑chain
   media previews and excludes unsupported contracts and burnt tokens.
   Live‑balance filtering still applies to creations; owned tokens
   rely on the balance query itself.  A tab selector with live
   counts enables switching between creations and owned tokens. */