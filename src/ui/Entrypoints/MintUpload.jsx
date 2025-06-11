/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/Entrypoints/MintUpload.jsx
  Summary: resolution‑agnostic file uploader that converts selected
           artifact to data‑URL and streams it to parent via callbacks. */

import React, { useRef, useState } from 'react';
import styledPkg from 'styled-components';
import PixelButton from '../PixelButton.jsx';
import { MIME_TYPES as WHITELIST } from '../../constants/mimeTypes.js';

/*──────── styled shells ─────────────────────────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Hidden = styled.input`
  display: none;
`;

const FileName = styled.p`
  font-size: .68rem;
  margin: .5rem 0 0;
  word-break: break-all;
`;

/*──────── helpers ───────────────────────────────*/
const EXT_OK = ['.glb', '.gltf', '.html'];
const ACCEPT = [...WHITELIST, ...EXT_OK].join(',');

const bytesOfB64 = (uri = '') => {
  const [, b64 = ''] = uri.split(',');
  const pad = (b64.match(/=+$/) || [''])[0].length;
  return (b64.length * 3) / 4 - pad;
};

/*──────── component ────────────────────────────*/
export default function MintUpload({ onFileChange, onFileDataUrlChange }) {
  const inpRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);

  const click = () => inpRef.current?.click();

  const handle = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const okMime = WHITELIST.includes(f.type) || EXT_OK.some((x) => f.name.toLowerCase().endsWith(x));
    if (!okMime) {
      window.globalSnackbar?.({ open: true, message: 'Unsupported file type', severity: 'error' });
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

      if (bytesOfB64(uri) > 20 * 1024) {
        window.globalSnackbar?.({ open: true, message: 'Encoded size > 20 KB – wallets may truncate', severity: 'warning' });
      }
    };
    reader.onerror = () => {
      window.globalSnackbar?.({ open: true, message: 'Read error – try again', severity: 'error' });
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
        onChange={handle}
      />
      <PixelButton size="sm" onClick={click} disabled={busy}>
        {busy ? 'Uploading…' : 'Upload Artifact *'}
      </PixelButton>
      {fileName && <FileName>Selected: {fileName}</FileName>}
    </div>
  );
}

/* What changed & why: new Upload component uses platform PixelButton &
   globalSnackbar for alerts; respects 20 KB advisory, whitelist from
   mimeTypes constant, keeping invariants I05/I13. */
