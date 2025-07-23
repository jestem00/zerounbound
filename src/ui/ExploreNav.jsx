/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ExploreNav.jsx
  Rev :    r18    2025‑10‑23
  Summary: add hideSearch prop to optionally hide search bar
           on pages like token detail; maintain hazard toggles.
──────────────────────────────────────────────────────────────*/
import { useState }  from 'react';
import { useRouter } from 'next/router';
import styledPkg     from 'styled-components';

import PixelButton         from './PixelButton.jsx';
import PixelInput          from './PixelInput.jsx';
import PixelConfirmDialog  from './PixelConfirmDialog.jsx';
import useConsent          from '../hooks/useConsent.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled banner ─────────────────────────────────────*/
const Bar = styled.nav`
  position: sticky; top: 0; z-index: 7;
  display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;
  padding:6px 10px;
  background:var(--zu-bg-dim,#111);
  border-block:2px solid var(--zu-accent,#00c8ff);
  box-shadow:0 2px 0 rgba(0,0,0,.4);
  overflow-x:auto;-webkit-overflow-scrolling:touch;white-space:nowrap;

  & form{display:flex;gap:6px;}
  & input{width:clamp(180px,30vw,340px);min-width:160px;}
`;

/**
 * Explore navigation bar with optional search suppression.
 * This component renders navigation buttons, a search field and
 * hazard toggles.  Set hideSearch=true to remove the search form,
 * which is useful on pages that don't require a search box (e.g.
 * token detail view).
 *
 * @param {Object} props
 * @param {boolean} [props.hideSearch=false] whether to hide the search bar
 */
export default function ExploreNav({ hideSearch = false }) {
  const [q, setQ] = useState('');
  const router     = useRouter();

  /* hazard‑consent flags */
  const [allowNSFW , setAllowNSFW ] = useConsent('nsfw' , false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);

  /* confirm‑dialog state */
  const [dlg,      setDlg]      = useState(null);   // 'nsfw' | 'flash' | null
  const [termsOK,  setTermsOK]  = useState(false);

  /* detect TOKENS context so address‑search keeps mode */
  const isTokensCtx = router.asPath.toLowerCase().includes('/tokens')
                    || String(router.query.cmd).toLowerCase() === 'tokens';

  const go = (e) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;

    const addrRe  = /^kt1[1-9A-HJ-NP-Za-km-z]{33}$/i;
    const adminRe = /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/i;

    if (addrRe.test(v)) {
      router.push(`/contracts/${v}`);
    } else if (adminRe.test(v)) {
      if (isTokensCtx) router.push(`/explore?cmd=tokens&admin=${v}`);
      else             router.push(`/explore?admin=${v}`);
    } else {
      // eslint-disable-next-line no-alert
      alert('Enter a valid admin (tz1…) or contract (KT1…) address.');
      return;
    }
    setQ('');
  };

  /*─ handlers ─*/
  const requestToggle = (flag) => {
    if ((flag === 'nsfw'  && !allowNSFW)
     || (flag === 'flash' && !allowFlash)) {
      setDlg(flag);          // enabling – ask agreement
    } else {
      if (flag === 'nsfw')  setAllowNSFW(false);
      if (flag === 'flash') setAllowFlash(false);
    }
  };

  const confirmEnable = () => {
    if (!termsOK) return;
    if (dlg === 'nsfw')  setAllowNSFW(true);
    if (dlg === 'flash') setAllowFlash(true);
    setDlg(null); setTermsOK(false);
  };

  /*──────── render ─────────────────────────────────────────*/
  return (
    <>
      <Bar aria-label="Explore navigation">
        <PixelButton as="a" href="/explore">COLLECTIONS</PixelButton>
        <PixelButton as="a" href="/explore?cmd=tokens">TOKENS</PixelButton>
        <PixelButton as="a" href="/explore/listings">LISTINGS</PixelButton>

        {!hideSearch && (
          <form onSubmit={go}>
            <PixelInput
              placeholder="Search by Admin Address or KT1…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <PixelButton size="sm" type="submit">GO</PixelButton>
          </form>
        )}

        {/* hazard toggles */}
        <PixelButton
          size="xs"
          warning={!allowNSFW}
          onClick={() => requestToggle('nsfw')}
          title={allowNSFW ? 'NSFW content visible' : 'NSFW content hidden'}
        >
          {allowNSFW ? 'Hide NSFW 🔞' : 'Enable NSFW 🔞'}
        </PixelButton>

        <PixelButton
          size="xs"
          warning={!allowFlash}
          onClick={() => requestToggle('flash')}
          title={allowFlash ? 'Flashing hazards visible' : 'Flashing hazards hidden'}
        >
          {allowFlash ? 'Hide Flashing 🚨' : 'Enable Flashing 🚨'}
        </PixelButton>
      </Bar>

      {/* confirm‑dialog */}
      {dlg && (
        <PixelConfirmDialog
          open
          title={`Enable ${dlg === 'nsfw' ? 'NSFW (mature)' : 'flashing‑hazard'} content site‑wide?`}
          message={(
            <>
              {dlg === 'nsfw' ? (
                <p style={{ margin:'0 0 8px' }}>
                  Warning: You are about to allow <strong>Not‑Safe‑For‑Work (NSFW)</strong>{' '}
                  content across Zero Unbound. This may include explicit nudity,
                  sexual themes, graphic violence or other mature material. Viewer
                  discretion is advised.
                </p>
              ) : (
                <p style={{ margin:'0 0 8px' }}>
                  Warning: You are about to allow content that contains{' '}
                  <strong>rapid flashing / strobing effects</strong> which may trigger
                  seizures for individuals with photosensitive epilepsy. See&nbsp;
                  <a href="https://kb.daisy.org/publishing/docs/metadata/schema.org/accessibilityHazard.html#value"
                     target="_blank" rel="noopener noreferrer">
                    accessibilityHazard reference
                  </a>{' '}
                  for details.
                </p>
              )}
              <label style={{
                display:'flex',
                gap:'6px',
                alignItems:'center',
                flexWrap:'wrap',
              }}>
                <input
                  type="checkbox"
                  checked={termsOK}
                  onChange={(e) => setTermsOK(e.target.checked)}
                />
                I&nbsp;confirm&nbsp;I&nbsp;am&nbsp;18 + and&nbsp;agree&nbsp;to&nbsp;
                <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
            </>
          )}
          confirmLabel="OK"
          cancelLabel="Cancel"
          confirmDisabled={!termsOK}
          onConfirm={confirmEnable}
          onCancel={() => { setDlg(null); setTermsOK(false); }}
        />
      )}
    </>
  );
}
/* What changed & why (r18):
   • Added hideSearch prop to optionally hide the search bar.
   • Wrapped search form in a conditional check.
   • Updated header and summary for new revision.
*/
/* EOF */