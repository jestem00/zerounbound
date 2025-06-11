/*─────────────────────────────────────────────────────────────
  File: src/ui/PixelConfirmDialog.jsx
  Rev : r445   2025-06-07
  Summary: theme-safe fg/bg; matches Operation* dialogs.
──────────────────────────────────────────────────────────────*/
import React      from 'react';
import styledPkg  from 'styled-components';
import PixelButton from './PixelButton.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Back = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,.86);
  display: flex; justify-content: center; align-items: center;
  z-index: 2600;
`;
const Panel = styled.div`
  width: 90vw; max-width: 360px;
  background: var(--zu-bg, #0b0b0b);
  color:      var(--zu-fg, #f0f0f0);
  border: 2px solid #bebebe;
  box-shadow: 0 0 0 2px #000, 0 0 12px #000;
  padding: 2rem 2.1rem;
  text-align: center;
  font-family: var(--font-pixel);
  font-size: .9rem;
`;

export default function PixelConfirmDialog({
  open, message = '', onOk = () => {}, onCancel = () => {},
}) {
  if (!open) return null;
  return (
    <Back>
      <Panel>
        <p style={{ margin: 0 }}>{message}</p>
        <div style={{ display:'flex',gap:'1rem',justifyContent:'center',marginTop:'1.6rem' }}>
          <PixelButton onClick={onOk}>OK</PixelButton>
          <PixelButton onClick={onCancel}>Cancel</PixelButton>
        </div>
      </Panel>
    </Back>
  );
}
/* EOF */
