/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ExploreNav.jsx
  Rev :    r20    2025‑07‑26 UTC
  Summary: Temporarily disables “My …” links; clicking any of
           them now opens a stub overlay informing users that the
           new marketplace contract is under construction.
─────────────────────────────────────────────────────────────*/

import { useState }    from 'react';
import { useRouter }   from 'next/router';
import styledPkg       from 'styled-components';

import PixelButton          from './PixelButton.jsx';
import PixelInput           from './PixelInput.jsx';
import PixelConfirmDialog   from './PixelConfirmDialog.jsx';
import useConsent           from '../hooks/useConsent.js';

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
 * NOTE (r20): All personalised “My …” links are temporarily
 * routed to a stub notice while the new marketplace contract
 * is being deployed.
 *
 * @param {Object} props
 * @param {boolean} [props.hideSearch=false] whether to hide the search bar
 */
export default function ExploreNav({ hideSearch = false }) {
  const [q, setQ] = useState('');
  const router     = useRouter();

  /* stub‑overlay state */
  const [stubOpen , setStubOpen ] = useState(false);

  /* hazard‑consent flags */
  const [allowNSFW , setAllowNSFW ] = useConsent('nsfw' , false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);

  /* confirm‑dialog state for hazard toggles */
  const [dlg,      setDlg]      = useState(null);   // 'nsfw' | 'flash' | null
  const [termsOK,  setTermsOK]  = useState(false);

  /* detect TOKENS context so address‑search keeps mode */
  const isTokensCtx = router.asPath.toLowerCase().includes('/tokens')
                    || String(router.query.cmd).toLowerCase() === 'tokens';

  /*──────────────── search ────────────────────────────────*/
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

  /*──────────────── hazard toggles ───────────────────────*/
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

  /*──────────────── render ───────────────────────────────*/
  return (
    <>
      <Bar aria-label="Explore navigation">
        <PixelButton as="a" href="/explore">COLLECTIONS</PixelButton>
        <PixelButton as="a" href="/explore?cmd=tokens">TOKENS</PixelButton>
        <PixelButton as="a" href="/explore/listings">LISTINGS</PixelButton>

        {/* personalised pages – now stubbed */}
        {['MY COLLECTIONS', 'MY TOKENS', 'MY OFFERS'].map((lbl) => (
          <PixelButton
            key={lbl}
            as="a"
            href="#"
            onClick={(e) => { e.preventDefault(); setStubOpen(true); }}
            style={{ background:'var(--zu-accent-sec)', color:'var(--zu-btn-fg)', borderColor:'var(--zu-accent-sec-hover)' }}
          >
            {lbl}
          </PixelButton>
        ))}

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

      {/* hazard confirm‑dialog */}
      {dlg && (
        <PixelConfirmDialog
          open
          title={`Enable ${dlg === 'nsfw' ? 'NSFW (mature)' : 'flashing‑hazard'} content site‑wide?`}
          message={(<>
            {dlg === 'nsfw' ? (
              <p style={{ margin:'0 0 8px' }}>
                Warning: You are about to allow <strong>Not‑Safe‑For‑Work (NSFW)</strong>{' '}
                content across Zero Unbound. This may include explicit nudity,
                sexual themes, graphic violence or other mature material.
              </p>
            ) : (
              <p style={{ margin:'0 0 8px' }}>
                Warning: You are about to allow content that contains flashing or
                strobe effects. This may trigger photosensitive reactions.
              </p>
            )}
            <label style={{ display:'flex',alignItems:'center' }}>
              <input
                type="checkbox"
                checked={termsOK}
                onChange={(e) => setTermsOK(e.target.checked)}
              />
              <span style={{ marginLeft:'0.4rem' }}>I accept the terms</span>
            </label>
          </>)}
          onConfirm={confirmEnable}
          onCancel={() => { setDlg(null); setTermsOK(false); }}
        />
      )}

      {/* marketplace stub overlay */}
      {stubOpen && (
        <PixelConfirmDialog
          open
          title="Marketplace upgrade in progress"
          message={(
            <p style={{ margin:0 }}>
              New ZeroSum marketplace contract is under construction.<br/>
              Please list or manage offers on&nbsp;
              <a href="https://objkt.com" target="_blank" rel="noopener noreferrer">OBJKT</a>{' '}
              for now and check back soon!
            </p>
          )}
          confirmLabel="OK"
          onConfirm={() => setStubOpen(false)}
          onCancel={() => setStubOpen(false)}
        />
      )}
    </>
  );
}

ExploreNav.propTypes = { hideSearch: Boolean };
/* What changed & why: r20 replaces all “My …” navigation links with a stub
   overlay to prevent users from accessing disabled marketplace features. */
/* EOF */
