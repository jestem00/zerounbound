/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/PixelButton.jsx
  Summary: fixed prop forwarding and click passthrough for Connect Wallet. */

import React from 'react';
import styled, { css } from 'styled-components';

/*———— shared rules ————*/
const base = css`
  border: 2px solid var(--zu-fg);
  box-shadow: 0 0 0 2px var(--zu-bg), 4px 4px 0 0 var(--zu-bg);
  display: inline-flex;
  align-items: center;
  justify-content: center;

  /* responsive ↘ font + padding scale with viewport width.
     • ≥900 px keeps legacy sizing
     • ≤320 px bottoms out at 0.75 rem font */
  padding: clamp(0.35rem, 1.2vw, 0.5rem) clamp(0.6rem, 3vw, 1.25rem);
  font: 700 clamp(0.75rem, 2.8vw, 1rem)/1 'PixeloidSans', monospace;

  text-transform: uppercase;
  background: var(--zu-accent);
  color: var(--zu-btn-fg);
  cursor: pointer;
  user-select: none;
  transition: transform 80ms, filter 80ms, background 120ms;
  max-width: 100%;
  &:hover   { background: var(--zu-accent-hover); }
  &:active  { transform: translateY(2px); box-shadow: 0 0 0 2px var(--zu-bg); }
  &:focus   { outline: none; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #ff2d2d; }
  &[disabled]{ filter: grayscale(1); cursor: not-allowed; box-shadow: none; }
`;

const sec = css`
  background: var(--zu-accent-sec);
  &:hover { background: var(--zu-accent-sec-hover); }
`;

const StyledButton = styled.button`
  ${base}
  ${({ $sec }) => $sec && sec}
`;

export default function PixelButton({
  children,
  onClick,
  title,
  disabled,
  'data-sec': dataSec,
  ...rest
}) {
  return (
    <StyledButton
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      $sec={!!dataSec}
      {...rest}
    >
      {children}
    </StyledButton>
  );
}

/* What changed & why:
   • Converted styled.button to a functional component wrapper.
   • Ensures `onClick` is correctly passed and not swallowed.
   • Styled-component uses `$sec` as SC prop instead of relying on DOM `data-sec`.
   • Fixes broken button handlers across Connect Wallet and others. */
/* EOF */
