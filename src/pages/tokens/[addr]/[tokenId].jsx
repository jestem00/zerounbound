/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/tokens/[addr]/[tokenId].jsx
  Rev :    r872    2025‑10‑23
  Summary: reposition script & fullscreen controls; remove script
           overlay from preview; freeze scripts when disabled;
           show script toggle and fullscreen button in meta panel;
           hide bottom‑left lightning icon.
──────────────────────────────────────────────────────────────*/
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useRouter } from 'next/router';
import styledPkg from 'styled-components';

import ExploreNav from '../../../ui/ExploreNav.jsx';
import PixelButton from '../../../ui/PixelButton.jsx';
import PixelConfirmDialog from '../../../ui/PixelConfirmDialog.jsx';
import RenderMedia from '../../../utils/RenderMedia.jsx';
import FullscreenModal from '../../../ui/FullscreenModal.jsx';
import MAINTokenMetaPanel from '../../../ui/MAINTokenMetaPanel.jsx';
import detectHazards from '../../../utils/hazards.js';
import useConsent from '../../../hooks/useConsent.js';
import { useWalletContext } from '../../../contexts/WalletContext.js';
import { jFetch } from '../../../core/net.js';
import { TZKT_API } from '../../../config/deployTarget.js';
import decodeHexFields, { decodeHexJson } from '../../../utils/decodeHexFields.js';

/*──────────────── helpers ───────────────────────────────────────────*/
// Convert a hex-encoded string into a UTF‑8 string.  TzKT returns
// contract metadata values as hex bytes; this helper decodes the
// bytes into a regular JS string.  If the input is not a valid
// hex sequence, the original string is returned unchanged.
function hexToString(hex = '') {
  if (!/^[0-9a-fA-F]*$/.test(hex)) return hex;
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substr(i, 2), 16);
    if (!Number.isNaN(code)) str += String.fromCharCode(code);
  }
  return str;
}

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── layout shells ─────────────────────────────────────*/
const Page = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: calc(var(--vh) - var(--hdr));
`;

const Grid = styled.main`
  flex: 1;
  display: grid;
  gap: 1.5rem;
  padding: 1.5rem clamp(1rem, 4vw, 2rem);
  max-width: 1920px;
  margin: 0 auto;
  width: 100%;
  grid-template-columns: 1fr;

  /* Responsive sidebar: use clamp() to ensure the metadata column scales
     with viewport width.  On medium screens (≥1024px), allocate between
     320px and 420px for the sidebar; on large screens (≥1440px), allow up
     to 480px while shrinking as necessary.  This keeps the hero image
     visible and prevents vertical scroll at 130 % zoom. */
  @media (min-width: 1024px) {
    grid-template-columns: minmax(0, 1fr) clamp(320px, 40vw, 420px);
  }
  @media (min-width: 1440px) {
    grid-template-columns: minmax(0, 1fr) clamp(360px, 35vw, 480px);
  }
`;

const MediaWrap = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  /* Limit height so the image and metadata fit on screen even when
     zoomed.  70vh leaves room for header and padding. */
  max-height: 70vh;
  height: auto;
`;

const Obscure = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, .88);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  font-size: .9rem;
  z-index: 4;
  p { margin: 0; width: 80%; }
`;

/*──────── helpers ───────────────────────────────────────────*/
// Use the centralised TZKT_API constant from deployTarget.  Append /v1
// to access the v1 REST endpoints.  This ensures the token page
// queries the correct network (mainnet or ghostnet) without relying on
// build‑time NEXT_PUBLIC_NETWORK values.
const apiBase = `${TZKT_API}/v1`;

/*──────── component ─────────────────────────────────────────*/
export default function TokenDetailPage() {
  const router = useRouter();
  const { addr, tokenId } = router.query;
  const { address: walletAddr } = useWalletContext() || {};

  const [token, setToken] = useState(null);
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fsOpen, setFsOpen] = useState(false);

  const [allowNSFW, setAllowNSFW] = useConsent('nsfw', false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);
  // script consent key scoped per token: scripts:<addr>:<tokenId>
  const scriptKey = useMemo(() => {
    return `scripts:${addr || ''}:${tokenId || ''}`;
  }, [addr, tokenId]);
  const [allowJs, setAllowJs] = useConsent(scriptKey, false);

  /* dialog state for hazard/script confirm */
  const [dlgType, setDlgType] = useState(null); // 'nsfw' | 'flash' | 'scripts' | null
  const [dlgTerms, setDlgTerms] = useState(false);

  /*──── data fetch ────*/
  useEffect(() => {
    let cancelled = false;
    if (!addr || tokenId === undefined) return;

    (async () => {
      setLoading(true);
      try {
        const [[tokRow], collRow] = await Promise.all([
          jFetch(`${apiBase}/tokens?contract=${addr}&tokenId=${tokenId}&limit=1`).catch(() => []),
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
          // Ensure collection metadata has readable fields.  The
          // contracts endpoint does not include the TZIP‑16 content
          // stored in the metadata big‑map.  Attempt to fetch and
          // decode that JSON from the big map.  If anything fails,
          // fall back to collRow.metadata.
          let collMeta = decodeHexFields(collRow.metadata || {});
          try {
            const bigmaps = await jFetch(`${apiBase}/contracts/${addr}/bigmaps`).catch(() => []);
            const metaMap = Array.isArray(bigmaps) ? bigmaps.find((m) => m.path === 'metadata') : null;
            if (metaMap) {
              // Retrieve up to 10 keys from the metadata big‑map.  The
              // content is usually stored under the key 'content'.
              const entries = await jFetch(`${apiBase}/bigmaps/${metaMap.ptr}/keys?limit=10`).catch(() => []);
              let entry = Array.isArray(entries)
                ? entries.find((k) => k.key === 'content') || entries.find((k) => k.key === '')
                : null;
              if (entry && typeof entry.value === 'string') {
                // Decode the hex bytes into a JSON string and parse it.
                const jsonStr = hexToString(entry.value);
                let parsed;
                try {
                  parsed = decodeHexJson(jsonStr) || JSON.parse(jsonStr);
                } catch {
                  parsed = null;
                }
                if (parsed && typeof parsed === 'object') {
                  collMeta = decodeHexFields(parsed);
                }
              }
            }
          } catch {
            /* ignore network or decode errors */
          }
          setCollection({ ...collRow, metadata: collMeta });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [addr, tokenId]);

  const meta = token?.metadata || {};
  const hazards = detectHazards(meta);

  const needsNSFW = hazards.nsfw && !allowNSFW;
  const needsFlash = hazards.flashing && !allowFlash;
  const hidden = needsNSFW || needsFlash;

  const mediaUri = meta.artifactUri || meta.displayUri || meta.imageUri || '';

  /* handlers to open confirm dialogs */
  const requestReveal = useCallback((type) => {
    setDlgType(type);
    setDlgTerms(false);
  }, []);

  /* confirm hazard or script reveal */
  const confirmReveal = useCallback(() => {
    if (!dlgTerms || !dlgType) return;
    if (dlgType === 'nsfw') setAllowNSFW(true);
    else if (dlgType === 'flash') setAllowFlash(true);
    else if (dlgType === 'scripts') setAllowJs(true);
    setDlgType(null);
    setDlgTerms(false);
  }, [dlgType, dlgTerms, setAllowNSFW, setAllowFlash, setAllowJs]);

  /* cancel dialog */
  const cancelReveal = () => {
    setDlgType(null);
    setDlgTerms(false);
  };

  /* script toggle helper passed to meta panel */
  const toggleScript = useCallback((val) => {
    if (!val) setAllowJs(false);
    else requestReveal('scripts');
  }, [requestReveal, setAllowJs]);

  /* full‑screen helper passed to meta panel */
  const openFullscreen = useCallback(() => {
    setFsOpen(true);
  }, []);

  const fsDisabled = hazards.scripts && !allowJs;

  if (loading) return (
    <p style={{ textAlign: 'center', marginTop: '4rem' }}>Loading…</p>
  );
  if (!token || !collection) return (
    <p style={{ textAlign: 'center', marginTop: '4rem' }}>Token not found.</p>
  );

  return (
    <Page>
      {/* Use ExploreNav with hideSearch to retain hazard toggles but omit search bar */}
      <ExploreNav hideSearch />
      <Grid>
        {/*──────── media preview ────────*/}
        <MediaWrap>
          {/* show media when not hidden by hazard overlays */}
          {!hidden && (
            <RenderMedia
              uri={mediaUri}
              mime={meta.mimeType}
              alt={meta.name || `Token #${tokenId}`}
              allowScripts={hazards.scripts && allowJs}
              /* force re-mount when script consent toggles */
              key={String(allowJs)}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          )}

          {/* obscured overlays for NSFW / flashing hazards */}
          {hidden && (
            <Obscure>
              {needsNSFW && (
                <PixelButton size="sm" warning onClick={() => requestReveal('nsfw')}>
                  NSFW&nbsp;🔞
                </PixelButton>
              )}
              {needsFlash && (
                <PixelButton size="sm" warning onClick={() => requestReveal('flash')}>
                  Flashing&nbsp;🚨
                </PixelButton>
              )}
            </Obscure>
          )}
        </MediaWrap>

        {/*──────── meta panel ───────────*/}
        <MAINTokenMetaPanel
          token={token}
          collection={collection}
          walletAddress={walletAddr}
          /* token‑specific script and fullscreen controls */
          tokenScripts={hazards.scripts}
          tokenAllowJs={allowJs}
          onToggleScript={toggleScript}
          onRequestScriptReveal={() => requestReveal('scripts')}
          onFullscreen={openFullscreen}
          fsDisabled={fsDisabled}
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

      {/*──────── hazard / script confirm dialog ──────*/}
      {dlgType && (
        <PixelConfirmDialog
          open
          title={(() => {
            if (dlgType === 'nsfw') return 'NSFW Warning';
            if (dlgType === 'flash') return 'Flashing Warning';
            return 'Enable Scripts';
          })()}
          message={(
            <span>
              {dlgType === 'nsfw' && (
                <>
                  Warning: This asset is flagged <strong>Not‑Safe‑For‑Work (NSFW)</strong>. It may
                  include explicit nudity, sexual content, graphic violence or other mature themes.
                  Viewer discretion is advised.
                  <br />
                </>
              )}
              {dlgType === 'flash' && (
                <>
                  Warning: This asset contains <strong>rapid flashing or strobing effects</strong>{' '}
                  which may trigger seizures for people with photosensitive epilepsy. Learn more&nbsp;
                  <a href="https://kb.daisy.org/publishing/docs/metadata/schema.org/accessibilityHazard.html#value"
                     target="_blank" rel="noopener noreferrer">
                    here
                  </a>.
                  <br />
                </>
              )}
              {dlgType === 'scripts' && (
                <>
                  Executable code can be harmful. Proceed only if you trust the author.
                  <br />
                </>
              )}
              <label style={{
                display:'flex',
                gap:'6px',
                alignItems:'center',
                flexWrap:'wrap',
                marginTop:'6px',
              }}>
                <input
                  type="checkbox"
                  checked={dlgTerms}
                  onChange={(e) => setDlgTerms(e.target.checked)}
                />
                I&nbsp;confirm&nbsp;I&nbsp;am&nbsp;18 + and&nbsp;agree&nbsp;to&nbsp;
                <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
            </span>
          )}
          okLabel={dlgType === 'scripts' ? 'ENABLE' : 'REVEAL'}
          cancelLabel="Cancel"
          confirmDisabled={!dlgTerms}
          onOk={confirmReveal}
          onCancel={cancelReveal}
        />
      )}
    </Page>
  );
}

/* What changed & why: r872
   • Removed script overlay and bottom-left toggle from preview; use fallback image / freeze.
   • Added toggleScript helper and onFullscreen, passing controls to meta panel.
   • Pass tokenScripts and tokenAllowJs to meta panel for script control.
   • Moved fullscreen and script toggles out of media frame; relocated into meta panel.
   • Hide bottom-left lightning icon entirely.
*/
/* EOF */