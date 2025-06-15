/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/hooks/useViewportUnit.js
  Rev :    r742‑m1  2025‑06‑29
  Summary: one‑vh CSS custom property w/ resize debounce
──────────────────────────────────────────────────────────────*/
import { useEffect } from 'react';

/**
 * Sets --vh to 1 % of the *visual* viewport height.
 * Debounced to 75 ms to avoid jank while dragging windows.
 */
export default function useViewportUnit() {
  useEffect(() => {
    let to = null;
    const set = () =>
      document.documentElement.style.setProperty(
        '--vh',
        `${window.visualViewport?.height ?? window.innerHeight}px`,
      );

    const handler = () => {
      clearTimeout(to);
      to = setTimeout(set, 75);
    };

    set();                                   /* initial */
    window.visualViewport?.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);

    return () => {
      window.visualViewport?.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
      clearTimeout(to);
    };
  }, []);
}
/* EOF */
