/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/Header.jsx
  Summary: injects wallet debug logging at mount time
           to validate wallet context and button handlers. */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import styled, { css, keyframes } from 'styled-components';
import Link from 'next/link';
import PixelButton from './PixelButton.jsx';
import { useWallet } from '../contexts/WalletContext.js';
import { useTheme, PALETTE_KEYS } from '../contexts/ThemeContext.js';
import useIso from '../utils/useIsoLayoutEffect.js';

/*──────── constants ─────*/
const NET_COL = {
  mainnet: 'var(--zu-mainnet)',
  ghostnet: 'var(--zu-ghostnet)',
  sandbox: 'var(--zu-sandbox)',
};
const BREAK = 800;

const selectCSS = css`
  font: 0.78rem/1 'PixeloidSans', monospace;
  background: var(--zu-bg); color: var(--zu-fg);
  border: 1px solid var(--zu-accent-sec);
  padding: 0.2rem 0.45rem; border-radius: 4px;
  min-width: 125px;
  option { color: var(--zu-fg); background: var(--zu-bg); }
`;
const NetSelect   = styled.select`${selectCSS}`;
const ThemeSelect = styled.select`${selectCSS}`;

const Shell = styled.header`
  position: fixed; inset-block-start: 0; inset-inline: 0; z-index: 1100;
  background: var(--zu-bg-alt);
  border-block-end: 2px solid var(--zu-net-border);
`;
const Wrap = styled.div`
  display: flex; flex-wrap: wrap; gap: 0.9rem;
  align-items: center; justify-content: space-between;
  padding: 0.55rem clamp(0.7rem, 3vw, 1.2rem);
`;
const BrandLine = styled(Link)`
  font: 700 1.35rem/1 'PixeloidSansBold', monospace;
  color: var(--zu-heading); text-decoration: none;
`;
const Note = styled.span`
  font: 0.7rem/1.2 'PixeloidMono', monospace;
`;
const Links = styled.nav`
  display: flex; gap: 0.8rem; flex-wrap: wrap;
  a,span { font: 0.8rem/1 'PixeloidSans', monospace; color: var(--zu-fg); }
  @media (max-width:${BREAK - 1}px) { display: none; }
`;
const Burger = styled.button`
  display: none;
  @media(max-width:${BREAK - 1}px){
    display: inline-flex;
    border: 2px solid var(--zu-fg); background: none; color: var(--zu-fg);
    width: 34px; height: 28px;
    font: 700 1rem/1 'PixeloidSans', monospace;
    cursor: pointer;
  }
`;
const slide = keyframes`from{transform:translateX(100%)}to{transform:translateX(0)}`;
const Drawer = styled.aside`
  position: fixed; inset-block: 0; inset-inline-end: 0;
  width: 260px; z-index: 1200;
  background: var(--zu-bg-alt);
  border-inline-start: 2px solid var(--zu-net-border);
  padding: 1rem; display: flex; flex-direction: column; gap: 1rem;
  animation: ${slide} 230ms ease-out;
`;

export default function Header() {
  const wrapRef = useRef(null);
  const [drawer, setDrawer] = useState(false);
  const walletCtx = useWallet();  // pull full context object
  const { theme, set: setTheme } = useTheme();

  // Log wallet context object at mount time
  useEffect(() => {
    console.warn('🧠 Header walletCtx:', walletCtx);
  }, [walletCtx]);

  const {
    address, network = 'ghostnet',
    connect, disconnect,
  } = walletCtx || {};

  useIso(() => {
    const el = wrapRef.current;
    if (!el) return;
    const sync = () =>
      document.documentElement.style.setProperty('--hdr', `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--zu-net-border',
      NET_COL[network] || 'var(--zu-accent-sec)');
  }, [network]);

  const shortAddr = useMemo(
    () => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''),
    [address],
  );

  const navNet = useCallback((e) => {
    window.location.assign(
      e.target.value === 'ghostnet'
        ? 'https://ghostnet.zerounbound.art'
        : 'https://zerounbound.art',
    );
  }, []);

  return (
    <>
      <Shell>
        <Wrap ref={wrapRef}>
          <div style={{ display:'flex', flexDirection:'column' }}>
            <BrandLine href="/">ZERO UNBOUND</BrandLine>
            <Note>you are on <b>{network.toUpperCase()}</b></Note>
          </div>

          <Links>
            <Link href="/terms">Terms</Link>
            <span style={{ opacity: 0.6 }}>more links</span>
            <span style={{ opacity: 0.6 }}>more links</span>
          </Links>

          <div style={{
            display:'flex', flexDirection:'column', gap:'0.25rem',
            width:'min(260px, 35vw)',
          }}>
            <NetSelect value={network} onChange={navNet}>
              <option value="ghostnet">Ghostnet</option>
              <option value="mainnet">Mainnet</option>
            </NetSelect>

            <ThemeSelect value={theme} onChange={(e) => setTheme(e.target.value)}>
              {PALETTE_KEYS.map(k => <option key={k} value={k}>{k.replace(/-/g, ' ')}</option>)}
            </ThemeSelect>

            {address
              ? <>
                  <PixelButton title={address}>{shortAddr}</PixelButton>
                  <PixelButton onClick={disconnect} data-sec>Disconnect</PixelButton>
                </>
              : <PixelButton onClick={connect}>Connect Wallet</PixelButton>}
          </div>

          <Burger aria-label="menu" onClick={() => setDrawer(true)}>≡</Burger>
        </Wrap>
      </Shell>

      {drawer &&
        <Drawer>
          <PixelButton onClick={() => setDrawer(false)} data-sec>Close ×</PixelButton>
          <Link href="/terms" onClick={() => setDrawer(false)}>Terms</Link>
          <span style={{ opacity: 0.6 }}>more links</span>
          <ThemeSelect value={theme} onChange={(e) => setTheme(e.target.value)}>
            {PALETTE_KEYS.map(k => <option key={k} value={k}>{k.replace(/-/g, ' ')}</option>)}
          </ThemeSelect>
        </Drawer>}
    </>
  );
}

/* What changed & why:
   • Injected `console.warn('🧠 Header walletCtx:', …)` to validate what
     `useWallet()` returns during mount. Verifies if `connect` is defined.
   • This confirms if provider wiring or context chain is broken. */
/* EOF */
