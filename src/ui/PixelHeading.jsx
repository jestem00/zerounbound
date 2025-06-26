/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/PixelHeading.jsx
  Rev :    r10     2025‑08‑08
  Summary: block 'level' prop leak + stable componentId
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

/*──────── styled base – filters both $level & level ───────*/
const HeadingBase = styled.h1.withConfig({
  componentId       : 'px-heading-base',
  shouldForwardProp : (prop) => prop !== '$level' && prop !== 'level',
})`
  ${frame};
  font-size: ${({ $level }) => SIZE[$level] || SIZE[2]};
`;

/*──────── component ───────────────────────────────────────*/
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
   • shouldForwardProp now blocks both 'level' & '$level', removing
     React warning about unknown prop leakage.
   • Fixed className hydration mismatch by pinning deterministic
     componentId (`px-heading-base`) so SSR & client hashes align. */
/* EOF */
