/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenMetaPanel.jsx
  Rev :    r743   2025-07-11 T03:12 UTC
  Summary: links trigger AdminTools via “zu:openAdminTool”
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
  margin:0 0 2px;
  font-size:.8rem;
  text-align:center;
  color:var(--zu-accent);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
`;
const AddrRow = styled.div`
  font-size:.65rem;
  text-align:center;
  display:flex;justify-content:center;align-items:center;gap:4px;
  margin-bottom:4px;
`;
const Warn = styled.div`
  position:absolute;inset:0;background:rgba(0,0,0,.9);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:1rem;
  border:2px dashed var(--zu-accent-sec,#ff0080);
  z-index:5;
  p{margin:.5rem 0;font-size:.7rem;line-height:1.35;}
  a{color:var(--zu-accent);text-decoration:underline;cursor:pointer;}
`;
const Stats = styled.p`
  margin:0 0 6px;font-size:.72rem;text-align:center;
  display:flex;gap:6px;justify-content:center;align-items:center;
  span{display:inline-block;padding:1px 4px;
       border:1px solid var(--zu-fg);white-space:nowrap;}
`;
const RelStats = styled(Stats)`
  margin-top:-2px;gap:4px;font-size:.68rem;opacity:.9;
`;
const MetaGrid = styled.dl`
  margin:0;display:grid;grid-template-columns:max-content 1fr;
  column-gap:6px;row-gap:2px;
  dt{white-space:nowrap;color:var(--zu-accent);}
  dd{margin:0;word-break:break-word;}
`;

/*──────── component ────────────────────────────────────────*/
export default function TokenMetaPanel({
  meta            = null,
  tokenId         = '',
  contractAddress = '',
  onRemove,
}) {
  const { address: wallet, network = 'ghostnet' } = useWalletContext() || {};

  const [warn,   setWarn]   = useState('');
  const [supply, setSupply] = useState(null);
  const [owned,  setOwned]  = useState(null);
  const [rel,    setRel]    = useState({ coll:0, parent:0, child:0 });
  const [copied, setCopied] = useState(false);

  /* suppress repeat warnings after user dismiss */
  const supRef = useRef(new Set());

  const suppressWarn = useCallback((reason) => {
    if (supRef.current.has(reason)) return;
    setWarn(reason);
  }, []);

  const dismissWarn = () => {
    if (warn) supRef.current.add(warn);
    setWarn('');
  };

  /* open AdminTools modal via global event */
  const openTool = useCallback((key) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('zu:openAdminTool', {
      detail: { key, contract: contractAddress },
    }));
  }, [contractAddress]);

  const m      = typeof meta === 'object' && meta ? meta : {};
  const hero   = useMemo(() => pickUri(m), [m]);
  const uriArr = useMemo(() => listUriKeys(m), [m]);

  const ktShort = contractAddress
    ? `${contractAddress.slice(0, 5)}…${contractAddress.slice(-4)}`
    : '';

  const copyAddr = async () => {
    if (!contractAddress || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(contractAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 800);
    } catch {/* ignore */}
  };

  /*──────── relationship counts ────────────────────────────*/
  useEffect(() => {
    if (!contractAddress) return;
    const base =
      network === 'mainnet'
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

  /*──────── supply & balance fetch  ────────────────────────*/
  useEffect(() => {
    let cancelled = false;
    const safeSet = (fn, val) => { if (!cancelled) fn(val); };

    if (!contractAddress || tokenId === '') {
      setSupply(null); setOwned(null); return;
    }
    const base = network === 'mainnet'
      ? 'https://api.tzkt.io/v1'
      : 'https://api.ghostnet.tzkt.io/v1';

    const sumBalances = async () => {
      const rows = await jFetch(
        `${base}/tokens/balances`
        + `?token.contract=${contractAddress}`
        + `&token.tokenId=${tokenId}`
        + `&select=balance&limit=10000`,
      ).catch(() => []);
      return Array.isArray(rows) && rows.length
        ? rows.reduce((t, b) => t + Number(b || 0), 0)
        : NaN;
    };

    const fetchSupply = async () => {
      try {
        const [row] = await jFetch(
          `${base}/tokens?contract=${contractAddress}`
          + `&tokenId=${tokenId}&select=totalSupply&limit=1`,
        ).catch(() => []);
        if (row !== undefined && row !== null) {
          const n = Number(typeof row === 'object' ? row.totalSupply : row);
          if (Number.isFinite(n)) return n;
        }
      } catch {}
      try {
        const bm = await jFetch(
          `${base}/contracts/${contractAddress}`
          + `/bigmaps/total_supply/keys/${tokenId}`,
        ).catch(() => null);
        if (bm?.value?.int) return Number(bm.value.int);
      } catch {}
      try {
        const st = await jFetch(
          `${base}/contracts/${contractAddress}/storage`,
        ).catch(() => null);
        const v = st?.total_supply?.[tokenId];
        if (v?.int) return Number(v.int);
        if (Number.isFinite(+v)) return Number(v);
      } catch {}
      return sumBalances();
    };

    const fetchOwned = async () => {
      if (!wallet) return NaN;
      const rows = await jFetch(
        `${base}/tokens/balances`
        + `?account=${wallet}`
        + `&token.contract=${contractAddress}`
        + `&token.tokenId=${tokenId}`
        + `&limit=1`,
      ).catch(() => []);
      if (!rows.length) return 0;
      const row = rows[0];
      return Number(typeof row === 'object' ? row.balance : row);
    };

    (async () => {
      const [sup, own] = await Promise.all([fetchSupply(), fetchOwned()]);
      safeSet(setSupply, Number.isFinite(sup) ? sup : undefined);
      safeSet(setOwned , Number.isFinite(own) ? own : undefined);
    })();

    return () => { cancelled = true; };
  }, [contractAddress, tokenId, wallet, network]);

  /*──────── meta grid pairs ────────────────────────────────*/
  const kvPairs = useMemo(() => {
    const keys = [
      'name', 'description', 'mimeType', 'authors', 'creators', 'rights',
      'royalties', 'mintingTool', 'accessibility', 'contentRating',
      'tags', 'attributes', 'decimals',
    ];
    return keys
      .filter((k) => m[k] !== undefined)
      .map((k) => [k, pretty(k, m[k])]);
  }, [m]);

  if (tokenId === '') return null;
  if (meta === null) {
    return (
      <Card style={{ textAlign: 'center' }}>
        <LoadingSpinner size={48} style={{ margin: '12px auto' }} />
      </Card>
    );
  }

  /*──────── JSX ───────────────────────────────────────────*/
  return (
    <Card>
      <Title>{m.name || `Token ${tokenId}`}</Title>

      {ktShort && (
        <AddrRow>
          <code style={{ opacity: .8 }}>{ktShort}</code>
          <PixelButton
            size="xs"
            title="copy KT1"
            aria-label={copied ? 'Address copied' : 'Copy contract address'}
            onClick={copyAddr}
            style={{ padding: '0 4px', lineHeight: 1 }}
          >
            {copied ? '✓' : '📋'}
          </PixelButton>
        </AddrRow>
      )}

      {warn && (
        <Warn>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--zu-accent-sec)' }}>
            Broken&nbsp;Media&nbsp;URI
          </h3>
          <p>
            This token’s media link looks invalid
            <br />
            (reason: {warn})
            <br />
            To avoid broken previews on marketplaces:
          </p>
          <p>
            <strong>Options:</strong>
            <br />
            1)&nbsp;If your batch sign sequence was interrupted,&nbsp;
            <a
              href="#repair_uri"
              onClick={(e) => { e.preventDefault(); openTool('repair_uri'); }}
            >
              REPAIR&nbsp;URI
            </a>
            &nbsp;— resume from last slice (upload <em>exact</em> original file).
            <br />
            2)&nbsp;
            <a
              href="#clear_uri"
              onClick={(e) => { e.preventDefault(); openTool('clear_uri'); }}
            >
              CLEAR&nbsp;URI
            </a>
            &nbsp;then append a fresh URI.
          </p>
          <PixelButton onClick={dismissWarn}>Dismiss</PixelButton>
        </Warn>
      )}

      {/* editions + wallet balance */}
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

      {/* relationship counts */}
      <RelStats>
        <span title="Parent addresses">P&nbsp;{rel.parent}</span>
        <span title="Children addresses">C&nbsp;{rel.child}</span>
        <span title="Collaborators">Collab&nbsp;{rel.coll}</span>
      </RelStats>

      {/* preview */}
      {hero && !supRef.current.has('hero') && (
        <RenderMedia
          uri={hero}
          alt={m.name}
          style={{
            width: 96,
            height: 96,
            objectFit: 'contain',
            display: 'block',
            margin: '0 auto 6px',
          }}
          onInvalid={(r) => {
            supRef.current.add('hero');
            suppressWarn(r);
          }}
        />
      )}

      {/* metadata */}
      <MetaGrid>
        {kvPairs.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
        {uriArr.map((k) => (
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RenderMedia
                uri={m[k]}
                alt={k}
                style={{ width: 48, height: 48, objectFit: 'contain' }}
                onInvalid={(r) => suppressWarn(`${k}: ${r}`)}
              />
              {onRemove && (
                <PixelButton
                  size="xs"
                  warning
                  title="delete uri"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => onRemove(k)}
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
   • Added `openTool()` helper that dispatches
     window event “zu:openAdminTool” with ep key + contract.
   • Replaced dead `/repair_uri` & `/clear_uri` links with
     hash anchors that trigger openTool, preventing 404s.
   • Warn <a> gets cursor:pointer and retains accent colour.
   • Rev bumped; lint-clean; all invariants intact.
*/
/* EOF */
