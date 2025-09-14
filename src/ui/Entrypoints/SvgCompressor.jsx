/* Entrypoint - header sanitized */


import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';
import PixelButton from '../PixelButton.jsx';
import PixelConfirmDialog from '../PixelConfirmDialog.jsx';
import { char2Bytes } from '@taquito/utils';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Row = styled.div`
  display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; margin-top: 6px;
`;
const Small = styled.span` font-size: .75rem; opacity: .85; `;

function decodeDataUriToText(u = '') {
  if (!u?.startsWith('data:')) return '';
  const [, meta = '', body = ''] = u.slice(5).split(/,(.*)/s) || [];
  try {
    return /;base64/i.test(meta)
      ? decodeURIComponent(escape(atob(body)))
      : decodeURIComponent(body);
  } catch { return ''; }
}

function bytesOfString(s = '') {
  try { return char2Bytes(s).length / 2; } catch { return new TextEncoder().encode(s).length; }
}

export default function SvgCompressor({ file, currentUrl, onChange }) {
  const [busy, setBusy] = useState(false);
  const [useGz, setUseGz] = useState(false);
  const [plainUri, setPlainUri] = useState('');
  const [gzUri, setGzUri] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [srcGz, setSrcGz] = useState(false);

  // Prepare plain and gz variants once per file
  useEffect(() => {
    let alive = true;
    (async () => {
      setBusy(true);
      try {
        // Sniff first bytes of file for gzip magic
        let sourceIsGz = false;
        try {
          const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
          sourceIsGz = head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b;
          setSrcGz(sourceIsGz);
        } catch { setSrcGz(false); }

        // Read source bytes and derive SVG text
        let svgText = '';
        if (sourceIsGz) {
          const ab = await file.arrayBuffer();
          const u8 = new Uint8Array(ab);
          try {
            if (typeof DecompressionStream !== 'undefined') {
              const rs = new ReadableStream({ start(c){ c.enqueue(u8); c.close(); } });
              const ds = new DecompressionStream('gzip');
              const out = await new Response(rs.pipeThrough(ds)).arrayBuffer();
              svgText = new TextDecoder('utf-8').decode(out);
            }
          } catch { /* fall back */ }
          if (!svgText) {
            const { default: pako } = await import('pako');
            svgText = new TextDecoder('utf-8').decode(pako.ungzip(u8));
          }
        } else {
          svgText = await file.text();
        }

        const plainB64 = btoa(unescape(encodeURIComponent(svgText)));
        const plain = `data:image/svg+xml;base64,${plainB64}`;
        if (!alive) return;
        setPlainUri(plain);

        // Try native CompressionStream first
        let gz = '';
        try {
          if (typeof CompressionStream !== 'undefined') {
            const enc = new TextEncoder().encode(svgText);
            const rs = new ReadableStream({ start(c){ c.enqueue(enc); c.close(); } });
            const cs = new CompressionStream('gzip');
            const out = await new Response(rs.pipeThrough(cs)).arrayBuffer();
            const u8 = new Uint8Array(out);
            const gzB64 = btoa(String.fromCharCode.apply(null, Array.from(u8)));
            gz = `data:image/svg+xml;base64,${gzB64}`;
          }
        } catch { /* fall back to pako */ }

        // Fallback: pako
        if (!gz) {
          try {
            const { default: pako } = await import('pako');
            const gzBytes = pako.gzip(new TextEncoder().encode(svgText));
            const gzB64 = btoa(String.fromCharCode.apply(null, Array.from(gzBytes)));
            gz = `data:image/svg+xml;base64,${gzB64}`;
          } catch { /* gzip unavailable */ }
        }

        if (!alive) return;
        setGzUri(sourceIsGz ? `data:image/svg+xml;base64,${btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(await file.arrayBuffer()))))}` : gz);
        // Never auto-enable gzip; user must opt in explicitly
        setUseGz(false);
      } catch {
        if (alive) { setPlainUri(''); setGzUri(''); setUseGz(false); }
      } finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, [file]);

  // Keep currentUrl in sync if the user toggles
  useEffect(() => {
    if (!plainUri || !gzUri) return;
    const preferred = useGz ? gzUri : plainUri;
    if (preferred && preferred !== currentUrl) onChange(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useGz, plainUri, gzUri]);

  const plainBytes = useMemo(() => (plainUri ? bytesOfString(plainUri) : 0), [plainUri]);
  const gzBytes = useMemo(() => (gzUri ? bytesOfString(gzUri) : 0), [gzUri]);

  const diff = plainBytes && gzBytes ? (plainBytes - gzBytes) : 0;

  return (
    <div style={{ marginTop: 4 }}>
      <Row>
        <Small>
          SVG storage options: plain {plainBytes ? `${plainBytes.toLocaleString()} B` : '-'} ·
          gzipped {gzBytes ? `${gzBytes.toLocaleString()} B` : (busy ? '...' : '-')}
          {diff ? ` (saves ${diff.toLocaleString()} B)` : ''}
        </Small>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={useGz}
            disabled={busy || !gzUri}
            onChange={(e) => {
              const want = !!e.target.checked;
              if (want) { setConfirmOpen(true); }
              else { setUseGz(false); onChange(plainUri); }
            }}
          />
          Store gzipped
        </label>
      </Row>
      <Small style={{ display: 'block', marginTop: 4 }}>
        Preview auto-decompresses gzipped SVG for safety and compatibility.
        {!gzUri && !busy && '  (gzip unavailable on this browser - plain SVG will be stored)'}
        {useGz && (
          <span style={{ color: 'var(--zu-accent-sec)', display: 'block', marginTop: 4 }}>
            Warning: Some marketplaces (e.g., OBJKT) may not render gzipped SVG data URIs
            and can show "Encoding error". ZeroUnbound renders them correctly.
          </span>
        )}
        {srcGz && (
          <span style={{ display: 'block', marginTop: 4 }}>
            Source appears already gzipped.
          </span>
        )}
      </Small>

      {confirmOpen && (
        <PixelConfirmDialog
          open
          title="Store gzipped?"
          message={(
            <div>
              <p style={{ margin: '0 0 6px' }}>
                Some marketplaces (e.g., OBJKT) may not render gzipped SVG data URIs and show
                "Encoding error". ZeroUnbound renders them correctly.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={termsOk} onChange={(e) => setTermsOk(e.target.checked)} />
                I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
            </div>
          )}
          confirmLabel="OK"
          cancelLabel="Cancel"
          confirmDisabled={!termsOk}
          onConfirm={() => { setUseGz(true); onChange(gzUri || currentUrl); setConfirmOpen(false); setTermsOk(false); }}
          onCancel={() => { setConfirmOpen(false); setTermsOk(false); }}
        />
      )}
    </div>
  );
}

SvgCompressor.propTypes = {
  file: PropTypes.instanceOf(File).isRequired,
  currentUrl: PropTypes.string,
  onChange: PropTypes.func,
};

SvgCompressor.defaultProps = {
  currentUrl: '',
  onChange: () => {},
};

/* EOF */
