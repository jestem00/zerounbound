/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/hooks/useConsent.js
  Rev :    r2     2025‑08‑15
  Summary: SSR‑safe initialise → eliminates hydration mismatch
──────────────────────────────────────────────────────────────*/
import { useEffect, useState } from 'react';

/**
 * Persistent user‑consent flags (NSFW, flashing, scripts).
 * Now SSR‑safe: defer localStorage read until after mount so
 * the first render is identical on server & client (I19).
 *
 * @param {string} key   unique key (e.g. "nsfw").
 * @param {boolean} def  default before any user action.
 * @returns {[boolean, (v:boolean)=>void]}
 */
export default function useConsent(key = '', def = false) {
  const storageKey = `zu:consent:${key}`;

  /* 1 · initial value = undefined so UI can gate on “hydrated” flag */
  const [value, setValue]       = useState(undefined);
  const [hydrated, setHydrated] = useState(false);

  /* 2 · read/write localStorage on mount only (client‑side) */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      setValue(stored === 'true' ? true : def);
    } catch {
      setValue(def);
    } finally {
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, value ? 'true' : 'false');
    } catch { /* ignore quota / private‑mode */ }
  }, [value, hydrated, storageKey]);

  /* 3 · return [resolvedValue, setter, hydratedFlag] */
  return [value ?? def, setValue, hydrated];
}
/* What changed & why:
   • defer LS read to avoid server/client markup drift → fixes
     “Hydration failed … UI does not match” error.  */
/* EOF */
