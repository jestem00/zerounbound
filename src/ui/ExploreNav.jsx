/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ExploreNav.jsx
  Rev :    r11    2025‑09‑25 UTC
  Summary: clear search box after nav + responsive input width
──────────────────────────────────────────────────────────────*/
import { useState }  from 'react';
import { useRouter } from 'next/router';
import styledPkg     from 'styled-components';
import PixelButton   from './PixelButton.jsx';
import PixelInput    from './PixelInput.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled banner ─────────────────────────────────────*/
const Bar = styled.nav`
  position: sticky; top: 0; z-index: 7;
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  justify-content: center; padding: 6px 10px;
  background: var(--zu-bg-dim,#111);
  border-block: 2px solid var(--zu-accent,#00c8ff);
  box-shadow: 0 2px 0 rgba(0,0,0,.4);
  overflow-x: auto; -webkit-overflow-scrolling: touch;
  white-space: nowrap;

  & form { display:flex; gap:6px; }
  & input { width:clamp(180px,30vw,340px); min-width:160px; }
`;

export default function ExploreNav() {
  const [q, setQ]   = useState('');
  const router      = useRouter();

  const go = (e) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;

    if (/^kt1[1-9A-HJ-NP-Za-km-z]{33}$/i.test(v)) {
      router.push(`/contracts/${v}`);
    } else if (/^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/i.test(v)) {
      router.push(`/explore?admin=${v}`);
    } else {
      alert('Enter a valid admin (tz1…) or contract (KT1…) address.');
      return;
    }
    setQ('');   // clear box once route accepted
  };

  return (
    <Bar aria-label="Explore navigation">
      <PixelButton as="a" href="/explore">COLLECTIONS</PixelButton>
      <PixelButton as="a" href="/explore?cmd=tokens">TOKENS</PixelButton>
      <PixelButton as="a" href="/explore/listings">LISTINGS</PixelButton>

      {/* address search */}
      <form onSubmit={go}>
        <PixelInput
          placeholder="Search by Admin Address or KT1…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <PixelButton size="sm" type="submit">GO</PixelButton>
      </form>
    </Bar>
  );
}
/* What changed & why (r11):
   • Input width now responsive (clamp 180‑340 px).
   • Search field clears after successful navigation. */
/* EOF */
