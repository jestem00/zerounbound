/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/FullscreenModal.jsx
  Rev :    r2     2025‑09‑17
  Summary: script‑safety guard – refuses to open when
           script‑hazardous media & scripts not enabled
──────────────────────────────────────────────────────────────*/
import React, { useState } from 'react';
import PropTypes           from 'prop-types';
import styledPkg           from 'styled-components';

import RenderMedia          from '../utils/RenderMedia.jsx';
import PixelButton          from './PixelButton.jsx';
import { pixelUpscaleStyle } from '../utils/pixelUpscale.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Back = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,.92);
  z-index: 6500;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
`;

const MediaWrap = styled.div`
  max-width: 90vw; max-height: 90vh;
  overflow: auto;
  display: inline-block;
`;

const CtrlRow = styled.div`
  display: flex; gap: 12px;
  margin-top: 10px;
`;

export default function FullscreenModal({
  open = false,
  onClose = () => {},
  uri = '',
  mime = '',
  allowScripts = false,
  scriptHazard = false,
}) {
  const [scale, setScale] = useState(1);

  /* block when scripts hazardous & disallowed */
  if (!open || (scriptHazard && !allowScripts)) return null;

  const incScale = () => setScale((s) => (s >= 8 ? 1 : s + 1));

  return (
    <Back onClick={onClose}>
      <MediaWrap onClick={(e) => e.stopPropagation()}>
        <RenderMedia
          uri={uri}
          mime={mime}
          allowScripts={allowScripts}
          style={pixelUpscaleStyle(scale)}
        />
        <CtrlRow>
          <PixelButton size="sm" onClick={incScale}>
            UPSCALE ×{scale}
          </PixelButton>
          <PixelButton size="sm" onClick={onClose}>
            CLOSE
          </PixelButton>
        </CtrlRow>
      </MediaWrap>
    </Back>
  );
}

FullscreenModal.propTypes = {
  open         : PropTypes.bool,
  onClose      : PropTypes.func,
  uri          : PropTypes.string,
  mime         : PropTypes.string,
  allowScripts : PropTypes.bool,
  scriptHazard : PropTypes.bool,
};
/* EOF */
