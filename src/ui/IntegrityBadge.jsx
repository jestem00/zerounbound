/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/IntegrityBadge.jsx
  Rev :    r2     2025‑07‑22
  Summary: improved integrity dialog layout – widen and wrap
           content so long labels or blurbs never overflow
           the container.  Responsively caps width to the
           viewport and ensures words break appropriately.
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
  padding:1.25rem .75rem;
  max-width:340px;
  width:90vw;
  text-align:center;
  font-family:var(--pixeloid, monospace);
  line-height:1.4;
  word-break:break-word;
  overflow-wrap:anywhere;
  display:flex;
  flex-direction:column;
  gap:.75rem;
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
            <span style={{ fontSize: '1.5rem', lineHeight: '1' }}>{badge}  {label}</span>
            <p style={{ margin: 0 }}>{blurb}</p>
            <PixelButton onClick={() => setOpen(false)}>CLOSE</PixelButton>
          </Dialog>
        </DialogOuter>
      )}
    </>
  );
}

/* What changed & why (r2):
   • Added responsive width and word‑wrapping rules to the modal
     container, preventing labels and descriptions from overflowing
     the dialog on narrow screens or with long copy.
   • Increased line height and introduced flex layout for clearer
     separation between icon/label, blurb and the close button.
*/