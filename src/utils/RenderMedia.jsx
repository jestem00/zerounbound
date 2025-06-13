/*Developed by @jams2blues with love for the Tezos community
  File: src/utils/RenderMedia.jsx
  Rev : r680   2025-06-25
  Summary: hook-order fix — call useModelViewerOnce
           unconditionally; drop unused MIME_TYPES import. */

import React, { useEffect, useMemo } from 'react';
import {
  mimeFromFilename,
  isMimeWhitelisted,
} from '../constants/mimeTypes.js';

/*──────── helpers ──────────────────────────────────────────────*/
const mimeFromDataUri = (u = '') =>
  u.startsWith('data:') ? (u.slice(5).split(/[;,]/)[0] || '') : '';

/** remove line-breaks / spaces and drop duplicate data-URI tail */
function sanitizeUri(u = '') {
  if (!u) return '';
  let s = String(u).replace(/\s+/g, '');          /* collapse whitespace */
  if (s.startsWith('data:')) {
    const dup = s.indexOf('data:', 5);            // second occurrence
    if (dup !== -1) s = s.slice(0, dup);
  }
  return s;
}

/** best-effort mime resolve: explicit → data-uri → filename */
function resolveMime(uri, explicit = '') {
  if (explicit) return explicit;
  const fromData = mimeFromDataUri(uri);
  if (fromData) return fromData;
  return mimeFromFilename(uri);
}

/* one-time <model-viewer> loader (SSR-safe) */
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
}) {
  /* stable hook count — always call */
  useModelViewerOnce();

  const safeUri = useMemo(() => sanitizeUri(uri), [uri]);
  const type    = useMemo(() => resolveMime(safeUri, mime), [safeUri, mime]);

  if (!safeUri) return null;

  /* lenient whitelist: accept any data:image|video|audio|model */
  const whitelisted =
    isMimeWhitelisted(type) ||
    safeUri.startsWith('data:image') ||
    safeUri.startsWith('data:video') ||
    safeUri.startsWith('data:audio') ||
    safeUri.startsWith('data:model');

  if (!whitelisted) {
    return (
      <a
        href={safeUri}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={{ color: 'var(--zu-accent-sec)' }}
      >
        Unsupported media — open externally.
      </a>
    );
  }

  /*──────── renderers ─────────────────────────────────────────*/
  if (type.startsWith('image/')) {
    return (
      <img
        src={safeUri}
        alt={alt}
        style={style}
        className={className}
        loading="lazy"
      />
    );
  }

  if (type.startsWith('video/')) {
    return (
      <video
        src={safeUri}
        controls
        style={style}
        className={className}
        preload="metadata"
      />
    );
  }

  if (type.startsWith('audio/')) {
    return (
      <audio src={safeUri} controls style={style} className={className} />
    );
  }

  if (type.startsWith('model/')) {
    return (
      <model-viewer
        src={safeUri}
        camera-controls
        auto-rotate
        style={{ width: '100%', height: '100%', ...style }}
        class={className} /* custom element needs plain class */
      />
    );
  }

  if (
    type === 'application/pdf' ||
    type === 'text/html' ||
    type === 'text/plain'
  ) {
    return (
      <iframe
        src={safeUri}
        title={alt}
        style={{
          border: 'none',
          width: '100%',
          height: '100%',
          ...style,
        }}
        className={className}
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
      />
    );
  }

  /* archive / generic fallback */
  return (
    <a
      href={safeUri}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      Download
    </a>
  );
}

/* What changed & why:
   • `useModelViewerOnce()` now called every render → hook order
     remains stable, fixing “Rendered fewer hooks” runtime error.
   • Removed dead MIME_TYPES import. */
/*EOF*/
