/*-------------------------------------------------------------
Developed by @jams2blues - ZeroContract Studio
File:    src/ui/Entrypoints/MintUpload.jsx
Rev :    r709   2025-09-21
Summary: Keeps clear/reset support and normalises ZIP uploads to application/zip for portability.
-------------------------------------------------------------*/
import React, { useRef, useState } from 'react';
import styledPkg            from 'styled-components';
import PixelButton          from '../PixelButton.jsx';
import {
  MIME_TYPES as WHITELIST,
  mimeFromFilename,
} from '../../constants/mimeTypes.js';
import PixelConfirmDialog   from '../PixelConfirmDialog.jsx';

/* styled-components handles both default and named exports */
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* hidden file input to trigger OS file picker */
const Hidden   = styled.input`display:none;`;
/* label for the selected filename */
const FileName = styled.p`
  font-size: .68rem;
  margin: .5rem 0 0;
  word-break: break-all;
  display: flex;
  align-items: center;
  gap: .4rem;
`;

/* whitelist additional extensions beyond MIME sniffs */
const EXT_OK     = ['.glb', '.gltf', '.html'];
const ALL_ACCEPT = [...WHITELIST, ...EXT_OK].join(',');

/* size threshold for large-file warning (in MB and bytes) */
const LARGE_MB    = 1.5;
const LARGE_BYTES = LARGE_MB * 1024 * 1024;

/* warning text shown when user attempts to upload very large files */
const WARN_TEXT = `Files beyond ${LARGE_MB}MB are experimental, attempt at your own risk, and only if you know what you\nare doing. Flaws, failures, and interruptions are highly likely and you could lose tezos if the file becomes corrupted\nin any way. Our repair_uri function can attempt to pick up where the last slice left off, but that is not guaranteed.`;

/**
 * Upload button and file processor used throughout the mint tool.  This
 * component abstracts away input type=file quirks (resetting the value to
 * allow re‑selecting a file with the same name) and surfaces a simple
 * callback interface.  A small “Clear” button is shown once a file is
 * selected so the user can remove the file without cancelling the form.
 *
 * Props:
 *  - onFileChange:     called with the File object (or null when cleared)
 *  - onFileDataUrlChange: called with a dataURI string (or '' when cleared)
 *  - maxFileSize:      optional number of bytes for max allowed upload
 *  - accept:           override for accepted MIME types (comma‑separated)
 *  - btnText:          text for the main upload button
 *  - size:             size variant for PixelButton (''|'sm'|'xs')
 */
export default function MintUpload({
  onFileChange        = () => {},
  onFileDataUrlChange = () => {},
  maxFileSize,
  accept,
  btnText             = 'Upload Artifact *',
  size                = 'sm',
}) {
  /* internal refs and state */
  const inpRef    = useRef(null);
  const [busy, setBusy]         = useState(false);
  const [fileName, setFileName] = useState('');
  const [dialog, setDialog]     = useState({ open: false, msg: '', todo: null });

  /* final accept string – default to full whitelist */
  const FINAL_ACCEPT = accept || ALL_ACCEPT;

  /**
   * Launch the OS picker.  Resetting the input value before calling
   * click() ensures that selecting a file with the same name still
   * triggers the onChange event (otherwise browsers ignore duplicate
   * selections).  Clearing value also helps with repeated uploads.
   */
  const triggerPick = () => {
    if (inpRef.current) {
      inpRef.current.value = '';
    }
    inpRef.current?.click();
  };

  /**
   * Clear the current file selection.  This resets local state and
   * notifies parents that the file has been removed.  Without this
   * explicit control the user would be forced to cancel and restart the
   * entire mint process to choose a different file.
   */
  const clearFile = () => {
    setFileName('');
    onFileChange(null);
    onFileDataUrlChange('');
    if (inpRef.current) {
      inpRef.current.value = '';
    }
  };

  /**
   * Handle the raw file pick.  Performs size, MIME and large‑file
   * validation.  If valid, passes control to processFile().  Using
   * asynchronous dialogs for warnings preserves interactivity while
   * letting the user confirm large uploads.
   */
  const handlePick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    /* enforce max file size (in bytes) */
    if (maxFileSize && f.size > maxFileSize) {
      setDialog({ open: true, msg: `File > ${(maxFileSize / 1024).toFixed(1)} KB`, todo: null });
      return;
    }

    /* MIME and extension whitelist */
    const mime = mimeFromFilename(f.name);
    const ext  = f.name.toLowerCase().match(/\.([a-z0-9]+)$/i)?.[1] || '';
    if (!WHITELIST.includes(mime) && !EXT_OK.includes(`.${ext}`)) {
      setDialog({
        open: true,
        msg: `Invalid file type: ${mime || ext || 'unknown'}. Allowed: ${ALL_ACCEPT}`,
        todo: null,
      });
      return;
    }

    /* warn on huge files */
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

  /**
   * Process a valid file: update busy state, set fileName, call
   * parent change handlers, and read the file into a dataURI.  The
   * FileReader API is used here which runs asynchronously.  In case
   * of errors a dialog is displayed.
   */
  const processFile = (f) => {
    setBusy(true);
    setFileName(f.name);
    onFileChange(f);

    const r = new FileReader();
    r.onload = (ev) => {
      let dataUri = ev.target.result;
      /* normalise audio mime to mpeg and GLB/GLTF variations */
      dataUri = dataUri.replace('audio/mp3', 'audio/mpeg');
      if (dataUri.startsWith('data:model/gltf-binary')) {
        dataUri = dataUri.replace('model/gltf-binary', 'model/gltf-binary');
      } else if (dataUri.startsWith('data:model/gltf+json')) {
        dataUri = dataUri.replace('model/gltf+json', 'model/gltf+json');
      }
      if (dataUri.startsWith('data:application/x-zip-compressed')) {
        dataUri = dataUri.replace('application/x-zip-compressed', 'application/zip');
      }
      onFileDataUrlChange(dataUri);
      setBusy(false);
    };
    r.onerror = () => {
      setBusy(false);
      setDialog({ open: true, msg: 'File read failed', todo: null });
    };
    r.readAsDataURL(f);
  };

  return (
    <>
      {/* main upload control */}
      <PixelButton onClick={triggerPick} disabled={busy} size={size}>
        {busy ? 'Reading…' : btnText}
      </PixelButton>

      {/* hidden input for file picking */}
      <Hidden
        ref={inpRef}
        type="file"
        accept={FINAL_ACCEPT}
        onChange={handlePick}
      />

      {/* display selected filename with a clear button */}
      {fileName && (
        <FileName>
          {fileName}
          <PixelButton onClick={clearFile} size="xs" data-sec>
            Clear
          </PixelButton>
        </FileName>
      )}

      {/* confirmation dialog for errors and large files */}
      {dialog.open && (
        <PixelConfirmDialog
          msg={dialog.msg}
          onConfirm={() => {
            setDialog({ open: false, msg: '', todo: null });
            if (dialog.todo) dialog.todo();
          }}
          onCancel={() => setDialog({ open: false, msg: '', todo: null })}
        />
      )}
    </>
  );
}
/* What changed & why: Added clear/reset support via Clear button and reset of input value to allow re‑uploading files with the same name; added descriptive comments; bumped rev to r708. */