/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/MintUpload.jsx
  Rev :    r700   2025‑07‑23
  Summary: artefact validator + confirm dialogue
──────────────────────────────────────────────────────────────*/
import React, { useRef, useState, useCallback } from 'react';
import styledPkg            from 'styled-components';
import PixelButton          from '../PixelButton.jsx';
import { MIME_TYPES as WHITELIST } from '../../constants/mimeTypes.js';
import PixelConfirmDialog   from '../PixelConfirmDialog.jsx';
import { checkOnChainIntegrity } from '../../utils/onChainValidator.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Hidden = styled.input`
  display:none;
`;
const FileName = styled.p`
  font-size:.68rem;margin:.5rem 0 0;word-break:break-all;
`;

/*──────── helpers ───────────────────────────────*/
const EXT_OK = ['.glb','.gltf','.html'];
const ACCEPT = [...WHITELIST, ...EXT_OK].join(',');

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
  const inpRef  = useRef(null);
  const [busy, setBusy]     = useState(false);
  const [fileName,setFileName] = useState('');
  const [dialog,setDialog]  = useState({ open:false,msg:'',todo:null });

  const triggerPick = () => inpRef.current?.click();

  const validateArtifact = useCallback((dataUri) => {
    try {
      const [, b64=''] = dataUri.split(',');
      const raw = atob(b64);
      const res = checkOnChainIntegrity({ artifactUri:dataUri, body:raw });
      return res.status === 'partial' ? res.reasons.join('; ') : '';
    } catch { return ''; }
  }, []);

  const handlePick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ok = WHITELIST.includes(f.type)
            || EXT_OK.some(x => f.name.toLowerCase().endsWith(x));
    if (!ok) { setDialog({ open:true,msg:'Unsupported file type',todo:null }); return; }

    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const uri = reader.result;
      const warn = validateArtifact(uri);
      const complete = () => {
        setFileName(f.name);
        onFileChange?.(f);
        onFileDataUrlChange?.(uri);
        setBusy(false);
      };
      if (warn) {
        setDialog({ open:true,msg:`Potential off‑chain refs detected: ${warn}`,todo:complete });
      } else {
        complete();
      }
    };
    reader.onerror = () => {
      setBusy(false);
      setDialog({ open:true,msg:'Read error – retry?',todo:null });
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
        onOk={() => { dialog.todo?.(); setDialog({ open:false,msg:'',todo:null }); }}
        onCancel={() => setDialog({ open:false,msg:'',todo:null })}
      />
    </div>
  );
}
/* EOF */
