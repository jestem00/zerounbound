/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/RenderMedia.jsx
  Rev :    r781   2025-08-10
  Summary: Center MP4/video correctly in FullscreenModal:
           • <ZuVideo> is now forwardRef’d so the modal can
             measure intrinsic video size (videoWidth/Height).
           • Wrapper no longer forces width/height:100%; it
             shrink‑wraps the media (inline‑block), so the
             modal’s flex centering works for videos too.
           • The scaling/size style from callers is applied to
             the wrapper (not the <video>) and the video fills
             the wrapper (100%/100% block).
           • Native fullscreen remains hidden; dbl‑click + ⛶
             overlay still open our FullscreenModal.
           • All previous behavior preserved (loop, autoplay
             safety, sandbox rules, sanitisation, etc.).
────────────────────────────────────────────────────────────*/
import * as React from 'react';
import {
  mimeFromFilename,
  isMimeWhitelisted,
} from '../constants/mimeTypes.js';          /* path fix */
import { mimeFromDataUri } from './uriHelpers.js';

const {
  useEffect,
  useMemo,
  useState,
  useRef,
  forwardRef,
} = React;

/*──────── types (JSDoc) ─────────────────────────────────────*/
/**
 * @typedef {'sanitised'|'unsupported'|'blocked-mime'|'load-error'|'mime-mismatch'} InvalidReason
 */

/**
 * @typedef {Object} RenderMediaProps
 * @property {string}  [uri]
 * @property {string}  [mime]
 * @property {string}  [alt]
 * @property {Object}  [style]
 * @property {string}  [className]
 * @property {boolean} [allowScripts=false]
 * @property {boolean} [autoPlay=false]
 * @property {boolean} [playsInline=true]
 * @property {boolean} [muted]
 * @property {string}  [poster]
 * @property {boolean} [controls=true]
 * @property {'none'|'metadata'|'auto'} [preload='metadata']
 * @property {(reason:InvalidReason)=>void} [onInvalid]
 * @property {()=>void} [onLoad]
 * @property {(ev?: any)=>void} [onLoadedMetadata]
 * @property {(detail:{uri:string,mime:string})=>void} [onRequestFullscreen]
 *           Optional: when provided, called instead of dispatching
 *           a window event to open our FullscreenModal.
 * @property {boolean} [fsOverlay=true]
 *           Whether to render a small ⛶ overlay that opens our modal.
 *           Native video fullscreen control is always hidden.
 */

/*──────── helpers ───────────────────────────────────────────*/
/**
 * Safer URI normalizer.
 * • Trims outer whitespace.
 * • Removes duplicated "data:" prefixes.
 * • For non‑data URIs: strips whitespace entirely (defensive).
 * • For data URIs:
 *    – Strips whitespace from header.
 *    – If ;base64 is present, removes whitespace from payload.
 *    – Otherwise leaves payload intact to avoid corrupting text.
 */
function sanitizeUri(u = '') {
  if (!u) return { uri: '', trimmed: false };
  let s = String(u);
  const orig = s;

  // Trim outer whitespace first
  s = s.trim();

  // Collapse duplicated data: prefixes (rare malformed input)
  if (s.startsWith('data:')) {
    const dup = s.indexOf('data:', 5);
    if (dup !== -1) s = s.slice(0, dup);
  }

  if (!s.startsWith('data:')) {
    // Remote/url‑like strings — strip all whitespace
    s = s.replace(/\s+/g, '');
  } else {
    // data:URI — preserve payload unless base64
    const comma = s.indexOf(',');
    if (comma > -1) {
      let header = s.slice(0, comma).replace(/\s+/g, '');
      let payload = s.slice(comma + 1);
      const isB64 = /;base64/i.test(header);
      if (isB64) payload = payload.replace(/\s+/g, '');
      s = `${header},${payload}`;
    } else {
      // No comma: treat as malformed; strip whitespace defensively
      s = s.replace(/\s+/g, '');
    }
  }

  return { uri: s, trimmed: s !== orig };
}

function resolveMime(uri, explicit = '') {
  if (explicit) return explicit;
  const fromData = mimeFromDataUri(uri);
  if (fromData) return fromData;
  return mimeFromFilename(uri);
}

/**
 * Inject @google/model-viewer once (SSR‑safe).
 * No‑op if already registered with customElements.
 */
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

/*──────── internal: video wrapper that never calls hooks conditionally ─────*/
/**
 * Note on centering in our FullscreenModal:
 *  • The wrapper is now `inline-block` and *does not* stretch to 100%.
 *    This allows the modal's flex container to center the media.
 *  • The caller‑provided `style` (width/height/transform from the modal)
 *    is applied to the wrapper. The <video> fills the wrapper.
 *  • The forwarded `ref` points to the <video> element so the modal
 *    can read videoWidth/videoHeight for natural‑size fit.
 */
const ZuVideo = forwardRef(function ZuVideo(
  {
    src,
    type,
    className,
    style,
    autoPlay,
    playsInline,
    muted,
    poster,
    preload,
    controls,
    onLoadedMetadata,
    onInvalid,
    onRequestFullscreen,
    fsOverlay,
  },
  ref,
) {
  const vref = useRef(null);
  const [errored, setErrored] = useState(false);

  // If autoPlay requested and muted prop is undefined, default to true
  const shouldMute = typeof muted === 'boolean' ? muted : !!autoPlay;

  // Defensive: make sure autoplay tries don’t explode in browsers that block it
  useEffect(() => {
    if (!autoPlay || !vref.current) return;
    try { vref.current.play?.().catch(() => {}); } catch (_) {}
  }, [autoPlay]);

  // Hide native fullscreen & PiP; use our modal instead
  const videoProps = {
    src,
    controls,                     // keep native transport bar
    loop: true,                   // keep r743/r760 behavior
    preload,
    playsInline,
    muted: shouldMute,
    autoPlay,
    poster,
    className,
    // style is applied to the wrapper; video fills wrapper
    ref: (node) => {
      vref.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref && typeof ref === 'object') ref.current = node;
    },
    onLoadedMetadata,
    onError: () => { if (!errored) { setErrored(true); onInvalid?.('load-error'); } },
    // Double‑click anywhere to open our modal
    onDoubleClick: openModal,
  };

  function openModal() {
    const detail = { uri: src, mime: type };
    if (typeof onRequestFullscreen === 'function') {
      onRequestFullscreen(detail);
      return;
    }
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('zu:openFullscreen', { detail }));
        window.dispatchEvent(new CustomEvent('zu:openMediaModal', { detail }));
      }
    } catch (_) {}
  }

  // Wrapper: shrink‑wrap and allow our modal to center it
  const wrapStyle = {
    position: 'relative',
    display: 'inline-block',
    lineHeight: 0,              // remove inline‑gap
    ...style,                   // modal passes width/height/transform here
  };

  // Video fills wrapper; block removes baseline gaps in some browsers
  const innerVideoStyle = {
    display: 'block',
    width: '100%',
    height: '100%',
    background: 'transparent',
    outline: 'none',
  };

  return (
    <div style={wrapStyle} data-zu-media="video">
      <video
        {...videoProps}
        style={innerVideoStyle}
        // Chromium/Firefox: hide built‑in fullscreen; Safari ignores but we also give users our ⛶
        controlsList="nofullscreen nodownload noremoteplayback"
        // Safari / Chromium
        disablePictureInPicture
      />
      {fsOverlay && (
        <button
          type="button"
          aria-label="Fullscreen"
          onClick={openModal}
          title="Fullscreen"
          style={{
            position: 'absolute',
            right: 6,
            bottom: 6,
            zIndex: 7,
            padding: '2px 6px',
            fontFamily: 'Pixeloid Sans, monospace',
            fontSize: '0.8rem',
            lineHeight: 1,
            border: '2px solid var(--zu-accent,#00c8ff)',
            background: 'rgba(0,0,0,.5)',
            color: 'var(--zu-fg,#fff)',
            cursor: 'pointer',
            opacity: .8,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '.8'; }}
        >
          ⛶
        </button>
      )}
    </div>
  );
});

/*──────── public component ──────────────────────────────────*/
/**
 * Universal, sandbox‑aware media renderer.
 * Accepts `onLoad` / `onLoadedMetadata` to bubble natural‑size signals.
 * NOTE: All hooks are declared unconditionally at the top of the
 * component to guarantee a stable call order across renders and media
 * type switches (fixes "Rendered more hooks than during the previous
 * render" regression).
 * (Stack trace pointed to useRef inside RenderMedia at ~line 248.)
 */
function RenderMediaRaw({
  uri = '',
  mime = '',
  alt = '',
  style = {},
  className = '',
  allowScripts = false,

  /* optional flags */
  autoPlay = false,
  playsInline = true,
  muted,
  poster,
  controls = true,
  preload = 'metadata',
  fsOverlay = true,

  onInvalid = () => {},
  onLoad = () => {},
  onLoadedMetadata = () => {},
  onRequestFullscreen,
}, ref) {
  useModelViewerOnce();  // SSR‑safe one‑time loader

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

  // Inform caller when we sanitised an incoming URI
  useEffect(() => { if (trimmed) onInvalid('sanitised'); }, [trimmed, onInvalid]);

  if (!safeUri) return null;

  /* whitelist gate – allow known types + specific data: classes */
  const whitelisted =
    isMimeWhitelisted(type) ||
    safeUri.startsWith('data:image') ||
    safeUri.startsWith('data:video') ||
    safeUri.startsWith('data:audio') ||
    safeUri.startsWith('data:model') ||
    safeUri.startsWith('data:font');

  if (!whitelisted) {
    onInvalid(type ? 'blocked-mime' : 'unsupported');
    return (
      <a
        href={safeUri}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={{ color: 'var(--zu-accent-sec)' }}
        download
      >
        Unsupported media — open externally.
      </a>
    );
  }

  const handleErrorOnce = () => {
    if (!errored) {
      setErrored(true);
      onInvalid('load-error');
    }
  };

  const commonImgProps = {
    style,
    className,
    ref,
    onLoad,
    onError: handleErrorOnce,
  };

  /* SVG – safe by default, opt‑in scripts via <object> */
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
          {/* Fallback if <object> fails to load */}
          <img
            src={safeUri}
            alt={alt}
            loading="lazy"
            decoding="async"
            {...commonImgProps}
          />
        </object>
      );
    }
    return (
      <img
        src={safeUri}
        alt={alt}
        loading="lazy"
        decoding="async"
        {...commonImgProps}
      />
    );
  }

  /* Images */
  if (type && type.startsWith('image/')) {
    return (
      <img
        src={safeUri}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={{ imageRendering: 'pixelated', ...style }}
        {...commonImgProps}
      />
    );
  }

  /* Videos — keep r743 loop behavior; remove native fullscreen
     IMPORTANT: we forward the ref to <video> so <FullscreenModal>
     can measure intrinsic size for perfect centering & scaling. */
  if (type && type.startsWith('video/')) {
    return (
      <ZuVideo
        ref={ref}
        src={safeUri}
        type={type}
        className={className}
        style={style}                 // applied to wrapper; video fills it
        autoPlay={autoPlay}
        playsInline={playsInline}
        muted={muted}
        poster={poster}
        preload={preload}
        controls={controls}
        onLoadedMetadata={onLoadedMetadata}
        onInvalid={onInvalid}
        onRequestFullscreen={onRequestFullscreen}
        fsOverlay={fsOverlay}
      />
    );
  }

  /* Audio */
  if (type && type.startsWith('audio/')) {
    const shouldMute = typeof muted === 'boolean' ? muted : false;
    return (
      <audio
        src={safeUri}
        controls={controls}
        preload={preload}
        muted={shouldMute}
        className={className}
        ref={ref}
        onError={handleErrorOnce}
      />
    );
  }

  /* 3D models (model-viewer web component) */
  if (type && type.startsWith('model/')) {
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
        onError={handleErrorOnce}
      />
      /* eslint-enable react/no-unknown-property */
    );
  }

  /* Inline docs / HTML / text – sandbox iframes by default */
  if (type === 'application/pdf' || type === 'text/html' || type === 'text/plain') {
    const base = 'allow-same-origin allow-popups allow-forms';
    const sandbox = allowScripts ? `${base} allow-scripts` : base;
    return (
      <iframe
        src={safeUri}
        title={alt || 'embedded-content'}
        sandbox={sandbox}
        style={{ border: 'none', width: '100%', height: '100%', ...style }}
        className={className}
        referrerPolicy="no-referrer"
      />
    );
  }

  /* Inline fonts → offer download */
  if (type && type.startsWith('font/')) {
    return (
      <a
        href={safeUri}
        download
        className={className}
        style={{ color: 'var(--zu-accent-sec)' }}
      >
        Download font
      </a>
    );
  }

  onInvalid('mime-mismatch');
  return (
    <a
      href={safeUri}
      download
      className={className}
      style={{ color: 'var(--zu-accent-sec)' }}
    >
      Download
    </a>
  );
}

const RenderMedia = forwardRef(RenderMediaRaw);
export default RenderMedia;

/* What changed & why: r781
   • Fixed FullscreenModal centering for videos (MP4, WebM, MOV):
     – The video wrapper no longer stretches to 100% of the pane.
       It is inline‑block and shrink‑wraps, allowing flex centering.
     – Caller style (size/scale from the modal) is applied to the
       wrapper, while the <video> fills the wrapper (100%/100%).
     – Forwarded ref now points to the <video> element so the modal
       can read videoWidth/videoHeight during natural‑size probes.
   • Kept no‑native‑fullscreen policy (controlsList, no PiP) and
     preserved all prior behaviors (loop, autoplay safety, sanitiser,
     events and overlay). */
/* EOF */
