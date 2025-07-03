/*──────── src/pages/contracts/[addr].jsx ────────*/
/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/contracts/[addr].jsx
  Rev :    r9     2025‑08‑22
  Summary: token list derives from listLiveTokenIds → burn‑held
           ids excluded; banner stats sync; meta fallback decode
──────────────────────────────────────────────────────────────*/
import React, {
  useEffect, useMemo, useState,
} from 'react';
import { useRouter }        from 'next/router';
import styledPkg            from 'styled-components';

import ExploreNav                   from '../../ui/ExploreNav.jsx';
import ContractMetaPanelContracts   from '../../ui/ContractMetaPanelContracts.jsx';
import TokenCard                    from '../../ui/TokenCard.jsx';
import PixelInput                   from '../../ui/PixelInput.jsx';
import PixelButton                  from '../../ui/PixelButton.jsx';

import countOwners                  from '../../utils/countOwners.js';
import listLiveTokenIds             from '../../utils/listLiveTokenIds.js';
import { jFetch }                   from '../../core/net.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Wrap = styled.div`
  padding: 0 1rem 1rem;
  max-width: 1440px;
  margin: 0 auto;
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
const ipfsToHttp = (u='') => u.replace(/^ipfs:\/\//,'https://ipfs.io/ipfs/');

/*──────── component ───────────────────────────────────────*/
export default function ContractPage() {
  const router           = useRouter();
  const { addr }         = router.query;
  const net              = 'ghostnet';

  /* data */
  const [meta, setMeta]        = useState(null);
  const [tokens, setTokens]    = useState([]);
  const [owners, setOwners]    = useState(null);
  const [loading, setLoading]  = useState(true);

  /* ui */
  const [search, setSearch] = useState('');
  const [sort, setSort]     = useState('newest');

  /*── fetch meta + tokens ──────────────────────────────────*/
  useEffect(() => { let cancel = false;
    if (!addr) return;
    const api = 'https://api.ghostnet.tzkt.io/v1';

    /* 1 · contract metadata w/ fallback big‑map decode */
    (async () => {
      try {
        const r = await jFetch(`${api}/contracts/${addr}`);
        setMeta(r?.metadata ?? {});
        if (!r?.metadata?.imageUri) {
          const [v] = await jFetch(
            `${api}/contracts/${addr}/bigmaps/metadata/keys?key=content&select=value`,
          ).catch(() => []);
          if (v && !cancel) {
            const hex = String(v).replace(/^0x/,'');
            try {
              const j = JSON.parse(
                new TextDecoder().decode(
                  new Uint8Array(hex.match(/.{1,2}/g).map((b)=>parseInt(b,16))),
                ),
              );
              setMeta((m)=>({ ...j, ...m }));
            } catch {/* ignore */}
          }
        }
      } catch { if (!cancel) setMeta({}); }
    })();

    /* 2 · tokens raw */
    (async () => {
      try {
        const [raw, goodIds] = await Promise.all([
          jFetch(`${api}/tokens?contract=${addr}&limit=10000`),
          listLiveTokenIds(addr, net),
        ]);
        if (cancel) return;
        const allow = new Set(goodIds);
        setTokens((raw || []).filter((t)=>allow.has(+t.tokenId)));
      } finally { if (!cancel) setLoading(false); }
    })();

    /* 3 · owners */
    countOwners(addr, net).then((n) => { if (!cancel) setOwners(n); });

    return () => { cancel = true; };
  }, [addr, net]);

  /*── search + sort ───────────────────────────────────────*/
  const list = useMemo(() => {
    let out = [...tokens];
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
    switch (sort) {
      case 'oldest': out.sort((a,b)=>a.tokenId - b.tokenId); break;
      default:       out.sort((a,b)=>b.tokenId - a.tokenId);
    }
    return out;
  }, [tokens, search, sort]);

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

  /* stats for banner */
  const stats = {
    tokens : tokens.length,
    owners : owners ?? '—',
    sales  : 0,
  };

  /*──────── render ─────────────────────────────────────────*/
  return (
    <Wrap>
      <ExploreNav />

      {meta && <ContractMetaPanelContracts
        meta={{ ...meta, imageUri: ipfsToHttp(meta.imageUri || '') }}
        contractAddress={addr}
        network={net}
        stats={stats}
      />}

      <ControlsRow>
        <PixelInput
          placeholder="Search tokens…"
          value={search}
          onChange={(e)=>setSearch(e.target.value)}
        />
        <select
          value={sort}
          onChange={(e)=>setSort(e.target.value)}
          style={{ fontFamily:'inherit',padding:'4px 6px' }}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </ControlsRow>

      {loading
        ? <p style={{ textAlign:'center', marginTop:'2rem' }}>Loading…</p>
        : <Grid>{cards}</Grid>}
    </Wrap>
  );
}
/* What changed & why (r9):
   • Token list intersects raw query with listLiveTokenIds() output,
     guaranteeing burn‑held IDs are excluded everywhere (I67).
   • Banner stats derive from filtered list.
   • Metadata fallback decodes contract big‑map when TzKT meta empty.
   • ipfs:// thumb auto‑rewritten → https://ipfs.io/ipfs/. */
