/* Developed by @jams2blues - ZeroContract Studio
   File:    src/ui/GlobalConfirm.jsx
   Rev :    r1   2025-09-09
   Summary: App-wide confirm host listening to `zu:confirm` and rendering
            PixelConfirmDialog with 8-bit theme, centered per I00. */
import React from 'react';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';

export default function GlobalConfirm() {
  const [dlg, setDlg] = React.useState({ open: false });

  React.useEffect(() => {
    const onConfirm = (e) => {
      const { title = '', message = '', okLabel = 'OK', cancelLabel = 'Cancel', hideCancel = false, resolve } = e.detail || {};
      setDlg({ open: true, title, message, okLabel, cancelLabel, hideCancel, resolve: typeof resolve === 'function' ? resolve : () => {} });
    };
    window.addEventListener('zu:confirm', onConfirm);
    return () => window.removeEventListener('zu:confirm', onConfirm);
  }, []);

  if (!dlg.open) return null;
  const close = (val) => { try { dlg.resolve?.(val); } finally { setDlg({ open: false }); } };

  return (
    <PixelConfirmDialog
      open
      title={dlg.title}
      message={dlg.message}
      okLabel={dlg.okLabel}
      cancelLabel={dlg.cancelLabel}
      hideCancel={dlg.hideCancel}
      onOk={() => close(true)}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );
}
/* EOF */

