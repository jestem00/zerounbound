/*Developed by @jams2blues with love for the Tezos community
  File:    src/constants/mimeTypes.js
  Rev :    r3   2025‑07‑24
  Summary: added web‑font types + helpers */
  
// NOTE: Keep alphabetical inside category blocks for merge hygiene.
// Update DeployCollectionForm.jsx validation + RenderMedia.jsx
// renderer cascade when editing this list.

/*────────────────── whitelisted MIME types ──────────────────*/
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

  /* fonts (inline‑data URIs are fully on‑chain & wallet‑safe) */
  'font/ttf',
  'font/woff',
  'font/woff2',

  /* archives */
  'application/x-zip-compressed',
  'application/zip',
];

/*────────────────── helpers ──────────────────────────────────*/
const EXT_LOOKUP = {
  // images
  apng: 'image/apng',
  bmp : 'image/bmp',
  gif : 'image/gif',
  jpeg: 'image/jpeg',
  jpg : 'image/jpeg',
  png : 'image/png',
  svg : 'image/svg+xml',
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
  mp3 : 'audio/mpeg',
  mpeg: 'audio/mpeg',
  wav : 'audio/wav',
  wave: 'audio/wav',

  // docs / misc
  html: 'text/html',
  json: 'application/json',
  pdf : 'application/pdf',
  txt : 'text/plain',

  // fonts
  ttf : 'font/ttf',
  woff: 'font/woff',
  woff2:'font/woff2',

  // archives
  zip : 'application/zip',
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

export function isMimeWhitelisted(mime) {
  return MIME_TYPES.includes(mime);
}

/* What changed & why:
   • Added WOFF/WOFF2/TTF to whitelist + ext map (false‑positive fix for
     inline fonts).
   • Rev bumped to r3. */
/* EOF */
