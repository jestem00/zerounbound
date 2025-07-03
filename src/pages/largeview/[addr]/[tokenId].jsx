/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/largeview/[addr]/[tokenId].jsx
  Rev :    r2     2025‑08‑15 UTC
  Summary: prepend ExploreNav for quick navigation
──────────────────────────────────────────────────────────────*/
import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import styledPkg     from 'styled-components';
import ExploreNav    from '../../../ui/ExploreNav.jsx';
import RenderMedia    from '../../../utils/RenderMedia.jsx';
import PixelButton    from '../../../ui/PixelButton.jsx';
import TokenMetaPanel from '../../../ui/TokenMetaPanel.jsx';
import useConsent     from '../../../hooks/useConsent.js';
import detectHazards  from '../../../utils/hazards.js';
import { jFetch }     from '../../../core/net.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Wrap = styled.div`
  position:fixed;inset:0;background:var(--zu-bg,#000);color:var(--zu-fg,#fff);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:1rem;overflow:auto;padding:1rem;
`;
const MediaBox = styled.div`
  max-width:calc(100vw - 2rem);max-height:70vh;
  display:flex;align-items:center;justify-content:center;
`;
const Obf = styled.div`
  position:absolute;inset:0;background:rgba(0,0,0,.85);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;font-size:.85rem;gap:12px;z-index:3;
  p{margin:0;width:80%;}
`;

/*──────── component ────────────────────────────────────────*/
export default function LargeView() {
  const router = useRouter();
  const { addr, tokenId } = router.query;

  const [token, setToken] = useState(null);

  const [allowNSFW,    setAllowNSFW]    = useConsent('nsfw', false);
  const [allowFlash,   setAllowFlash]   = useConsent('flash', false);
  const [allowScripts, setAllowScripts] = useConsent('scripts', false);

  useEffect(() => { let cancel = false;
    if (!addr || tokenId === undefined) return;
    const base = 'https://api.ghostnet.tzkt.io/v1';
    (async () => {
      try {
        const rows = await jFetch(
          `${base}/tokens?contract=${addr}&tokenId=${tokenId}&limit=1`,
        );
        if (!cancel) setToken(rows[0] || null);
      } catch {}
    })();
    return () => { cancel = true; };
  }, [addr, tokenId]);

  const onConsent = useCallback((label, setter) => {
    const ok = window.confirm(`Content flagged ${label}. Show anyway?`);
    if (ok) setter(true);
  }, []);

  if (!token) return <p style={{ textAlign:'center', marginTop:'4rem' }}>Loading…</p>;

  const meta = token.metadata || {};
  const { nsfw, flashing, scripts } = detectHazards(meta);
  const hidden = (nsfw && !allowNSFW) || (flashing && !allowFlash);

  return (
    <Wrap>
      <ExploreNav />
      <PixelButton size="sm" onClick={() => router.back()}>← Back</PixelButton>
      <MediaBox style={{ position:'relative', width:'100%' }}>
        {/* hidden overlay */}
        {hidden && (
          <Obf>
            <p>{nsfw && 'NSFW'}{nsfw && flashing ? ' / ' : ''}{flashing && 'Flashing'}</p>
            <PixelButton size="sm" onClick={() => {
              if (nsfw)    onConsent('NSFW',    setAllowNSFW);
              if (flashing)onConsent('flashing',setAllowFlash);
            }}>Unhide</PixelButton>
          </Obf>
        )}
        {/* viewer */}
        {!hidden && (
          <RenderMedia
            uri={meta.artifactUri || meta.displayUri || meta.imageUri}
            mime={meta.mimeType}
            alt={meta.name}
            allowScripts={scripts && allowScripts}
            style={{ maxWidth:'100%', maxHeight:'100%', imageRendering:'pixelated' }}
          />
        )}
        {/* script gating */}
        {scripts && !allowScripts && !hidden && (
          <Obf>
            <p>This token executes scripts.</p>
            <PixelButton size="sm" warning onClick={() => {
              const ok = window.confirm('Enable scripting? Proceed only if you trust.');
              if (ok) setAllowScripts(true);
            }}>Allow scripts</PixelButton>
          </Obf>
        )}
      </MediaBox>

      <TokenMetaPanel
        meta={meta}
        tokenId={tokenId}
        contractAddress={addr}
      />
    </Wrap>
  );
}
/* What changed & why: sticky explore nav across viewer page; rev r2 */
/* EOF */
