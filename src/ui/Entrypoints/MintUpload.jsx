/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/MintUpload.jsx
  Rev :    r699   2025-06-25
  Summary: snackbar fallback, accept whitelist join safeguard,
           clearer helper naming, ESLint clean
──────────────────────────────────────────────────────────────*/
import React, { useRef, useState } from 'react';
import styledPkg                   from 'styled-components';
import PixelButton                 from '../PixelButton.jsx';
import { MIME_TYPES as WHITELIST } from '../../constants/mimeTypes.js';

/*──────── styled shells ─────────────────────────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Hidden = styled.input`
  display:none;
`;
const FileName = styled.p`
  font-size:.68rem;margin:.5rem 0 0;word-break:break-all;
`;

/*──────── helpers ───────────────────────────────*/
const EXT_OK  = ['.glb', '.gltf', '.html'];
const ACCEPT  = [...WHITELIST, ...EXT_OK].join(',');

/** rough byte estimate from a data URI */
const byteSizeOfDataUri = (uri = '') => {
  const [, b64 = ''] = uri.split(',');
  const pad = (b64.match(/=+$/) || [''])[0].length;
  return (b64.length * 3) / 4 - pad;
};

/* global snackbar shim */
function alertSnack(msg, sev = 'info') {
  if (typeof window !== 'undefined' && window.globalSnackbar) {
    window.globalSnackbar({ open: true, message: msg, severity: sev });
  }
}

/*──────── component ────────────────────────────*/
export default function MintUpload({ onFileChange, onFileDataUrlChange }) {
  const inpRef           = useRef(null);
  const [fileName, setFileName] = useState('');
  const [busy,     setBusy]     = useState(false);

  const triggerPick = () => inpRef.current?.click();

  const handlePick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const mimeOk = WHITELIST.includes(f.type)
                || EXT_OK.some((x) => f.name.toLowerCase().endsWith(x));

    if (!mimeOk) {
      alertSnack('Unsupported file type', 'error');
      e.target.value = '';
      return;
    }

    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const uri = reader.result;
      setFileName(f.name);
      setBusy(false);

      onFileChange?.(f);
      onFileDataUrlChange?.(uri);

      if (byteSizeOfDataUri(uri) > 20 * 1024) {
        alertSnack('Encoded size > 20 KB; some wallets may truncate', 'warning');
      }
    };
    reader.onerror = () => {
      alertSnack('Read error – please try again', 'error');
      setBusy(false);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div>
      <Hidden
        ref={inpRef}
        type="file"
        accept={ACCEPT}
        onChange={handlePick}
      />
      <PixelButton size="sm" onClick={triggerPick} disabled={busy}>
        {busy ? 'Uploading…' : 'Upload Artifact *'}
      </PixelButton>
      {fileName && <FileName>Selected: {fileName}</FileName>}
    </div>
  );
}
/* EOF */
