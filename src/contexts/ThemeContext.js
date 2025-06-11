/*Developed by @jams2blues with love for the Tezos community
  File: src/contexts/ThemeContext.js
  Summary: Theme provider — exposes `set` for direct selection (dropdown)
           in addition to `next`, so UI can use a <select>.
*/

/*──────── imports ─────────*/
import React, { createContext, useContext, useEffect, useState } from 'react';
import palettesRaw from '../styles/palettes.json' assert { type: 'json' };

/*──────── helpers ─────────*/
export const PALETTE_KEYS = Object.keys(palettesRaw);
const STORAGE_KEY = 'ZU_THEME_v1';

const ThemeCtx = createContext(null);
export const useTheme = () => useContext(ThemeCtx);

/*──────── provider ─────────*/
export function ThemeProvider({ children }) {
  const [themeKey, setThemeKey] = useState(() => {
    const stored = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null;
    return PALETTE_KEYS.includes(stored) ? stored : PALETTE_KEYS[0];
  });

  /* inject vars on change */
  useEffect(() => {
    const palette = palettesRaw[themeKey];
    if (!palette) return;

    const root = document.documentElement;
    Object.entries(palette).forEach(([key, val]) => {
      const cssVar = key.startsWith('--zu-') ? key : `--zu-${key}`;
      root.style.setProperty(cssVar, val);
    });
    localStorage.setItem(STORAGE_KEY, themeKey);
  }, [themeKey]);

  const next = () =>
    setThemeKey(
      (prev) => PALETTE_KEYS[(PALETTE_KEYS.indexOf(prev) + 1) % PALETTE_KEYS.length],
    );

  const set = (key) => {
    if (PALETTE_KEYS.includes(key)) setThemeKey(key);
  };

  return (
    <ThemeCtx.Provider value={{ theme: themeKey, next, set, keys: PALETTE_KEYS }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export default ThemeProvider;

/* What changed & why
   • Exposed `set()` and `keys` so UI can render explicit theme dropdown.
*/
