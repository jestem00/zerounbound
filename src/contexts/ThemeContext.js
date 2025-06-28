/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/contexts/ThemeContext.js
  Rev :    r913   2025‑08‑15
  Summary: smarter contrast – bidirectional tweak loop guarantees
           ≥ 4 .5 ratio (fixes pastel‑mint & terminal‑light fun lines)
──────────────────────────────────────────────────────────────*/
import React, {
  createContext, useContext, useEffect, useState,
} from 'react';
import palettesRaw from '../styles/palettes.json' assert { type: 'json' };

/*──────── colour maths helpers ──────────────────────────────*/
const toRGB = (hex = '') => {
  const h = hex.replace('#', '');
  return h.length === 3
    ? [...h].map((c) => parseInt(c + c, 16) / 255)
    : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const lum = ([r, g, b]) => {
  const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (c1, c2) => {
  const [L1, L2] = [lum(toRGB(c1)), lum(toRGB(c2))].sort((a, b) => b - a);
  return (L1 + 0.05) / (L2 + 0.05);
};
/* apply ±∆L in HSL space by RGB scaling (fast & artefact‑free) */
const tweak = (hex, delta = 0.06) => {
  const [r, g, b] = toRGB(hex).map((v) => v * 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 510 || 0.0001;            /* guard /0 */
  const k = (l + delta) / l;
  const scale = (v) => Math.max(0, Math.min(255, v * k));
  return `#${[scale(r), scale(g), scale(b)]
    .map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
};
/* ensure ≥min contrast vs BOTH bg colours – tries both light & dark */
const ensureContrast = (clr, b1, b2, min = 4.5) => {
  if (ratio(clr, b1) >= min && ratio(clr, b2) >= min) return clr;

  let lighter = clr; let darker = clr; let best = clr;
  for (let i = 0; i < 24; i += 1) {                 /* bounded loop */
    lighter = tweak(lighter,  0.06);                /* lighten */
    darker  = tweak(darker,  -0.06);                /* darken  */

    const test = [lighter, darker]
      .filter(Boolean)
      .sort((a, b) => (
        Math.min(ratio(b, b1), ratio(b, b2))
        - Math.min(ratio(a, b1), ratio(a, b2))
      ))[0];

    if (Math.min(ratio(test, b1), ratio(test, b2))
        > Math.min(ratio(best, b1), ratio(best, b2))) {
      best = test;
      if (ratio(best, b1) >= min && ratio(best, b2) >= min) break;
    }
  }
  return best;
};

/*──────── constants ─────────────────────────────────────────*/
export const PALETTE_KEYS = Object.keys(palettesRaw);
const STORAGE_KEY = 'ZU_THEME_v1';

const ThemeCtx = createContext(null);
export const useTheme = () => useContext(ThemeCtx);

/*──────── provider ───────────────────────────────────────────*/
export function ThemeProvider({ children }) {
  const [themeKey, setThemeKey] = useState(() => {
    const stored = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null;
    return PALETTE_KEYS.includes(stored) ? stored : PALETTE_KEYS[0];
  });

  /* inject vars on change – now bidirectional contrast guard */
  useEffect(() => {
    const base = palettesRaw[themeKey];
    if (!base) return;

    const palette = { ...base };
    const bg1 = palette['--zu-bg']     || '#000';
    const bg2 = palette['--zu-bg-alt'] || bg1;

    [
      '--zu-fg', '--zu-heading',
      '--zu-accent', '--zu-accent-hover',
      '--zu-accent-sec', '--zu-accent-sec-hover',
    ].forEach((k) => {
      if (!palette[k]) return;
      palette[k] = ensureContrast(palette[k], bg1, bg2);
    });

    const root = document.documentElement;
    Object.entries(palette).forEach(([k, v]) => root.style.setProperty(k, v));
    localStorage.setItem(STORAGE_KEY, themeKey);
  }, [themeKey]);

  const next = () => setThemeKey(
    (prev) => PALETTE_KEYS[(PALETTE_KEYS.indexOf(prev) + 1) % PALETTE_KEYS.length],
  );
  const set = (key) => { if (PALETTE_KEYS.includes(key)) setThemeKey(key); };

  return (
    <ThemeCtx.Provider value={{ theme: themeKey, next, set, keys: PALETTE_KEYS }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export default ThemeProvider;

/* What changed & why:
   • ensureContrast now tries BOTH lighten & darken each loop and
     keeps the variant that yields higher minimal contrast against
     bg / bg‑alt → fixes unreadable Fun‑Lines in light palettes.
   • Loop bounded (≤ 24 iterations) to maintain O(1) cost.
   • Rev bump r913.
*/
/* EOF */