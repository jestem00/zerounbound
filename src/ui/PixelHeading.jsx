/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/PixelHeading.jsx
  Rev :    r12     2025‑10‑26
  Summary: Customized heading component for pixel‑styled titles.  This
           revision allows long names to wrap by switching to normal
           white‑space behaviour, adding overflow‑wrap and word-break
           support, and ensures headings span the full available width.
─────────────────────────────────────────────────────────────*/
import React from 'react';
import styled, { css } from 'styled-components';

/*──────── shared styles ─────────────────────────────────────*/
const frame = css`
  font-family: 'PixeloidSans', monospace;
  line-height: 1.05;
  margin: 0 0 1rem;
  text-align: center;
  white-space: normal;         /* allow headings to wrap */
  overflow-wrap: anywhere;     /* break long words and addresses */
  word-break: break-word;      /* ensure long names wrap within container */
  max-width: 100%;             /* prevent shrinking when used in flex layouts */
  color: var(--zu-fg);
  text-rendering: optimizeLegibility;
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
    <HeadingBase as={tag} $level={level} {...rest}>
      {children}
    </HeadingBase>
  );
}
/* What changed & why:
   • Updated white-space to normal and added overflow-wrap: anywhere so
     long collection or token names wrap gracefully without clipping.
   • Retains responsive font sizing and stable componentId for SSR. */
/* EOF */