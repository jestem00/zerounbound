//File: ghostnet/src/ui/PixelHeading.jsx
/* r266 – accept `level` prop safely
   • Supports both `as="h2"` and numeric `level={2}` API.
   • Filters unknown props — none leak to DOM (I35, SC6).
   • No other behaviour changed.                                          */

import React from 'react';
import styled, { css } from 'styled-components';

/*──────── shared rules ───────*/
const base = css`
  font-family: 'PixeloidSans', monospace;
  line-height: 1.05;
  margin: 0 0 1rem;
  text-align: center;
  white-space: nowrap;          /* never wrap */
  color: var(--zu-fg);
  text-rendering: optimizeLegibility;
  overflow: hidden;             /* prevent bleed */
`;

/*──────── fluid sizes ───────
 *  - Uses vw so width, not height, controls scaling.
 *  - Lower multiplier on mobile; upper cap on 4K.
 */
const sizes = {
  h1: 'clamp(1.25rem, 7.5vw, 3rem)',
  h2: 'clamp(1rem,  6vw,  2.25rem)',
  h3: 'clamp(.9rem, 5vw,  1.5rem)',
};

const H1 = styled.h1`${base}; font-size: ${sizes.h1};`;
const H2 = styled.h2`${base}; font-size: ${sizes.h2};`;
const H3 = styled.h3`${base}; font-size: ${sizes.h3};`;

/*──────── component ───────*/
export default function PixelHeading({
  as,
  level = 2,
  children,
  ...rest          /* `level` stripped, so nothing leaks to DOM */
}) {
  const Map = { h1: H1, h2: H2, h3: H3 };

  /* precedence: explicit `as` → numeric `level` → fallback */
  const tagKey = as || `h${level}`;
  const Tag    = Map[tagKey] || H2;

  return <Tag {...rest}>{children}</Tag>;
}
