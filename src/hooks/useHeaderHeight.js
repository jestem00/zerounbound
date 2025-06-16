/*Developed by @jams2blues – ZeroContract Studio
  File:    src/hooks/useHeaderHeight.js
  Rev :    r001  2025-07-02
  Summary: updates CSS var --hdr to live header height */
import { useEffect } from 'react';

/**
 * Keeps the --hdr CSS variable in sync with the real rendered
 * <header> element so every page can offset content precisely
 * (fixes clipping when fonts scale or theme changes).
 */
export default function useHeaderHeight () {
  useEffect(() => {
    const set = () => {
      const hdr = document.querySelector('header');
      if (!hdr) return;
      const { height } = hdr.getBoundingClientRect();
      document.documentElement
        .style
        .setProperty('--hdr', `${Math.round(height)}px`);
    };

    /* initial + debounced resize/orientation */
    set();
    let id;
    const onResize = () => {
      clearTimeout(id);
      id = setTimeout(set, 60);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      clearTimeout(id);
    };
  }, []);
}
/* EOF */
