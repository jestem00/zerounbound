/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/GlobalSnackbar.jsx
  Rev :    r1     2025‑09‑22
  Summary: lightweight toast host listening to zu:snackbar */
import React, { useEffect, useState } from 'react';
import styledPkg from 'styled-components';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Host = styled.div`
  position: fixed;
  left: 50%; bottom: 22px;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex; flex-direction: column; gap: 6px;
  pointer-events: none;
`;

const Toast = styled.div`
  min-width: 220px;
  max-width: 88vw;
  padding: 6px 10px;
  font: 700 .8rem/1 'Pixeloid Sans', monospace;
  color: var(--zu-fg,#fff);
  background: ${({ $sev }) => (
    $sev === 'error'   ? 'var(--zu-err,#900)'  :
    $sev === 'warning' ? 'var(--zu-warn,#c90)' :
    'var(--zu-bg-dim,#222)')};
  border: 2px solid var(--zu-accent,#0cf);
  box-shadow: 0 2px 4px rgba(0,0,0,.45);
  pointer-events: all;
`;

export default function GlobalSnackbar() {
  const [queue, setQueue] = useState([]);

  /* listener */
  useEffect(() => {
    const handler = (e) => {
      const { message = '', severity = 'info' } = e.detail || {};
      if (!message) return;
      setQueue((q) => [...q, { id: Date.now(), message, severity }]);
    };
    window.addEventListener('zu:snackbar', handler);
    return () => window.removeEventListener('zu:snackbar', handler);
  }, []);

  /* auto‑dismiss oldest toast */
  useEffect(() => {
    if (!queue.length) return undefined;
    const timer = setTimeout(() => setQueue((q) => q.slice(1)), 3200);
    return () => clearTimeout(timer);
  }, [queue]);

  return (
    <Host aria-live="polite">
      {queue.map(({ id, message, severity }) => (
        <Toast key={id} $sev={severity}>{message}</Toast>
      ))}
    </Host>
  );
}
/* EOF */
