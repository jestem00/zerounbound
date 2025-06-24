/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/IntegrityBadge.jsx
  Rev :    r1      2025‑07‑29
  Summary: clickable / hoverable integrity badge component
──────────────────────────────────────────────────────────────*/
import React, { useState } from 'react';
import styled from 'styled-components';
import { getIntegrityInfo } from '../constants/integrityBadges.js';
import PixelButton from './PixelButton.jsx';

/*──────────────── styled ───────────────*/
const Badge = styled.span`
  display:inline-block;
  font-size:1.25rem;
  cursor:pointer;
  outline:none;
  transition:filter .15s;
  &:hover,
  &:focus-visible{
    filter:brightness(140%);
    text-shadow:0 0 2px var(--zu-accent);
  }
`;

const DialogOuter = styled.div`
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.65);
  backdrop-filter:blur(2px);
  z-index:1300;
  display:flex;align-items:center;justify-content:center;
`;

const Dialog = styled.section`
  background:var(--zu-bg);
  border:4px solid var(--zu-fg);
  padding:1.25rem .75rem;
  max-width:340px;
  text-align:center;
  font-family:var(--pixeloid, monospace);
  line-height:1.3;
`;

export default function IntegrityBadge({ status='unknown', ...rest }){
  const [open,setOpen] = useState(false);
  const { badge,label,blurb } = getIntegrityInfo(status);

  return (
    <>
      <Badge
        role="button"
        aria-label={`${label} – click for details`}
        tabIndex={0}
        onClick={()=>setOpen(true)}
        onKeyDown={e=>e.key==='Enter' && setOpen(true)}
        {...rest}>
        {badge}
      </Badge>

      {open && (
        <DialogOuter onClick={()=>setOpen(false)}>
          <Dialog onClick={e=>e.stopPropagation()}>
            <h3 style={{marginTop:0}}>{badge}  {label}</h3>
            <p style={{margin:'0.5rem 0 1rem'}}>{blurb}</p>
            <PixelButton onClick={()=>setOpen(false)}>Close</PixelButton>
          </Dialog>
        </DialogOuter>
      )}
    </>
  );
}
/* What changed & why: new self‑contained badge that works on mobile tap,
   desktop hover (visual cue) and is keyboard‑accessible. */
/* EOF */