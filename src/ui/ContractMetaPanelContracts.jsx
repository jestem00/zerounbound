/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ContractMetaPanelContracts.jsx
  Rev :    r4      2025‑09‑05
  Summary: robust on‑chain meta decode + data‑URI‑only thumbnail
──────────────────────────────────────────────────────────────*/
import React, { useMemo, useState } from 'react';
import PropTypes                    from 'prop-types';
import styledPkg                    from 'styled-components';

import RenderMedia                  from '../utils/RenderMedia.jsx';
import { checkOnChainIntegrity }    from '../utils/onChainValidator.js';
import { getIntegrityInfo }         from '../constants/integrityBadges.js';
import decodeHexFields, { decodeHexJson } from '../utils/decodeHexFields.js';
import IntegrityBadge               from './IntegrityBadge.jsx';
import PixelButton                  from './PixelButton.jsx';
import { copyToClipboard }          from '../utils/formatAddress.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helpers ───────────────────────────────────────────*/
/* Fully‑on‑chain only → reject anything that isn’t a data‑URI */
const VALID_DATA_URI_RE = /^data:/i;
const PLACEHOLDER       = '/sprites/cover_default.svg';

/** best‑effort meta decoding (hex → json → deep‑hex‑fields) */
function toMetaObject(meta) {
  if (!meta) return {};
  /* string input — may be plain JSON or hex‑wrapped JSON */
  if (typeof meta === 'string') {
    /* 1. try JSON.parse straight away              */
    try { return decodeHexFields(JSON.parse(meta)); } catch {/* ignore */}
    /* 2. try “0x…” hex‑encoded JSON                */
    const parsed = decodeHexJson(meta);
    if (parsed) return decodeHexFields(parsed);
    return {};
  }
  /* object input — still decode nested hex fields  */
  return decodeHexFields(meta);
}

/** pick the first data‑URI from the usual TZIP keys                */
function selectThumb(m = {}) {
  const uri = m.imageUri || m.thumbnailUri || m.displayUri || m.artifactUri;
  return (typeof uri === 'string' && VALID_DATA_URI_RE.test(uri.trim()))
    ? uri.trim() : '';
}

/*──────── styled shells ─────────────────────────────────────*/
const Card = styled.section`
  border:2px solid var(--zu-accent);background:var(--zu-bg);
  color:var(--zu-fg);display:flex;flex-direction:column;gap:10px;
  padding:12px;margin-bottom:20px;
  @media(min-width:720px){flex-direction:row;align-items:flex-start;}
`;
const Thumb = styled.div`
  flex:0 0 120px;width:120px;height:120px;border:2px solid var(--zu-fg);
  background:var(--zu-bg-dim);display:flex;align-items:center;justify-content:center;
  img,video,model-viewer,object{width:100%;height:100%;object-fit:contain;}
`;
const Body = styled.div`
  flex:1 1 auto;display:flex;flex-direction:column;gap:6px;min-width:0;
`;
const TitleRow = styled.div`
  display:flex;flex-wrap:wrap;gap:6px;align-items:center;
  h2{margin:0;font-size:1rem;line-height:1.2;word-break:break-word;color:var(--zu-accent);}
  .badge{font-size:1.1rem;}
`;
const AddrRow = styled.div`
  font-size:.75rem;opacity:.8;display:flex;align-items:center;gap:6px;
  code{word-break:break-all;}button{padding:0 4px;font-size:.65rem;line-height:1;}
`;
const Desc   = styled.p`margin:6px 0 0;font-size:.8rem;line-height:1.35;white-space:pre-wrap;`;
const StatRow= styled.div`
  display:flex;gap:10px;font-size:.8rem;flex-wrap:wrap;
  span{border:1px solid var(--zu-fg);padding:1px 6px;white-space:nowrap;}
`;

/*──────── component ───────────────────────────────────────*/
export default function ContractMetaPanelContracts({
  meta = {},
  contractAddress = '',
  stats = { tokens:'…', owners:'…', sales:'…' },
}) {
  const [copied, setCopied]   = useState(false);
  const [thumbOk, setThumbOk] = useState(true);

  /* fully‑decoded, hex‑free meta object */
  const metaObj = useMemo(() => toMetaObject(meta), [meta]);

  /* badge & integrity calc */
  const integrity    = useMemo(() => checkOnChainIntegrity(metaObj), [metaObj]);
  const { label }    = useMemo(() => getIntegrityInfo(integrity.status), [integrity.status]);

  /* select thumbnail strictly from data: URIs */
  const thumb        = selectThumb(metaObj);
  const showFallback = !thumbOk || !thumb;

  const onCopy = () => {
    copyToClipboard(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 900);
  };

  return (
    <Card>
      <Thumb>
        {showFallback ? (
          <img src={PLACEHOLDER} alt="" />
        ) : (
          <RenderMedia
            uri={thumb}
            alt={metaObj.name}
            onInvalid={() => setThumbOk(false)}
          />
        )}
      </Thumb>

      <Body>
        <TitleRow>
          <h2>{metaObj.name || 'Untitled Collection'}</h2>
          <span className="badge" title={label}>
            <IntegrityBadge status={integrity.status} />
          </span>
        </TitleRow>

        <AddrRow>
          <code>{contractAddress}</code>
          <PixelButton size="xs" onClick={onCopy}>
            {copied ? '✓' : '📋'}
          </PixelButton>
        </AddrRow>

        {metaObj.description && <Desc>{metaObj.description}</Desc>}

        <StatRow>
          <span>{stats.tokens} Tokens</span>
          <span>{stats.owners} Owners</span>
          <span>{stats.sales} For Sale</span>
        </StatRow>
      </Body>
    </Card>
  );
}

ContractMetaPanelContracts.propTypes = {
  meta: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
  contractAddress: PropTypes.string.isRequired,
  stats: PropTypes.shape({
    tokens : PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    owners : PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    sales  : PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }),
};
/* What changed & why (r4):
   • Replaced legacy ipfs→http shim with strict data‑URI enforcement (I24). 
   • Added toMetaObject() → resilient deep hex‑decode for all meta inputs. 
   • selectThumb() picks first valid data‑URI; fallback placeholder otherwise.
   • Ensures integrity badge & title render once on‑chain meta is decoded.
*/
/* EOF */
