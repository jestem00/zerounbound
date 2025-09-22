/*
  Developed by @jams2blues
  File:    src/utils/interactiveZip.js
  Rev :    r4   2025-09-21
  Summary: Restores CSS asset rewriting while emitting viewport metrics for responsive embeds.
*/

import { mimeFromFilename } from '../constants/mimeTypes.js';

const isHttpLike = /^(https?:)?\/\//i;

function decodeBase64DataUri(u = '') {
  if (!u.startsWith('data:')) throw new Error('Not a data URI');
  const comma = u.indexOf(',');
  if (comma < 0) throw new Error('Malformed data URI');
  const meta = u.slice(5, comma);
  const b64 = /;base64/i.test(meta);
  const body = u.slice(comma + 1);
  if (!b64) throw new Error('ZIP must be base64-encoded');
  const bin = typeof atob === 'function' ? atob(body) : Buffer.from(body, 'base64').toString('binary');
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = bin.charCodeAt(i) & 0xff;
  return bytes.buffer;
}

/** Build a blob URL for a file, guessing MIME from filename. */
function makeBlobUrl(name, bytes) {
  const mime = mimeFromFilename(name) || 'application/octet-stream';
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

/** Normalize zip entry keys to forward-slash paths without leading './'. */
function normPath(p = '') {
  const s = String(p).replace(/\\/g, '/');
  return s.replace(/^\.\//, '');
}

function resolveBlobUrl(map, target = '') {
  if (!target) return '';
  const direct = map.get(target);
  if (direct) return direct;
  const norm = normPath(target);
  if (norm !== target) {
    const normHit = map.get(norm);
    if (normHit) return normHit;
  }
  for (const [key, url] of map.entries()) {
    if (!url) continue;
    if (key === target || key === norm) return url;
    if (key.endsWith('/' + norm)) return url;
  }
  return '';
}

/**
 * Unpack a data:application/zip;base64 URI and construct a sandboxable entry.
 * Returns { ok, error?, indexUrl?, urls, cleanup, hazards, fallbackUrl? }.
 */
export async function unpackZipDataUri(dataUri) {
  try {
    const ab = decodeBase64DataUri(dataUri);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(ab);

    const keys = Object.keys(zip.files).map(normPath);
    if (!keys.includes('index.html')) {
      return { ok: false, error: 'ZIP missing top-level index.html' };
    }

    const idxFile = zip.file('index.html');
    const rawIndex = await idxFile.async('string');

    // Strip any author-supplied CSP meta so we can inject our sandbox policy.
    const strippedIndex = rawIndex.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>\s*/gi, '');

    // Probe <noscript> fallback content before rewriting.
    let fallbackContent = '';
    let fallbackUrl = '';
    let fallbackAssetPath = '';
    let fallbackKind = '';
    const fallbackMatch = strippedIndex.match(/<noscript[^>]*>([\s\S]*?)<\/noscript>/i);
    if (fallbackMatch) {
      fallbackContent = fallbackMatch[1].trim();
      if (fallbackContent) {
        if (/^<svg[\s>]/i.test(fallbackContent)) {
          fallbackKind = 'inline-svg';
        } else {
          const imgMatch = fallbackContent.match(/<img[^>]+src=(["'])([^"']+)\1/i);
          if (imgMatch) {
            const src = imgMatch[2].trim();
            if (src.startsWith('data:')) {
              fallbackUrl = src;
            } else if (!isHttpLike.test(src) && !src.startsWith('blob:') && !src.startsWith('#')) {
              fallbackKind = 'asset';
              fallbackAssetPath = normPath(src);
            }
          }
        }
      }
    }

    const urlMap = new Map();
    const hazards = { remotes: [] };
    const extraUrls = [];

    for (const [rawKey, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const key = normPath(rawKey);
      const bytes = await file.async('uint8array');
      const url = makeBlobUrl(key, bytes);
      urlMap.set(key, url);

      if (!fallbackUrl && fallbackKind === 'asset' && key === fallbackAssetPath) {
        fallbackUrl = url;
      }

      const lc = key.toLowerCase();
      if (/\.(html?|css|js)$/i.test(lc)) {
        try {
          const txt = key === 'index.html' ? rawIndex : await file.async('string');
          const matches = (txt.match(/\b(?:https?:|wss?:)\/\//gi) || []);
          hazards.remotes.push(...matches);
        } catch {}
      }
    }

    if (!fallbackUrl && fallbackKind === 'inline-svg') {
      const svgUrl = makeBlobUrl('inline-fallback.svg', new TextEncoder().encode(fallbackContent));
      fallbackUrl = svgUrl;
      extraUrls.push(svgUrl);
    }

    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: data:; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' blob: data:; script-src 'self' 'unsafe-inline' blob: data:; style-src 'self' 'unsafe-inline' blob: data:; connect-src 'none'">`;
    const withCsp = (() => {
      try {
        if (/<head[\s>]/i.test(strippedIndex)) {
          return strippedIndex.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n${cspMeta}`);
        }
      } catch {}
      return `${cspMeta}\n${strippedIndex}`;
    })();

    const rewritten = withCsp.replace(/(src|href)=["']([^"']+)["']/gi, (m, attr, val) => {
      const v = val.trim();
      if (!v || v.startsWith('#') || v.startsWith('data:') || v.startsWith('blob:') || isHttpLike.test(v)) return m;
      const blobUrl = resolveBlobUrl(urlMap, v);
      if (blobUrl) {
        return `${attr}="${blobUrl}"`;
      }
      return m;
    });

    const metricsScript = `
<script>
(function(){
  function postSize(){
    try {
      var doc = document.documentElement;
      var body = document.body;
      var width = Math.max(
        doc ? doc.scrollWidth : 0,
        doc ? doc.offsetWidth : 0,
        doc ? doc.clientWidth : 0,
        body ? body.scrollWidth : 0,
        body ? body.offsetWidth : 0,
        body ? body.clientWidth : 0
      );
      var height = Math.max(
        doc ? doc.scrollHeight : 0,
        doc ? doc.offsetHeight : 0,
        doc ? doc.clientHeight : 0,
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        body ? body.clientHeight : 0
      );
      if (width && height) {
        parent.postMessage({ type: 'zu:zip:metrics', width: width, height: height }, '*');
      }
    } catch (err) { }
  }
  function setupObservers(){
    if (typeof ResizeObserver === 'function') {
      try {
        var observer = new ResizeObserver(function(){ postSize(); });
        if (document.documentElement) observer.observe(document.documentElement);
        if (document.body) observer.observe(document.body);
        window.addEventListener('beforeunload', function(){ try { observer.disconnect(); } catch (e) {} });
      } catch (e) {}
    } else {
      var timer = setInterval(postSize, 500);
      window.addEventListener('beforeunload', function(){ clearInterval(timer); });
    }
  }
  window.addEventListener('load', function(){ postSize(); setupObservers(); });
  window.addEventListener('resize', postSize);
  window.addEventListener('message', function(event){
    var data = event && event.data;
    if (!data) return;
    if (data === 'zu:zip:ping' || (typeof data === 'object' && data.type === 'zu:zip:ping')) {
      postSize();
    }
  });
  setTimeout(postSize, 0);
})();
</script>`;

    const finalHtml = (() => {
      if (/<\/body>/i.test(rewritten)) {
        return rewritten.replace(/<\/body>/i, `${metricsScript}
</body>`);
      }
      return `${rewritten}
${metricsScript}`;
    })();

    const htmlUrl = makeBlobUrl('index.html', new TextEncoder().encode(finalHtml));
    urlMap.set('index.html', htmlUrl);
    extraUrls.push(htmlUrl);

    const debugHtml = typeof process !== 'undefined' && process?.env?.NODE_ENV === 'test' ? finalHtml : undefined;

    const cleanup = () => {
      for (const u of extraUrls) {
        try { URL.revokeObjectURL(u); } catch {}
      }
      for (const u of urlMap.values()) {
        try { URL.revokeObjectURL(u); } catch {}
      }
    };

    return { ok: true, indexUrl: htmlUrl, urls: urlMap, cleanup, hazards, fallbackUrl, debugHtml };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export function isZipDataUri(u = '') {
  return /^data:application\/(zip|x-zip-compressed);base64,/i.test(String(u || ''));
}

/* EOF */

