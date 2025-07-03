/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/MintV4a.jsx
  Rev :    r201   2025‑08‑15
  Summary: progressive‑collection mint now links to ZeroTerminal
──────────────────────────────────────────────────────────────*/
import React, { useMemo } from 'react';
import styledPkg          from 'styled-components';
import PixelHeading       from '../PixelHeading.jsx';
import PixelButton        from '../PixelButton.jsx';
import { useWalletContext } from '../../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── shells ─────*/
const Wrap = styled.section`margin-top:1rem;text-align:center;`;

/*════════ component ═══════════════════════════════════════*/
export default function MintV4a({ contractAddress }) {
  const { network } = useWalletContext() || {};
  const base = network === 'mainnet'
    ? 'https://zeroterminal.art'
    : 'https://testnet.zeroterminal.art';

  /* best‑effort contract injection for convenience */
  const url = useMemo(
    () => `${base}/?cmd=tokendata&cid=${ contractAddress }`,
    [base, contractAddress],
  );

  return (
    <Wrap>
      <PixelHeading level={3}>Mint on ZeroTerminal</PixelHeading>
      <p style={{ maxWidth:540,margin:'0 auto .8rem' }}>
        Minting for progressive (v4a / v4c) collections is handled directly on&nbsp;
        <strong>ZeroTerminal</strong> to ensure full TZIP‑compliance. Clicking the
        button below opens the correct minting screen in a new tab.
      </p>
      <PixelButton
        as="a"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        OPEN ZEROTERMINAL
      </PixelButton>
    </Wrap>
  );
}
/* EOF */
