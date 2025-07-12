/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/MintUpload.jsx
  Rev :    r706   2025-07-11
  Summary: fix Data‑URI MIME normalisation for .glb/.gltf
──────────────────────────────────────────────────────────────*/
import React, { useRef, useState, useCallback } from 'react';
import styledPkg            from 'styled-components';
import PixelButton          from '../PixelButton.jsx';
import { MIME_TYPES as WHITELIST,               /* whitelist guard   */
         mimeFromFilename } from '../../constants/mimeTypes.js';  /* ★ NEW */
import PixelConfirmDialog   from '../PixelConfirmDialog.jsx';
import { checkOnChainIntegrity }  from '../../utils/onChainValidator.js';
import { getIntegrityInfo }       from '../../constants/integrityBadges.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Hidden   = styled.input`display:none;`;
const FileName = styled.p`font-size:.68rem;margin:.5rem 0 0;word-break:break-all;`;

const EXT_OK     = ['.glb', '.gltf', '.html'];    /* extra beyond MIME sniffs */
const ALL_ACCEPT = [...WHITELIST, ...EXT_OK].join(',');
const TEXT_RE    = /^(text\/|image\/svg|application\/(json|xml|javascript|ecmascript))/i;

export default function MintUpload({
  onFileChange          = () => {},
  onFileDataUrlChange   = () => {},
  maxFileSize,
  accept,
  btnText               = 'Upload Artifact *',
  size                  = 'sm',
}) {
  const inpRef = useRef(null);
  const [busy, setBusy]       = useState(false);
  const [fileName, setFileName] = useState('');
  const [dialog, setDialog]   = useState({ open:false, msg:'', todo:null });

  const FINAL_ACCEPT = accept || ALL_ACCEPT;
  const triggerPick  = () => inpRef.current?.click();

  /* integrity helper – lightweight heuristic only */
  const scanIntegrity = useCallback((dataUri) => {
    const mime = dataUri.startsWith('data:')
      ? dataUri.slice(5).split(/[;,]/)[0] || ''
      : '';
    const normMime = mime.replace('audio/mp3', 'audio/mpeg');
    const meta = TEXT_RE.test(normMime)
      ? (()=>{ const [,b64='']=dataUri.split(','); return { artifactUri:dataUri, body:atob(b64) }; })()
      : { artifactUri:dataUri.replace(mime, normMime) };
    return checkOnChainIntegrity(meta);
  }, []);

  const handlePick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    /* size guard */
    if (maxFileSize && f.size > maxFileSize) {
      setDialog({ open:true, msg:`File > ${(maxFileSize/1024).toFixed(1)} KB`, todo:null });
      return;
    }

    /* type guard (default mode only) */
    if (!accept) {
      const ok = WHITELIST.includes(f.type)
        || EXT_OK.some((x) => f.name.toLowerCase().endsWith(x));
      if (!ok) {
        setDialog({ open:true, msg:'Unsupported file type', todo:null });
        return;
      }
    }

    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      let uri = reader.result;

      /* ── MIME normalisation ─────────────────────────────── */
      /* 1) audio/mp3 alias */
      uri = uri.replace('audio/mp3', 'audio/mpeg');

      /* 2) unknown / octet‑stream → infer from filename */
      if (uri.startsWith('data:application/octet-stream')
          || uri.startsWith('data:;base64')) {
        const guess = mimeFromFilename(f.name);
        if (guess) {
          uri = uri.replace(
            /^data:(?:application\/octet-stream)?/,
            `data:${guess}`,
          );
        }
      }
      /* ───────────────────────────────────────────────────── */

      const res  = scanIntegrity(uri);
      const info = getIntegrityInfo(res.status);
      const why  = res.reasons.length ? res.reasons.join('; ') : 'No issues detected';

      setDialog({
        open:true,
        msg : `${info.badge}  ${info.label}\n${why}`,
        todo: () => {
          setFileName(f.name);
          onFileChange(f);
          onFileDataUrlChange(uri);
          setBusy(false);
        },
      });
    };
    reader.onerror = () => {
      setBusy(false);
      setDialog({ open:true, msg:'Read error – retry?', todo:null });
    };
    reader.readAsDataURL(f);
  };

  return (
    <div>
      <Hidden ref={inpRef} type="file" accept={FINAL_ACCEPT} onChange={handlePick} />

      <PixelButton size={size} onClick={triggerPick} disabled={busy}>
        {busy ? 'Uploading…' : btnText}
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
   • Added mimeFromFilename import.
   • Normalise Data‑URI `application/octet-stream`/blank headers to
     correct MIME based on file extension (fixes .glb/.gltf preview).
   • Rev bump to r706. */
/* EOF */
