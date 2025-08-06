/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenMetaPanel.jsx
  Rev :    r755   2025‑08‑04
  Summary: restore full TokenMetaPanel with unique keys fix
──────────────────────────────────────────────────────────────*/

import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from 'react';
import styledPkg from 'styled-components';

import RenderMedia from '../utils/RenderMedia.jsx';
import { listUriKeys } from '../utils/uriHelpers.js';
import { useWalletContext } from '../contexts/WalletContext.js';
import { jFetch } from '../core/net.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import PixelButton from './PixelButton.jsx';
import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import { getIntegrityInfo } from '../constants/integrityBadges.js';
import IntegrityBadge from './IntegrityBadge.jsx';
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';
import { shortAddr } from '../utils/formatAddress.js';
import { NETWORK_KEY } from '../config/deployTarget.js';

// styled-components factory helper; styledPkg.default on latest
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helpers ───────────────────────────────────────────*/
// Extract the src from an HTML <img> tag contained within a string.
const unwrapImgSrc = (s = '') =>
  (s.match(/<img[^>]+src=["']([^"']+)["']/i) || [, ''])[1] || s;

// Pick the best URI candidate from the metadata object.
const pickUri = (m = {}) =>
  unwrapImgSrc(
    m.imageUri || m.artifactUri || m.displayUri || m.thumbnailUri || '',
  );

// Convert a share value to a percentage string with appropriate decimals.
const pct = (v, d) => (Number(v) / 10 ** d * 100)
  .toFixed(2)
  .replace(/\.00$/, '');

// Format a royalties object into a human‑readable string.
const fmtRoyalties = (o = {}) =>
  o.shares
    ? Object.entries(o.shares)
        .map(([a, v]) => `${a.slice(0, 6)}… : ${pct(v, o.decimals || 0)}%`)
        .join(', ')
    : JSON.stringify(o);

// Format an attributes array or object into a string.
const fmtAttrs = (v) => Array.isArray(v)
  ? v.filter((a) => a && a.name).map((a) => `${a.name}: ${a.value}`).join(', ')
  : Object.entries(v || {})
      .filter(([, val]) => val !== undefined && val !== null && val !== '')
      .map(([k, val]) => `${k}: ${val}`)
      .join(', ');

// Pretty‑print metadata values based on key type.
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
// Determine the length of various storage types (array, set, bigmap).
const sz = (v) =>
  Array.isArray(v)                     ? v.length
    : v && typeof v.size === 'number'  ? v.size
    : v && typeof v.forEach === 'function' ? [...v].length
    : typeof v === 'number'            ? v
    : v && typeof v.int === 'string'   ? parseInt(v.int, 10)
    : 0;

// Build a link for admin‑filtered explore pages.
const hrefFor = (addr = '') => `/explore?cmd=tokens&admin=${addr}`;

/*──────── styled shells ─────────────────────────────────────*/
const Card = styled.div`
  --zu-chip-h: 34px;
  border:2px solid var(--zu-accent,#00c8ff);
  background:var(--zu-bg,#000);
  color:var(--zu-fg,#f0f0f0);
  padding:clamp(var(--zu-chip-h), 6px, var(--zu-chip-h)) 8px 8px;
  font-size:.75rem;line-height:1.25;overflow:hidden;
  position:relative;

  @media(min-width:480px){
    padding-top:6px;
  }
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

// Chip displaying an integrity badge and label.
const IntegrityChip = styled.span`
  position:absolute;top:4px;right:4px;z-index:4;
  display:flex;align-items:center;gap:4px;flex-wrap:wrap;
  max-width:calc(100% - 8px);
  font-size:1rem;line-height:1;
  padding:.15rem .4rem;border:1px solid var(--zu-fg);border-radius:3px;
  background:var(--zu-bg);
  .label{font-size:.55rem;white-space:nowrap;}
  @media(min-width:480px){
    background:transparent;border:none;gap:0;
    .label{display:none;}
  }
`;

// Determine the primary author key from metadata.
const primaryAuthorKey = (m = {}) =>
  m.authors !== undefined ? 'authors'
  : m.artists !== undefined ? 'artists'
  : 'authors';

/*════════ component ════════════════════════════════════════*/
export default function TokenMetaPanel({
  meta            = null,
  tokenId         = '',
  contractAddress = '',
  contractVersion: _contractVersion = '',
  onRemove,
}) {
  // Access wallet address and network from context. Default to ghostnet.
  const { address: wallet, network = 'ghostnet' } = useWalletContext() || {};

  /* Normalize metadata into a plain object.  If meta is null or not
   * an object, use an empty object to avoid null checks.  This must be
   * declared before any hooks that reference metaObj. */
  const metaObj = typeof meta === 'object' && meta ? meta : {};

  /* State variables */
  const [warn,   setWarn]   = useState('');            // warning message overlay
  const [supply, setSupply] = useState(null);          // total token supply
  const [owned,  setOwned]  = useState(null);          // number owned by wallet
  const [rel,    setRel]    = useState({ coll:0, parent:0, child:0 }); // relationship counts
  const [copied, setCopied] = useState(false);         // copy address feedback
  const [domains, setDomains] = useState({});          // resolved .tez domains
  const [showAllAuthors, setShowAllAuthors] = useState(false);
  const [showAllCreators, setShowAllCreators] = useState(false);

  /* Domain resolution: resolve .tez domains for all tz/kt addresses
   * found in authors and creators lists. Use NETWORK_KEY to honour the
   * current network. Cache results keyed by lowercased address. */
  useEffect(() => {
    const addrs = new Set();
    // gather addresses from authors and creators lists
    (metaObj.authors ?? metaObj.artists ?? []).forEach((item) => {
      if (typeof item === 'string' && /^(tz|kt)/i.test(item.trim())) {
        addrs.add(item);
      }
    });
    (metaObj.creators ?? []).forEach((item) => {
      if (typeof item === 'string' && /^(tz|kt)/i.test(item.trim())) {
        addrs.add(item);
      }
    });
    // fetch domain for each address if not already resolved
    addrs.forEach((addr) => {
      const key = addr.toLowerCase();
      if (domains[key] !== undefined) return;
      (async () => {
        try {
          const name = await resolveTezosDomain(addr, NETWORK_KEY);
          setDomains((prev) => {
            if (prev[key] !== undefined) return prev;
            return { ...prev, [key]: name };
          });
        } catch {
          // ignore lookup failures
        }
      })();
    });
  }, [metaObj, domains]);

  /* Format a single author/creator entry.  If a domain has been
   * resolved, return that domain; otherwise, if the value contains a dot,
   * treat it as a human name or domain; addresses are truncated via
   * shortAddr for readability. */
  const formatEntry = useCallback((val) => {
    if (!val || typeof val !== 'string') return String(val || '');
    const v = val.trim();
    const key = v.toLowerCase();
    if (domains[key]) return domains[key];
    if (v.includes('.')) return v;
    if (/^(tz|kt)/i.test(v) && v.length > 12) return shortAddr(v);
    return v;
  }, [domains]);

  /* Render a comma-separated list of entries with an optional More toggle.
   * Each element is wrapped in a React.Fragment with a unique key. */
  const renderEntryList = useCallback((list, showAll, toggleFn) => {
    const arr = Array.isArray(list)
      ? list
      : list != null
        ? [list]
        : [];
    const display = showAll ? arr : arr.slice(0, 3);
    const items = [];
    display.forEach((item, idx) => {
      const prefix = idx > 0 ? ', ' : '';
      const formatted = formatEntry(item);
      const isAddr = typeof item === 'string' && /^(tz|kt)/i.test(item.trim());
      const key = `${item}-${idx}`;
      items.push(
        isAddr ? (
          <React.Fragment key={key}>
            {prefix}
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a onClick={() => onRemove && onRemove(item)} href={hrefFor(item)}>{formatted}</a>
          </React.Fragment>
        ) : (
          <React.Fragment key={key}>
            {prefix}
            {formatted}
          </React.Fragment>
        ),
      );
    });
    if (arr.length > 3 && !showAll) {
      items.push(
        <React.Fragment key="more-button">
          … 
          <button
            onClick={() => toggleFn(true)}
            style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
          >More</button>
        </React.Fragment>,
      );
    }
    return items;
  }, [formatEntry, onRemove]);

  /* Reference for suppressed warnings.  Prevents repeated warnings from
   * resurfacing after dismissal. */
  const supRef = useRef(new Set());
  const suppressWarn = useCallback((r) => {
    if (supRef.current.has(r)) return;
    setWarn(r);
  }, []);
  const dismissWarn = () => { if (warn) supRef.current.add(warn); setWarn(''); };

  /*AdminTools opener: dispatch custom event to open an entry‑point form.
   * Called when clicking the integrity chip or update buttons. */
  const openTool = useCallback((key) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('zu:openAdminTool', {
      detail: { key, contract: contractAddress },
    }));
  }, [contractAddress]);

  /*──────── memo‑derived values ─*/
  const hero      = useMemo(() => pickUri(metaObj), [metaObj]);
  const uriArr    = useMemo(() => listUriKeys(metaObj), [metaObj]);

  /* Adaptive hero styling: fill width for audio/video; fixed size otherwise. */
  const heroStyle = useMemo(() => {
    const mime = hero.startsWith('data:')
      ? hero.slice(5, hero.indexOf(';')).split(/[;,]/)[0] || ''
      : '';
    if (/^audio\//i.test(mime) || /^video\//i.test(mime)) {
      return {
        width: '100%',
        maxHeight: 120,
        display: 'block',
        margin: '0 auto 6px',
      };
    }
    // default square thumbnail for images & svg
    return {
      width: 96,
      height: 96,
      objectFit: 'contain',
      display: 'block',
      margin: '0 auto 6px',
    };
  }, [hero]);

  /* Compute integrity status and label from metadata. */
  const integrity = useMemo(() => checkOnChainIntegrity(metaObj), [metaObj]);
  const { label } = useMemo(() => getIntegrityInfo(integrity.status), [integrity.status]);

  /* Build list of key-value pairs for metadata fields to display.
   * Exclude authors/artists and creators since they are rendered separately. */
  const kvPairs = useMemo(() => {
    const keys = [
      'name', 'description', 'mimeType', 'rights',
      'royalties', 'mintingTool', 'accessibility', 'contentRating',
      'tags', 'attributes', 'decimals',
    ];
    return keys
      .filter((k) => metaObj[k] !== undefined)
      .map((k) => [k, pretty(k, metaObj[k])]);
  }, [metaObj]);

  /* Shorten KT1 address for display. */
  const ktShort = contractAddress
    ? `${contractAddress.slice(0, 5)}…${contractAddress.slice(-4)}`
    : '';

  /* Copy contract address to clipboard with UI feedback. */
  const copyAddr = async () => {
    if (!contractAddress || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(contractAddress);
      setCopied(true); setTimeout(() => setCopied(false), 800);
    } catch {}
  };

  /* Relationship counts: fetch collaborators, parents and children via TzKT.
   * This runs on contract or network changes. */
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
      } catch {
        // ignore network errors
      }
    })();
  }, [contractAddress, network]);

  /* Supply and wallet balance: compute total supply and owned tokens.
   * fallback to zero when queries fail. */
  useEffect(() => {
    let cancelled = false;
    const safeSet = (fn, v) => { if (!cancelled) fn(v); };
    if (!contractAddress || tokenId === '') {
      setSupply(null); setOwned(null);
      return;
    }

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
          return Number.isFinite(n) ? n : undefined;
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

  /*──────── render ─*/
  // If no token ID has been provided, render nothing.
  if (tokenId === '') return null;
  // While metadata is still loading (null), show a spinner.
  if (meta === null) {
    return (
      <Card>
        <LoadingSpinner />
      </Card>
    );
  }

  return (
    <Card>
      {/* Integrity chip: show status and label if known */}
      {integrity.status !== 'unknown' && (
        <IntegrityChip
          aria-label={label}
          title={label}
          onClick={() => openTool('integrity')}
        >
          {/* Display the badge icon alongside the label to clarify status */}
          <IntegrityBadge status={integrity.status} />
          <span className="label">{label}</span>
        </IntegrityChip>
      )}

      {/* Address row with copy button */}
      {ktShort && (
        <AddrRow onClick={copyAddr}>
          <span>{ktShort}</span>
          <span>{copied ? '✓' : '📋'}</span>
        </AddrRow>
      )}

      {/* Supply and owned counts */}
      <Stats>
        {supply === null
          ? <LoadingSpinner size="small" />
          : supply === undefined
            ? null
            : <>Total { supply } </>}
        {wallet && (
          owned === null
            ? <LoadingSpinner size="small" />
            : owned === undefined
              ? null
              : <>Owned { owned } </>
        )}
      </Stats>

      {/* Relationship counts */}
      <RelStats>
        <>P {rel.parent} </>
        <>C {rel.child} </>
        <>Collab {rel.coll} </>
      </RelStats>

      {/* Hero preview */}
      {hero && !supRef.current.has('hero') && (
        <>
          <RenderMedia uri={hero} style={heroStyle} alt="Hero Preview" />
        </>
      )}

      {/* Metadata grid */}
      <MetaGrid>
        {/* Authors row */}
        {(metaObj.authors ?? metaObj.artists ?? []).length > 0 && (
          <>
            <dt>{primaryAuthorKey(metaObj)}</dt>
            <dd>{renderEntryList(metaObj.authors ?? metaObj.artists ?? [], showAllAuthors, setShowAllAuthors)}</dd>
          </>
        )}
        {/* Creators row */}
        {(metaObj.creators ?? []).length > 0 && (
          <>
            <dt>Creators</dt>
            <dd>{renderEntryList(metaObj.creators ?? [], showAllCreators, setShowAllCreators)}</dd>
          </>
        )}
        {/* Other metadata rows */}
        {kvPairs.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
        {/* URI rows: show integrity badge, preview and delete button */}
        {uriArr.map((k) => {
          const { status: uriStatus } = checkOnChainIntegrity({ [k]: metaObj[k] }) || { status: 'unknown' };
          return (
            <React.Fragment key={k}>
              <dt>{k}</dt>
              <dd style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <IntegrityBadge status={uriStatus} />
                <RenderMedia
                  uri={metaObj[k]}
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
          );
        })}
      </MetaGrid>

      {/* Warning overlay */}
      {warn && (
        <Warn>
          <p>{warn}</p>
          <PixelButton onClick={dismissWarn}>Dismiss</PixelButton>
        </Warn>
      )}
    </Card>
  );
}

/* What changed & why: Restored full functionality from the original
   TokenMetaPanel while fixing React key warnings in renderEntryList.
   Reintroduced domain resolution, loading spinner, integrity chip, and
   URI integrity badges. */