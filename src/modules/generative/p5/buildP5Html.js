/*─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: src/modules/generative/p5/buildP5Html.js
Rev:  r2   2025‑08‑20 UTC
Summary: Build self‑contained p5 HTML (text/html data URI), poster PNG, downscale, and helpers.
──────────────────────────────────────────────────────────────────*/

import P5_MIN_JS_SOURCE from './lib/p5-1.7.0.min.js'; // via next.config.js asset/source

function escapeScriptBody(s = '') {
  // Prevent premature </script> termination when inlining user code
  return String(s).replace(/<\/script/gi, '<\\/script');
}

/**
 * Build a complete HTML string embedding p5.min.js + sketch + deterministic seeding.
 * No external URLs. Observes square-canvas centering for nice previews.
 */
export function buildP5Html({ sketchSource, seedHex, tokenId, contract, projectName = 'P5OnChain' }) {
  const squareCss = `
  <style>
    html,body{margin:0;padding:0;background:#000;height:100%}
    #zu-root{position:fixed;inset:0;display:grid;place-items:center}
    canvas{image-rendering:pixelated;max-width:100vw;max-height:100vh}
  </style>`.trim();

  const boot = `
  <script>
  (function(){
    window.__zuToken = {
      contract: ${JSON.stringify(contract || '')},
      tokenId: ${Number.isFinite(tokenId) ? tokenId : 0},
      seedHex: ${JSON.stringify(seedHex || '')}
    };
    var hex = window.__zuToken.seedHex || '00000000'.repeat(4);
    function fold32(h){return [0,1,2,3].map(i=>parseInt(h.slice(i*8,(i+1)*8),16)>>>0).reduce((a,n)=>(a^n)>>>0,0)>>>0;}
    var SEED32 = fold32(hex);

    // Apply seed on both global- and instance-mode p5 sketches.
    function applySeed(p) {
      try { if (p && typeof p.randomSeed === 'function') p.randomSeed(SEED32); } catch {}
      try { if (p && typeof p.noiseSeed === 'function')  p.noiseSeed(SEED32);  } catch {}
    }
    window.__zuPrelude = applySeed;

    // 1) Global-mode hook: wrap window.setup (before user setup runs)
    try {
      if (typeof window.setup === 'function') {
        var _userSetup = window.setup;
        window.setup = function(){ try{ applySeed(window); }catch{} return _userSetup.apply(this, arguments); }
      } else {
        // define a setter that wraps later assignment
        var __setupSetter;
        Object.defineProperty(window, 'setup', {
          configurable: true, enumerable: true,
          get(){ return __setupSetter; },
          set(fn){ __setupSetter = function(){ try{ applySeed(window); }catch{} return fn.apply(this, arguments); }; }
        });
      }
    } catch {}

    // 2) Instance-mode hook: patch createCanvas to apply seed on the instance early
    try {
      if (window.p5 && window.p5.prototype) {
        var P = window.p5.prototype;
        if (typeof P.createCanvas === 'function') {
          var _cc = P.createCanvas;
          P.createCanvas = function(){ try{ applySeed(this); }catch{} return _cc.apply(this, arguments); }
        }
      }
    } catch {}
  })();
  </script>`.trim();

  const p5Min = `\n<script>${escapeScriptBody(P5_MIN_JS_SOURCE)}</script>`;
  const userSketch = `\n<script>\n${escapeScriptBody(sketchSource || '')}\n</script>`;

  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>',
    `<title>${projectName} #${tokenId}</title>`,
    squareCss,
    p5Min,
    boot,
    '</head><body><div id="zu-root"></div>',
    userSketch,
    '</body></html>',
  ].join('\n');
}

/** Convert HTML string → data:text/html;base64,… */
export function toDataHtmlBase64(html) {
  const utf8 = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(html)
    : new Uint8Array(unescape(encodeURIComponent(html)).split('').map((c) => c.charCodeAt(0)));
  let bin = ''; for (const b of utf8) bin += String.fromCharCode(b);
  return 'data:text/html;charset=utf-8;base64,' + btoa(bin);
}

/**
 * Render the HTML in an offscreen <iframe sandbox="allow-scripts"> and capture the first <canvas>.
 * Returns data:image/png;base64,…  (creator-side only; not SSR)
 */
export async function buildPosterPng(html, frame = 90, size = 768) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-scripts';
    iframe.style.cssText = `position:fixed;left:-10000px;top:-10000px;width:${size}px;height:${size}px;border:0;`;
    document.body.appendChild(iframe);
    iframe.src = toDataHtmlBase64(html);

    let tries = 0;
    const cleanup = () => { try { document.body.removeChild(iframe); } catch {} };
    const tick = () => {
      tries++;
      try {
        const c = iframe.contentDocument?.querySelector('canvas');
        if (c) { resolve(c.toDataURL('image/png')); cleanup(); return; }
      } catch {}
      if (tries < 120) requestAnimationFrame(tick); else { cleanup(); resolve(''); }
    };
    requestAnimationFrame(() => setTimeout(tick, Math.max(0, frame * 16 - 100)));
  });
}

/** Downscale a PNG data URI to max dimension `maxPx` (creator-side only). */
export async function downscalePng(pngDataUri, maxPx = 512) {
  if (!pngDataUri) return '';
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = pngDataUri;
  });
}

/* What changed & why: inline vendor p5; seed global+instance; text/html data URI only; poster & downscale helpers. */
