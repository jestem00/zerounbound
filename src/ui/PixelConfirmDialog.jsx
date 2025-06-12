/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/PixelConfirmDialog.jsx
  Rev :    r660   2025-06-20
  Summary: API v2 — backward-safe
           • props: open, title, message (node)
           • okLabel / cancelLabel text
           • onOk  ← primary handler
           • onConfirm alias → onOk
           • dark-theme I00 palette + pixel font
──────────────────────────────────────────────────────────────*/
import React       from 'react';
import styledPkg   from 'styled-components';
import PixelButton from './PixelButton.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── shells ─────*/
const Back = styled.div`
  position:fixed;inset:0;display:flex;justify-content:center;align-items:center;
  background:rgba(0,0,0,.86);z-index:2600;
`;
const Panel = styled.div`
  width:90vw;max-width:360px;padding:2rem 2.1rem;
  background:var(--zu-bg,#0b0b0b);color:var(--zu-fg,#f0f0f0);
  border:2px solid #bebebe;box-shadow:0 0 0 2px #000,0 0 12px #000;
  text-align:center;font-family:var(--font-pixel);font-size:.9rem;
`;
const Title = styled.h3`
  margin:0 0 .75rem;font-size:1.15rem;line-height:1.1;
`;

/*════════ component ════════════════════════════════════════*/
export default function PixelConfirmDialog({
  open       = false,
  title      = '',
  message    = '',
  okLabel    = 'OK',
  cancelLabel= 'Cancel',
  onOk       = () => {},
  onConfirm,              /* ← legacy alias */
  onCancel   = () => {},
}) {
  if (!open) return null;

  /* alias bridge */
  const handleOk = () => {
    (onOk || onConfirm || (() => {}))();
  };

  return (
    <Back>
      <Panel>
        {title && <Title>{title}</Title>}
        <p style={{ margin: 0 }}>{message}</p>
        <div style={{
          display:'flex',gap:'1rem',justifyContent:'center',marginTop:'1.6rem',
        }}>
          <PixelButton onClick={handleOk}>{okLabel}</PixelButton>
          <PixelButton onClick={onCancel}>{cancelLabel}</PixelButton>
        </div>
      </Panel>
    </Back>
  );
}
/* EOF */
