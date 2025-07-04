/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/EnableScripts.jsx
  Rev :    r3     2025‑09‑16
  Summary: checkbox + terms link • toggle text ⇄ Enable/Disable
──────────────────────────────────────────────────────────────*/
import React, { useState } from 'react';
import PropTypes           from 'prop-types';
import PixelButton         from './PixelButton.jsx';

/* full‑cover opt‑in overlay – caller controls visibility */
export function EnableScriptsOverlay({ onAccept }) {
  const [agree, setAgree] = useState(false);

  return (
    <>
      <p style={{ marginBottom: '6px', fontSize: '.8rem', lineHeight: 1.25 }}>
        Executable media blocked.<br />
        Enable scripts <strong>only if</strong> you&nbsp;trust the author.
      </p>

      <label style={{ display: 'flex', gap: '4px', alignItems: 'center',
        fontSize: '.7rem', marginBottom: '8px' }}
      >
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
        />
        I&nbsp;agree&nbsp;to&nbsp;
        <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
      </label>

      <PixelButton
        size="sm"
        warning
        disabled={!agree}
        onClick={onAccept}
      >
        ENABLE&nbsp;SCRIPTS
      </PixelButton>
    </>
  );
}

EnableScriptsOverlay.propTypes = {
  onAccept: PropTypes.func.isRequired,
};

/* tiny lightning toggle – now with label, bi‑directional */
export function EnableScriptsToggle({
  enabled = false,
  onToggle = () => {},
}) {
  return (
    <PixelButton
      size="xs"
      warning={!enabled}
      style={{ fontSize: '.65rem', lineHeight: 1, whiteSpace: 'nowrap' }}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      ⚡ {enabled ? 'Disable‑Scripts' : 'Enable‑Scripts'}
    </PixelButton>
  );
}

EnableScriptsToggle.propTypes = {
  enabled : PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
};
/* EOF */
