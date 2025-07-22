/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/IntegrityBadge.jsx
  Rev :    r3     2025‑07‑22
  Summary: further refine modal sizing and typography to
           ensure integrity descriptions never overflow on
           small screens.  Adds responsive font scaling,
           height constraints and dedicated Title/Blurb
           styled components for better readability.
─────────────────────────────────────────────────────────────*/
import React, { useState } from 'react';
import styled              from 'styled-components';
import { getIntegrityInfo } from '../constants/integrityBadges.js';
import PixelButton         from './PixelButton.jsx';

/*──────────────── styled ───────────────*/
// The clickable badge itself.  Retains the hover/focus effects from
// the original component.  Keep this minimal to allow it to fit
// alongside other chips without layout shifts.
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

// The fullscreen backdrop used when the pop‑up is open.  A fixed
// positioning with a semi‑opaque background darkens the page and
// recentres the dialog.  The backdrop covers the entire viewport
// and applies a small blur for polish.
const DialogOuter = styled.div`
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.65);
  backdrop-filter:blur(2px);
  z-index:1300;
  display:flex;
  align-items:center;
  justify-content:center;
`;

// The dialog box containing the badge icon, label, blurb and close
// button.  The width is capped at 340px on large screens but will
// shrink to fit smaller viewports (via 90vw).  We explicitly set
// word‑break and overflow‑wrap rules so long words or URLs will
// wrap rather than run off the page.  A slightly larger line height
// improves readability for multi‑line blurbs.
const Dialog = styled.section`
  background:var(--zu-bg);
  border:4px solid var(--zu-fg);
  /* Use clamp() to scale padding based on viewport width.  Larger screens
     retain generous padding while small screens shrink gracefully. */
  padding: clamp(1rem, 2.5vw, 1.5rem) clamp(0.5rem, 2vw, 1rem);
  /* Cap modal width at 360px but allow it to shrink down on narrow
     viewports.  Using min() ensures we never exceed 95vw. */
  max-width:360px;
  width: min(95vw, 360px);
  /* Constrain height so tall blurbs scroll rather than overflow the
     viewport; allow vertical scrolling within the modal. */
  max-height:90vh;
  overflow-y:auto;
  text-align:center;
  font-family:var(--pixeloid, monospace);
  /* Slightly tighter line height improves vertical spacing. */
  line-height:1.35;
  word-break:break-word;
  overflow-wrap:anywhere;
  display:flex;
  flex-direction:column;
  gap:0.75rem;
`;

/* The title row contains the badge icon and the short label.  Use
   clamp() to scale the font size across devices while keeping
   generous spacing. */
const Title = styled.span`
  font-weight:bold;
  font-size: clamp(1.2rem, 4vw, 1.6rem);
  line-height:1.2;
  display:block;
  white-space:normal;
`;

/* The blurb may be lengthy; clamp the font size down on small
   devices and ensure long words wrap. */
const Blurb = styled.p`
  margin: 0;
  font-size: clamp(0.9rem, 3.5vw, 1.1rem);
  line-height:1.35;
  word-break:break-word;
  overflow-wrap:anywhere;
  white-space:normal;
`;

/**
 * IntegrityBadge
 *
 * Displays a small badge (e.g. ⭐ or ⛓️‍💥) indicating whether a piece
 * of content is fully on‑chain, partially on‑chain or unknown.  When
 * clicked or activated via keyboard, the badge opens a modal
 * explaining what the status means.  The modal can be dismissed by
 * clicking outside of it or pressing the close button.
 *
 * @param {Object} props
 * @param {string} props.status – one of "full", "partial" or "unknown"
 */
export default function IntegrityBadge({ status = 'unknown', ...rest }) {
  const [open, setOpen] = useState(false);
  const { badge, label, blurb } = getIntegrityInfo(status);

  return (
    <>
      {/* Always render the badge itself.  It can be clicked or
          activated via the keyboard (Enter) to show details. */}
      <Badge
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') setOpen(true); }}
        {...rest}
      >
        {badge}
      </Badge>

      {open && (
        <DialogOuter onClick={() => setOpen(false)}>
          <Dialog onClick={(e) => e.stopPropagation()}>
            <Title>{badge}  {label}</Title>
            <Blurb>{blurb}</Blurb>
            <PixelButton onClick={() => setOpen(false)}>CLOSE</PixelButton>
          </Dialog>
        </DialogOuter>
      )}
    </>
  );
}

/* What changed & why (r3):
   • Added clamp‑based responsive padding and width constraints to
     ensure the modal scales gracefully across phones, tablets and
     desktops and never exceeds the viewport.
   • Introduced Title and Blurb styled components with responsive
     font sizes to prevent overflow and maintain readability on
     very narrow screens.
   • Added max‑height and scrolling behaviour so long copy stays
     contained within the modal and doesn’t slide off screen.
*/