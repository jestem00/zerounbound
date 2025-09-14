/*
  Developed by @jams2blues - ZeroContract Studio
  File:    src/utils/confirmBus.js
  Rev :    r1   2025-09-09
  Summary: Tiny event-based confirm() replacement that integrates with
           PixelConfirmDialog via GlobalConfirm. Ensures 8-bit theme,
           central alignment and SSR safety.
*/

export function requestConfirm({ title = '', message = '', okLabel = 'OK', cancelLabel = 'Cancel', hideCancel = false } = {}) {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const detail = { title, message, okLabel, cancelLabel, hideCancel, resolve };
      window.dispatchEvent(new CustomEvent('zu:confirm', { detail }));
    } catch {
      resolve(false);
    }
  });
}

/* EOF */

