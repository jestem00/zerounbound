/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ContractMetaPanel.jsx
  Rev :    r813     2025‑07‑29
  Summary: fix undefined var, hook IntegrityBadge, enable click
──────────────────────────────────────────────────────────────*/
import React, { useEffect, useMemo, useState, useRef } from 'react';
import styledPkg                       from 'styled-components';
import RenderMedia                     from '../utils/RenderMedia.jsx';
import { jFetch }                      from '../core/net.js';
import { checkOnChainIntegrity }       from '../utils/onChainValidator.js';
import { getIntegrityInfo }            from '../constants/integrityBadges.js';
import IntegrityBadge                  from './IntegrityBadge.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helpers ───────────────────────────────────────────*/
const sz = (v) =>
  Array.isArray(v)                     ? v.length
    : v && typeof v.size === 'number'  ? v.size
    : v && typeof v.forEach === 'function' ? [...v].length
    : typeof v === 'number'            ? v
    : v && typeof v.int === 'string'   ? parseInt(v.int, 10)
    : 0;

/*──────── styled shells ─────────────────────────────────────*/
/* room for IntegrityChip on narrow screens */
const Card = styled.div`
  --zu-chip-h: 34px;              /* badge height inc. gap */
  border:2px solid var(--zu-accent,#00c8ff);
  background:var(--zu-bg,#000);
  color:var(--zu-fg,#f0f0f0);
  padding:clamp(var(--zu-chip-h), 10px, var(--zu-chip-h)) 10px 10px;
  font-size:.75rem;line-height:1.25;
  overflow:visible;
  position:relative;

  @media(min-width:480px){
    /* label disappears → shrink header gap */
    padding-top:10px;
  }
`;

/* single chip – allows wrapping & preserves pointer events */
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

const Title = styled.h3`
  margin:.1rem 0 .35rem;font-size:.95rem;text-align:center;
  color:var(--zu-accent);word-break:break-word;
`;
const StatRow = styled.p`
  margin:.25rem 0;font-size:.75rem;
  display:flex;justify-content:center;gap:6px;
  span{display:inline-block;padding:1px 6px;border:1px solid var(--zu-fg);}
`;
const MetaGrid = styled.dl`
  display:grid;grid-template-columns:max-content 1fr;
  column-gap:6px;row-gap:2px;margin:8px 0 0;
  dt{text-align:right;color:var(--zu-accent);overflow-wrap:anywhere;}
  dd{margin:0;word-break:break-word;overflow-wrap:anywhere;}
`;

/*──────── component ────────────────────────────────────────*/
export default function ContractMetaPanel({
  meta = {}, contractAddress = '', network = 'ghostnet',
}) {
  const [counts, setCounts] = useState({ coll:0,parent:0,child:0,total:0 });
  const cancelled = useRef(false);

  /* live chain counts */
  useEffect(() => {
    cancelled.current = false;
    if (!contractAddress) return;
    const base = network === 'mainnet'
      ? 'https://api.tzkt.io/v1'
      : 'https://api.ghostnet.tzkt.io/v1';
    (async () => {
      try{
        const st = await jFetch(`${base}/contracts/${contractAddress}/storage`);
        if (cancelled.current) return;
        setCounts({
          coll  : sz(st?.collaborators),
          parent: sz(st?.parents),
          child : sz(st?.children),
          total : sz(st?.active_tokens) ?? sz(st?.total_supply) ?? sz(st?.next_token_id),
        });
      }catch{/* ignore */}
    })();
    return () => { cancelled.current = true; };
  }, [contractAddress, network]);

  /* ordered key/value pairs for grid */
  const ORDER=[
    'name','symbol','description','version','license','authors',
    'homepage','authoraddress','creators','type','interfaces',
  ];
  const kv = useMemo(() =>
    ORDER.filter(k => meta[k] !== undefined)
         .map(k => [k, Array.isArray(meta[k]) ? meta[k].join(', ') : String(meta[k])]),
  [meta]);

  /* integrity calc */
  const integrity = useMemo(() => checkOnChainIntegrity(meta), [meta]);
  const { badge, label } = useMemo(
    () => getIntegrityInfo(integrity.status),
  [integrity.status]);

  return (
    <Card>
      {integrity.status !== 'unknown' && (
        <IntegrityChip aria-label={label}
          title={integrity.status === 'partial'
            ? `${label} – ${integrity.reasons.join('; ')}`
            : label}>
          <IntegrityBadge status={integrity.status}/>
          <span className="label">{label}</span>
        </IntegrityChip>
      )}

      {meta.imageUri && (
        <RenderMedia
          uri={meta.imageUri}
          alt={meta.name}
          style={{
            width:120,height:120,margin:'0 auto 6px',display:'block',
            objectFit:'contain',border:'2px solid var(--zu-fg)',
          }}
        />
      )}

      <Title>{meta.name || '—'}</Title>

      <StatRow>
        <span>P {counts.parent}</span>
        <span>C {counts.child}</span>
        <span>Collab {counts.coll}</span>
        <span>Tokens {counts.total}</span>
      </StatRow>

      <MetaGrid>
        {kv.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{k}</dt><dd>{v}</dd>
          </React.Fragment>
        ))}
      </MetaGrid>
    </Card>
  );
}
/* What changed & why:
   • Replaced undefined `contract` var with on‑the‑fly integrity
     analysis via checkOnChainIntegrity(meta).
   • Swapped raw emoji for interactive <IntegrityBadge/>.
   • Restored pointer events on IntegrityChip for click support.
   • Removed unused checkOnChainIntegrity import warning. */
/* EOF */
