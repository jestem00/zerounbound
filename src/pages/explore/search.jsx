/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/explore/search.jsx
  Rev :    r8  2025‑09‑13 – uses EnableScripts overlay
  Summary: mobile‑safe grid min 160px
──────────────────────────────────────────────────────────────*/
import React, {
  useEffect, useMemo, useState, useCallback,
} from 'react';
import { useRouter } from 'next/router';
import styledPkg     from 'styled-components';
import PixelButton   from '../../ui/PixelButton.jsx';
import TokenMetaPanel from '../../ui/TokenMetaPanel.jsx';
import RenderMedia   from '../../utils/RenderMedia.jsx';
import detectHazards from '../../utils/hazards.js';
import useConsent    from '../../hooks/useConsent.js';
import ExploreNav    from '../../ui/ExploreNav.jsx';
import { jFetch }    from '../../core/net.js';
import { EnableScriptsOverlay } from '../../ui/EnableScripts.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const NETWORK  = process.env.NEXT_PUBLIC_TEZOS_NETWORK || 'ghostnet';
const VERSIONS = [
  'ZeroContractV1','ZeroContractV2','ZeroContractV2a','ZeroContractV2b',
  'ZeroContractV2c','ZeroContractV2d','ZeroContractV2e',
  'ZeroContractV3','ZeroContractV4','ZeroContractV4a','ZeroContractV4b',
];
const VERSION_PARAM = `contract.metadata.version.in=${VERSIONS.join(',')}`;

function buildQuery({ q, author, tag }) {
  const base = NETWORK === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';

  const parts = [VERSION_PARAM];
  if (q)      parts.push(`search=${encodeURIComponent(q)}`);
  if (author) parts.push(`metadata.authors.contains=${encodeURIComponent(author)}`);
  if (tag)    parts.push(`metadata.tags.contains=${encodeURIComponent(tag)}`);

  return `${base}/tokens?${parts.join('&')}&limit=120`;
}

/*──────── styled shells ─────────────────────────────────────*/
const Wrap = styled.div`
  padding: 1rem;
  max-width: 1440px;
  margin: 0 auto;
`;

const FormBar = styled.form`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 1rem 0;
  input{ padding: 6px; font-size: .85rem; flex: 1; }
`;

const Grid = styled.div`
  --min: 160px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--min), 1fr));
  gap: 10px;
`;

const Card = styled.div`
  position: relative;
  border: 2px solid var(--zu-accent);
  background: var(--zu-bg);
  overflow: hidden;
`;

const Obf = styled.div`
  position: absolute; inset: 0;
  background: rgba(0,0,0,.8);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;font-size:.75rem;gap:10px;z-index:3;
  p{margin:0;width:80%;}
`;

const CardBody = styled.div`
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

/*──────── component ────────────────────────────────────────*/
export default function ExploreSearch() {
  const router = useRouter();
  const init = useMemo(() => ({
    q     : router.query.q      || '',
    author: router.query.author || '',
    tag   : router.query.tag    || '',
  }), [router.query]);

  const [input, setInput]     = useState(init);
  const [tokens, setTokens]   = useState([]);
  const [loading, setLoading] = useState(false);

  const [allowNSFW,    setAllowNSFW]    = useConsent('nsfw', false);
  const [allowFlash,   setAllowFlash]   = useConsent('flash', false);
  const [allowScripts, setAllowScripts] = useConsent('scripts', false);

  const onChange = (e) => setInput({ ...input, [e.target.name]: e.target.value });

  const search = useCallback((e) => {
    if (e) e.preventDefault();
    const url = buildQuery(input);
    router.replace({ pathname:'/explore/search', query: input }, undefined, { shallow:true });
    setLoading(true);
    jFetch(url)
      .then(rows => { setTokens(rows); setLoading(false); })
      .catch(()   => setLoading(false));
  }, [input, router]);

  useEffect(() => { if (router.isReady) search(); }, [router.isReady]);

  const requireConsent = useCallback((has, setter, label) => {
    if (has) return true;
    const ok = window.confirm(`Content flagged ${label}. Unhide?`);
    if (ok) setter(true);
    return ok;
  }, []);

  const cards = tokens.map(t => {
    const m = t.metadata || {};
    const { nsfw, flashing, scripts } = detectHazards(m);
    const hidden = (nsfw && !allowNSFW) || (flashing && !allowFlash);

    return (
      <Card key={`${t.contract?.address}_${t.tokenId}`}>
        <div style={{
          width: '100%',
          aspectRatio: (m.width && m.height) ? `${m.width}/${m.height}` : '1/1',
          position: 'relative',
        }}>
          {scripts && !allowScripts && !hidden && (
          <Obf>
            <EnableScriptsOverlay onAccept={()=>{ const ok=window.confirm('Enable scripting? Trust author.'); if(ok) setAllowScripts(true); }}/>
              <p>{nsfw && 'NSFW'}{nsfw && flashing ? ' / ' : ''}{flashing && 'Flashing'}</p>
              <PixelButton size="sm" onClick={() => {
                if (nsfw)    requireConsent(allowNSFW,  setAllowNSFW,  'NSFW');
                if (flashing)requireConsent(allowFlash, setAllowFlash, 'flashing');
              }}>Unhide</PixelButton>
            </Obf>
          )}
          {!hidden && (
            <RenderMedia
              uri={m.displayUri || m.imageUri || m.artifactUri}
              mime={m.mimeType}
              alt={m.name}
              allowScripts={scripts && allowScripts}
              style={{ width:'100%', height:'100%', objectFit:'contain', display:'block' }}
            />
          )}
        </div>
        {scripts && !allowScripts && !hidden && (
          <Obf>
            <p>Token executes scripts.</p>
            <PixelButton size="sm" warning onClick={() => {
              const ok = window.confirm('Enable scripting? Trust author.');
              if (ok) setAllowScripts(true);
            }}>Allow scripts</PixelButton>
          </Obf>
        )}
        <CardBody>
          <TokenMetaPanel
            meta={m}
            tokenId={t.tokenId}
            contractAddress={t.contract?.address}
          />
        </CardBody>
      </Card>
    );
  });

  return (
    <Wrap>
      <ExploreNav />

      <FormBar onSubmit={search}>
        <input name="q"     placeholder="keyword" value={input.q} onChange={onChange} />
        <input name="author"placeholder="author"  value={input.author} onChange={onChange} />
        <input name="tag"   placeholder="tag"     value={input.tag} onChange={onChange} />
        <PixelButton type="submit" size="sm">SEARCH</PixelButton>
        <PixelButton type="button" size="sm" onClick={() => router.push('/explore')}>← Back</PixelButton>
      </FormBar>

      {loading ? <p>Searching…</p> : <Grid>{cards}</Grid>}
    </Wrap>
  );
}
/* What changed & why:
   • Grid adopts 160 px min card width for single‑column mobile layout. */
