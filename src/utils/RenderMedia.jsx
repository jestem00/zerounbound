/*Developed by @jams2blues with love for the Tezos community
  File: src/utils/RenderMedia.jsx
  Summary: Universal, sandboxed media renderer — now parses data: URIs */

import React, { useEffect } from 'react';
import {
  MIME_TYPES,
  mimeFromFilename,
  isMimeWhitelisted,
} from '../constants/mimeTypes.js';

/*──────── helpers ──────────────────────────────────────────────*/
/** return mime part of a data-URI or empty string */
const mimeFromDataUri = (u = '') =>
  u.startsWith('data:') ? (u.slice(5).split(/[;,]/)[0] || '') : '';

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
 * Render any on-chain media in a secure, self-contained element.
 *
 * @param {string}  uri
 * @param {string=} mime
 * @param {string=} alt
 * @param {object=} style
 * @param {string=} className
 */
export default function RenderMedia({
  uri = '',
  mime = '',
  alt = '',
  style = {},
  className = '',
}) {
  if (!uri) return null;

  const type = resolveMime(uri, mime);

  /* fall back: treat data:image/* & data:video/* even if not whitelisted */
  const whitelisted =
    isMimeWhitelisted(type) ||
    uri.startsWith('data:image') ||
    uri.startsWith('data:video') ||
    uri.startsWith('data:audio') ||
    uri.startsWith('data:model');

  if (!whitelisted) {
    return (
      <a
        href={uri}
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
        src={uri}
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
        src={uri}
        controls
        style={style}
        className={className}
        preload="metadata"
      />
    );
  }

  if (type.startsWith('audio/')) {
    return (
      <audio src={uri} controls style={style} className={className} />
    );
  }

  if (type.startsWith('model/')) {
    useModelViewerOnce();
    return (
      <model-viewer
        src={uri}
        camera-controls
        auto-rotate
        style={{ width: '100%', height: '100%', ...style }}
        class={className} /* must use plain class for custom element */
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
        src={uri}
        title={alt}
        style={{
          border: 'none',
          width: '100%',
          height: '100%',
          ...style,
        }}
        className={className}
        sandbox="allow-same-origin' allow-scripts allow-popups allow-forms"
      />
    );
  }

  /* archive / generic fallback */
  return (
    <a
      href={uri}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      Download
    </a>
  );
}

/* What changed & why: added robust mime resolution for data: URIs and lenient
   fallback so fully on-chain assets render instead of “unsupported”. */
