/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/MintUpload.jsx
  Rev :    r701   2025‑07‑24
  Summary: upload dialog shows integrity badge + label
──────────────────────────────────────────────────────────────*/
import React, { useRef, useState, useCallback } from 'react';
import styledPkg            from 'styled-components';
import PixelButton          from '../PixelButton.jsx';
import { MIME_TYPES as WHITELIST } from '../../constants/mimeTypes.js';
import PixelConfirmDialog   from '../PixelConfirmDialog.jsx';
import { checkOnChainIntegrity }  from '../../utils/onChainValidator.js';
import { getIntegrityInfo }       from '../../constants/integrityBadges.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Hidden = styled.input`
  display:none;
`;
const FileName = styled.p`
  font-size:.68rem;margin:.5rem 0 0;word-break:break-all;
`;

/*──────── helpers ───────────────────────────────*/
const EXT_OK = ['.glb', '.gltf', '.html'];
const ACCEPT = [...WHITELIST, ...EXT_OK].join(',');

/*──────── component ────────────────────────────*/
export default function MintUpload({ onFileChange, onFileDataUrlChange }) {
  const inpRef = useRef(null);
  const [busy,   setBusy]   = useState(false);
  const [fileName, setFileName] = useState('');
  const [dialog, setDialog] = useState({ open: false, msg: '', todo: null });

  const triggerPick = () => inpRef.current?.click();

  /* single‑pass integrity scan – returns full result */
  const scanIntegrity = useCallback((dataUri) => {
    try {
      const [, b64 = ''] = dataUri.split(',');
      const raw = atob(b64);
      return checkOnChainIntegrity({ artifactUri: dataUri, body: raw });
    } catch {
      return { status: 'unknown', reasons: ['decode error'] };
    }
  }, []);

  const handlePick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const ok = WHITELIST.includes(f.type)
      || EXT_OK.some((x) => f.name.toLowerCase().endsWith(x));
    if (!ok) {
      setDialog({ open: true, msg: 'Unsupported file type', todo: null });
      return;
    }

    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const uri  = reader.result;
      const res  = scanIntegrity(uri);
      const info = getIntegrityInfo(res.status);

      const proceed = () => {
        setFileName(f.name);
        onFileChange?.(f);
        onFileDataUrlChange?.(uri);
        setBusy(false);
      };

      /* show soft‑warning when not fully on‑chain */
      if (res.status !== 'full') {
        const reasons = res.reasons.join('; ');
        setDialog({
          open: true,
          msg: `${info.badge}  ${info.label}\n${reasons}`,
          todo: proceed,
        });
      } else {
        proceed();
      }
    };

    reader.onerror = () => {
      setBusy(false);
      setDialog({ open: true, msg: 'Read error – retry?', todo: null });
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

      <PixelConfirmDialog
        open={dialog.open}
        message={dialog.msg}
        onOk={() => { dialog.todo?.(); setDialog({ open: false, msg: '', todo: null }); }}
        onCancel={() => setDialog({ open: false, msg: '', todo: null })}
      />
    </div>
  );
}
/* What changed & why:
   • Removed dead helpers; single `scanIntegrity()` computes status.
   • Confirm dialog now shows badge + readable label + reasons.
   • Rev bumped to r701; passes ESLint no‑unused‑vars. */
/* EOF */
