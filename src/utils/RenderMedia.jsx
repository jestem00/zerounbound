/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/RenderMedia.jsx
  Rev :    r737   2025‑07‑25
  Summary: SSR‑safe useEffect + font preview stub
──────────────────────────────────────────────────────────────*/
import * as React from 'react';
import {
  mimeFromFilename,
  isMimeWhitelisted,
} from '../constants/mimeTypes.js';

const { useEffect, useMemo, useState } = React;

/*──────── helpers ───────────────────────────────────────────*/
const mimeFromDataUri = (u = '') =>
  u.startsWith('data:') ? (u.slice(5).split(/[;,]/)[0] || '') : '';

function sanitizeUri(u = '') {
  if (!u) return { uri:'', trimmed:false };
  let s = String(u).replace(/\s+/g, '');
  const orig = s;
  if (s.startsWith('data:')) {
    const dup = s.indexOf('data:', 5);
    if (dup !== -1) s = s.slice(0, dup);
  }
  return { uri:s, trimmed:s !== orig };
}

function resolveMime(uri, explicit = '') {
  if (explicit) return explicit;
  const fromData = mimeFromDataUri(uri);
  if (fromData) return fromData;
  return mimeFromFilename(uri);
}

function useModelViewerOnce() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.customElements?.get('model-viewer')) return;
    const s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
    document.head.appendChild(s);
  }, []);
}

/**
 * Universal, sandboxed media renderer.
 */
export default function RenderMedia({
  uri = '',
  mime = '',
  alt = '',
  style = {},
  className = '',
  onInvalid = () => {},
}) {
  useModelViewerOnce();

  const { uri: safeUri, trimmed } = sanitizeUri(uri);
  const type = useMemo(() => resolveMime(safeUri, mime), [safeUri, mime]);
  const [errored, setErrored] = useState(false);

  useEffect(() => { if (trimmed) onInvalid('sanitised'); }, [trimmed, onInvalid]);
  if (!safeUri) return null;

  const whitelisted = isMimeWhitelisted(type)
    || safeUri.startsWith('data:image')
    || safeUri.startsWith('data:video')
    || safeUri.startsWith('data:audio')
    || safeUri.startsWith('data:model')
    || safeUri.startsWith('data:font');

  if (!whitelisted) {
    onInvalid('unsupported');
    return (
      <a href={safeUri} target="_blank" rel="noopener noreferrer" download
         className={className} style={{ color:'var(--zu-accent-sec)' }}>
        Unsupported media — open externally.
      </a>
    );
  }

  const commonImgProps = {
    style, className,
    onError: () => { if (!errored) { setErrored(true); onInvalid('load-error'); } },
  };

  /* SVG special‑case */
  if (type === 'image/svg+xml') {
    const svgStyle = { imageRendering:'pixelated', width:'100%', height:'100%', ...style };
    return (
      <object data={safeUri} type="image/svg+xml" style={svgStyle} className={className}>
        <img src={safeUri} alt={alt} loading="lazy" {...commonImgProps} />
      </object>
    );
  }
  if (type.startsWith('image/'))  return <img   src={safeUri} alt={alt} loading="lazy" {...commonImgProps} />;
  if (type.startsWith('video/'))  return <video src={safeUri} controls preload="metadata" {...commonImgProps} />;
  if (type.startsWith('audio/'))  return <audio src={safeUri} controls {...commonImgProps} />;
  if (type.startsWith('model/'))  return (
    <model-viewer src={safeUri} camera-controls auto-rotate
                  style={{ width:'100%', height:'100%', ...style }} class={className} />
  );
  if (type === 'application/pdf' || type === 'text/html' || type === 'text/plain') {
    return (
      <iframe src={safeUri} title={alt}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              style={{ border:'none', width:'100%', height:'100%', ...style }}
              className={className} />
    );
  }

  /* inline fonts → offer download link */
  if (type.startsWith('font/')) {
    return (
      <a href={safeUri} download={alt || 'font'} className={className}
         style={{ fontFamily:'monospace', fontSize:'.8rem' }}>
        Download font
      </a>
    );
  }

  onInvalid('unsupported');
  return (
    <a href={safeUri} target="_blank" rel="noopener noreferrer" className={className}>
      Download
    </a>
  );
}
/* What changed & why:
   • Switched to namespace import to guarantee SSR `useEffect` binding.
   • Added font/* handling + fallback link.
   • whitelisted data:font prefix.
   • Rev bumped to r737.
*/
/* EOF */
