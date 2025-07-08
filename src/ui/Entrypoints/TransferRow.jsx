/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/TransferRow.jsx
  Rev :    r100   2025‑10‑04
  Summary: reusable row component for batch transfer UI
──────────────────────────────────────────────────────────────*/
import React, { useCallback, useState, useEffect } from 'react';
import styledPkg            from 'styled-components';
import PixelInput           from '../PixelInput.jsx';
import PixelButton          from '../PixelButton.jsx';
import TokenMetaPanel       from '../TokenMetaPanel.jsx';
import { TZKT_API }         from '../../config/deployTarget.js';
import { jFetch }           from '../../core/net.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const RowWrap = styled.div`
  margin:.9rem 0;padding:.9rem;border:2px dashed #1c1c1c;
  display:flex;flex-direction:column;gap:.6rem;position:relative;
`;
const PickerWrap = styled.div`display:flex;gap:.6rem;`;
const Box        = styled.div`position:relative;flex:1;`;
const RemoveBtn  = styled(PixelButton)`
  position:absolute;top:-10px;right:-10px;
  padding:0 6px;line-height:14px;font-size:.8rem;
`;

export default function TransferRow({
  index,
  tokenId,
  amount,
  recips,
  tokOpts,
  loadingTok,
  useSameRecipients,
  onChange,
  onRemove,
  contractAddress = '',
}) {
  /* local state mirrors props until debounce‑update */
  const [tid, setTid]     = useState(tokenId);
  const [amt, setAmt]     = useState(amount);
  const [rcp, setRcp]     = useState(recips);

  /* push changes upward */
  useEffect(() => { onChange({ tokenId:tid, amount:amt, recips:rcp }); },
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [tid, amt, rcp]);

  /* meta preview */
  const [meta, setMeta] = useState(null);
  const loadMeta = useCallback(async () => {
    setMeta(null);
    if (!contractAddress || tid === '') return;
    const [row] = await jFetch(
      `${TZKT_API}/v1/tokens?contract=${contractAddress}&tokenId=${tid}&limit=1`,
    ).catch(() => []);
    setMeta(row?.metadata || {});
  }, [contractAddress, tid]);
  useEffect(() => { void loadMeta(); }, [loadMeta]);

  return (
    <RowWrap>
      <RemoveBtn onClick={onRemove}>×</RemoveBtn>

      <PickerWrap>
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'.5rem' }}>
          <label htmlFor={`tid-${index}`}>Token‑ID *</label>
          <PixelInput
            id={`tid-${index}`}
            placeholder="e.g. 42"
            value={tid}
            onChange={(e)=>setTid(e.target.value.replace(/\D+/g,''))}
          />
        </div>

        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'.5rem' }}>
          <label htmlFor={`tokSel-${index}`}>Owned Tokens</label>
          <Box>
            <select
              id={`tokSel-${index}`}
              style={{ width:'100%',height:32 }}
              disabled={loadingTok}
              onChange={(e)=>setTid(e.target.value)}
            >
              <option value="">
                {loadingTok ? 'Loading…' : tokOpts.length ? 'Select' : '— none —'}
              </option>
              {tokOpts.map(({ id, name }) => (
                <option key={id} value={id}>{name ? `${id} — ${name}` : id}</option>
              ))}
            </select>
          </Box>
        </div>

        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'.5rem' }}>
          <label htmlFor={`amt-${index}`}>Amount *</label>
          <PixelInput
            id={`amt-${index}`}
            type="number"
            min="1"
            value={amt}
            onChange={(e)=>setAmt(e.target.value.replace(/\D+/g,''))}
          />
        </div>
      </PickerWrap>

      {!useSameRecipients && (
        <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
          <label htmlFor={`rcp-${index}`}>Recipients *</label>
          <PixelInput
            id={`rcp-${index}`}
            as="textarea"
            rows={2}
            placeholder="tz1… tz1… tz1…"
            value={rcp}
            onChange={(e)=>setRcp(e.target.value)}
          />
        </div>
      )}

      {meta && (
        <TokenMetaPanel
          meta={meta}
          tokenId={tid}
          contractAddress={contractAddress}
        />
      )}
    </RowWrap>
  );
}
/* EOF */
