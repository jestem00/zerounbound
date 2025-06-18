/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/PixelInput.jsx
  Rev :    r269   2025-07-05 T10:36 UTC
  Summary: textarea wrap+auto-sizing, consistent overflow-wrap
──────────────────────────────────────────────────────────────*/
import React, { forwardRef, useEffect, useRef } from 'react';
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
  overflow-wrap: anywhere;     /* prevent horizontal clip */
  &:focus { border-color: var(--zu-accent); }
`;

const Input    = styled.input`${common}`;
const TextArea = styled.textarea`
  ${common};
  white-space: pre-wrap;
`;
const Select   = styled.select`${common}`;

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export default forwardRef(function PixelInput(props, ref) {
  const { as, ...rest } = props;
  const innerRef = useRef(null);

  /* grow textarea on content change */
  useEffect(() => {
    if (as === 'textarea') autoResize(innerRef.current);
  }, [props.value, as]);

  if (as === 'textarea') {
    return (
      <TextArea
        ref={(n) => { innerRef.current = n; if (typeof ref === 'function') ref(n); }}
        onInput={(e) => autoResize(e.target)}
        {...rest}
      />
    );
  }
  if (as === 'select')   return <Select ref={ref} {...rest} />;
  return <Input ref={ref} {...rest} />;
});
/* What changed & why:
   • Added any-wrap + pre-wrap for TextArea to avoid clipping.
   • autoResize helper grows textarea vertically as user types. */
/* EOF */
