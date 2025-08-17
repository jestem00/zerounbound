/*──────── src/ui/ExploreNav.jsx ────────*/
/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ExploreNav.jsx
  Rev :    r3    2025‑08‑16
  Summary: Restores & locks full Explore nav (Collections, Tokens,
           Listings, Secondary, My‑pages), preserves search & hazard
           toggles, adds small a11y polish. No routes removed.
─────────────────────────────────────────────────────────────*/

import { useState }    from 'react';
import { useRouter }   from 'next/router';
import styledPkg       from 'styled-components';
import PropTypes       from 'prop-types';

import PixelButton        from './PixelButton.jsx';
import PixelInput         from './PixelInput.jsx';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';
import useConsent         from '../hooks/useConsent.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled banner ─────────────────────────────────────*/
const Bar = styled.nav`
  position: sticky;
  top: 0;
  z-index: 7;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  background: var(--zu-bg-dim, #111);
  border-block: 2px solid var(--zu-accent, #00c8ff);
  box-shadow: 0 2px 0 rgba(0, 0, 0, .4);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  white-space: nowrap;

  & form {
    display: flex;
    gap: 6px;
  }

  & input {
    width: clamp(180px, 30vw, 340px);
    min-width: 160px;
  }
`;

/**
 * Explore navigation bar with optional search suppression.
 * This component renders navigation buttons for core explore
 * pages (collections, tokens, listings, secondary), as well as
 * personalised pages (My Collections, My Tokens, My Offers,
 * My Listings).  Each button routes to its corresponding
 * page using Next.js router.  A search field accepts either
 * contract addresses (KT1…) or admin/creator addresses (tz1…),
 * redirecting users to the appropriate contract or filtered
 * explore view.  Two hazard toggles control NSFW and flashing
 * content; enabling either requires user consent via a
 * confirmation dialog.
 *
 * @param {Object} props
 * @param {boolean} [props.hideSearch=false] whether to hide the search bar
 */
export default function ExploreNav({ hideSearch = false }) {
  const [q, setQ] = useState('');
  const router    = useRouter();

  /* hazard‑consent flags */
  const [allowNSFW , setAllowNSFW ] = useConsent('nsfw' , false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);

  /* confirm‑dialog state for hazard toggles */
  const [dlg,     setDlg    ] = useState(null);   // 'nsfw' | 'flash' | null
  const [termsOK, setTermsOK] = useState(false);

  /* search handler: navigate to contract or admin page */
  const go = (e) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    const addrRe  = /^kt1[1-9A-HJ-NP-Za-km-z]{33}$/i;
    const adminRe = /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/i;
    if (addrRe.test(v)) {
      router.push(`/contracts/${v}`);
    } else if (adminRe.test(v)) {
      // preserve tokens context for admin filter
      const isTokensCtx = router.asPath.toLowerCase().includes('/tokens')
                       || String(router.query.cmd).toLowerCase() === 'tokens';
      if (isTokensCtx) router.push(`/explore?cmd=tokens&admin=${v}`);
      else             router.push(`/explore?admin=${v}`);
    } else {
      // eslint-disable-next-line no-alert
      alert('Enter a valid admin (tz1…) or contract (KT1…) address.');
      return;
    }
    setQ('');
  };

  /* hazard toggle request: open confirm dialog when enabling */
  const requestToggle = (flag) => {
    if ((flag === 'nsfw'  && !allowNSFW)
     || (flag === 'flash' && !allowFlash)) {
      setDlg(flag);
    } else {
      if (flag === 'nsfw')  setAllowNSFW(false);
      if (flag === 'flash') setAllowFlash(false);
    }
  };
  const confirmEnable = () => {
    if (!termsOK) return;
    if (dlg === 'nsfw')  setAllowNSFW(true);
    if (dlg === 'flash') setAllowFlash(true);
    setDlg(null);
    setTermsOK(false);
  };

  /* navigation helpers */
  const goto = (path) => () => { router.push(path); };

  return (
    <>
      <Bar aria-label="Explore navigation">
        {/* primary navigation */}
        <PixelButton size="sm" onClick={goto('/explore')} title="Browse collections">COLLECTIONS</PixelButton>
        <PixelButton size="sm" onClick={goto('/explore?cmd=tokens')} title="Browse individual tokens">TOKENS</PixelButton>
        <PixelButton size="sm" onClick={goto('/explore/listings')} title="Primary listings">LISTINGS</PixelButton>
        <PixelButton size="sm" onClick={goto('/explore/secondary')} title="Secondary market">SECONDARY</PixelButton>

        {/* personalised pages */}
        <PixelButton
          size="sm"
          style={{ background: 'var(--zu-accent-sec)', color: 'var(--zu-btn-fg)', borderColor: 'var(--zu-accent-sec-hover)' }}
          onClick={goto('/my/collections')}
          title="Your collections"
        >MY&nbsp;COLLECTIONS</PixelButton>
        <PixelButton
          size="sm"
          style={{ background: 'var(--zu-accent-sec)', color: 'var(--zu-btn-fg)', borderColor: 'var(--zu-accent-sec-hover)' }}
          onClick={goto('/my/tokens')}
          title="Your tokens"
        >MY&nbsp;TOKENS</PixelButton>
        <PixelButton
          size="sm"
          style={{ background: 'var(--zu-accent-sec)', color: 'var(--zu-btn-fg)', borderColor: 'var(--zu-accent-sec-hover)' }}
          onClick={goto('/my/offers')}
          title="Offers you can accept and ones you made"
        >MY&nbsp;OFFERS</PixelButton>
        <PixelButton
          size="sm"
          style={{ background: 'var(--zu-accent-sec)', color: 'var(--zu-btn-fg)', borderColor: 'var(--zu-accent-sec-hover)' }}
          onClick={goto('/my/listings')}
          title="Your active listings"
        >MY&nbsp;LISTINGS</PixelButton>

        {/* search bar */}
        {!hideSearch && (
          <form onSubmit={go} role="search" aria-label="Search by admin or contract">
            <PixelInput
              type="text"
              placeholder="Search by admin or contract…"
              inputMode="text"
              autoComplete="off"
              aria-label="Admin or contract address"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <PixelButton type="submit" size="sm" title="Go to address">GO</PixelButton>
          </form>
        )}

        {/* hazard toggles */}
        <PixelButton
          size="sm"
          warning={!allowNSFW}
          onClick={() => requestToggle('nsfw')}
          title={allowNSFW ? 'NSFW content visible' : 'NSFW content hidden'}
          aria-pressed={!!allowNSFW}
          aria-label={allowNSFW ? 'Hide NSFW content' : 'Enable NSFW content'}
        >
          {allowNSFW ? 'Hide NSFW 🔞' : 'Enable NSFW 🔞'}
        </PixelButton>
        <PixelButton
          size="sm"
          warning={!allowFlash}
          onClick={() => requestToggle('flash')}
          title={allowFlash ? 'Flashing hazards visible' : 'Flashing hazards hidden'}
          aria-pressed={!!allowFlash}
          aria-label={allowFlash ? 'Hide flashing hazards' : 'Enable flashing hazards'}
        >
          {allowFlash ? 'Hide Flashing 🚨' : 'Enable Flashing 🚨'}
        </PixelButton>
      </Bar>

      {/* hazard confirm dialog */}
      {dlg && (
        <PixelConfirmDialog
          open
          title={dlg === 'nsfw' ? 'Enable NSFW?' : 'Enable Flashing?'}
          message={(<>
              {dlg === 'nsfw' ? (
                <p style={{ margin: '0 0 8px' }}>
                  Warning: You are about to allow Not‑Safe‑For‑Work (NSFW) content across
                  Zero Unbound. This may include explicit nudity, sexual themes, graphic
                  violence or other mature material.
                </p>
              ) : (
                <p style={{ margin: '0 0 8px' }}>
                  Warning: You are about to allow content that contains flashing or strobe
                  effects. This may trigger photosensitive reactions.
                </p>
              )}
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="checkbox"
                  checked={termsOK}
                  onChange={(e) => setTermsOK(e.target.checked)}
                />
                I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
            </>)}
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

ExploreNav.propTypes = {
  hideSearch: PropTypes.bool,
};

/* What changed & why: r3 – Restored complete button set and tightened
   a11y (aria attributes). Kept search, hazard toggles, and routing
   semantics intact. No functional removals. */ /* EOF */
