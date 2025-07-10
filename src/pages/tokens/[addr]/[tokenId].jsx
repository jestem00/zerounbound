/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/tokens/[addr]/[tokenId].jsx
  Rev :    r868   2025‑10‑17
  Summary: separate buttons for NSFW / Flashing in detail view
──────────────────────────────────────────────────────────────*/
import React, {
  useEffect, useState, useCallback, useMemo,
}                           from 'react';
import { useRouter }        from 'next/router';
import styledPkg            from 'styled-components';

import ExploreNav           from '../../../ui/ExploreNav.jsx';
import PixelButton          from '../../../ui/PixelButton.jsx';
import RenderMedia          from '../../../utils/RenderMedia.jsx';
import FullscreenModal      from '../../../ui/FullscreenModal.jsx';
import MAINTokenMetaPanel   from '../../../ui/MAINTokenMetaPanel.jsx';
import detectHazards        from '../../../utils/hazards.js';
import useConsent           from '../../../hooks/useConsent.js';
import { useWalletContext } from '../../../contexts/WalletContext.js';
import { jFetch }           from '../../../core/net.js';
import { TZKT_API }         from '../../../config/deployTarget.js';
import decodeHexFields, {
  decodeHexJson,
}                           from '../../../utils/decodeHexFields.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── layout shells ─────────────────────────────────────*/
const Page = styled.div`
  display:flex;flex-direction:column;width:100%;
  min-height:calc(var(--vh) - var(--hdr));
`;

const Grid = styled.main`
  flex:1;display:grid;gap:1.5rem;
  padding:1.5rem clamp(1rem,4vw,2rem);
  max-width:1920px;margin:0 auto;width:100%;
  grid-template-columns:1fr;

  @media(min-width:1024px){ grid-template-columns:minmax(0,1fr) 420px; }
  @media(min-width:1440px){ grid-template-columns:minmax(0,1fr) 480px; }
`;

const MediaWrap = styled.div`
  position:relative;display:flex;align-items:center;justify-content:center;
  max-height:80vh;width:100%;
`;

const Obscure = styled.div`
  position:absolute;inset:0;background:rgba(0,0,0,.88);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:8px;text-align:center;font-size:.9rem;z-index:4;
  p{margin:0;width:80%;}
`;

const FSBtn = styled(PixelButton)`
  position:absolute;bottom:8px;right:8px;opacity:.65;z-index:5;
  &:hover{opacity:1;}
`;

/*──────── helpers ───────────────────────────────────────────*/
const apiBase = TZKT_API.includes('ghostnet')
  ? 'https://api.ghostnet.tzkt.io/v1'
  : 'https://api.tzkt.io/v1';

/*──────── component ─────────────────────────────────────────*/
export default function TokenDetailPage() {
  const router = useRouter();
  const { addr, tokenId } = router.query;
  const { address: walletAddr } = useWalletContext() || {};

  const [token,      setToken]      = useState(null);
  const [collection, setCollection] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [fsOpen,     setFsOpen]     = useState(false);

  const [allowNSFW,  setAllowNSFW ] = useConsent('nsfw',  false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);
  const scriptKey    = useMemo(() => `scripts:${addr}:${tokenId}`, [addr, tokenId]);
  const [allowJs,    setAllowJs  ] = useConsent(scriptKey, false);

  /*──── data fetch ────*/
  useEffect(() => {
    let cancelled = false;
    if (!addr || tokenId === undefined) return;

    (async () => {
      setLoading(true);
      try {
        const [[tokRow], collRow] = await Promise.all([
          jFetch(`${apiBase}/tokens?contract=${addr}&tokenId=${tokenId}&limit=1`)
            .catch(() => []),
          jFetch(`${apiBase}/contracts/${addr}`).catch(() => null),
        ]);

        if (cancelled) return;

        if (tokRow) {
          const meta = typeof tokRow.metadata === 'string'
            ? decodeHexFields(decodeHexJson(tokRow.metadata) || {})
            : decodeHexFields(tokRow.metadata || {});
          setToken({ ...tokRow, metadata: meta });
        }

        if (collRow) {
          /* ensure collection metadata has readable fields */
          const collMeta = decodeHexFields(collRow.metadata || {});
          setCollection({ ...collRow, metadata: collMeta });
        }
      } finally { if (!cancelled) setLoading(false); }
    })();

    return () => { cancelled = true; };
  }, [addr, tokenId]);

  const meta = token?.metadata || {};
  const hazards = detectHazards(meta);

  const needsNSFW  = hazards.nsfw     && !allowNSFW;
  const needsFlash = hazards.flashing && !allowFlash;
  const hidden     = needsNSFW || needsFlash;

  const mediaUri = meta.artifactUri
    || meta.displayUri || meta.imageUri || '';

  const confirmReveal = useCallback((flag, setter) => {
    // eslint-disable-next-line no-alert
    if (window.confirm(`Content flagged ${flag}. Reveal anyway?`)) setter(true);
  }, []);

  if (loading) return <p style={{ textAlign:'center', marginTop:'4rem' }}>Loading…</p>;
  if (!token || !collection) return <p style={{ textAlign:'center', marginTop:'4rem' }}>Token not found.</p>;

  return (
    <Page>
      <ExploreNav />
      <Grid>
        {/*──────── media preview ────────*/}
        <MediaWrap>
          {!hidden && (
            <RenderMedia
              uri={mediaUri}
              mime={meta.mimeType}
              alt={meta.name || `Token #${tokenId}`}
              allowScripts={hazards.scripts && allowJs}
              style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }}
            />
          )}

          {/* obscured overlays */}
          {hidden && (
            <Obscure>
              {needsNSFW && (
                <PixelButton size="sm" warning onClick={() => confirmReveal('NSFW', setAllowNSFW)}>
                  NSFW 🔞
                </PixelButton>
              )}
              {needsFlash && (
                <PixelButton size="sm" warning onClick={() => confirmReveal('flashing', setAllowFlash)}>
                  Flashing 🚨
                </PixelButton>
              )}
            </Obscure>
          )}

          {hazards.scripts && !allowJs && !hidden && (
            <Obscure>
              <p>This media executes scripts.</p>
              <PixelButton size="sm" warning onClick={() => confirmReveal('scripts', setAllowJs)}>
                ALLOW SCRIPTS
              </PixelButton>
            </Obscure>
          )}

          {/* fullscreen btn */}
          <FSBtn
            size="xs"
            disabled={hazards.scripts && !allowJs}
            onClick={() => setFsOpen(true)}
            title="Fullscreen"
          >⛶</FSBtn>
        </MediaWrap>

        {/*──────── meta panel ───────────*/}
        <MAINTokenMetaPanel
          token={token}
          collection={collection}
          walletAddress={walletAddr}
        />
      </Grid>

      {/*──────── fullscreen modal ──────*/}
      <FullscreenModal
        open={fsOpen}
        onClose={() => setFsOpen(false)}
        uri={mediaUri}
        mime={meta.mimeType}
        allowScripts={hazards.scripts && allowJs}
        scriptHazard={hazards.scripts}
      />
    </Page>
  );
}
/* EOF */
