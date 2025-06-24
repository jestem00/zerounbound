/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/PixelHeading.jsx
  Rev :    r9      2025‑07‑30
  Summary: unicode‑safe, transient $level prop, ARIA‑correct
──────────────────────────────────────────────────────────────*/
import React from 'react';
import styled, { css } from 'styled-components';

/*──────── shared styles ─────────────────────────────────────*/
const frame = css`
  font-family: 'PixeloidSans', monospace;
  line-height: 1.05;
  margin: 0 0 1rem;
  text-align: center;
  white-space: nowrap;
  color: var(--zu-fg);
  text-rendering: optimizeLegibility;
  overflow: hidden;
`;

/*──────── responsive sizes ─────────────────────────────────*/
const SIZE = {
  1: 'clamp(1rem, 6vw, 2.5rem)',
  2: 'clamp(.9rem, 5vw, 1.75rem)',
  3: 'clamp(.8rem, 4vw, 1.25rem)',
};

/*──────── styled base – blocks $level leakage ──────────────*/
const HeadingBase = styled.h1.withConfig({
  shouldForwardProp: (prop) => prop !== '$level',
})`
  ${frame};
  font-size: ${({ $level }) => SIZE[$level] || SIZE[2]};
`;

/*──────── component ────────────────────────────────────────*/
export default function PixelHeading({
  as,
  level = 2,
  children,
  ...rest
}) {
  const tag = as || `h${level}`;
  return (
    <HeadingBase
      as={tag}
      role="heading"
      aria-level={level}
      $level={level}
      {...rest}
    >
      {children}
    </HeadingBase>
  );
}
/* What changed & why:
   • Purged invisible Unicode causing TS 1127 error.
   • Dynamic font-size via transient $level prop (no DOM leak).
   • Added ARIA role/level for accessibility.                          */
/* EOF */
