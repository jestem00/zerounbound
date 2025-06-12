/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/LoadingSpinner.jsx
  Rev :    r646   2025-06-19
  Summary: Compact theme-aware loading sprite component.
           • size prop: 16 | 24 | 32 | 48 (any number works)
           • auto-selects 16×16 or 48×48 GIF asset
           • pixelated rendering; no DOM prop leaks
──────────────────────────────────────────────────────────────*/
import React from 'react';
import styled from 'styled-components';

/*──────── helpers ───────────────────────────────────────────*/
const pickSrc = (s = 24) =>
  s < 32 ? '/sprites/loading16x16.gif' : '/sprites/loading48x48.gif';

/*──────── styled shell ──────────────────────────────────────*/
const Img = styled.img.attrs(({ $size }) => ({
  src : pickSrc($size),
  alt : 'loading',
  width: $size,
  height: $size,
}))`
  image-rendering: pixelated;
  display: inline-block;
`;

/*════════ component ════════════════════════════════════════*/
export default function LoadingSpinner({
  size  = 24,
  style = {},
  ...rest          /* safe DOM attrs only */
}) {
  const s = Number(size) || 24;       // guard against NaN
  /* eslint-disable react/jsx-props-no-spreading */
  return <Img $size={s} style={style} {...rest} />;
}
/* EOF */
