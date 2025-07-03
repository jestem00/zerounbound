/*──────── src/ui/ContractMetaPanelContracts.jsx ────────*/
/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ContractMetaPanelContracts.jsx
  Rev :    r2     2025‑08‑22
  Summary: ipfs:// → https http gateway so preview renders
──────────────────────────────────────────────────────────────*/
import React, { useMemo, useState } from 'react';
import PropTypes                    from 'prop-types';
import styledPkg                    from 'styled-components';

import RenderMedia                  from '../utils/RenderMedia.jsx';
import { checkOnChainIntegrity }    from '../utils/onChainValidator.js';
import { getIntegrityInfo }         from '../constants/integrityBadges.js';
import IntegrityBadge               from './IntegrityBadge.jsx';
import PixelButton                  from './PixelButton.jsx';
import { copyToClipboard }          from '../utils/formatAddress.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helpers ───────────────────────────────────────────*/
const ipfsToHttp = (u='') => u.replace(/^ipfs:\/\//,'https://ipfs.io/ipfs/');
const PLACEHOLDER = '/sprites/cover_default.svg';

/*──────── styled shells ─────────────────────────────────────*/
const Card = styled.section`
  border: 2px solid var(--zu-accent,#00c8ff);
  background: var(--zu-bg,#000);
  color: var(--zu-fg,#f0f0f0);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  margin-bottom: 20px;
  @media(min-width:720px){
    flex-direction: row;
    align-items: flex-start;
  }
`;

const Thumb = styled.div`
  flex: 0 0 120px;
  width: 120px;
  height: 120px;
  border: 2px solid var(--zu-fg,#fff);
  background: var(--zu-bg-dim,#111);
  display: flex; align-items:center; justify-content:center;
  img,video,object,model-viewer{ width:100%; height:100%; object-fit:contain; }
`;

const Body = styled.div`
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const TitleRow = styled.div`
  display:flex;flex-wrap:wrap;gap:6px;align-items:center;
  h2{
    margin:0; font-size:1rem; line-height:1.2;
    word-break:break-word; color:var(--zu-accent);
  }
  .badge{ font-size:1.1rem; }
`;

const AddrRow = styled.div`
  font-size:.75rem; opacity:.8; display:flex; align-items:center; gap:6px;
  code{word-break:break-all;}
  button{ line-height:1; padding:0 4px; font-size:.65rem; }
`;

const Desc = styled.p`
  margin:6px 0 0; font-size:.8rem; line-height:1.35; white-space:pre-wrap;
`;

const StatRow = styled.div`
  display:flex; gap:10px; font-size:.8rem; flex-wrap:wrap;
  span{ border:1px solid var(--zu-fg); padding:1px 6px; white-space:nowrap; }
`;

/*──────── component ───────────────────────────────────────*/
export default function ContractMetaPanelContracts({
  meta = {},
  contractAddress = '',
  network = 'ghostnet',
  stats = { tokens:'…', owners:'…', sales:'…' },
}) {
  const [copied, setCopied] = useState(false);

  const integrity = useMemo(() => checkOnChainIntegrity(meta), [meta]);
  const { label } = useMemo(
    () => getIntegrityInfo(integrity.status),
  [integrity.status]);

  const onCopy = () => {
    copyToClipboard(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 900);
  };

  const [thumbOk, setThumbOk] = useState(true);
  const thumb = thumbOk
    ? ipfsToHttp(meta.imageUri || meta.thumbnailUri || meta.displayUri || '')
    : PLACEHOLDER;

  return (
    <Card>
      <Thumb>
        <RenderMedia
          uri={thumb}
          alt={meta.name}
          onInvalid={()=>setThumbOk(false)}
        />
      </Thumb>

      <Body>
        <TitleRow>
          <h2>{meta.name || 'Untitled Collection'}</h2>
          <span className="badge" title={label}>
            <IntegrityBadge status={integrity.status}/>
          </span>
        </TitleRow>

        <AddrRow>
          <code>{contractAddress}</code>
          <PixelButton size="xs" onClick={onCopy}>
            {copied ? '✓' : '📋'}
          </PixelButton>
        </AddrRow>

        {meta.description && (
          <Desc>{meta.description}</Desc>
        )}

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
  meta: PropTypes.object,
  contractAddress: PropTypes.string.isRequired,
  network: PropTypes.string,
  stats: PropTypes.shape({
    tokens : PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    owners : PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    sales  : PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }),
};
/* What changed & why (r2):
   • Converts ipfs:// URIs → https://ipfs.io/ipfs/ ensuring preview
     renders under RenderMedia (I41) without altering source meta. */