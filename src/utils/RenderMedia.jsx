/*Developed by @jams2blues

  File: src/utils/RenderMedia.jsx

  Rev:  r788

  Summary: Video wrapper fill via CSS in tiles; forwardRef video; path fix; no merge artifacts. */



import * as React from 'react';

import {

  mimeFromFilename,

  isMimeWhitelisted,

} from '../constants/mimeTypes.js';

import { mimeFromDataUri, isSvgDataUri, isSvgzDataUri, normalizeSvgDataUri } from './uriHelpers.js';
import { isZipDataUri, unpackZipDataUri } from './interactiveZip.js';



const {

  useEffect,

  useMemo,

  useState,

  useRef,

  forwardRef,

} = React;



/*ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ helpers ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬*/

/**

 * Safer URI normalizer (trims, dedupes data:, handles base64 whitespace).

 */

function sanitizeUri(u = '') {

  if (!u) return { uri: '', trimmed: false };

  let s = String(u);

  const orig = s;



  s = s.trim();



  // Collapse duplicated data: prefixes (rare malformed input)

  if (s.startsWith('data:')) {

    const dup = s.indexOf('data:', 5);

    if (dup !== -1) s = s.slice(0, dup);

  }



  if (!s.startsWith('data:')) {

    s = s.replace(/\s+/g, '');

  } else {

    const comma = s.indexOf(',');

    if (comma > -1) {

      let header = s.slice(0, comma).replace(/\s+/g, '');

      let payload = s.slice(comma + 1);

      const isB64 = /;base64/i.test(header);

      if (isB64) payload = payload.replace(/\s+/g, '');

      s = `${header},${payload}`;

    } else {

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



/** OneÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Ëœtime loader for <model-viewer> (SSRÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Ëœsafe). */

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



/*ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ internal: <video> wrapper ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬*/

/**

 * Notes:

 *  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Wrapper shrinkÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Ëœwraps by default (inlineÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Ëœblock) so the FullscreenModal can

 *    drive size/scale. In 1ÃƒÆ’Ã¢â‚¬â€1 preview tiles we override this via CSS:

 *      .preview-1x1 > div[data-zu-media="video"] { inset:0; width/height:100% !important; }

 *  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Forward the ref to <video> so FullscreenModal can read videoWidth/Height.

 *  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Hide native fullscreen PiP; keep transport bar visible.

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

    fsOverlay = true,

  },

  ref,

) {

  const vref = useRef(null);

  const [errored, setErrored] = useState(false);




  const shouldMute = typeof muted === 'boolean' ? muted : !!autoPlay;



  // Defensive autoplay

  useEffect(() => {

    if (!autoPlay || !vref.current) return;

    try { vref.current.play?.().catch(() => {}); } catch {}

  }, [autoPlay]);



  const openModal = () => {

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

    } catch {}

  };



  const wrapStyle = {

    position: 'relative',

    display: 'inline-block', // becomes full-fill in tiles via CSS !important

    lineHeight: 0,

    ...style,                // FullscreenModal passes transforms here

  };



  const innerVideoStyle = {

    display: 'block',

    width: '100%',

    height: '100%',

    background: 'transparent',

    outline: 'none',

  };



  return (

    <div style={wrapStyle} className={className} data-zu-media="video">

      <video

        src={src}

        controls={controls}

        loop

        preload={preload}

        playsInline={playsInline}

        muted={shouldMute}

        autoPlay={autoPlay}

        poster={poster}

        style={innerVideoStyle}

        ref={(node) => {

          vref.current = node;

          if (typeof ref === 'function') ref(node);

          else if (ref && typeof ref === 'object') ref.current = node;

        }}

        onLoadedMetadata={onLoadedMetadata}

        onError={() => { if (!errored) { setErrored(true); onInvalid?.('load-error'); } }}

        onDoubleClick={openModal}

        controlsList="nofullscreen nodownload noremoteplayback"

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
          â›¶
        </button>
      )}
    </div>
  );
});

function RenderMediaRaw({

  uri = '',

  mime = '',

  alt = '',

  style = {},

  className = '',

  allowScripts = false,



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

  useModelViewerOnce();

  const { uri: safeUri, trimmed } = sanitizeUri(uri);

  const type = useMemo(() => resolveMime(safeUri, mime), [safeUri, mime]);

  const [errored, setErrored] = useState(false);
  const [svgViewUri, setSvgViewUri] = useState('');
  const [zipViewUri, setZipViewUri] = useState('');
  const zipCleanupRef = useRef(null);





  // Dev visibility when scripts are blocked

  useEffect(() => {

    if (typeof window === 'undefined' || !safeUri) return;

    if (type === 'image/svg+xml' && !allowScripts) {

      console.info('[RenderMedia] SVG scripts blocked for', safeUri);

    }

    if (type === 'text/html' && !allowScripts) {

      console.info('[RenderMedia] HTML iframe sandboxed (scripts off) for', safeUri);

    }

  }, [safeUri, type, allowScripts]);



  useEffect(() => { if (trimmed) onInvalid('sanitised'); }, [trimmed, onInvalid]);
  // Auto-normalise gzipped SVG data URIs to plain UTF-8 for compatibility
  useEffect(() => {
    let canceled = false;
    (async () => {
      setSvgViewUri('');
      try {
        if (type === 'image/svg+xml' && isSvgDataUri(safeUri) && isSvgzDataUri(safeUri)) {
          const norm = await normalizeSvgDataUri(safeUri);
          if (!canceled) setSvgViewUri(norm || safeUri);
        }
      } catch {}
    })();
    return () => { canceled = true; };
  }, [safeUri, type]);

  // Constrained interactive ZIP support for data:application/zip
  useEffect(() => {
    let canceled = false;
    (async () => {
      try { zipCleanupRef.current?.(); } catch {}
      zipCleanupRef.current = null;
      setZipViewUri('');
      try {
        if (type === 'application/zip' && isZipDataUri(safeUri)) {
          const res = await unpackZipDataUri(safeUri);
          if (!canceled && res?.ok && res.indexUrl) {
            setZipViewUri(res.indexUrl);
            zipCleanupRef.current = res.cleanup;
          }
        }
      } catch {}
    })();
    return () => { canceled = true; try { zipCleanupRef.current?.(); } catch {} };
  }, [safeUri, type]);



  if (!safeUri) return null;



  // Whitelist/allow data: safe classes

  const whitelisted =

    isMimeWhitelisted(type) ||

    safeUri.startsWith('data:image') ||

    safeUri.startsWith('data:video') ||

    safeUri.startsWith('data:audio') ||

    safeUri.startsWith('data:model') ||

    safeUri.startsWith('data:font'); // using your MIME map. :contentReference[oaicite:2]{index=2}



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

        Unsupported media ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â open externally.

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



  // SVG (scriptless <img> or opt-in <object>)

  if (type === 'image/svg+xml') {

    const svgStyle = { width: '100%', height: '100%', ...style };

    if (allowScripts) {

      return (

        <object data={svgViewUri || safeUri} type="image/svg+xml" style={svgStyle} className={className} onLoad={onLoad} data-zu-media="svg">

          <img src={svgViewUri || safeUri} alt={alt} loading="lazy" decoding="async" {...commonImgProps} data-zu-media="svg" />

        </object>

      );

    }

    return <img src={svgViewUri || safeUri} alt={alt} loading="lazy" decoding="async" {...commonImgProps} data-zu-media="svg" />;

  }



  // Images

  if (type && type.startsWith('image/')) {

    const imgClass = [className, 'zu-pixelated'].filter(Boolean).join(' ');

    return (

      <img

        src={safeUri}

        alt={alt}

        loading="lazy"

        decoding="async"

        style={{ imageRendering: 'pixelated', ...style }}

        className={imgClass}

        data-zu-media="image"

        ref={ref}

        onLoad={onLoad}

        onError={handleErrorOnce}

      />

    );

  }



  // Videos

  if (type && type.startsWith('video/')) {

    return (

      <ZuVideo

        ref={ref}

        src={safeUri}

        type={type}

        className={className}

        style={style}        // In tiles we pass no size; CSS takes over. In modal, caller can size.

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



  // Audio

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



  // 3D models (model-viewer)

  if (type && type.startsWith('model/')) {

    // eslint-disable-next-line react/no-unknown-property

    return (

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

    );

  }




  // ZIP (interactive; sandboxed iframe with CSP injected by unpacker)
  if (type === 'application/zip' && zipViewUri) {
    const sandbox = allowScripts ? 'allow-scripts' : '';
    return (
      <iframe
        src={zipViewUri}
        title={alt || 'interactive-zip'}
        sandbox={sandbox}
        style={{ border: 'none', width: '100%', height: '100%', ...style }}
        className={className}
        referrerPolicy='no-referrer'
      />
    );
  }
  // PDFs/HTML/text ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ sandboxed iframe by default

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



  // Fonts (offer download)

  if (type && type.startsWith('font/')) {

    return (

      <a href={safeUri} download className={className} style={{ color: 'var(--zu-accent-sec)' }}>

        Download font

      </a>

    );

  }



  onInvalid('mime-mismatch');

  return (

    <a href={safeUri} download className={className} style={{ color: 'var(--zu-accent-sec)' }}>

      Download

    </a>

  );

}



const RenderMedia = forwardRef(RenderMediaRaw);

export default RenderMedia;



/* What changed & why: r788

   ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Restored clean file (removed bad merge artifacts; fixed import path).

   ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Let CSS force video wrapper to fill in .preview-1x1 tiles (no crop).

   ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Kept fullscreen modal behavior: ref on <video>, shrink-wrap by default. */















