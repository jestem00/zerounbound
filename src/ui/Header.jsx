/* Developed by @jams2blues – ZeroContract Studio
   File:    src/ui/Header.jsx
   Rev :    r744‑a1  2025‑07‑01 T15:02 UTC
   Summary: NET fallback via deployTarget; removes duplicate default */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import styled, { css, keyframes } from 'styled-components';
import Link           from 'next/link';
import PixelButton    from './PixelButton.jsx';
import { useWallet }  from '../contexts/WalletContext.js';
import { useTheme, PALETTE_KEYS } from '../contexts/ThemeContext.js';
import useIso         from '../utils/useIsoLayoutEffect.js';
import { NETWORK_KEY } from '../config/deployTarget.js';

/*──────── constants ─────*/
const NET_COL = {
  mainnet : 'var(--zu-mainnet)',
  ghostnet: 'var(--zu-ghostnet)',
  sandbox : 'var(--zu-sandbox)',
};
const BREAK        = 800;
const COPY_TIMEOUT = 1800;

/*──────── styled shells ─────*/
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
  a { font: 0.8rem/1 'PixeloidSans', monospace; color: var(--zu-fg); }
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

const Controls = styled.div`
  display: flex; flex-wrap: wrap; gap: 0.45rem;
  align-items: center; justify-content: flex-end;
  @media (max-width:${BREAK - 1}px){
    flex-direction: column; align-items: stretch; width: 100%;
  }
`;

const CopyBtn = styled(PixelButton).attrs({ size: 'xs' })`
  padding: 0 0.55rem; font-size: 0.85rem;
  background: var(--zu-accent-sec);
`;

/*──────── component ───────────────────────*/
export default function Header() {
  const wrapRef = useRef(null);
  const [drawer, setDrawer]   = useState(false);
  const [copied, setCopied]   = useState(false);
  const walletCtx             = useWallet();
  const { theme, set: setTheme } = useTheme();

  const {
    address,
    network: walletNet,
    connect, disconnect,
  } = walletCtx || {};
  const network = walletNet || NETWORK_KEY;

  /* publish header height → CSS var --hdr (Invariant I44) */
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

  /* border colour per network */
  useEffect(() => {
    document.documentElement.style
      .setProperty('--zu-net-border', NET_COL[network] || 'var(--zu-accent-sec)');
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

  const copyAddr = useCallback(() => {
    if (!address || copied) return;
    navigator?.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_TIMEOUT);
    });
  }, [address, copied]);

  /*──────── render ─────*/
  const NavLinks = (
    <>
      <Link href="/deploy">Create Collection</Link>
      <Link href="/manage">Manage Collections</Link>
      <Link href="/explore">Explore FOC</Link>
      <Link href="/terms">Terms</Link>
    </>
  );

  return (
    <>
      <Shell>
        <Wrap ref={wrapRef}>
          {/* logo + net label */}
          <div style={{ display:'flex', flexDirection:'column' }}>
            <BrandLine href="/">ZERO UNBOUND</BrandLine>
            <Note>you are on <b>{network.toUpperCase()}</b></Note>
          </div>

          {/* desktop nav */}
          <Links>{NavLinks}</Links>

          {/* controls */}
          <Controls>
            <NetSelect value={network} onChange={navNet} aria-label="Network">
              <option value="ghostnet">Ghostnet</option>
              <option value="mainnet">Mainnet</option>
            </NetSelect>

            <ThemeSelect
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              aria-label="Theme palette"
            >
              {PALETTE_KEYS.map(k => (
                <option key={k} value={k}>{k.replace(/-/g, ' ')}</option>
              ))}
            </ThemeSelect>

            {address ? (
              <>
                <PixelButton title={address}>{shortAddr}</PixelButton>
                <CopyBtn
                  aria-label="Copy wallet address"
                  title={copied ? 'Copied!' : 'Copy address'}
                  onClick={copyAddr}
                >
                  {copied ? '✓' : '📋'}
                </CopyBtn>
                <PixelButton onClick={disconnect} data-sec>Disconnect</PixelButton>
              </>
            ) : (
              <PixelButton onClick={connect}>Connect Wallet</PixelButton>
            )}
          </Controls>

          <Burger aria-label="menu" onClick={() => setDrawer(true)}>≡</Burger>
        </Wrap>
      </Shell>

      {/* mobile drawer */}
      {drawer && (
        <Drawer>
          <PixelButton onClick={() => setDrawer(false)} data-sec>Close ×</PixelButton>
          {NavLinks}
          <ThemeSelect
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            aria-label="Theme palette mobile"
          >
            {PALETTE_KEYS.map(k => (
              <option key={k} value={k}>{k.replace(/-/g, ' ')}</option>
            ))}
          </ThemeSelect>
        </Drawer>
      )}
    </>
  );
}
/* What changed & why:
   • Header now defaults to NETWORK_KEY when wallet not yet connected,
     eliminating hard‑coded 'ghostnet' leakage and keeping divergence
     centralised in deployTarget.js (I10, I63).  No UI regressions.
*/
/* EOF */
