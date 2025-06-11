/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/OperationConfirmDialog.jsx
  Rev :    r445   2025-06-07
  Summary: theme-safe fg/bg colours for light palettes.
──────────────────────────────────────────────────────────────*/
import React, { useState } from 'react';
import styledPkg           from 'styled-components';
import PixelButton         from './PixelButton.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* shells */
const Back = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,.86);
  display: flex; justify-content: center; align-items: center;
  z-index: 2600;
`;
const Panel = styled.div`
  width: 90vw; max-width: 380px;
  background: var(--zu-bg, #0b0b0b);
  color:      var(--zu-fg, #f0f0f0);              /* <-- fg sync */
  border: 2px solid #bebebe;
  box-shadow: 0 0 0 2px #000, 0 0 12px #000;
  padding: 2rem 2.5rem;
  text-align: center;
  font-family: var(--font-pixel);
`;
const Row = styled.p`
  margin: .35rem 0; font-size: .9rem;
`;

export default function OperationConfirmDialog({
  open, estimate = {}, slices = 1, onOk = () => {}, onCancel = () => {},
}) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const feeTez     = (estimate?.feeTez ?? '—').toString();
  const storageTez = (estimate?.storageTez ?? '—').toString();
  const err        = estimate?.error;

  const handleOk = () => { setBusy(true); onOk(); };

  return (
    <Back>
      <Panel>
        <h3 style={{ margin: '0 0 .85rem' }}>Review&nbsp;network&nbsp;fees</h3>

        {err
          ? <Row style={{ color: 'var(--zu-accent-sec)' }}>Estimator error – values unavailable</Row>
          : (
              <>
                <Row>Network fee ≈ {feeTez} ꜩ</Row>
                <Row>Storage cost ≈ {storageTez} ꜩ</Row>
              </>
            )}

        {slices > 1 && (
          <Row style={{ fontSize: '.75rem', opacity: .8, marginTop: '.9rem' }}>
            This upload needs {slices} sequential signatures.
            Wallet will show a fee prompt for each slice.
          </Row>
        )}

        <div style={{ display:'flex',gap:'1rem',justifyContent:'center',marginTop:'1.2rem' }}>
          <PixelButton onClick={handleOk} disabled={busy}>
            {busy ? 'Please wait…' : 'Proceed'}
          </PixelButton>
          {busy && (
            <img
              src="/sprites/loading16x16.gif" alt=""
              style={{ width:16,height:16,marginLeft:4,imageRendering:'pixelated' }}
            />
          )}
          <PixelButton onClick={onCancel} disabled={busy}>Cancel</PixelButton>
        </div>
      </Panel>
    </Back>
  );
}
/* EOF */
