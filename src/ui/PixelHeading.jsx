/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/PixelHeading.jsx
  Rev :    r267  2025-07-02
  Summary: shrink clamps (~15 %) */
import React from 'react';
import styled, { css } from 'styled-components';

const base = css`
  font-family:'PixeloidSans', monospace;
  line-height:1.05;
  margin:0 0 1rem;
  text-align:center;
  white-space:nowrap;
  color:var(--zu-fg);
  text-rendering:optimizeLegibility;
  overflow:hidden;
`;

const sizes = {
  h1:'clamp(1rem,6vw,2.5rem)',
  h2:'clamp(.9rem,5vw,1.75rem)',
  h3:'clamp(.8rem,4vw,1.25rem)',
};

const H1 = styled.h1`${base};font-size:${sizes.h1};`;
const H2 = styled.h2`${base};font-size:${sizes.h2};`;
const H3 = styled.h3`${base};font-size:${sizes.h3};`;

export default function PixelHeading({ as, level=2, children, ...rest }) {
  const Map={h1:H1,h2:H2,h3:H3};
  const tagKey = as || `h${level}`;
  const Tag = Map[tagKey] || H2;
  return <Tag {...rest}>{children}</Tag>;
}
/* EOF */
