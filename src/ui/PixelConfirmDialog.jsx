/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/PixelConfirmDialog.jsx
  Rev :    r664   2025‑10‑03
  Summary: fix conditional‑hook rule & SSR portal mismatch
──────────────────────────────────────────────────────────────*/
import React, { useEffect }  from 'react';
import { createPortal }      from 'react-dom';
import styledPkg             from 'styled-components';
import PixelButton           from './PixelButton.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Back = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0,0,0,.86);
  z-index: 6500;
`;
const Panel = styled.div`
  width: 90vw;
  max-width: 360px;
  padding: 2rem 2.1rem;
  background: var(--zu-bg,#0b0b0b);
  color: var(--zu-fg,#f0f0f0);
  border: 2px solid #bebebe;
  box-shadow: 0 0 0 2px #000, 0 0 12px #000;
  text-align: center;
  font-family: var(--font-pixel);
  font-size: .9rem;
`;
const Title = styled.h3`
  margin: 0 0 .75rem;
  font-size: 1.15rem;
  line-height: 1.1;
`;

/*════════ component ════════════════════════════════════════*/
export default function PixelConfirmDialog({
  open              = false,
  title             = '',
  message           = '',
  confirmLabel,
  okLabel           = 'OK',
  cancelLabel       = 'Cancel',
  confirmDisabled   = false,
  hideCancel        = false,
  onConfirm,
  onOk,
  onCancel          = () => {},
}) {
  /*──────────────────────────────────────────────────────────
    Hook must run on *every* render to satisfy React invariant
  ──────────────────────────────────────────────────────────*/
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onCancel]);

  /* guard – keep markup identical between SSR & CSR */
  if (!open) return null;

  const handleConfirm = () => (onConfirm || onOk || (() => {}))();

  const body = (
    <Back
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <Panel onClick={(e) => e.stopPropagation()}>
        {title && <Title>{title}</Title>}
        {typeof message === 'string'
          ? <p style={{ margin: 0 }}>{message}</p>
          : message}

        <div style={{
          display: 'flex',
          flexDirection: hideCancel ? 'column' : 'row',
          gap: '1rem',
          justifyContent: 'center',
          marginTop: '1.6rem',
        }}
        >
          <PixelButton
            onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
            disabled={confirmDisabled}
          >
            {confirmLabel || okLabel}
          </PixelButton>

          {!hideCancel && (
            <PixelButton
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
            >
              {cancelLabel}
            </PixelButton>
          )}
        </div>
      </Panel>
    </Back>
  );

  /* createPortal must only run client‑side */
  return typeof document === 'undefined'
    ? body
    : createPortal(body, document.body);
}

/* What changed & why (r664):
   • Moved useEffect outside conditional render to satisfy React
     “hooks‑order” invariant, eliminating runtime stack errors.
   • Early‑return null kept *after* hook call – markup stable.
   • Esc‑key listener now conditional on `open` flag.
   • No other logic altered; lint‑ & type‑clean. */
/* EOF */
