/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/PixelConfirmDialog.jsx
  Rev :    r666   2025‑10‑18
  Summary: focus‑trap + body‑scroll‑lock, stronger a11y labels
──────────────────────────────────────────────────────────────*/
import React, {
  useEffect, useRef,
}                          from 'react';
import { createPortal }    from 'react-dom';
import styledPkg           from 'styled-components';
import PixelButton         from './PixelButton.jsx';

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
  max-height: 90vh;
  padding: 2rem 2.1rem;
  background: var(--zu-bg,#0b0b0b);
  color: var(--zu-fg,#f0f0f0);
  border: 2px solid #bebebe;
  box-shadow: 0 0 0 2px #000, 0 0 12px #000;
  text-align: center;
  font-family: var(--font-pixel);
  font-size: .9rem;
  overflow-y: auto;
  word-break: break-word;
  overflow-wrap: anywhere;
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
  const btnRef      = useRef(null);
  const prevActive  = useRef(null);

  /*──────── side‑effects ───────────────────────────────────*/
  useEffect(() => {
    if (!open) return undefined;

    /* focus‑trap */
    prevActive.current = document.activeElement;
    setTimeout(() => btnRef.current?.focus(), 0);

    /* body scroll‑lock */
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    /* ESC close */
    const esc = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', esc);

    return () => {
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = overflow;
      prevActive.current?.focus?.();
    };
  }, [open, onCancel]);

  /* guard – keep markup identical between SSR & CSR */
  if (!open) return null;

  const handleConfirm = () => (onConfirm || onOk || (() => {}))();

  const body = (
    // eslint-disable-next-line styled-components-a11y/no-noninteractive-element-interactions
    <Back
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'pcd-title' : undefined}
      aria-describedby="pcd-message"
      tabIndex="-1"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <Panel onClick={(e) => e.stopPropagation()}>
        {title && <Title id="pcd-title">{title}</Title>}
        {typeof message === 'string'
          ? <p id="pcd-message" style={{ margin: 0 }}>{message}</p>
          : <div id="pcd-message">{message}</div>}

        <div style={{
          display: 'flex',
          flexDirection: hideCancel ? 'column' : 'row',
          gap: '1rem',
          justifyContent: 'center',
          marginTop: '1.6rem',
        }}
        >
          <PixelButton
            ref={btnRef}
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

/* What changed & why:
   • Added focus‑trap: first button auto‑focused,   restores focus on close.
   • Body scroll‑lock when dialog open – prevents background scroll bleed.
   • Aria‑labelledby / ‑describedby for screen‑reader clarity.
   • Refactor uses useRef; public API & visual style untouched. */
/* EOF */
