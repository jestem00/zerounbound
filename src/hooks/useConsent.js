/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/hooks/useConsent.js
  Rev :    r3     2025‑10‑16
  Summary: cross‑component sync via CustomEvent + storage
──────────────────────────────────────────────────────────────*/
import { useEffect, useState, useCallback } from 'react';

/**
 * Reactive, persistent user‑consent flags (NSFW, flashing, scripts).
 * v3  – adds global “zu:consentchange” CustomEvent broadcast so every
 *       component using this hook stays in sync no matter where the
 *       update originated (UNHIDE buttons, global nav, etc.).
 *
 * @param {string}  key   unique flag key (e.g. "nsfw")
 * @param {boolean} def   default value before any user action
 * @returns {[boolean, (v:boolean)=>void, boolean]}
 */
export default function useConsent(key = '', def = false) {
  const storageKey = `zu:consent:${key}`;

  /* 1 · local state starts undefined to avoid SSR mismatch */
  const [value,    setValue]    = useState(undefined);
  const [hydrated, setHydrated] = useState(false);

  /* 2 · initialise from localStorage (client‑side only) */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(storageKey);
      setValue(raw === 'true' ? true : def);
    } catch {
      setValue(def);
    } finally {
      setHydrated(true);
    }
  }, [storageKey, def]);

  /* 3 · helper that updates state + localStorage + broadcast */
  const update = useCallback((v) => {
    setValue(v);
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(storageKey, v ? 'true' : 'false');
    } catch { /* quota / private‑mode – ignore */ }

    /* broadcast change so other hooks update instantly */
    window.dispatchEvent(new CustomEvent('zu:consentchange', {
      detail: { key: storageKey, value: v },
    }));
  }, [storageKey]);

  /* 4 · subscribe to other components’ changes */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (e) => {
      const { key: k, value: v } = e.detail || {};
      if (k === storageKey) setValue(Boolean(v));
    };
    window.addEventListener('zu:consentchange', handler);
    return () => window.removeEventListener('zu:consentchange', handler);
  }, [storageKey]);

  /* 5 · also react to native 'storage' events (other tabs) */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (e) => {
      if (e.key !== storageKey) return;
      setValue(e.newValue === 'true');
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [storageKey]);

  return [value ?? def, update, hydrated];
}
/* EOF */
