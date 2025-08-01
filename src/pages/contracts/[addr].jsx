/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/contracts/[addr].jsx
  Rev :    r4  2025‑09‑13 – authors filter improvements
  Summary: edition‑filter now uses totalSupply instead of decimals
           and authors filtering now parses JSON‑encoded creators
           arrays.  When filtering by authors the page now
           considers creators, artists and authors fields in
           metadata, parsing JSON strings into arrays when
           necessary.  Token ingestion also decodes and parses
           creators strings into arrays, ensuring no tokens are
           overlooked.  All other behaviour remains unchanged.
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
        const decoded = (raw || []).filter((t) => allow.has(+t.tokenId))
          .map((t) => {
            if (t.metadata && typeof t.metadata === 'object') {
              t.metadata = decodeHexFields(t.metadata);                  // eslint-disable-line no-param-reassign
            } else if (typeof t.metadata === 'string') {
              const j = decodeHexJson(t.metadata);
              if (j) t.metadata = decodeHexFields(j);                    // eslint-disable-line no-param-reassign
            }
            // Parse JSON‑encoded creators arrays if present
            const md = t.metadata || {};
            if (md && typeof md.creators === 'string') {
              try {
                const parsed = JSON.parse(md.creators);
                if (Array.isArray(parsed)) md.creators = parsed;
              } catch {/* ignore JSON errors */}
            }
            return t;
          });
        setTokens(decoded);
        setTokOpts(live);
      } catch (err) {
        console.error('Token fetch failed', err);
        if (!cancel) {
          setTokens([]);
          setTokOpts([]);
        }
      } finally { if (!cancel) setLoading(false); }
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
      case 'offerLow':              out.sort((a,b)=(a.topOffer||0)-(b.topOffer||0)); break;
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

/* What changed & why (r4):
   • Authors filter now uses a helper getAuthors() to extract creators,
     authors and artists, parsing JSON‑encoded strings into arrays when
     present.  This resolves cases where metadata.creators was a
     JSON string and ensures admin filtering matches all creators.
   • Token ingestion now parses JSON‑encoded creators arrays after
     decoding metadata, so that the metadata has the correct array
     form when used in filters or displayed.
   • All other logic (edition filter, search, sort, counts) remains
     unchanged. */
/* EOF */