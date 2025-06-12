/*Developed by @jams2blues with love for the Tezos community
  File: src/utils/useWheelTunnel.js
  Summary: hook that lets wheel-scroll bubble to the document when an
           inner overlay is at its scroll extents – ends iframe “dead-scroll” pain. */

import { useEffect } from 'react';

/**
 *      useWheelTunnel(ref)
 * When `ref.current` cannot scroll further (top or bottom) the wheel event
 * is re-dispatched on `window`, so the page scrolls instead of “sticking”.
 */
export default function useWheelTunnel(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const atTop    = e.deltaY < 0 && scrollTop === 0;
      const atBottom = e.deltaY > 0 && scrollTop + clientHeight >= scrollHeight;
      if (atTop || atBottom) {
        e.preventDefault();                 // stop inner scroll
        window.scrollBy({                   // bubble to page
          top: e.deltaY,
          behavior: 'smooth',
        });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref]);
}
