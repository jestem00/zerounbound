/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenMetaPanel.jsx
  Rev :    r446   2025-06-07
  Summary: merges r441 formatting helpers with r445 extras:
           • keeps JSON/attributes pretty-print
           • keeps royalties %, arrays, objects handling
           • NEW: inline extrauri_<label>_name / _description
           • theme-safe fg/bg + optional DELETE hook
──────────────────────────────────────────────────────────────*/
import React, { useMemo } from 'react';
import styledPkg          from 'styled-components';
import RenderMedia        from '../utils/RenderMedia.jsx';
import { listUriKeys }    from '../utils/uriHelpers.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helper fns ───────────────────────────────────────*/
const unwrap = (s) => {
  if (typeof s !== 'string') return '';
  const m = s.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : s;
};
const pickUri = (m={}) =>
  unwrap(m.imageUri || m.artifactUri || m.displayUri || m.thumbnailUri || '');

const tryJson = (s) => {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!/^[{\[]/.test(t)) return null;
  try { return JSON.parse(t); } catch { return null; }
};

const pct = (v,d) => (
  (Number(v) / 10 ** d * 100)
    .toFixed(2)
    .replace(/\.00$/,'')
);
const fmtRoyalties = (o={})=>{
  if(!o.shares||typeof o.shares!=='object') return JSON.stringify(o);
  const d = Number(o.decimals||0);
  return Object.entries(o.shares)
    .map(([a,v])=>`${a.slice(0,6)}… : ${pct(v,d)}%`).join(', ');
};
const fmtAttrs = (v)=>{
  if(Array.isArray(v))
    return v.filter(a=>a&&a.name).map(a=>`${a.name}: ${a.value}`).join(', ');
  if(v&&typeof v==='object')
    return Object.entries(v).map(([k,val])=>`${k}: ${val}`).join(', ');
  return String(v);
};
const pretty = (k,v)=>{
  if(Array.isArray(v))  return k==='attributes'?fmtAttrs(v):v.join(', ');
  if(v&&typeof v==='object')
    return k==='royalties'?fmtRoyalties(v):
           k==='attributes'?fmtAttrs(v):
           JSON.stringify(v);
  if(typeof v==='string'){
    const j=tryJson(v); if(j) return pretty(k,j);
  }
  return String(v);
};

/*──────── styled shells ───────────────────────────────────*/
const Card = styled.div`
  border: 2px solid var(--zu-accent, #00c8ff);
  background: var(--zu-bg, #000);
  color:      var(--zu-fg, #f0f0f0);
  padding: 6px 8px 8px;
  font-size: .75rem; line-height: 1.2;
  overflow: hidden;
`;
const Name = styled.h3`
  margin: 0 0 4px;
  font-size: 1.4rem;
  font-family: 'Press Start 2P', monospace;
  color: var(--zu-heading, var(--zu-fg));
  text-align: center; word-break: break-word;
`;
const MetaGrid = styled.dl`
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 6px; row-gap: 2px;
  dt{ white-space:nowrap; color:var(--zu-accent); }
  dd{ margin:0; word-break: break-word; }
`;

/*──────── component ───────────────────────────────────────*/
export default function TokenMetaPanel({
  meta       = null,
  tokenId    = '',
  onRemove,                       // optional (key)=>void
}) {
  const m      = meta && typeof meta==='object' ? meta : {};
  const uriArr = useMemo(()=> listUriKeys(m), [m]);
  const hero   = useMemo(()=> pickUri(m),     [m]);

  /* core KV list */
  const kv = useMemo(()=>{
    const keys = [
      'name','description','mimeType','authors','creators','rights',
      'royalties','mintingTool','accessibility','contentRating',
      'tags','attributes','decimals',
    ];
    return keys.filter(k=>m[k]!==undefined).map(k=>[k,pretty(k,m[k])]);
  },[m]);

  /* pull adjunct name/desc for each extrauri */
  const sidecar = (k)=>{
    const label = k.replace(/^extrauri_/,'');
    return {
      name : m[`extrauri_${label}_name`],
      desc : m[`extrauri_${label}_description`],
    };
  };

  if(!tokenId && !meta) return null;

  return (
    <Card>
      <Name>{m.name || `Token ${tokenId}`}</Name>

      {hero && (
        <RenderMedia uri={hero} alt={m.name}
          style={{ width:96,height:96,objectFit:'contain',
                   display:'block',margin:'0 auto 6px' }} />
      )}

      <MetaGrid>
        {kv.map(([k,v])=>(
          <React.Fragment key={k}>
            <dt>{k}</dt><dd>{v}</dd>
          </React.Fragment>
        ))}

        {uriArr.map((k)=>(
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd style={{ display:'flex',alignItems:'center',gap:6 }}>
              <RenderMedia uri={m[k]} alt={k}
                style={{ width:48,height:48,objectFit:'contain' }} />
              <div style={{ fontSize:'.65rem', lineHeight:1.15 }}>
                {sidecar(k).name && (<div><em>{sidecar(k).name}</em></div>)}
                {sidecar(k).desc && (<div>{sidecar(k).desc}</div>)}
              </div>
              {onRemove && (
                <button type="button"
                  style={{ marginLeft:'auto',
                           background:'var(--zu-accent-sec,#00ffff)',
                           color:'#000',border:'none',padding:'2px 6px',
                           fontSize:'.55rem',fontFamily:'var(--font-pixel)',
                           cursor:'pointer' }}
                  title="delete this URI from token metadata"
                  onClick={()=>onRemove(k)}>
                  DELETE
                </button>
              )}
            </dd>
          </React.Fragment>
        ))}
      </MetaGrid>
    </Card>
  );
}
/* EOF */
