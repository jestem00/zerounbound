/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/RenderMedia.jsx
  Rev :    r741   2025‑09‑20
  Summary: exposes onLoad / onLoadedMetadata passthrough
──────────────────────────────────────────────────────────────*/
import * as React from 'react';
import {
  mimeFromFilename,
  isMimeWhitelisted,
} from '../constants/mimeTypes.js';

const {
  useEffect,
  useMemo,
  useState,
  forwardRef,
} = React;

/*──────── helpers ───────────────────────────────────────────*/
const mimeFromDataUri = (u = '') =>
  u.startsWith('data:') ? (u.slice(5).split(/[;,]/)[0] || '') : '';

function sanitizeUri(u = '') {
  if (!u) return { uri: '', trimmed: false };
  let s = String(u).replace(/\s+/g, '');
  const orig = s;
  if (s.startsWith('data:')) {
    const dup = s.indexOf('data:', 5);
    if (dup !== -1) s = s.slice(0, dup);
  }
  return { uri: s, trimmed: s !== orig };
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
 * Universal, sandbox‑aware media renderer.
 * Accepts `onLoad` / `onLoadedMetadata` to bubble natural‑size signals
 */
function RenderMediaRaw({
  uri = '',
  mime = '',
  alt = '',
  style = {},
  className = '',
  allowScripts = false,
  onInvalid = () => {},
  onLoad = () => {},
  onLoadedMetadata = () => {},
}, ref) {
  useModelViewerOnce();

  const { uri: safeUri, trimmed } = sanitizeUri(uri);
  const type = useMemo(() => resolveMime(safeUri, mime), [safeUri, mime]);
  const [errored, setErrored] = useState(false);

  /* developer visibility – warn when scripts disabled */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!safeUri) return;
    if (type === 'image/svg+xml' && !allowScripts) {
      // eslint-disable-next-line no-console
      console.info('[RenderMedia] SVG scripts blocked for', safeUri);
    }
    if (type === 'text/html' && !allowScripts) {
      // eslint-disable-next-line no-console
      console.info('[RenderMedia] HTML iframe sandboxed (scripts off) for', safeUri);
    }
  }, [safeUri, type, allowScripts]);

  React.useEffect(() => { if (trimmed) onInvalid('sanitised'); }, [trimmed, onInvalid]);
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
      <a
        href={safeUri}
        target="_blank"
        rel="noopener noreferrer"
        download
        className={className}
        style={{ color: 'var(--zu-accent-sec)' }}
      >
        Unsupported media — open externally.
      </a>
    );
  }

  const commonImgProps = {
    style,
    className,
    ref,
    onLoad,
    onError: () => {
      if (!errored) {
        setErrored(true);
        onInvalid('load-error');
      }
    },
  };

  /* SVG special‑case — safe by default, opt‑in scripts */
  if (type === 'image/svg+xml') {
    const svgStyle = {
      imageRendering: 'pixelated',
      width: '100%',
      height: '100%',
      ...style,
    };

    if (allowScripts) {
      return (
        <object
          data={safeUri}
          type="image/svg+xml"
          style={svgStyle}
          className={className}
          onLoad={onLoad}
        >
          <img src={safeUri} alt={alt} loading="lazy" {...commonImgProps} />
        </object>
      );
    }
    return <img src={safeUri} alt={alt} loading="lazy" {...commonImgProps} />;
  }

  if (type.startsWith('image/')) {
    return (
      <img
        src={safeUri}
        alt={alt}
        loading="lazy"
        style={{ imageRendering: 'pixelated', ...style }}
        {...commonImgProps}
      />
    );
  }
  if (type.startsWith('video/')) {
    return (
      <video
        src={safeUri}
        controls
        preload="metadata"
        style={style}
        className={className}
        ref={ref}
        onLoadedMetadata={onLoadedMetadata}
      />
    );
  }
  if (type.startsWith('audio/')) {
    return <audio src={safeUri} controls className={className} ref={ref} />;
  }
  if (type.startsWith('model/')) {
    return (
      /* eslint-disable react/no-unknown-property */
      <model-viewer
        src={safeUri}
        camera-controls
        auto-rotate
        style={{ width: '100%', height: '100%', ...style }}
        class={className}
        ref={ref}
        onLoad={onLoad}
      />
      /* eslint-enable react/no-unknown-property */
    );
  }
  if (type === 'application/pdf' || type === 'text/html' || type === 'text/plain') {
    const sandboxBase = 'allow-same-origin allow-popups allow-forms';
    const sandbox     = allowScripts ? `${sandboxBase} allow-scripts` : sandboxBase;
    return (
      <iframe
        src={safeUri}
        title={alt}
        sandbox={sandbox}
        style={{ border: 'none', width: '100%', height: '100%', ...style }}
        className={className}
        ref={ref}
        onLoad={onLoad}
      />
    );
  }

  /* inline fonts → offer download */
  if (type.startsWith('font/')) {
    return (
      <a
        href={safeUri}
        download={alt || 'font'}
        className={className}
        style={{ fontFamily: 'monospace', fontSize: '.8rem' }}
      >
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

const RenderMedia = forwardRef(RenderMediaRaw);
export default RenderMedia;

/* What changed & why:
   • onLoad / onLoadedMetadata props forwarded for size detection
   • ref forwarding via forwardRef keeps parent‑side measurement simple
   • common hook order maintained; lint‑clean                              */
/* EOF */
