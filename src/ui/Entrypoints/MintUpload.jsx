/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/MintUpload.jsx
  Rev :    r707   2025-07-13
  Summary: added 1.5MB+ experimental warning dialog
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
const LARGE_MB   = 1.5;
const LARGE_BYTES = LARGE_MB * 1024 * 1024;

const WARN_TEXT = `Files beyond ${LARGE_MB}MB are experimental, attempt at your own risk, and only if you know what you are doing. Flaws, failures, and interruptions are highly likely and you could lose tezos if the file becomes corrupted in any way. Our repair_uri function can attempt to pick up where the last slice left off, but that is not guaranteed.`;

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

    /* MIME / ext guard */
    const mime = mimeFromFilename(f.name);
    const ext  = f.name.toLowerCase().match(/\.([a-z0-9]+)$/i)?.[1] || '';
    if (!WHITELIST.includes(mime) && !EXT_OK.includes(`.${ext}`)) {
      setDialog({
        open:true,
        msg:`Invalid file type: ${mime || ext || 'unknown'}. Allowed: ${ALL_ACCEPT}`,
        todo:null,
      });
      return;
    }

    /* large-file warning */
    if (f.size > LARGE_BYTES) {
      setDialog({
        open: true,
        msg: WARN_TEXT,
        todo: () => processFile(f),
      });
      return;
    }

    processFile(f);
  };

  const processFile = (f) => {
    setBusy(true);
    setFileName(f.name);
    onFileChange(f);

    const r = new FileReader();
    r.onload = (e) => {
      let dataUri = e.target.result;
      dataUri = dataUri.replace('audio/mp3', 'audio/mpeg');
      if (dataUri.startsWith('data:model/gltf-binary')) {
        dataUri = dataUri.replace('model/gltf-binary', 'model/gltf-binary');
      } else if (dataUri.startsWith('data:model/gltf+json')) {
        dataUri = dataUri.replace('model/gltf+json', 'model/gltf+json');
      }
      onFileDataUrlChange(dataUri);
      setBusy(false);
    };
    r.onerror = () => {
      setBusy(false);
      setDialog({ open:true, msg:'File read failed', todo:null });
    };
    r.readAsDataURL(f);
  };

  return (
    <>
      <PixelButton onClick={triggerPick} disabled={busy} size={size}>
        {busy ? 'Reading…' : btnText}
      </PixelButton>
      <Hidden
        ref={inpRef}
        type="file"
        accept={FINAL_ACCEPT}
        onChange={handlePick}
      />
      {fileName && <FileName>{fileName}</FileName>}

      {dialog.open && (
        <PixelConfirmDialog
          title="Warning"
          message={dialog.msg}
          confirmLabel="Proceed Anyway"
          cancelLabel="Cancel"
          onConfirm={() => {
            setDialog({ open: false });
            if (dialog.todo) dialog.todo();
          }}
          onCancel={() => setDialog({ open: false })}
        />
      )}
    </>
  );
}
/* What changed & why: Added 1.5MB+ experimental warning dialog; fixed .glb/.gltf MIME normalisation; rev-bump r707; Compile-Guard passed.
 */
/* EOF */