/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Header.jsx
  Rev :    r744-a4  2025-07-23
  Summary: add Reset Cache button & version display; refresh wallet state
──────────────────────────────────────────────────────────────*/
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
/* Application version (increment for each deploy) */
const APP_VERSION = '0.65';

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
  display: inline-flex; align-items: baseline; gap: 0.15rem;
  sup { font-size: 0.55em; color: var(--zu-accent); }
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
    // refresh helper added to sync wallet state from WalletContext
    refresh,
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

  // ensure wallet state is up‑to‑date: on mount, focus, or
  // visibility change, request a refresh from WalletContext.  This
  // prevents stale headers showing disconnected wallets when a
  // session expires in another tab (see issue with manage page)
  useEffect(() => {
    if (!refresh) return;
    // initial refresh on mount
    refresh().catch(() => {});
    const handleVisibility = () => {
      // call refresh whenever the tab gains focus or becomes visible
      refresh().catch(() => {});
    };
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);

  // copy address to clipboard
  const shortAddr = useMemo(
    () => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''),
    [address],
  );

  // network navigation
  const navNet = useCallback((e) => {
    window.location.assign(
      e.target.value === 'ghostnet'
        ? 'https://ghostnet.zerounbound.art'
        : 'https://zerounbound.art',
    );
  }, []);

  // copy wallet to clipboard with toast
  const copyAddr = useCallback(() => {
    if (!address || copied) return;
    navigator?.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_TIMEOUT);
    });
  }, [address, copied]);

  /* reset cache & hard reload
   * Unregisters all service workers and clears all caches before forcing a reload.
   * This mirrors the Empty Cache + Hard Reload behaviour to fix stale-code
   * issues reported by artists on mainnet.
   */
  const handleCacheRefresh = useCallback(() => {
    (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((reg) => reg.unregister()));
        }
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch (err) {
        console.warn('Cache refresh error', err);
      } finally {
        try {
          window.location.reload(true);
        } catch {
          window.location.reload();
        }
      }
    })();
  }, []);

  /*──────── render ─────*/
  const NavLinks = (
    <>
      <Link href="/deploy">Create Collection</Link>
      <Link href="/manage">Manage Collections</Link>
      <Link href="/explore">Explore FOC</Link>
      <a href="https://sifrzero.art" target="_blank" rel="noopener noreferrer">
        SIFR ZERO Mint
      </a>
      <Link href="/terms">Terms</Link>
    </>
  );

  return (
    <>
      <Shell>
        <Wrap ref={wrapRef}>
          {/* logo + net label + version */}
          <div style={{ display:'flex', flexDirection:'column' }}>
            <BrandLine href="/">
              <span>ZERO UNBOUND</span>
              <sup>β</sup>
              <span style={{ fontSize:'0.55rem', marginLeft:'0.25rem', color:'var(--zu-accent-sec)' }}>
                v.{APP_VERSION}
              </span>
            </BrandLine>
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

            {/* Reset cache button (global) */}
            <PixelButton onClick={handleCacheRefresh} data-sec>
              Reset Cache
            </PixelButton>

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
          {/* replicate theme select and network select in drawer; include cache button for mobile */}
          <ThemeSelect
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            aria-label="Theme palette mobile"
          >
            {PALETTE_KEYS.map(k => (
              <option key={k} value={k}>{k.replace(/-/g, ' ')}</option>
            ))}
          </ThemeSelect>
          <NetSelect value={network} onChange={navNet} aria-label="Network mobile">
            <option value="ghostnet">Ghostnet</option>
            <option value="mainnet">Mainnet</option>
          </NetSelect>
          <PixelButton onClick={handleCacheRefresh} data-sec>
            Reset Cache
          </PixelButton>
        </Drawer>
      )}
    </>
  );
}
/* What changed & why:
   • Introduced APP_VERSION constant and displayed “v.0.65” next to the β symbol
     in the header; this helps authors verify they’re running the latest build.
   • Added handleCacheRefresh() helper which unregisters all service workers,
     clears caches and forces a hard reload.  Inserted a Reset Cache button in
     both desktop controls and mobile drawer to trigger this helper.
   • Updated revision and summary lines to reflect new features; preserved
     existing wallet refresh logic and styling.
*/
/* EOF */