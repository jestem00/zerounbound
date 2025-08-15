/*Developed by @jams2blues
  File: src/utils/navigationRecovery.js
  Rev:  r1
  Summary: Back/forward recovery: re‑mount pages & nudge data refresh. */

/**
 * Install app‑wide navigation recovery to withstand browser back/forward
 * (incl. BFCache restores). On trigger it:
 *  • bumps `onRemount()` → _app keys <Component/> so pages re‑mount
 *  • dispatches light‑weight refresh events some pages already use
 *  • opts into manual scrollRestoration to avoid mismatches
 *
 * No page changes required.
 */
export function installNavigationRecovery(router, onRemount, opts = {}) {
  if (typeof window === 'undefined') return () => {};
  const { debounceMs = 80, fireRefreshEvents = true } = opts;

  /* throttle multiple signals into a single remount */
  let scheduled = false;
  const trigger = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;

      /* nudge data layers that already subscribe */
      if (fireRefreshEvents) {
        try { window.dispatchEvent(new Event('zu_cache_flush')); } catch {}
        try { window.dispatchEvent(new Event('zu:offersRefresh')); } catch {}
        try { window.dispatchEvent(new Event('zu:listingsRefresh')); } catch {}
        try { window.dispatchEvent(new Event('zu:tokensRefresh')); } catch {}
        try { window.dispatchEvent(new Event('zu:navigationRecover')); } catch {}
      }

      /* bump <Component key=…> */
      try { onRemount && onRemount(); } catch {}
    }, debounceMs);
  };

  /* Back/forward cache restore (pageshow.persisted) */
  const onPageShow = (e) => {
    if (e && e.persisted) trigger();
  };

  /* SPA back/forward gestures (history popstate) */
  const onPopState = () => {
    trigger();
  };

  /* Some browsers expose navigation type (back_forward) */
  try {
    const entries = performance.getEntriesByType?.('navigation') || [];
    const nav = entries[0];
    if (nav && nav.type === 'back_forward') {
      // schedule after hydration
      setTimeout(trigger, 0);
    }
  } catch { /* ignore */ }

  /* Install listeners */
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('popstate', onPopState);

  /* Avoid stale scroll positions on remount */
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}

  /* Clean‑up */
  return () => {
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('popstate', onPopState);
  };
}
/* What changed & why: new util enabling app‑wide nav recovery */
