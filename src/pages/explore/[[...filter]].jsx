/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/explore/[[...filter]].jsx
  Rev :    r6    2025‑08‑02 UTC
  Summary: Fix admin‑filtered token search.  The admin search now
           queries full token objects (no `select=…`) for creator,
           metadata.creators and metadata.authors, just like the
           My Creations page.  This resolves the “empty results”
           issue and preserves fast loading of all mints and
           collaborator tokens for a given address while skipping
           burned and non‑ZeroContract tokens.  JSON‑encoded
           creators arrays are parsed into arrays during token
           ingestion.  The rest of the explore grid remains
           unchanged.
─────────────────────────────────────────────────────────────*/

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/router';
import styledPkg from 'styled-components';

import CollectionCard from '../../ui/CollectionCard.jsx';
import TokenCard from '../../ui/TokenCard.jsx';
import ExploreNav from '../../ui/ExploreNav.jsx';
import PixelButton from '../../ui/PixelButton.jsx';

import hashMatrix from '../../data/hashMatrix.json';
import { jFetch } from '../../core/net.js';
import decodeHexFields from '../../utils/decodeHexFields.js';
import detectHazards from '../../utils/hazards.js';
import { TZKT_API } from '../../config/deployTarget.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── constants ─────────────────────────────────────────*/
const TZKT = `${TZKT_API}/v1`;
const FETCH_STEP    = 48;
const FIRST_FAST    = 8;
const DESIRED_BATCH = 24;
const RUNAWAY_LIMIT = 10_000;
const BURN  = 'tz1burnburnburnburnburnburnburjAYjjX';
const VERSION_HASHES = Object.keys(hashMatrix).join(',');

/*──────── styled shells ─────────────────────────────────────*/
const Wrap = styled.main`
  width:100%;padding:1rem;max-width:1440px;margin:0 auto;
`;
const GridWrap = styled.div`
  --col: clamp(160px,18vw,220px);
  display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--col),1fr));gap:10px;
`;
const Center = styled.div`
  text-align:center;margin:1.4rem 0 2rem;
`;

/*──────── helpers ───────────────────────────────────────────*/
const authorArray = (m = {}) => {
  const src = m.creators ?? m.authors ?? m.artists ?? [];
  if (Array.isArray(src)) return src;
  if (typeof src === 'string') {
    try {
      const j = JSON.parse(src);
      return Array.isArray(j) ? j : [src];
    } catch {
      return [src];
    }
  }
  if (src && typeof src === 'object') return Object.values(src);
  return [];
};

const tokenMatchesAdmin = (t, admin) => {
  if (!admin) return true;
  if (t.contract?.creator?.address === admin) return true;
  const meta = decodeHexFields(t.metadata || {});
  return authorArray(meta).some(
    (a) => String(a).toLowerCase() === admin.toLowerCase(),
  );
};

/**
 * Determine whether a token should be excluded from the explore grid.
 * Filters out tokens with zero supply, burned balances, unsupported
 * contracts or missing on‑chain media.  A token must have at least
 * one on‑chain data URI among the common metadata keys (artifactUri,
 * displayUri, imageUri, thumbnailUri) or within its formats array.
 */
const isZeroToken = (t) => {
  if (!t || !t.metadata) return true;
  if (Number(t.totalSupply) === 0) return true;
  if (t.account?.address === BURN) return true;
  const meta = decodeHexFields(t.metadata);
  // Helper to detect any data URI among known preview fields.
  // ZeroContract previews live under specific keys such as displayUri,
  // imageUri, thumbnailUri, artifactUri and mediaUri (including
  // snake_case and camelCase variants).  We do not scan arbitrary
  // string fields because some metadata values (e.g. license text)
  // may contain a "data:" prefix unrelated to media previews.  Only
  // these keys and the formats array are considered.
  const hasDataUri = (m = {}) => {
    // Recognised preview keys (camelCase and snake_case variants).  The
    // value must be a data URI representing an image, video or audio.
    const keys = [
      'artifactUri', 'artifact_uri',
      'displayUri', 'display_uri',
      'imageUri',   'image',
      'thumbnailUri','thumbnail_uri',
      'mediaUri',   'media_uri',
    ];
    const mediaRe = /^data:(image\/|video\/|audio\/)/i;
    for (const k of keys) {
      const v = m && typeof m === 'object' ? m[k] : undefined;
      if (typeof v === 'string') {
        const val = v.trim();
        if (mediaRe.test(val)) return true;
      }
    }
    // Also search formats array for data URIs.  Only count entries
    // where the URI or URL is a data URI for image/video/audio.
    if (m && Array.isArray(m.formats)) {
      for (const fmt of m.formats) {
        if (fmt && typeof fmt === 'object') {
          const candidates = [];
          if (fmt.uri) candidates.push(String(fmt.uri));
          if (fmt.url) candidates.push(String(fmt.url));
          for (const cand of candidates) {
            const val = cand.trim();
            if (mediaRe.test(val)) return true;
          }
        }
      }
    }
    return false;
  };
  // Require at least one valid on‑chain data URI; skip tokens whose
  // previews resolve only to remote (ipfs/http) or broken URIs.
  if (!hasDataUri(meta)) return true;

  // Additional validation: ensure the first detected preview data URI
  // contains a decodable base64 payload.  Some tokens may embed a
  // "data:image/jpeg;base64,..." string that is truncated or invalid
  // (e.g. missing padding), resulting in broken images.  We decode a
  // small portion of the base64 data using atob() or Buffer.from() to
  // confirm that it contains valid base64 characters.  If decoding
  // throws, we treat the token as invalid and exclude it from the
  // explore grid.  This check is lightweight and runs only on the
  // initial portion of the base64 to avoid expensive full decodes.
  const findPreviewUri = (m = {}) => {
    const keys = [
      'artifactUri', 'artifact_uri',
      'displayUri', 'display_uri',
      'imageUri',   'image',
      'thumbnailUri','thumbnail_uri',
      'mediaUri',   'media_uri',
    ];
    const mediaRe = /^data:(image\/|video\/|audio\/)/i;
    for (const k of keys) {
      const v = m && typeof m === 'object' ? m[k] : undefined;
      if (typeof v === 'string') {
        const val = v.trim();
        if (mediaRe.test(val)) return val;
      }
    }
    if (m && Array.isArray(m.formats)) {
      for (const fmt of m.formats) {
        if (fmt && typeof fmt === 'object') {
          const candidates = [];
          if (fmt.uri) candidates.push(String(fmt.uri));
          if (fmt.url) candidates.push(String(fmt.url));
          for (const cand of candidates) {
            const val = cand.trim();
            if (mediaRe.test(val)) return val;
          }
        }
      }
    }
    return null;
  };
  const isValidDataUri = (uri) => {
    try {
      if (typeof uri !== 'string' || !uri.startsWith('data:')) return false;
      const commaIndex = uri.indexOf(',');
      if (commaIndex < 0) return false;
      const header = uri.slice(5, commaIndex);
      const semi   = header.indexOf(';');
      const mime   = (semi >= 0 ? header.slice(0, semi) : header).toLowerCase();
      const b64    = uri.slice(commaIndex + 1);
      // Fully decode the base64 payload; atob will throw on invalid base64.
      let binary;
      if (typeof atob === 'function') {
        binary = atob(b64);
      } else if (typeof Buffer !== 'undefined') {
        const buf = Buffer.from(b64, 'base64');
        binary = String.fromCharCode.apply(null, buf);
      } else {
        return true;
      }
      const bytes = [];
      for (let i = 0; i < binary.length; i++) bytes.push(binary.charCodeAt(i) & 0xff);
      // JPEG: header 0xFF 0xD8 0xFF and trailer 0xFF 0xD9
      if (mime === 'image/jpeg') {
        const validHeader = bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const validTrailer = bytes.length > 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
        return validHeader && validTrailer;
      }
      // PNG/APNG: header 0x89 0x50 0x4E 0x47 and contains IEND chunk
      if (mime === 'image/png' || mime === 'image/apng') {
        const validHeader = bytes.length > 7 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
        // Search for 'IEND' signature near the end
        let hasIEND = false;
        for (let i = bytes.length - 8; i >= 0 && i < bytes.length; i--) {
          if (bytes[i] === 0x49 && bytes[i + 1] === 0x45 && bytes[i + 2] === 0x4e && bytes[i + 3] === 0x44) {
            hasIEND = true; break;
          }
        }
        return validHeader && hasIEND;
      }
      // GIF: header GIF87a or GIF89a
      if (mime === 'image/gif') {
        const headerStr = binary.slice(0, 6);
        return headerStr === 'GIF87a' || headerStr === 'GIF89a';
      }
      // BMP: header 'BM' and file size matches length
      if (mime === 'image/bmp') {
        const validHeader = bytes.length > 1 && bytes[0] === 0x42 && bytes[1] === 0x4d;
        // BMP stores file size at bytes 2-5 (little endian)
        let fileSize = bytes[2] | (bytes[3] << 8) | (bytes[4] << 16) | (bytes[5] << 24);
        // Some broken BMPs may not include file size; treat as valid if header ok
        if (fileSize <= 0) fileSize = bytes.length;
        return validHeader && fileSize === bytes.length;
      }
      // WebP: RIFF, WEBP signatures
      if (mime === 'image/webp') {
        const riff  = binary.slice(0, 4);
        const webp  = binary.slice(8, 12);
        return riff === 'RIFF' && webp === 'WEBP';
      }
      // SVG and other image types (e.g. svg+xml), treat as valid if base64 decoded
      return true;
    } catch {
      return false;
    }
  };
  const preview = findPreviewUri(meta);
  if (preview && !isValidDataUri(preview)) return true;
  if (detectHazards(meta).broken) return true;
  // Mutate metadata in place to avoid recomputing later
  // eslint-disable-next-line no-param-reassign
  t.metadata = meta;
  return false;
};

/*──────── component ─────────────────────────────────────────*/
export default function ExploreGrid() {
  const router = useRouter();

  const seg0 = Array.isArray(router.query.filter)
    ? (router.query.filter[0] || '').toString().toLowerCase()
    : '';
  const cmdQ  = (router.query.cmd || '').toString().toLowerCase();
  const pathQ = router.asPath.toLowerCase();

  const isTokensMode = seg0 === 'tokens' || cmdQ === 'tokens' || pathQ.includes('/tokens');

  const adminFilterRaw = (router.query.admin || '').toString().trim();
  const adminFilter = /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/i.test(adminFilterRaw)
    ? adminFilterRaw
    : '';

  const [collections, setCollections] = useState([]);
  const [tokens, setTokens]           = useState([]);
  const [loading, setLoading]         = useState(false);
  const [offset, setOffset]           = useState(0);
  const [end, setEnd]                 = useState(false);
  const [seenColl] = useState(() => new Set());
  const [seenTok]  = useState(() => new Set());

  /*───────────────────────────────────────────────────────────
    Helper: fetch tokens for a specific admin address.  This
    mirrors My Creations logic: query creator=admin, metadata.creators
    and metadata.authors without using `select=…`, decode metadata,
    parse JSON‑encoded creators strings, dedupe and filter to valid
    ZeroContract tokens, skipping burned.  TypeHash guard and zero
    supply filtering are retained.
  ───────────────────────────────────────────────────────────*/
  const fetchAdminTokens = useCallback(async (admin) => {
    const base = `${TZKT_API}/v1/tokens`;
    const minted = await jFetch(
      `${base}?creator=${admin}&limit=1000`,
    ).catch(() => []);
    // Include tokens where the first minter matches the admin to cover
    // contract versions that record the initial minter under firstMinter.
    const firsts = await jFetch(
      `${base}?firstMinter=${admin}&limit=1000`,
    ).catch(() => []);
    const creators = await jFetch(
      `${base}?metadata.creators.[*]=${admin}&limit=1000`,
    ).catch(() => []);
    const authors = await jFetch(
      `${base}?metadata.authors.[*]=${admin}&limit=1000`,
    ).catch(() => []);

    const all = [...minted, ...firsts, ...creators, ...authors];
    // Build contract typeHash map
    const contractSet = new Set(all.map((t) => t.contract?.address).filter(Boolean));
    const contractInfo = new Map();
    const list = [...contractSet];
    const chunk = 50;
    for (let i = 0; i < list.length; i += chunk) {
      const slice = list.slice(i, i + chunk);
      const q = slice.join(',');
      const res = await jFetch(
        `${TZKT_API}/v1/contracts?address.in=${q}&select=address,typeHash&limit=${slice.length}`,
      ).catch(() => []);
      const arr = Array.isArray(res) ? res : [];
      arr.forEach((row) => contractInfo.set(row.address, row));
    }
    const seen = new Set();
    const tokens = [];
    for (const t of all) {
      const key = `${t.contract?.address}_${t.tokenId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (String(t.totalSupply) === '0') continue;
      const info = contractInfo.get(t.contract?.address);
      const typeHash = String(info?.typeHash ?? info?.type_hash ?? '');
      if (!hashMatrix[typeHash]) continue;
      let meta;
      try {
        meta = decodeHexFields(t.metadata || {});
      } catch {
        meta = t.metadata || {};
      }
      // Parse JSON‑encoded creators if present
      if (meta && typeof meta.creators === 'string') {
        try {
          const parsed = JSON.parse(meta.creators);
          if (Array.isArray(parsed)) meta.creators = parsed;
        } catch {
          /* ignore parse errors */
        }
      }
      tokens.push({
        contract: t.contract,
        tokenId: t.tokenId,
        metadata: meta,
        holdersCount: t.holdersCount,
        totalSupply: t.totalSupply,
      });
    }
    // Live‑balance filter: exclude tokens whose only non‑zero balance is held
    // by the canonical burn address.  This mirrors the logic in
    // src/pages/my/tokens.jsx (r44) to avoid showing burned tokens.  If
    // the balance endpoint errors, include the token by default.
    const filtered = [];
    await Promise.all(tokens.map(async (tok) => {
      try {
        const balRaw = await jFetch(
          `${TZKT_API}/v1/tokens/balances?token.contract=${tok.contract?.address}` +
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
        // On error include token by default so we don't hide valid tokens
        filtered.push(tok);
      }
    }));
    return filtered;
  }, []);

  // Batch loader invoked when “Load More” is clicked or on
  // component mount.  Loads either collections or tokens
  // depending on the current mode.  The loader stops when it
  // reaches the desired number of fresh items or hits the end.
  const loadBatch = useCallback(
    async (batchSize) => {
      if (loading || end) return;
      setLoading(true);
      const fresh = [];
      let off = offset;
      const target = Math.max(batchSize, 1);
      while (fresh.length < target && off - offset < RUNAWAY_LIMIT) {
        const rows = isTokensMode
          ? await fetchBatchTokens(off)
          : await fetchBatchCollections(off);
        if (!rows.length) {
          setEnd(true);
          break;
        }
        off += rows.length;
        if (isTokensMode) {
          rows.forEach((t) => {
            const key = `${t.contract?.address}_${t.tokenId}`;
            if (seenTok.has(key) || isZeroToken(t)) return;
            if (!tokenMatchesAdmin(t, adminFilter)) return;
            seenTok.add(key);
            fresh.push(t);
          });
        } else {
          rows.forEach((c) => {
            if (!c.address || seenColl.has(c.address)) return;
            if (Number(c.tokensCount) === 0) return;
            seenColl.add(c.address);
            fresh.push(c);
          });
        }
        if (rows.length < FETCH_STEP) {
          setEnd(true);
          break;
        }
      }
      setOffset(off);
      if (isTokensMode) setTokens((p) => [...p, ...fresh]);
      else              setCollections((p) => [...p, ...fresh]);
      setLoading(false);
    },
    [loading, end, offset, isTokensMode, adminFilter],
  );

  // Reset collections/tokens on mode or admin filter change.
  useEffect(() => {
    if (!router.isReady) return;
    setTokens([]);
    setCollections([]);
    setOffset(0);
    setEnd(false);
    seenTok.clear();
    seenColl.clear();
    if (adminFilter && isTokensMode) {
      // Admin-filtered tokens: load all at once
      (async () => {
        setLoading(true);
        const items = await fetchAdminTokens(adminFilter);
        setTokens(items);
        setEnd(true);
        setLoading(false);
      })();
    } else {
      // Default mode: incremental fetch
      loadBatch(FIRST_FAST);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, isTokensMode, adminFilter]);

  // Trigger another batch of tokens when none are loaded.  Without
  // this effect, the explore grid could remain empty if the first
  // batch contained only filtered items.
  useEffect(() => {
    if (!loading && !end && isTokensMode && !adminFilter && tokens.length === 0) {
      loadBatch(FIRST_FAST);
    }
  }, [tokens.length, loading, end, isTokensMode, adminFilter, loadBatch]);

  // Fetch helpers for collections and tokens for non-admin searches
  const fetchBatchCollections = useCallback(
    async (off) => {
      const qs = new URLSearchParams({
        limit      : FETCH_STEP,
        offset     : off,
        'sort.desc': 'firstActivityTime',
      });
      qs.append('typeHash.in', VERSION_HASHES);
      if (adminFilter) {
        qs.append('creator.eq', adminFilter);
      }
      return jFetch(`${TZKT}/contracts?${qs}`).catch(() => []);
    },
    [adminFilter],
  );

  const fetchBatchTokens = useCallback(
    async (off) => {
      const qs = new URLSearchParams({
        limit      : FETCH_STEP,
        offset     : off,
        'sort.desc': 'firstTime',
        'contract.metadata.version.in':
          'ZeroContractV1,ZeroContractV2,ZeroContractV2a,ZeroContractV2b,' +
          'ZeroContractV2c,ZeroContractV2d,ZeroContractV2e,' +
          'ZeroContractV3,ZeroContractV4,ZeroContractV4a,ZeroContractV4b,ZeroContractV4c',
      });
      if (adminFilter) qs.append('contract.creator.eq', adminFilter);
      return jFetch(`${TZKT}/tokens?${qs}`).catch(() => []);
    },
    [adminFilter],
  );

  // Render tokens or collections grid.
  const cardList = useMemo(
    () => (
      isTokensMode
        ? tokens.map((t) => (
            <TokenCard
              key={`${t.contract?.address}_${t.tokenId}`}
              token={t}
              contractAddress={t.contract?.address}
              contractName={t.contract?.metadata?.name}
            />
          ))
        : collections.map((c) => (
            <CollectionCard key={c.address} contract={c} />
          ))
    ),
    [isTokensMode, tokens, collections],
  );

  const bannerTxt = isTokensMode ? 'tokens' : 'collections';

  return (
    <Wrap>
      <ExploreNav />
      {adminFilter && (
        <p
          style={{
            textAlign: 'center',
            fontSize: '.8rem',
            margin: '6px 0 0',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          Showing {bannerTxt} where creator&nbsp;=&nbsp;
          <code style={{ fontSize: '.8rem' }}>{adminFilter}</code>
          <button
            type="button"
            aria-label="Clear filter"
            onClick={() => router.replace(isTokensMode ? '/explore?cmd=tokens' : '/explore')}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1rem',
              cursor: 'pointer',
              lineHeight: 1,
              marginTop: '-2px',
            }}
          >
            ❌
          </button>
        </p>
      )}
      <GridWrap>{cardList}</GridWrap>
      {!end && !adminFilter && (
        <Center>
          <PixelButton
            type="button"
            onClick={() => loadBatch(DESIRED_BATCH)}
            disabled={loading}
            size="sm"
          >
            {loading ? 'Loading…' : 'Load More 🔻'}
          </PixelButton>
        </Center>
      )}
    </Wrap>
  );
}

/* What changed & why: r6 – Fixed admin-filtered token searches by
   dropping `select=…` from deep-filter API calls.  When filtering
   tokens by an admin address, the page now fetches creator,
   metadata.creators and metadata.authors without select, ensuring
   that full metadata is returned and properly decoded.  The list
   updates immediately with all valid ZeroContract tokens owned or
   co‑minted by the address, skipping burned tokens and invalid
   contracts.  Additionally, JSON‑encoded creators strings are now
   parsed into arrays during token ingestion to avoid overlooking
   tokens where creators is a JSON string.  The rest of the explore
   grid’s behavior (paging, collection loading) remains unchanged. */
/* EOF */