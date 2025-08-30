/*─────────────────────────────────────────────────────────────
      Developed by @jams2blues – ZeroContract Studio
      File:    src/pages/tokens/[addr]/[tokenId].jsx
      Rev :    r883    2025‑09‑07
      Summary: add rarity computation and prop wiring; keep flex‑grouped preview and nav
──────────────────────────────────────────────────────────────*/
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
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
import { TZKT_API, SITE_URL } from '../../../config/deployTarget.js';
import decodeHexFields, { decodeHexJson } from '../../../utils/decodeHexFields.js';
import { mimeFromDataUri } from '../../../utils/uriHelpers.js';

/* centralized extra‑URI fetching */
import { fetchExtraUris } from '../../../utils/extraUris.js';
import { getCollectionRarity, buildTokenRarity } from '../../../utils/rarity.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────────────── helpers ───────────────────────────────────────────*/
// Convert hex‑encoded string (TzKT metadata big‑map values) → UTF‑8.
function hexToString(hex = '') {
  if (!/^[0-9a-fA-F]*$/.test(hex)) return hex;
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substr(i, 2), 16);
    if (!Number.isNaN(code)) str += String.fromCharCode(code);
  }
  return str;
}

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
  /* The media flexes to use remaining vertical space within MediaGroup; its
     height is capped by the parent’s max-height. Overflow is hidden to
     prevent content from exceeding the container. */
  flex: 1 1 0%;
  overflow: hidden;
`;

/* Wrapper for preview and nav. A max-height clamp reserves space for
   navigation and surrounding margins. Using flex column ensures the
   navigation bar always appears beneath the artwork without overlap.
   min-height:0 allows the preview to shrink on small screens. */
const MediaGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  width: 100%;
  max-height: min(70vh, calc(var(--vh) - var(--hdr) - 160px));
  min-height: 0;
`;

/* dark veil when content is gated (NSFW / flashing) */
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

/* New: a compact nav bar that sits BELOW the art so controls never
   cover the primary display. Keyboard arrows still work. */
const MediaNav = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  margin-top: .75rem;
  min-height: 28px; /* keep layout stable even if buttons disabled */
`;

/*──────── TzKT base (append /v1) ───────────────────────────*/
const apiBase = `${TZKT_API}/v1`;

/*──────── component ─────────────────────────────────────────*/
export default function TokenDetailPage() {
  const router = useRouter();
  const { addr, tokenId } = router.query;
  const { address: walletAddr, toolkit } = useWalletContext() || {};

  /* data */
  const [token, setToken]           = useState(null);
  const [collection, setCollection] = useState(null);
  const [loading, setLoading]       = useState(true);

  /* viewers */
  const [fsOpen, setFsOpen]         = useState(false);

  /* unified URI carousel state (artifactUri + extraURIs) */
  const [uris, setUris]             = useState([]);
  const [uriIdx, setUriIdx]         = useState(0);

  /* rarity data */
  const [rarity, setRarity]         = useState(null);

  /* consents */
  const [allowNSFW,  setAllowNSFW]  = useConsent('nsfw',  false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);
  const scriptKey = useMemo(
    () => `scripts:${addr || ''}:${tokenId || ''}`,
    [addr, tokenId, toolkit],
  );
  const [allowJs,   setAllowJs]     = useConsent(scriptKey, false);

  /* confirm dialog (hazards + scripts) */
  const [dlgType,  setDlgType]      = useState(null); // 'nsfw' | 'flash' | 'scripts' | null
  const [dlgTerms, setDlgTerms]     = useState(false);

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

        /* token row -> decode metadata + build URI list */
        if (tokRow) {
          const meta = typeof tokRow.metadata === 'string'
            ? decodeHexFields(decodeHexJson(tokRow.metadata) || {})
            : decodeHexFields(tokRow.metadata || {});
          setToken({ ...tokRow, metadata: meta });

          // Centralized extra‑URI lookup (uses on‑chain/off‑chain views)
          let extras = await fetchExtraUris({ toolkit, addr, tokenId, apiBase, meta }).catch(() => []);
          if (!Array.isArray(extras)) extras = [];
          // Debug: log extras for inspection in browser console
          try {
            console.log('Extras payload:', extras);
          } catch (err) {
            /* no-op */
          }

          const mainUri = meta.artifactUri || '';
          const all = [
            {
              key        : 'artifactUri',
              name       : meta.name || '',
              description: meta.description || '',
              value      : mainUri,
              mime       : meta.mimeType || mimeFromDataUri(mainUri),
            },
            ...extras,
          ].filter((u) => typeof u?.value === 'string' && u.value); // hygiene

          setUris(all);
          setUriIdx(0);
        }

        /* collection row -> ensure readable metadata (hex big‑map fallback) */
        if (collRow) {
          let collMeta = decodeHexFields(collRow.metadata || {});
          try {
            const bigmaps = await jFetch(`${apiBase}/contracts/${addr}/bigmaps`).catch(() => []);
            const metaMap = Array.isArray(bigmaps) ? bigmaps.find((m) => m.path === 'metadata') : null;
            if (metaMap) {
              const entries = await jFetch(`${apiBase}/bigmaps/${metaMap.ptr}/keys?limit=10`).catch(() => []);
              const entry = Array.isArray(entries)
                ? entries.find((k) => k.key === 'content') || entries.find((k) => k.key === '')
                : null;
              if (entry && typeof entry.value === 'string') {
                const jsonStr = hexToString(entry.value);
                let parsed;
                try {
                  parsed = decodeHexJson(jsonStr) || JSON.parse(jsonStr);
                } catch { parsed = null; }
                if (parsed && typeof parsed === 'object') collMeta = decodeHexFields(parsed);
              }
            }
          } catch { /* ignore network/decode errors */ }
          setCollection({ ...collRow, metadata: collMeta });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [addr, tokenId, toolkit]);

  /* fetch rarity info once token and collection are known */
  useEffect(() => {
    let cancelled = false;
    if (!collection?.address || token?.tokenId == null) return undefined;
    (async () => {
      try {
        const collData = await getCollectionRarity(apiBase, collection.address);
        if (cancelled || !collData) return;
        const info = buildTokenRarity(collData, token.tokenId);
        setRarity(info);
      } catch {
        /* ignore rarity failures */
      }
    })();
    return () => { cancelled = true; };
  }, [collection?.address, token?.tokenId]);

  /* derived current media + hazards */
  const cur  = uris[uriIdx] || { value: '', mime: '' };
  const meta = token?.metadata || {};
  const hazards = detectHazards({ artifactUri: cur.value, mimeType: cur.mime });

  const needsNSFW  = hazards.nsfw     && !allowNSFW;
  const needsFlash = hazards.flashing && !allowFlash;
  const hidden     = needsNSFW || needsFlash;
  const mediaUri   = cur.value || '';

  /* reveal handlers */
  const requestReveal = useCallback((type) => {
    setDlgType(type);
    setDlgTerms(false);
  }, []);
  const confirmReveal = useCallback(() => {
    if (!dlgTerms || !dlgType) return;
    if (dlgType === 'nsfw')    setAllowNSFW(true);
    if (dlgType === 'flash')   setAllowFlash(true);
    if (dlgType === 'scripts') setAllowJs(true);
    setDlgType(null);
    setDlgTerms(false);
  }, [dlgTerms, dlgType, setAllowNSFW, setAllowFlash, setAllowJs]);
  const cancelReveal = () => { setDlgType(null); setDlgTerms(false); };

  /* script toggle from meta panel */
  const toggleScript = useCallback((val) => {
    if (!val) setAllowJs(false);
    else requestReveal('scripts');
  }, [requestReveal, setAllowJs]);

  /* carousel controls (wrap) */
  const prevUri = useCallback(() => {
    setUriIdx((i) => (uris.length ? (i - 1 + uris.length) % uris.length : 0));
  }, [uris.length]);

  const nextUri = useCallback(() => {
    setUriIdx((i) => (uris.length ? (i + 1) % uris.length : 0));
  }, [uris.length]);

  /* keyboard arrows (only when no modal/dialog is open) */
  useEffect(() => {
    const onKey = (e) => {
      // Avoid when user types in inputs or when a dialog is active.
      const tag = String((e.target && e.target.tagName) || '').toLowerCase();
      if (dlgType || fsOpen || tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prevUri(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); nextUri(); }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    return undefined;
  }, [dlgType, fsOpen, prevUri, nextUri]);

  /* fullscreen openers */
  const openFullscreen = useCallback(() => setFsOpen(true), []);
  const openExtrasAsFullscreen = useCallback((startAt = 0) => {
    const idx = Number(startAt) || 0;
    if (idx >= 0 && idx < uris.length) setUriIdx(idx);
    setFsOpen(true);
  }, [uris.length]);

  const fsDisabled = hazards.scripts && !allowJs;

  /* guards */
  if (loading) return <p style={{ textAlign: 'center', marginTop: '4rem' }}>Loading…</p>;
  if (!token || !collection) return <p style={{ textAlign: 'center', marginTop: '4rem' }}>Token not found.</p>;

  return (
    <Page>
      <Head>
        <title>{meta.name ? `${meta.name} — Zero Unbound` : `Token ${tokenId} — Zero Unbound`}</title>
        <meta property="og:title" content={meta.name || `Token #${tokenId}`} />
        <meta name="twitter:title" content={meta.name || `Token #${tokenId}`} />
        <meta property="og:description" content={meta.description || 'On-chain artwork on ZeroUnbound.art'} />
        <meta name="twitter:description" content={meta.description || 'On-chain artwork on ZeroUnbound.art'} />
        <meta property="og:url" content={`${SITE_URL}/tokens/${addr}/${tokenId}`} />
        <meta property="og:image" content={`${SITE_URL}/api/snapshot/${addr}/${tokenId}`} />
        <meta name="twitter:image" content={`${SITE_URL}/api/snapshot/${addr}/${tokenId}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href={`${SITE_URL}/tokens/${addr}/${tokenId}`} />
      </Head>
      {/* Explore header (keeps hazard toggles; search hidden on detail) */}
      <ExploreNav hideSearch />

      <Grid>
        {/*──────── main media preview (controls moved below) ────────*/}
        <MediaGroup>
          <MediaWrap>
            {!hidden && (
              <RenderMedia
                uri={mediaUri}
                mime={cur.mime}
                alt={meta.name || `Token #${tokenId}`}
                allowScripts={hazards.scripts && allowJs}
                /* force re‑mount on index or JS‑consent changes */
                key={`${uriIdx}-${allowJs}`}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            )}

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

          {/* New: navigation bar BELOW the art; never covers content */}
          {uris.length > 1 && (
            <MediaNav aria-label="Media navigation">
              <PixelButton
                $noActiveFx
                onClick={prevUri}
                aria-label="Previous media"
                title="Previous (←)"
              >
                ◀
              </PixelButton>
              <span style={{ fontSize: '.85rem', opacity: .9 }}>
                {uriIdx + 1} / {uris.length}
              </span>
              <PixelButton
                $noActiveFx
                onClick={nextUri}
                aria-label="Next media"
                title="Next (→)"
              >
                ▶
              </PixelButton>
            </MediaNav>
          )}
        </MediaGroup>

        {/*──────── side meta panel ───────────*/}
        <MAINTokenMetaPanel
          token={token}
          collection={collection}
          walletAddress={walletAddr}
          /* token‑specific script/fullscreen controls */
          tokenScripts={hazards.scripts}
          tokenAllowJs={allowJs}
          onToggleScript={toggleScript}
          onRequestScriptReveal={() => requestReveal('scripts')}
          onFullscreen={openFullscreen}
          fsDisabled={fsDisabled}
          /* current + all URIs (artifact + extras) */
          currentUri={cur}
          extraUris={uris}
          /* allow panel to jump to any extra and open fullscreen */
          onOpenExtras={openExtrasAsFullscreen}
          /* current index (optional, for 2/2 indicators in panel) */
          currentIndex={uriIdx}
          totalUris={uris.length}
          rarity={rarity}
        />
      </Grid>

      {/*──────── fullscreen modal (wrap‑nav across all URIs) ──────*/}
      <FullscreenModal
        open={fsOpen}
        onClose={() => setFsOpen(false)}
        uri={mediaUri}
        mime={cur.mime}
        allowScripts={hazards.scripts && allowJs}
        scriptHazard={hazards.scripts}
        hasPrev={uris.length > 1}
        hasNext={uris.length > 1}
        onPrev={prevUri}
        onNext={nextUri}
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
/* What changed & why (r882):
   • Refined MediaGroup: now clamps its maximum height to the smaller
     of 70vh and calc(var(--vh) - var(--hdr) - 160px), reserving ample
     space for the navigation controls and margins across all viewport sizes.
   • Simplified MediaWrap to flex within MediaGroup and removed its own
     height constraints; overflow is hidden so artwork never spills over.
   • Maintained the flex column layout so the navigation bar always
     appears below the artwork without overlap.
   • Updated revision and summary to r882 to document the refined height
     clamping and layout adjustments. */
/* EOF */
