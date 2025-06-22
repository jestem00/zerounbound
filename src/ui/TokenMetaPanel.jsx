/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenMetaPanel.jsx
  Rev :    r744‑d   2025‑07‑24
  Summary: responsive integrity chip legend (mobile a11y)
──────────────────────────────────────────────────────────────*/
import React, {
  useEffect, useMemo, useState, useRef, useCallback,
} from 'react';
import styledPkg            from 'styled-components';

import RenderMedia          from '../utils/RenderMedia.jsx';
import { listUriKeys }      from '../utils/uriHelpers.js';
import { useWalletContext } from '../contexts/WalletContext.js';
import { jFetch }           from '../core/net.js';
import LoadingSpinner       from './LoadingSpinner.jsx';
import PixelButton          from './PixelButton.jsx';
import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import {
  getIntegrityInfo,
}                           from '../constants/integrityBadges.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;


/*──────── helpers ───────────────────────────────────────────*/
const unwrapImgSrc = (s = '') =>
  (s.match(/<img[^>]+src=["']([^"']+)["']/i) || [, ''])[1] || s;

const pickUri = (m = {}) =>
  unwrapImgSrc(
    m.imageUri || m.artifactUri || m.displayUri || m.thumbnailUri || '',
  );

const pct = (v, d) => (Number(v) / 10 ** d * 100)
  .toFixed(2)
  .replace(/\.00$/, '');

const fmtRoyalties = (o = {}) =>
  o.shares
    ? Object.entries(o.shares)
        .map(([a, v]) => `${a.slice(0, 6)}… : ${pct(v, o.decimals || 0)}%`)
        .join(', ')
    : JSON.stringify(o);

const fmtAttrs = (v) => Array.isArray(v)
  ? v.filter((a) => a && a.name).map((a) => `${a.name}: ${a.value}`).join(', ')
  : Object.entries(v || {})
      .filter(([, val]) => val !== undefined && val !== null && val !== '')
      .map(([k, val]) => `${k}: ${val}`)
      .join(', ');

const pretty = (k, v) => {
  if (Array.isArray(v)) return k === 'attributes' ? fmtAttrs(v) : v.join(', ');
  if (v && typeof v === 'object') {
    return k === 'royalties'
      ? fmtRoyalties(v)
      : k === 'attributes'
        ? fmtAttrs(v)
        : JSON.stringify(v);
  }
  try { return pretty(k, JSON.parse(v)); } catch { return String(v); }
};

/*──────── util ─────────────────────────────────────────────*/
const sz = (v) =>
  Array.isArray(v)                     ? v.length
    : v && typeof v.size === 'number'  ? v.size
    : v && typeof v.forEach === 'function' ? [...v].length
    : typeof v === 'number'            ? v
    : v && typeof v.int === 'string'   ? parseInt(v.int, 10)
    : 0;

/*──────── styled shells ─────────────────────────────────────*/
const Card = styled.div`
  border:2px solid var(--zu-accent,#00c8ff);
  background:var(--zu-bg,#000);
  color:var(--zu-fg,#f0f0f0);
  padding:6px 8px 8px;
  font-size:.75rem;line-height:1.25;overflow:hidden;
  position:relative;
`;
const Title = styled.h4`
  margin:0 0 2px;font-size:.8rem;text-align:center;
  color:var(--zu-accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
`;
const AddrRow = styled.div`
  font-size:.65rem;text-align:center;
  display:flex;justify-content:center;align-items:center;gap:4px;
  margin-bottom:4px;
`;
const Warn = styled.div`
  position:absolute;inset:0;background:rgba(0,0,0,.9);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:1rem;
  border:2px dashed var(--zu-accent-sec,#ff0080);z-index:5;
  p{margin:.5rem 0;font-size:.7rem;line-height:1.35;}
  a{color:var(--zu-accent);text-decoration:underline;cursor:pointer;}
`;
const Stats = styled.p`
  margin:0 0 6px;font-size:.72rem;text-align:center;
  display:flex;gap:6px;justify-content:center;align-items:center;
  span{display:inline-block;padding:1px 4px;border:1px solid var(--zu-fg);white-space:nowrap;}
`;
const RelStats = styled(Stats)`margin-top:-2px;gap:4px;font-size:.68rem;opacity:.9;`;
const MetaGrid = styled.dl`
  margin:0;display:grid;grid-template-columns:max-content 1fr;
  column-gap:6px;row-gap:2px;
  dt{white-space:nowrap;color:var(--zu-accent);}
  dd{margin:0;word-break:break-word;}
`;

/* responsive integrity chip */
const IntegrityChip = styled.span`
  position:absolute;top:4px;right:4px;z-index:4;
  display:flex;align-items:center;gap:4px;
  font-size:1rem;line-height:1;padding:.15rem .35rem;
  border:1px solid var(--zu-fg);border-radius:3px;
  background:var(--zu-bg);
  .label{font-size:.55rem;}
  @media(min-width:480px){
    background:transparent;border:none;gap:0;
    .label{display:none;}
  }
`;

export default function TokenMetaPanel({
  meta            = null,
  tokenId         = '',
  contractAddress = '',
  onRemove,
}) {
  const { address: wallet, network = 'ghostnet' } = useWalletContext() || {};

  /*── state ─────────────────────────────*/
  const [warn,   setWarn]   = useState('');
  const [supply, setSupply] = useState(null);
  const [owned,  setOwned]  = useState(null);
  const [rel,    setRel]    = useState({ coll:0, parent:0, child:0 });
  const [copied, setCopied] = useState(false);

  /* suppress repeat warnings after user dismiss */
  const supRef = useRef(new Set());
  const suppressWarn = useCallback((r) => {
    if (supRef.current.has(r)) return;
    setWarn(r);
  }, []);
  const dismissWarn = () => { if (warn) supRef.current.add(warn); setWarn(''); };

  /* global AdminTools opener */
  const openTool = useCallback((key) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('zu:openAdminTool', {
      detail: { key, contract: contractAddress },
    }));
  }, [contractAddress]);

   /* stable memo‑derived values */
  const metaObj   = typeof meta === 'object' && meta ? meta : {};
  const hero      = useMemo(() => pickUri(metaObj), [metaObj]);
  const uriArr    = useMemo(() => listUriKeys(metaObj), [metaObj]);
  const integrity = useMemo(() => checkOnChainIntegrity(metaObj), [metaObj]);
  const { badge, label } = useMemo(
    () => getIntegrityInfo(integrity.status),
    [integrity.status],
  );
  const kvPairs = useMemo(() => {
    const keys = [
      'name','description','mimeType','authors','creators','rights',
      'royalties','mintingTool','accessibility','contentRating',
      'tags','attributes','decimals',
    ];
    return keys
      .filter((k) => metaObj[k] !== undefined)
      .map((k) => [k, pretty(k, metaObj[k])]);
  }, [metaObj]);

  const ktShort = contractAddress
    ? `${contractAddress.slice(0, 5)}…${contractAddress.slice(-4)}`
    : '';

  const copyAddr = async () => {
    if (!contractAddress || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(contractAddress);
      setCopied(true); setTimeout(() => setCopied(false), 800);
    } catch {}
  };


  /* relationship counts */
  useEffect(() => {
    if (!contractAddress) return;
    const base = network === 'mainnet'
      ? 'https://api.tzkt.io/v1'
      : 'https://api.ghostnet.tzkt.io/v1';
    (async () => {
      try {
        const st = await jFetch(`${base}/contracts/${contractAddress}/storage`);
        setRel({
          coll  : sz(st?.collaborators),
          parent: sz(st?.parents),
          child : sz(st?.children),
        });
      } catch {}
    })();
  }, [contractAddress, network]);

   /* supply & wallet balance */
  useEffect(() => {
    let cancelled = false;
    const safeSet = (fn, v) => { if (!cancelled) fn(v); };
    if (!contractAddress || tokenId === '') { setSupply(null); setOwned(null); return; }

    const base = network === 'mainnet'
      ? 'https://api.tzkt.io/v1'
      : 'https://api.ghostnet.tzkt.io/v1';

    const sumBalances = async () => {
      const rows = await jFetch(
        `${base}/tokens/balances?token.contract=${contractAddress}&token.tokenId=${tokenId}&select=balance&limit=10000`,
      ).catch(() => []);
      return rows.length ? rows.reduce((t, b) => t + Number(b || 0), 0) : NaN;
    };

    const fetchSupply = async () => {
      try {
        const [row] = await jFetch(
          `${base}/tokens?contract=${contractAddress}&tokenId=${tokenId}&select=totalSupply&limit=1`,
        ).catch(() => []);
        if (row !== undefined && row !== null) {
          const n = Number(typeof row === 'object' ? row.totalSupply : row);
          if (Number.isFinite(n)) return n;
        }
      } catch {}
      try {
        const bm = await jFetch(
          `${base}/contracts/${contractAddress}/bigmaps/total_supply/keys/${tokenId}`,
        ).catch(() => null);
        if (bm?.value?.int) return Number(bm.value.int);
      } catch {}
      try {
        const st = await jFetch(`${base}/contracts/${contractAddress}/storage`).catch(() => null);
        const v = st?.total_supply?.[tokenId];
        if (v?.int) return Number(v.int);
        if (Number.isFinite(+v)) return Number(v);
      } catch {}
      return sumBalances();
    };


    const fetchOwned = async () => {
      if (!wallet) return NaN;
      const [row] = await jFetch(
        `${base}/tokens/balances?account=${wallet}&token.contract=${contractAddress}&token.tokenId=${tokenId}&limit=1`,
      ).catch(() => []);
      return row ? Number(row.balance || row) : 0;
    };

    (async () => {
      const [sup, own] = await Promise.all([fetchSupply(), fetchOwned()]);
      safeSet(setSupply, Number.isFinite(sup) ? sup : undefined);
      safeSet(setOwned , Number.isFinite(own) ? own : undefined);
    })();
    return () => { cancelled = true; };
  }, [contractAddress, tokenId, wallet, network]);


  /*── render ──────────────────────────────*/
  if (tokenId === '') return null;           // ok – hooks already ran

  if (meta === null) {
    return (
      <Card style={{ textAlign: 'center' }}>
        <LoadingSpinner size={48} style={{ margin: '12px auto' }} />
      </Card>
    );
  }

  /*──────── render ───────────────────────────────────────────*/
  if (tokenId === '') return null;
  if (meta === null) {
    return (
      <Card style={{ textAlign:'center' }}>
        <LoadingSpinner size={48} style={{ margin:'12px auto' }} />
      </Card>
    );
  }

  return (
    <Card>
      {integrity.status !== 'unknown' && (
        <IntegrityChip
          aria-label={label}
          title={integrity.status === 'partial'
            ? `${label} – ${integrity.reasons.join('; ')}`
            : label}
        >
          {badge}<span className="label">{label}</span>
        </IntegrityChip>
      )}

      {ktShort && (
        <AddrRow>
          <code style={{ opacity:.8 }}>{ktShort}</code>
          <PixelButton
            size="xs"
            title="copy KT1"
            aria-label={copied ? 'Address copied' : 'Copy contract address'}
            onClick={copyAddr}
            style={{ padding:'0 4px', lineHeight:1 }}
          >
            {copied ? '✓' : '📋'}
          </PixelButton>
        </AddrRow>
      )}

      <Stats>
        {supply === null
          ? <LoadingSpinner size={16} />
          : supply === undefined
            ? null
            : <span title="Total editions">Total&nbsp;{supply}</span>}
        {wallet && (
          owned === null
            ? <LoadingSpinner size={16} />
            : owned === undefined
              ? null
              : <span title="Editions you own">Owned&nbsp;{owned}</span>
        )}
      </Stats>

      <RelStats>
        <span title="Parent addresses">P&nbsp;{rel.parent}</span>
        <span title="Children addresses">C&nbsp;{rel.child}</span>
        <span title="Collaborators">Collab&nbsp;{rel.coll}</span>
      </RelStats>

      {hero && !supRef.current.has('hero') && (
        <RenderMedia
          uri={hero}
          alt={metaObj.name}
          style={{ width:96,height:96,objectFit:'contain',display:'block',margin:'0 auto 6px' }}
          onInvalid={(r) => { supRef.current.add('hero'); suppressWarn(r); }}
        />
      )}

      {warn && (
        <Warn>
          <h3 style={{ margin:0,fontSize:'1rem',color:'var(--zu-accent-sec)' }}>
            Broken&nbsp;Media&nbsp;URI
          </h3>
          <p>
            This token’s media link looks invalid
            <br />(reason: {warn})
            <br />To avoid broken previews on marketplaces:
          </p>
          <p>
            <strong>Options:</strong><br />
            1)&nbsp;If your batch sign sequence was interrupted,&nbsp;
            <a href="#repair_uri" onClick={(e)=>{e.preventDefault();openTool('repair_uri');}}>
              REPAIR&nbsp;URI
            </a>
            &nbsp;— resume from last slice.<br />
            2)&nbsp;
            <a href="#clear_uri" onClick={(e)=>{e.preventDefault();openTool('clear_uri');}}>
              CLEAR&nbsp;URI
            </a>
            &nbsp;then append a fresh URI.
          </p>
          <PixelButton onClick={dismissWarn}>Dismiss</PixelButton>
        </Warn>
      )}

      <MetaGrid>
        {kvPairs.map(([k,v])=>(
          <React.Fragment key={k}>
            <dt>{k}</dt><dd>{v}</dd>
          </React.Fragment>
        ))}
        {uriArr.map((k)=>(
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd style={{ display:'flex',alignItems:'center',gap:6 }}>
              <RenderMedia
                uri={metaObj[k]}
                alt={k}
                style={{ width:48,height:48,objectFit:'contain' }}
                onInvalid={(r)=>suppressWarn(`${k}: ${r}`)}
              />
              {onRemove && (
                <PixelButton
                  size="xs"
                  warning
                  title="delete uri"
                  style={{ marginLeft:'auto' }}
                  onClick={()=>onRemove(k)}
                >
                  DELETE
                </PixelButton>
              )}
            </dd>
          </React.Fragment>
        ))}
      </MetaGrid>
    </Card>
  );
}
/* What changed & why:
   • Introduced IntegrityChip identical to Contract panel for
     consistent UX; shows short text on mobile, hides on desktop.
   • Centralised badge/label via getIntegrityInfo().
   • Removed legacy Badge vars (no dead constants). */
/* EOF */