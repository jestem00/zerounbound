/*
  Developed by @jams2blues - ZeroContract Studio
  File:    src/utils/mediaPreview.js
  Rev :    r1 2025-09-21 UTC
  Summary: Shared helpers for determining whether token metadata exposes
           renderable media URIs (data: or tezos-storage:), including
           application/zip payloads used by interactive projects.
*/

const MEDIA_KEYS = [
  'artifactUri', 'artifact_uri',
  'displayUri', 'display_uri',
  'imageUri', 'image_uri', 'image',
  'thumbnailUri', 'thumbnail_uri',
  'mediaUri', 'media_uri',
  'animationUri', 'animation_uri',
  'animationUrl', 'animation_url',
];

const FORMAT_KEYS = ['uri', 'url'];

const DATA_URI_RE = /^data:(?:image\/|video\/|audio\/|text\/html|application\/(?:zip|x-zip-compressed|octet-stream)|application\/svg\+xml)/i;
const TEZOS_STORAGE_RE = /^tezos-storage:/i;

export function isInlineRenderableDataUri(uri) {
  if (typeof uri !== 'string') return false;
  return DATA_URI_RE.test(uri.trim());
}

export function isRenderableUri(uri, { allowTezosStorage = true } = {}) {
  if (isInlineRenderableDataUri(uri)) return true;
  if (allowTezosStorage && typeof uri === 'string' && TEZOS_STORAGE_RE.test(uri.trim())) {
    return true;
  }
  return false;
}

function firstMatchFromKeys(meta, predicate) {
  if (!meta || typeof meta !== 'object') return null;
  for (const key of MEDIA_KEYS) {
    if (!(key in meta)) continue;
    const value = meta[key];
    if (typeof value !== 'string') continue;
    if (predicate(value)) return value.trim();
  }
  return null;
}

function firstMatchFromFormats(meta, predicate) {
  const list = meta && Array.isArray(meta.formats) ? meta.formats : [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    for (const key of FORMAT_KEYS) {
      if (!(key in entry)) continue;
      const value = entry[key];
      if (typeof value !== 'string') continue;
      if (predicate(value)) return value.trim();
    }
  }
  return null;
}

export function findInlineRenderableDataUri(meta = {}) {
  const direct = firstMatchFromKeys(meta, isInlineRenderableDataUri);
  if (direct) return direct;
  return firstMatchFromFormats(meta, isInlineRenderableDataUri);
}

export function findRenderableUri(meta = {}, { allowTezosStorage = true } = {}) {
  const direct = firstMatchFromKeys(meta, (val) => isRenderableUri(val, { allowTezosStorage }));
  if (direct) return direct;
  return firstMatchFromFormats(meta, (val) => isRenderableUri(val, { allowTezosStorage }));
}

export function hasInlineRenderablePreview(meta = {}) {
  return Boolean(findInlineRenderableDataUri(meta));
}

export function hasRenderablePreview(meta = {}, { allowTezosStorage = true } = {}) {
  return Boolean(findRenderableUri(meta, { allowTezosStorage }));
}

export const __mediaPreviewTestHooks = {
  DATA_URI_RE,
  TEZOS_STORAGE_RE,
};

/* What changed & why (r1):
   - Centralised data: URI detection (including application/zip) so pages and
     listings share the same logic while we extend ZIP support.
   - Exposed helpers for tests via a dedicated module instead of duplicating
     regex fragments across pages.
*/
