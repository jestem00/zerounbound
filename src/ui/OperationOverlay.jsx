/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/OperationOverlay.jsx
  Rev :    r965   2025-07-23
  Summary: unified progress overlay for origination, mint,
           repair and append.  Restores success view,
           wallet hints, timeout messaging and cache clearing on close.
           Adds optional tokenUrl support to render a
           “View Token” button on success.
──────────────────────────────────────────────────────────────*/

import React, {
  useMemo, useState, useRef, useCallback,
} from 'react';
import styled, { css, keyframes } from 'styled-components';

import CanvasFireworks            from './canvasFireworks.jsx';
import PixelButton                from './PixelButton.jsx';
import FUN_LINES                  from '../constants/funLines.js';
import {
  URL_BCD_BASE, URL_OBJKT_BASE, URL_TZKT_OP_BASE,
}                                  from '../config/deployTarget.js';
import useWheelTunnel             from '../utils/useWheelTunnel.js';

/*──────── palette‑aware helpers ─────────*/
const varOr = (v, d) => `var(${v},${d})`;

/*──────── shells ────────────────────────*/
const Back = styled.div`
  position:fixed;inset-inline:0;top:var(--hdr,0);
  height:calc(100vh - var(--hdr,0));
  display:flex;justify-content:center;align-items:center;
  background:rgba(0,0,0,.88);
  z-index:2500;
`;

const Panel = styled.div.attrs({ role:'dialog','aria-modal':true })`
  --bg:  ${varOr('--zu-bg-alt', '#0b0b0b')};
  --fg:  ${varOr('--zu-fg',     '#e8e8e8')};
  --brd: ${varOr('--zu-heading','#bebebe')};

  position:relative;
  width:clamp(280px,90vw,480px);
  padding:2rem 3rem;
  background:var(--bg);
  border:2px solid var(--brd);
  box-shadow:0 0 0 2px #000,0 0 12px #000;
  text-align:center;
  font-family:var(--font-pixel);
  color:var(--fg);

  &::before{
    content:'';
    position:absolute;inset:0;
    pointer-events:none;
    background:repeating-linear-gradient(
      0deg,
      transparent      0 1px,
      rgba(0,0,0,.22)  2px 3px
    );
    animation:scan 6s linear infinite;
  }
  @keyframes scan{to{transform:translateY(3px);}}

  @media (prefers-reduced-motion:reduce){
    &::before{ animation:none; }
  }
`;

const Bar = styled.div.attrs((p)=>({style:{transform:`scaleX(${p.$p})`}}))`
  position:absolute;inset-inline:0;top:0;height:4px;
  background:${varOr('--zu-accent', '#50fa7b')};
  transform-origin:left;
  transition:transform .15s linear;

  ${({$p})=>$p>=0.99&&css`
    animation:pulse 1.2s ease-in-out infinite alternate;
    @keyframes pulse{from{opacity:.6;}to{opacity:1;}}
  `}
`;

const Gif  = styled.img`
  width:96px;height:96px;margin:0 auto 1.25rem;
  image-rendering:pixelated;
`;
const Ring = styled.div`
  width:72px;height:72px;margin:0 auto 1.25rem;
  border-radius:50%;
  border:8px solid #444;
  border-top-color:${varOr('--zu-accent', '#50fa7b')};
  animation:spin 1s linear infinite;
  @keyframes spin{to{transform:rotate(360deg);}}

  @media (prefers-reduced-motion:reduce){ animation:none; }
`;

const Addy = styled.p`
  margin:.5rem 0;
  font-family:monospace;
  font-size:.9rem;
  word-break:break-all;
  color:${varOr('--zu-fg', '#e8e8e8')};
`;

const Caption = styled.p`
  margin:.75rem 0 0;
  font-size:.9rem;
  color:${({$error})=>$error
    ? varOr('--zu-accent-sec', '#ff3333')
    : varOr('--zu-fg', '#e8e8e8')};
`;

/*── CSS‑steps Solari board ───────────────────────────────*/
const wrapH = '1.2em';
const makeFlip = (n)=>keyframes`
  to{transform:translateY(-${n*parseFloat(wrapH)}em);}
`;
const Wrap = styled.div`
  overflow:hidden;
  height:${wrapH};
  margin:.6rem auto 0;

  @media (prefers-reduced-motion:reduce){ display:none; }
`;
const List = styled.ul.attrs((p)=>({$n:p.$n}))`
  list-style:none;margin:0;padding:0;
  display:inline-block;width:100%;text-align:center;
  animation:${(p)=>css`${makeFlip(p.$n)} ${p.$n*3}s steps(${p.$n}) infinite`};

  li{
    height:${wrapH};
    line-height:${wrapH};
    color:${varOr('--zu-accent', '#50fa7b')};
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }

  @media (prefers-reduced-motion:reduce){ animation:none; }
`;

/*════════ component ════════════════════════════════════*/
export default function OperationOverlay({
  status    = '',
  progress: progressProp = 0,
  error,
  kt1,
  opHash,
  current,
  step,
  total = 1,
  /**
   * Optional URL pointing to the freshly minted token. When provided
   * (e.g. by the mint entrypoint after successful completion), the
   * overlay will render a “View Token” button that links directly
   * to the token detail page on the correct network.  Without this
   * prop the overlay behaves exactly as before.
   */
  tokenUrl,
  onRetry  = undefined,
  onCancel = () => {},
}){
  /* progress calc */
  const cur  = Number.isFinite(current) ? current
             : Number.isFinite(step)    ? step
             : 1;
  const prog = progressProp || (total>0 ? (cur-1)/total : 0);

  /* wheel lock */
  const panelRef = useRef(null);
  useWheelTunnel(panelRef);

  /* fun‑lines shuffle (stable) */
  const lines = useMemo(()=>{ const a=[...FUN_LINES];
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return [...a,a[0]];
  },[]);

  /* img fallback */
  const [gifOk,setGifOk]=useState(true);

  /* helpers */
  const linkBtn = useCallback(
    (href,txt)=>(<PixelButton as="a" href={href} target="_blank" rel="noopener noreferrer">{txt}</PixelButton>),
    [],
  );
  const handleCopy = useCallback((txt)=>navigator.clipboard.writeText(txt),[]);

  const clearCachesAndReload = useCallback(async () => {
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } finally {
      window.location.reload();
    }
  }, []);

  const handleClose = useCallback(() => {
    onCancel?.();
    if (typeof window !== 'undefined') clearCachesAndReload();
  }, [onCancel, clearCachesAndReload]);

  /*──────── success branch ───────*/
  if (kt1 || opHash){
    return (
      <Back>
        <CanvasFireworks active />
        <Panel ref={panelRef}>
          <Bar $p={1}/>
          <h2 style={{margin:'1rem 0 .5rem'}}>Success!</h2>

          {kt1   && <Addy>{kt1}</Addy>}
          {opHash&&(
            <Addy style={{display:'flex',gap:6,justifyContent:'center'}}>
              {opHash}
              <a
                href={`${URL_TZKT_OP_BASE}${opHash}`}
                target="_blank" rel="noopener noreferrer"
                title="View on TzKT" style={{textDecoration:'none'}}
              >🔗</a>
            </Addy>
          )}

          <div
            style={{
              display:'flex',
              flexWrap:'wrap',
              gap:'1rem',
              justifyContent:'center',
              marginTop:'1rem',
            }}
          >
            {kt1 && (
              <>
                {linkBtn(`${URL_BCD_BASE}${kt1}`, 'BCD')}
                {linkBtn(`${URL_OBJKT_BASE}${kt1}`, 'objkt')}
                <PixelButton as="a" href={`/manage?addr=${kt1}`}>Manage</PixelButton>
              </>
            )}
            {/*
             * If a tokenUrl is supplied (e.g. after mint completes), render
             * a dedicated link to the token’s detail page. Use an eye emoji
             * for accessibility and to hint at previewing the token.  Without
             * tokenUrl this button is omitted.
             */}
            {tokenUrl && (
              <PixelButton
                as="a"
                href={tokenUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                👁️ View&nbsp;Token
              </PixelButton>
            )}
            <PixelButton onClick={() => handleCopy(kt1 || opHash)}>Copy</PixelButton>
            <PixelButton onClick={handleClose}>Close</PixelButton>
          </div>
        </Panel>
      </Back>
    );
  }

  /*──────── progress / error branch ─────*/
  const caption = error ? status : (status||'Preparing request…');
  const walletHint = /wallet/i.test(caption)&&!error;
  const showSig    = total>1 && !error;
  const isTimeout = /timeout|took more time/i.test(caption);
  const isBeaconInvalid = /parameters invalid|beacon/i.test(caption);

  return (
    <Back>
      <CanvasFireworks active={false}/>
      <Panel ref={panelRef}>
        <Bar $p={prog}/>
        {gifOk
          ? <Gif src="/sprites/loading48x48.gif" alt="loading" onError={()=>setGifOk(false)}/>
          : <Ring />}

        {showSig && (
          <h3 style={{margin:'.25rem 0 .4rem',fontSize:'1rem'}}>
            Signature {cur} of {total}
          </h3>
        )}

        {error && (
          <h2 style={{color:varOr('--zu-accent-sec', '#ff3333')}}>Error</h2>
        )}

        <Caption $error={!!error}>{caption}</Caption>

        {walletHint && (
          <p style={{fontSize:'.8rem',opacity:.8,marginTop:4}}>
            Wallet pop‑up opening.<br/>
            <strong>Review total fees</strong> then sign.<br/>
            Confirmation may take a while.
          </p>
        )}

        {isTimeout && (
          <p style={{fontSize:'.8rem',opacity:.8,marginTop:4}}>
            Node simulation timed out—reducing chunk size for retry.
          </p>
        )}

        {isBeaconInvalid && (
          <p style={{fontSize:'.8rem',opacity:.8,marginTop:4}}>
            Wallet rejected params—check inputs or try smaller file.
          </p>
        )}

        {error && total>1 && (
          <p style={{fontSize:'.8rem',opacity:.8,marginTop:4}}>
            Already‑confirmed slices won’t be resent on retry.
          </p>
        )}

        {!error && (
          <Wrap>
            <List $n={lines.length}>
              {lines.map((l,i)=><li key={i}>{l}</li>)}
            </List>
          </Wrap>
        )}

        <div style={{
          display:'flex',gap:'1rem',
          justifyContent:'center',marginTop:'1rem',
        }}>
          {error && onRetry && <PixelButton onClick={onRetry}>Retry</PixelButton>}
          <PixelButton warning={!error} onClick={onCancel}>
            {error ? 'Close' : 'Cancel'}
          </PixelButton>
        </div>
      </Panel>
    </Back>
  );
}

/* What changed & why: Restored full success and progress UI from r955,
   unifying it with dual-stage origination.  Handles mint, repair and
   append workflows by showing correct success view (with kt1/opHash
   links), progress indicators for multi-signature operations and error
   hints.  Added cache/service-worker clearing on close.
*/