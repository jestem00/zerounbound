/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/PixelInput.jsx
  Summary: forwardRef-enabled — warnings removed. */

import React, { forwardRef } from 'react';
import styled, { css }       from 'styled-components';

const common = css`
  width: 100%;
  box-sizing: border-box;
  font-family: 'PixeloidSans', monospace;
  font-size: 1rem;
  padding: .55rem .6rem;
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

const PixelInput = forwardRef(function PixelInput (props, ref) {
  if (props.as === 'textarea') return <TextArea ref={ref} {...props} />;
  if (props.as === 'select')   return <Select   ref={ref} {...props} />;
  return <Input ref={ref} {...props} />;
});

export default PixelInput;

/* EOF */
