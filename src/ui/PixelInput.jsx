/* Developed by @jams2blues with love for the Tezos community
   File:    src/ui/PixelInput.jsx
   Rev :    r268  2025-07-04 T02:14 UTC
   Summary: compact padding & font for better viewport fit */

import React, { forwardRef } from 'react';
import styled, { css }       from 'styled-components';

const common = css`
  width: 100%;
  box-sizing: border-box;
  font-family: 'PixeloidSans', monospace;
  font-size: .9rem;
  padding: .45rem .5rem;
  border: 3px solid var(--zu-fg);
  background: var(--zu-bg);
  color: var(--zu-fg);
  outline: none;
  resize: none;
  &:focus { border-color: var(--zu-accent); }
`;

const Input    = styled.input`${common}`;
const TextArea = styled.textarea`${common}`;
const Select   = styled.select`${common}`;

const PixelInput = forwardRef(function PixelInput(props, ref) {
  if (props.as === 'textarea') return <TextArea ref={ref} {...props} />;
  if (props.as === 'select')   return <Select   ref={ref} {...props} />;
  return <Input ref={ref} {...props} />;
});

export default PixelInput;

/* What changed & why:
   • Font-size ↓ 10 %, padding trimmed → field height −18 px average,
     letting full Deploy form display within 1080 p & small phones. */
/* EOF */
