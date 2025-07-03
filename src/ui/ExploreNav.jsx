/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ExploreNav.jsx
  Rev :    r8     2025‑08‑17 UTC
  Summary: mobile nowrap scroll + tighter two‑col wrap
──────────────────────────────────────────────────────────────*/
import styledPkg   from 'styled-components';
import PixelButton from './PixelButton.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled banner ─────────────────────────────────────*/
const Bar = styled.nav`
  position: sticky;
  top: 0;                      /* <main> already offset by --hdr */
  z-index: 7;

  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding: 4px 10px;
  box-sizing: border-box;

  background: var(--zu-bg-dim, #111);
  border-block: 2px solid var(--zu-accent, #00c8ff);
  box-shadow: 0 2px 0 rgba(0,0,0,.4);
  margin-bottom: 10px;

  /* horizontal scroll safety for super‑narrow screens */
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  white-space: nowrap;

  @media (max-width: 480px) {
    /* switch to 2‑col grid when enough width, otherwise scroll */
    flex-wrap: wrap;
    white-space: normal;
    gap: 6px;
    & > *{
      flex: 1 1 calc(50% - 6px);
      min-width: 0;
      text-align: center;
    }
  }
`;

export default function ExploreNav() {
  return (
    <Bar aria-label="Explore navigation">
      <PixelButton as="a" href="/explore">COLLECTIONS</PixelButton>
      <PixelButton as="a" href="/explore?cmd=tokens">TOKENS</PixelButton>
      <PixelButton as="a" href="/explore/listings">LISTINGS</PixelButton>
      <PixelButton as="a" href="/explore/search">SEARCH / FILTER</PixelButton>
    </Bar>
  );
}
/* What changed & why:
   • white‑space:nowrap + overflow‑scroll keeps buttons visible
     without clipping on 320 px screens.
   • 2‑column flex‑wrap ≤ 480 px maintains tapable size.
*/
