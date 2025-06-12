/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenMetaPanel.jsx
  Rev :    r648   2025-06-19
  Summary: supply/owned restore
           • Adds balance-sum fallback for totalSupply
           • Owned resolver handles numeric OR object rows
           • “no record” ⇒ owned 0 (never undefined)
──────────────────────────────────────────────────────────────*/
import React, { useEffect, useMemo, useState } from 'react';
import styledPkg            from 'styled-components';

import RenderMedia          from '../utils/RenderMedia.jsx';
import { listUriKeys }      from '../utils/uriHelpers.js';
import { useWalletContext } from '../contexts/WalletContext.js';
import { jFetch }           from '../core/net.js';
import LoadingSpinner       from './LoadingSpinner.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helpers ───────────────────────────────────────────*/
const unwrapImgSrc = (s='') =>
  (s.match(/<img[^>]+src=["']([^"']+)["']/i) || [,''])[1] || s;

const pickUri = (m={}) =>
  unwrapImgSrc(
    m.imageUri || m.artifactUri || m.displayUri || m.thumbnailUri || '',
  );

const pct = (v,d) =>
  (Number(v)/10**d*100).toFixed(2).replace(/\.00$/,'');

const fmtRoyalties = (o={}) =>
  o.shares
    ? Object.entries(o.shares)
        .map(([a,v])=>`${a.slice(0,6)}… : ${pct(v,o.decimals||0)}%`)
        .join(', ')
    : JSON.stringify(o);

const fmtAttrs = (v)=>Array.isArray(v)
  ? v.filter((a)=>a && a.name).map((a)=>`${a.name}: ${a.value}`).join(', ')
  : Object.entries(v||{}).map(([,val],i)=>val && `${Object.keys(v)[i]}: ${val}`)
      .filter(Boolean).join(', ');

const pretty = (k,v)=>{
  if(Array.isArray(v)) return k==='attributes'?fmtAttrs(v):v.join(', ');
  if(v && typeof v==='object')
    return k==='royalties'  ? fmtRoyalties(v)
         : k==='attributes' ? fmtAttrs(v)
         : JSON.stringify(v);
  try{ return pretty(k,JSON.parse(v)); }catch{return String(v); }
};

/*──────── styled shells ─────────────────────────────────────*/
const Card = styled.div`
  border:2px solid var(--zu-accent,#00c8ff);
  background:var(--zu-bg,#000);
  color:var(--zu-fg,#f0f0f0);
  padding:6px 8px 8px;
  font-size:.75rem;line-height:1.25;overflow:hidden;
`;
const Name = styled.h3`
  margin:0;font:1.4rem/1 'Press Start 2P',monospace;
  text-align:center;word-break:break-word;
`;
const Addr  = styled.p`
  margin:.15rem 0 4px;font-size:.62rem;text-align:center;
  opacity:.75;word-break:break-all;
`;
const Stats = styled.p`
  margin:0 0 6px;font-size:.72rem;text-align:center;
  display:flex;gap:6px;justify-content:center;align-items:center;
  span{display:inline-block;padding:1px 4px;
       border:1px solid var(--zu-fg);white-space:nowrap;}
`;
const MetaGrid = styled.dl`
  margin:0;display:grid;grid-template-columns:max-content 1fr;
  column-gap:6px;row-gap:2px;
  dt{white-space:nowrap;color:var(--zu-accent);}
  dd{margin:0;word-break:break-word;}
`;

/*════════ component ════════════════════════════════════════*/
export default function TokenMetaPanel({
  meta            = null,
  tokenId         = '',
  contractAddress = '',
  onRemove,
}) {
  const { address: wallet, network='ghostnet' } = useWalletContext() || {};

  /*──── early exits ───*/
  if(tokenId==='')        return null;
  if(meta===null){
    return(
      <Card style={{textAlign:'center'}}>
        <LoadingSpinner size={48} style={{margin:'12px auto'}}/>
      </Card>
    );
  }

  /*──── derived ───────*/
  const m      = typeof meta==='object' && meta ? meta : {};
  const hero   = useMemo(()=>pickUri(m), [m]);
  const uriArr = useMemo(()=>listUriKeys(m), [m]);

  const [supply,setSupply] = useState(null);   /* null=loading, undefined=unknown */
  const [owned ,setOwned ] = useState(null);

  /*──────── live look-ups ──────────────────────────────────*/
  useEffect(()=>{
    let cancelled=false;
    const safeSet=(fn,val)=>{ if(!cancelled) fn(val); };

    if(!contractAddress || tokenId===''){
      setSupply(null); setOwned(null); return;
    }
    const base = network==='mainnet'
      ? 'https://api.tzkt.io/v1'
      : 'https://api.ghostnet.tzkt.io/v1';

    /* helper: sum balances fallback */
    const sumBalances = async()=>{
      const rows = await jFetch(
        `${base}/tokens/balances`
        + `?token.contract=${contractAddress}`
        + `&token.tokenId=${tokenId}`
        + `&select=balance&limit=10000`,
      ).catch(()=>[]);
      return Array.isArray(rows) && rows.length
        ? rows.reduce((t,b)=>t+Number(b||0),0)
        : NaN;
    };

    const fetchSupply = async()=>{
      /* ① tokens endpoint (indexed) */
      try{
        const [row] = await jFetch(
          `${base}/tokens?contract=${contractAddress}`
          + `&tokenId=${tokenId}&select=totalSupply&limit=1`,
        ).catch(()=>[]);
        if(row!==undefined && row!==null){
          const n = Number(
            typeof row==='object' ? row.totalSupply : row,
          );
          if(Number.isFinite(n)) return n;
        }
      }catch{/* ignore */ }

      /* ② big-map direct (v4/v4a mirrors) */
      try{
        const bm = await jFetch(
          `${base}/contracts/${contractAddress}`
          + `/bigmaps/total_supply/keys/${tokenId}`, 1,
        ).catch(()=>null);
        if(bm?.value?.int) return Number(bm.value.int);
      }catch{/* ignore */ }

      /* ③ storage snapshot mirror object */
      try{
        const st = await jFetch(
          `${base}/contracts/${contractAddress}/storage`,
        ).catch(()=>null);
        const v  = st?.total_supply?.[tokenId];
        if(v?.int) return Number(v.int);
        if(Number.isFinite(+v)) return Number(v);
      }catch{/* ignore */ }

      /* ④ aggregate balances (legacy or burned) */
      return sumBalances();
    };

    const fetchOwned = async()=>{
      if(!wallet) return NaN;
      const rows = await jFetch(
        `${base}/tokens/balances`
        + `?account=${wallet}`
        + `&token.contract=${contractAddress}`
        + `&token.tokenId=${tokenId}`
        + `&limit=1`,
      ).catch(()=>[]);
      if(!rows.length) return 0;
      const row = rows[0];
      return Number(
        typeof row==='object' ? row.balance : row,
      );
    };

    (async()=>{
      const [sup,own] = await Promise.all([fetchSupply(), fetchOwned()]);
      safeSet(setSupply, Number.isFinite(sup) ? sup : undefined);
      safeSet(setOwned , Number.isFinite(own) ? own : undefined);
    })();

    return ()=>{ cancelled=true; };
  },[contractAddress, tokenId, wallet, network]);

  /*──────── kv list ────────────────────────────────────────*/
  const kvPairs = useMemo(()=>{
    const keys=[
      'name','description','mimeType','authors','creators','rights',
      'royalties','mintingTool','accessibility','contentRating',
      'tags','attributes','decimals',
    ];
    return keys.filter(k=>m[k]!==undefined)
               .map(k=>[k, pretty(k,m[k])]);
  },[m]);

  /*──────── render ────────────────────────────────────────*/
  return(
    <Card>
      <Name>{m.name || `Token ${tokenId}`}</Name>
      {contractAddress && <Addr>{contractAddress}</Addr>}

      <Stats>
        {supply===null
          ? <LoadingSpinner size={16}/>
          : supply===undefined
            ? null
            : <span title="Total editions">Total&nbsp;{supply}</span>}
        {wallet && (
          owned===null
            ? <LoadingSpinner size={16}/>
            : owned===undefined
              ? null
              : <span title="Editions you own">Owned&nbsp;{owned}</span>
        )}
      </Stats>

      {hero && (
        <RenderMedia
          uri={hero}
          alt={m.name}
          style={{
            width:96,height:96,objectFit:'contain',
            display:'block',margin:'0 auto 6px',
          }}
        />
      )}

      <MetaGrid>
        {kvPairs.map(([k,v])=>(
          <React.Fragment key={k}>
            <dt>{k}</dt><dd>{v}</dd>
          </React.Fragment>
        ))}
        {uriArr.map(k=>(
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd style={{display:'flex',alignItems:'center',gap:6}}>
              <RenderMedia
                uri={m[k]} alt={k}
                style={{width:48,height:48,objectFit:'contain'}}
              />
              {onRemove && (
                <button type="button" title="delete uri"
                  style={{
                    marginLeft:'auto',
                    background:'var(--zu-accent-sec,#00ffff)',
                    color:'#000',border:'none',
                    padding:'2px 6px',fontSize:'.55rem',
                    cursor:'pointer',
                  }}
                  onClick={()=>onRemove(k)}
                >DELETE</button>
              )}
            </dd>
          </React.Fragment>
        ))}
      </MetaGrid>
    </Card>
  );
}
/* EOF */
