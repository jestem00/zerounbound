/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/MintUpload.jsx
  Rev :    r703   2025‑07‑24
  Summary: binary‑aware integrity scan
──────────────────────────────────────────────────────────────*/
import React, { useRef, useState, useCallback } from 'react';
import styledPkg            from 'styled-components';
import PixelButton          from '../PixelButton.jsx';
import { MIME_TYPES as WHITELIST } from '../../constants/mimeTypes.js';
import PixelConfirmDialog   from '../PixelConfirmDialog.jsx';
import { checkOnChainIntegrity }  from '../../utils/onChainValidator.js';
import { getIntegrityInfo }       from '../../constants/integrityBadges.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Hidden   = styled.input`display:none;`;
const FileName = styled.p`font-size:.68rem;margin:.5rem 0 0;word-break:break-all;`;

const EXT_OK  = ['.glb', '.gltf', '.html'];
const ACCEPT  = [...WHITELIST, ...EXT_OK].join(',');
const TEXT_RE = /^(text\/|image\/svg|application\/(json|xml|javascript|ecmascript))/i;

export default function MintUpload({ onFileChange, onFileDataUrlChange }) {
  const inpRef = useRef(null);
  const [busy, setBusy]       = useState(false);
  const [fileName, setFileName] = useState('');
  const [dialog, setDialog]   = useState({ open:false, msg:'', todo:null });

  const triggerPick = () => inpRef.current?.click();

  const scanIntegrity = useCallback((dataUri) => {
    const mime = dataUri.startsWith('data:') ? dataUri.slice(5).split(/[;,]/)[0] : '';
    let meta   = { artifactUri: dataUri };
    if (TEXT_RE.test(mime)) {
      try {
        const [, b64 = ''] = dataUri.split(',');
        meta.body = atob(b64);
      } catch {/* ignore */}
    }
    return checkOnChainIntegrity(meta);
  }, []);

  /* … unchanged pick logic up to reader.onload … */
  const handlePick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const ok = WHITELIST.includes(f.type) || EXT_OK.some(x => f.name.toLowerCase().endsWith(x));
    if (!ok) { setDialog({ open:true, msg:'Unsupported file type', todo:null }); return; }

    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const uri  = reader.result;
      const res  = scanIntegrity(uri);
      const info = getIntegrityInfo(res.status);
      const why  = res.reasons.length ? res.reasons.join('; ') : 'No issues detected';

      setDialog({
        open:true,
        msg : `${info.badge}  ${info.label}\n${why}`,
        todo: () => {
          setFileName(f.name);
          onFileChange?.(f);
          onFileDataUrlChange?.(uri);
          setBusy(false);
        },
      });
    };
    reader.onerror = () => { setBusy(false); setDialog({ open:true, msg:'Read error – retry?', todo:null }); };
    reader.readAsDataURL(f);
  };

  return (
    <div>
      <Hidden ref={inpRef} type="file" accept={ACCEPT} onChange={handlePick} />

      <PixelButton size="sm" onClick={triggerPick} disabled={busy}>
        {busy ? 'Uploading…' : 'Upload Artifact *'}
      </PixelButton>

      {fileName && <FileName>Selected: {fileName}</FileName>}

      <PixelConfirmDialog
        open={dialog.open}
        message={dialog.msg}
        onOk={() => { dialog.todo?.(); setDialog({ open:false,msg:'',todo:null }); }}
        onCancel={() => { setBusy(false); setDialog({ open:false,msg:'',todo:null }); }}
      />
    </div>
  );
}
/* What changed & why:
   • scanIntegrity now decodes body *only* for textual MIME – binary safe.
   • Rev bumped to r703. */
/* EOF */
