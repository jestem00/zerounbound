/*Developed by @jams2blues
  File: src/ui/PixelButton.jsx
  Rev:  r640
  Summary: Absorb `noActiveFx` via transient prop to prevent
           React unknown‑prop warnings; refine active effect. */

import React from 'react';
import styled, { css } from 'styled-components';

/*──────── size variants ────────*/
const VAR_SM = css`
  padding: clamp(0.3rem,1vw,0.45rem) clamp(0.55rem,2.2vw,1rem);
  font-size: clamp(0.7rem,2.4vw,0.9rem);
`;

const VAR_XS = css`
  padding: 0.18rem 0.45rem;
  font-size: 0.65rem;
`;

/*──────── shared styles ────────*/
const base = css`
  border: 2px solid var(--zu-fg);
  box-shadow: 0 0 0 2px var(--zu-bg), 4px 4px 0 0 var(--zu-bg);
  display: inline-flex; align-items: center; justify-content: center;
  padding: clamp(0.35rem, 1.2vw, 0.5rem)
           clamp(0.6rem , 3vw , 1.25rem);
  font: 700 clamp(0.75rem, 2.8vw, 1rem)/1 'PixeloidSans', monospace;
  text-transform: uppercase;
  cursor: pointer; user-select: none;
  transition: transform 80ms, filter 80ms, background 120ms, box-shadow 80ms;
  max-width: 100%;

  background: var(--zu-accent);
  color: var(--zu-btn-fg);
  &:hover  { background: var(--zu-accent-hover); }
  &:active { transform: translateY(2px); box-shadow: 0 0 0 2px var(--zu-bg); }
  &:focus  { outline: none; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #ff2d2d; }
  &[disabled] { filter: grayscale(1); cursor: not-allowed; box-shadow: none; }

  ${({ $size }) => $size === 'sm' && VAR_SM}
  ${({ $size }) => $size === 'xs' && VAR_XS}
`;

const sec = css`
  background: var(--zu-accent-sec);
  &:hover { background: var(--zu-accent-sec-hover); }
`;

const warn = css`
  background: var(--zu-warn, #ff2d2d);
  color: #000;
  &:hover { background: #ff4c4c; }
`;

const activeOff = css`
  &:active { transform: none; box-shadow: 0 0 0 2px var(--zu-bg); }
`;

const StyledButton = styled.button`
  ${base}
  ${({ $sec  }) => $sec  && sec}
  ${({ $warn }) => $warn && warn}
  ${({ $noActiveFx }) => $noActiveFx && activeOff}
`;

export default function PixelButton({
  children,
  onClick,
  title,
  disabled,
  'data-sec': dataSec,
  warning = false,
  size = '',          /* '', 'sm', 'xs' */
  noActiveFx = false, /* absorb custom prop; not forwarded to DOM */
  as,
  href,
  ...rest
}) {
  /* eslint-disable react/jsx-props-no-spreading */
  return (
    <StyledButton
      as={as}
      href={href}
      type={as ? undefined : 'button'}
      onClick={onClick}
      title={title}
      disabled={disabled}
      $sec={!!dataSec}
      $warn={!!warning}
      $size={size}
      $noActiveFx={!!noActiveFx}
      {...rest}
    >
      {children}
    </StyledButton>
  );
}

/* What changed & why:
   • New transient prop `$noActiveFx` prevents React DOM warnings.
   • Keeps existing styling; active effect can be disabled per‑button. */
