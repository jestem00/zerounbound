/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/WalletNotice.jsx
  Summary: full sync-aware wallet alerts (Reveal, Fund, Mismatch) */

import React from 'react';
import styled from 'styled-components';
import { useWallet } from '../contexts/WalletContext.js';

/*──────── styles ─────*/
const Box = styled.div`
  margin: 1.25rem 0;
  padding: 0.85rem 1.2rem;
  background: var(--zu-accent-sec);
  border: 2px solid var(--zu-fg);
  color: var(--zu-btn-fg);
  font: 0.78rem/1.5 'PixeloidSans', monospace;
  white-space: pre-line;
`;

/*──────── component ─────*/
export default function WalletNotice() {
  const {
    address,
    mismatch,
    needsReveal,
    needsFunds,
    network = 'ghostnet',
    revealAccount,
  } = useWallet() || {};

  if (!address) return null;

  const messages = [];

  if (mismatch)
    messages.push(
      `⚠ Connected wallet is on the wrong network.\nExpected: ${network.toUpperCase()}`,
    );

  if (needsReveal)
    messages.push(
      '⚠ Your wallet account is unrevealed.\nClick "Reveal account" to sign a 0ꜩ self-transfer.',
    );

  if (needsFunds)
    messages.push(
      '⚠ Your wallet appears unfunded.\nMinimum 0.5 ꜩ required to operate.',
    );

  if (!messages.length) return null;

  return (
    <Box role="alert" aria-live="polite">
      {messages.join('\n\n')}
      {needsReveal && (
        <div style={{ marginTop: '0.75rem' }}>
          <button
            onClick={revealAccount}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--zu-accent)',
              border: 'none',
              color: 'var(--zu-btn-fg)',
              cursor: 'pointer',
              font: '0.78rem/1.5 "PixeloidSans", monospace',
            }}
          >
            Reveal account
          </button>
        </div>
      )}
    </Box>
  );
}

/* What changed & why:
   • Imported revealAccount() from context.
   • Added a “Reveal account” button under the unrevealed notice.
   • Button styles match existing UI tokens. */
/* EOF */
