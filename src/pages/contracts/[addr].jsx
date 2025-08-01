/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/contracts/[addr].jsx
  Rev :    r5  2025‑08‑XX – robust broken‑preview filtering
  Summary: In addition to parsing JSON‑encoded creators and decoding
           metadata, this version filters out tokens whose on‑chain
           previews are invalid or truncated.  It validates data
           URIs for JPEG, PNG/APNG, GIF, BMP, and WebP by checking
           header and trailer signatures, mirroring the explore
           grid’s logic.  Only tokens with intact previews or
           non‑image media are shown, preventing broken images in
           contract pages.  Authors filtering remains unchanged.
──────────────────────────────────────────────────────────────*/
import React, {
  useEffect, useMemo, useState, useCallback,
} from 'react';
import { useRouter }      from 'next/router';
import styledPkg          from 'styled-components';

import ExploreNav                 from '../../ui/ExploreNav.jsx';
import ContractMetaPanelContracts from '../../ui/ContractMetaPanelContracts.jsx';
import TokenCard                  from '../../ui/TokenCard.jsx';
import PixelInput                 from '../../ui/PixelInput.jsx';
import PixelButton                from '../../ui/PixelButton.jsx';
import TokenIdSelect              from '../../ui/TokenIdSelect.jsx';
import FiltersPanel               from '../../ui/FiltersPanel.jsx';

import countOwners      from '../../utils/countOwners.js';
import countTokens      from '../../utils/countTokens.js';
import listLiveTokenIds from '../../utils/listLiveTokenIds.js';
import decodeHexFields, { decodeHexJson } from '../../utils/decodeHexFields.js';
import { jFetch }       from '../../core/net.js';
import { TARGET }       from '../../config/deployTarget.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Wrap = styled.div`
  padding: 0 1rem 1rem;
  max-width: 1440px;
  margin: 0 auto;
  display:grid;
  grid-template-columns: 1fr;
  gap:12px;

  @media(min-width:1100px){
    grid-template-columns:260px 1fr;
  }
`;

const ControlsRow = styled.div`
  display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0;
  & > *{flex:1 1 auto;min-width:140px;}
`;

const Grid = styled.div`
  --col: clamp(160px,18vw,220px);
  display:grid;gap:12px;
  grid-template-columns:repeat(auto-fill,minmax(var(--col),1fr));
`;

/*──────── helpers ───────────────────────────────────────────*/
const NETWORK = TARGET?.toLowerCase().includes('mainnet') ? 'mainnet' : 'ghostnet';
const TZKT_API = NETWORK === 'mainnet'
  ? 'https://api.tzkt.io/v1'
  : 'https://api.ghostnet.tzkt.io/v1';

/*──────── component ───────────────────────────────────────*/
export default function ContractPage() {
  const router           = useRouter();
  const { addr }         = router.query;

  const [meta, setMeta]       = useState(null);
  const [tokens, setTokens]   = useState([]);
  const [tokCount, setTokCount] = useState('…');
  const [owners, setOwners]   = useState('…');
  const [loading, setLoading] = useState(true);
  const [tokOpts, setTokOpts] = useState([]);
  const [tokSel,  setTokSel]  = useState('');

  /* ui */
  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState('newest');

  /* filters */
  const [filters, setFilters] = useState({
    authors: new Set(),
    mime   : new Set(),
    tags   : new Set(),
    type   : '',              /* '', 1of1, editions */
    mature : 'include',        /* include | exclude | only */
    flash  : 'include',
  });

  /*── fetch meta + tokens ──────────────────────────────────*/
  useEffect(() => { let cancel = false;
    if (!addr) return;

    /* 1 · contract metadata (hex → JSON fallback) */
    (async () => {
      try {
        const r = await jFetch(`${TZKT_API}/contracts/${addr}`);
        let m   = r?.metadata ?? {};
        if (!m?.name) {
          const [v] = await jFetch(
            `${TZKT_API}/contracts/${addr}/bigmaps/metadata/keys?key=content&select=value`,
          ).catch(() => []);
          const decoded = decodeHexJson(v);
          if (decoded) m = { ...decoded, ...m };
        }
        if (!cancel) setMeta(decodeHexFields(m));
      } catch { if (!cancel) setMeta({}); }
    })();

    /* 2 · tokens & dropdown names */
    (async () => {
      try {
        const [raw, live] = await Promise.all([
          jFetch(`${TZKT_API}/tokens?contract=${addr}&limit=10000`),
          listLiveTokenIds(addr, NETWORK, true),
        ]);
        if (cancel) return;
        const allow = new Set(live.map((o) => +o.id));
        // Helper to validate data URI previews.  Mirrors the robust checks
        // used in the explore grid: JPEG must start with FFD8FF and end
        // with FFD9; PNG/APNG must have an IEND chunk; GIF must have a
        // proper header; BMP must begin with BM; WebP must be RIFF/WEBP.
        const isValidPreview = (m = {}) => {
          const keys = [
            'artifactUri', 'artifact_uri',
            'displayUri', 'display_uri',
            'imageUri',   'image',
            'thumbnailUri','thumbnail_uri',
            'mediaUri',   'media_uri',
          ];
          const mediaRe = /^data:(image\/|video\/|audio\/)/i;
          // Find the first preview data URI
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
            const commaIndex = uri.indexOf(',');
            if (commaIndex < 0) return false;
            const header = uri.slice(5, commaIndex);
            const semi = header.indexOf(';');
            const mime = (semi >= 0 ? header.slice(0, semi) : header).toLowerCase();
            const b64 = uri.slice(commaIndex + 1);
            // decode entire base64; will throw on invalid base64
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
            // Accept other media types (audio/video/svg, etc.)
            return true;
          } catch {
            return false;
          }
        };
        const decoded = (raw || [])
          .filter((t) => allow.has(+t.tokenId))
          .map((t) => {
            if (t.metadata && typeof t.metadata === 'object') {
              t.metadata = decodeHexFields(t.metadata);                  // eslint-disable-line no-param-reassign
            } else if (typeof t.metadata === 'string') {
              const j = decodeHexJson(t.metadata);
              if (j) t.metadata = decodeHexFields(j);                    // eslint-disable-line no-param-reassign
            }
            const md = t.metadata || {};
            if (md && typeof md.creators === 'string') {
              try {
                const parsed = JSON.parse(md.creators);
                if (Array.isArray(parsed)) md.creators = parsed;
              } catch {/* ignore JSON errors */}
            }
            return t;
          })
          // Filter out tokens without valid previews
          .filter((t) => isValidPreview(t.metadata));
        setTokens(decoded);
        setTokOpts(live);
      } catch (err) {
        console.error('Token fetch failed', err);
        if (!cancel) {
          setTokens([]);
          setTokOpts([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    /* 3 · counts */
    countOwners(addr, NETWORK).then((n) => {
      if (!cancel) setOwners(n);
    });
    countTokens(addr, NETWORK).then((n) => {
      if (!cancel) setTokCount(n);
    });

    return () => { cancel = true; };
  }, [addr]);

  /*── filter helpers ───────────────────────────────────────*/
  /**
   * Derive a normalised array of authors/creators from a metadata object.
   * Some ZeroContract versions store the creators field as a JSON‑encoded
   * string or object.  This helper mirrors authorArray() from the explore
   * grid and My Creations page.  It tries to JSON.parse() string values
   * and falls back to a single‑element array.  Objects return their values.
   */
  const getAuthors = useCallback((m = {}) => {
    const src = m.authors ?? m.artists ?? m.creators ?? [];
    if (Array.isArray(src)) return src;
    if (typeof src === 'string') {
      try {
        const j = JSON.parse(src);
        if (Array.isArray(j)) return j;
      } catch {
        /* ignore parse errors */
      }
      return [src];
    }
    if (src && typeof src === 'object') return Object.values(src);
    return [];
  }, []);

  const applyFilters = useCallback((arr) => arr.filter((t) => {
    const m = t.metadata || {};
    /* authors */
    if (filters.authors.size) {
      const aArr = getAuthors(m);
      if (!aArr.some((a) => filters.authors.has(a))) return false;
    }
    /* mime */
    if (filters.mime.size && !filters.mime.has(m.mimeType)) return false;
    /* tags */
    if (filters.tags.size) {
      const tagArr = m.tags || [];
      if (!tagArr.some((tg) => filters.tags.has(tg))) return false;
    }
    /* 1/1 vs editions by totalSupply */
    const supply = Number(t.totalSupply || m.totalSupply || m.amount || 0);
    if (filters.type === '1of1'   && supply !== 1) return false;
    if (filters.type === 'editions' && supply <= 1) return false;
    /* mature / flashing */
    const mature   = String(m.contentRating || '').toLowerCase().includes('mature');
    const flashing = String(m.accessibility || '').toLowerCase().includes('flash');
    if (filters.mature === 'exclude' && mature)   return false;
    if (filters.mature === 'only'    && !mature)  return false;
    if (filters.flash  === 'exclude' && flashing) return false;
    if (filters.flash  === 'only'    && !flashing)return false;
    return true;
  }), [filters, getAuthors]);

  /*── search + sort + token‑id filter ─────────────────────*/
  const list = useMemo(() => {
    let out = [...tokens];
    if (tokSel) return out.filter((t) => String(t.tokenId) === String(tokSel));

    /* filters */
    out = applyFilters(out);

    /* search */
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((t) => {
        const m = t.metadata || {};
        const hay = [
          m.name, m.description,
          ...(m.tags || []),
          ...(Array.isArray(m.attributes)
            ? m.attributes.map((a) => `${a.name}:${a.value}`)
            : []),
        ].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    /* sort */
    switch (sort) {
      case 'oldest':                out.sort((a,b)=>a.tokenId-b.tokenId); break;
      case 'recentlyListed':        out.sort((a,b)=>(b.listedAt||0)-(a.listedAt||0)); break;
      case 'priceHigh':             out.sort((a,b)=>(b.price||0)-(a.price||0)); break;
      case 'priceLow':              out.sort((a,b)=>(a.price||0)-(b.price||0)); break;
      case 'offerHigh':             out.sort((a,b)=>(b.topOffer||0)-(a.topOffer||0)); break;
      case 'offerLow':              out.sort((a,b)=>(a.topOffer||0)-(b.topOffer||0)); break;
      default: /* newest */         out.sort((a,b)=>b.tokenId-a.tokenId);
    }
    return out;
  }, [tokens, search, sort, tokSel, applyFilters]);

  const cards = useMemo(() =>
    list.map((t) => (
      <TokenCard
        key={t.tokenId}
        token={t}
        contractAddress={addr}
        contractName={meta?.name}
      />
    )),
  [list, addr, meta]);

  /* stats */
  const stats = {
    tokens : tokCount,
    owners : owners,
    sales  : loading ? '…' : tokens.filter((t) => Number(t.price) > 0).length,
  };

  /*──────── render ─────────────────────────────────────────*/
  return (
    <>
      <ExploreNav />
      <Wrap>
        <FiltersPanel
          tokens={tokens}
          filters={filters}
          setFilters={setFilters}
          buttonStyle={{ position:'static', margin:'0 0 8px' }}
        />

        <div>
          {meta && <ContractMetaPanelContracts
            meta={meta}
            contractAddress={addr}
            stats={stats}
          />}

          <ControlsRow>
            <PixelInput
              placeholder="Search tokens…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{ fontFamily:'inherit',padding:'4px 6px' }}
            >
              <option value="newest">Newest</option>
              <option value="recentlyListed">Recently listed</option>
              <option value="priceHigh">Price: high → low</option>
              <option value="priceLow">Price: low → high</option>
              <option value="offerHigh">Offer: high → low</option>
              <option value="offerLow">Offer: low → high</option>
              <option value="oldest">Oldest</option>
            </select>
            <TokenIdSelect
              options={tokOpts}
              value={tokSel}
              onChange={setTokSel}
            />
            {tokSel && (
              <PixelButton size="sm" onClick={() => setTokSel('')}>
                CLEAR
              </PixelButton>
            )}
          </ControlsRow>

          {loading
            ? <p style={{ textAlign:'center', marginTop:'2rem' }}>Loading…</p>
            : <Grid>{cards}</Grid>}
        </div>
      </Wrap>
    </>
  );
}

/* What changed & why (r5):
   • Added isValidPreview() helper and applied it during token
     ingestion.  This function ensures that JPEG images start with
     0xFFD8FF and end with 0xFFD9, PNG/APNG images include an IEND
     chunk, GIFs have valid headers, BMPs begin with 'BM' and
     WebP files contain RIFF/WEBP signatures.  Data URIs that do
     not pass these checks are considered invalid and the token
     is excluded from the contract page.
   • Preserved existing authors filtering logic and metadata
     decoding, including JSON‑encoded creators parsing.  Only the
     preview validation logic was added. */
/* EOF */