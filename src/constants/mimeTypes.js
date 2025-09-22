/*
  Developed by @jams2blues with love for the Tezos community
  File:    src/constants/mimeTypes.js
  Rev :    r5   2025-09-19
  Summary: added JS/CSS blob MIME mappings and kept preferredExt helper.
*/

// NOTE: Keep alphabetical inside category blocks for merge hygiene.
// Update DeployCollectionForm.jsx validation + RenderMedia.jsx
// renderer cascade when editing this list.

/* whitelisted MIME types */
export const MIME_TYPES = [
  /* images */
  'image/apng',
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',

  /* video */
  'video/mp4',            // H.264 + AAC baseline
  'video/ogg',            // Theora + Vorbis
  'video/quicktime',
  'video/webm',

  /* 3D models */
  'model/gltf-binary',    // .glb binary
  'model/gltf+json',      // .gltf JSON descriptor
  'model/gltf',

  /* audio */
  'audio/flac',
  'audio/midi',           // .mid / .midi files
  'audio/mp3',
  'audio/mpeg',
  'audio/ogg',
  'audio/vnd.wave',
  'audio/wav',
  'audio/x-pn-wav',
  'audio/x-wav',

  /* docs / misc */
  'application/json',
  'application/pdf',
  'text/html',            // will render in sandboxed iframe
  'text/plain',

  /* fonts (inline data URIs are fully on-chain and wallet-safe) */
  'font/ttf',
  'font/woff',
  'font/woff2',

  /* archives */
  'application/x-zip-compressed',
  'application/zip',
];

/* helpers */
const EXT_LOOKUP = {
  // images
  apng: 'image/apng',
  bmp : 'image/bmp',
  gif : 'image/gif',
  jpeg: 'image/jpeg',
  jpg : 'image/jpeg',
  png : 'image/png',
  svg : 'image/svg+xml',
  svgz: 'image/svg+xml',
  webp: 'image/webp',

  // video
  mov : 'video/quicktime',
  mp4 : 'video/mp4',
  ogg : 'video/ogg',
  ogv : 'video/ogg',
  webm: 'video/webm',

  // 3D models
  glb : 'model/gltf-binary',
  gltf: 'model/gltf+json',

  // audio
  flac: 'audio/flac',
  mid : 'audio/midi',
  midi: 'audio/midi',
  mp3 : 'audio/mp3',
  mpeg: 'audio/mpeg',
  wav : 'audio/wav',
  wave: 'audio/wav',

  // docs / misc
  css : 'text/css',
  html: 'text/html',
  json: 'application/json',
  pdf : 'application/pdf',
  txt : 'text/plain',

  // script assets
  cjs : 'text/javascript',
  js  : 'text/javascript',
  mjs : 'text/javascript',

  // fonts
  ttf : 'font/ttf',
  woff: 'font/woff',
  woff2:'font/woff2',

  // archives
  zip : 'application/zip',
};

const PREFERRED_EXT = {
  'audio/mpeg'   : 'mp3',
  'audio/mp3'    : 'mp3',
  'image/svg+xml': 'svg',
};

/**
 * Infer MIME from filename (extension).
 * Returns empty string on failure.
 */
export function mimeFromFilename(uri = '') {
  try {
    const ext = uri.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
    return EXT_LOOKUP[ext] || '';
  } catch {
    return '';
  }
}

/**
 * Preferred file extension for a given MIME type.
 * Falls back to subtype if no preference set.
 */
export function preferredExt(mime = '') {
  const m = String(mime || '').toLowerCase().split(';', 1)[0].trim();
  if (!m) return 'bin';
  return PREFERRED_EXT[m] || m.split('/')[1] || 'bin';
}

export function isMimeWhitelisted(mime) {
  return MIME_TYPES.includes(mime);
}

/* What changed & why:
   r4 - Added audio/mp3 alias plus preferredExt helper.
   r5 - Map css/js/cjs/mjs extensions to text MIME types for interactive ZIP blobs.
*/
/* EOF */
