/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/OperationOverlay.jsx
  Rev :    r719   2025-06-27 T14:00 UTC
  Summary: added retry-hint text for multi-sig error case */

import React, { useMemo, useState, useRef } from 'react';
import styled, { css } from 'styled-components';
import CanvasFireworks from './canvasFireworks.jsx';
import PixelButton     from './PixelButton.jsx';
import FUN_LINES       from '../constants/funLines.js';
import {
  URL_BCD_BASE, URL_OBJKT_BASE, URL_TZKT_OP_BASE,
}                      from '../config/deployTarget.js';
import useWheelTunnel  from '../utils/useWheelTunnel.js';

/*──────── shells ───────────────────────────────────────────*/
const Back = styled.div`
  position: fixed;
  top: var(--hdr,0); left:0; right:0;
  height: calc(100vh - var(--hdr,0));
  display:flex;justify-content:center;align-items:center;
  background: rgba(0,0,0,.88); z-index:2500;
`;
const Panel = styled.div`
  position:relative;width:90vw;max-width:480px;padding:2rem 3rem;
  background:#0b0b0b;border:2px solid #bebebe;
  box-shadow:0 0 0 2px #000,0 0 12px #000;
  text-align:center;font-family:var(--font-pixel);
  color:var(--zu-fg,#e8e8e8);
  &::before{
    content:'';position:absolute;inset:0;pointer-events:none;
    background:repeating-linear-gradient(0deg,
      transparent 0 1px,rgba(0,0,0,.22) 2px 3px);
    animation:scan 6s linear infinite;
  }
  @keyframes scan{to{transform:translateY(3px);}}
`;

const Bar = styled.div.attrs(p=>({style:{transform:`scaleX(${p.$p})`}}))`
  position:absolute;top:0;left:0;right:0;height:4px;
  background:var(--zu-accent-pri);
  transform-origin:left center;
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
  border-radius:50%;border:8px solid #444;border-top-color:#6cf;
  animation:spin 1s linear infinite;
  @keyframes spin{to{transform:rotate(360deg);}}
`;

const Addy = styled.p`
  margin:.5rem 0;font-family:monospace;
  font-size:.9rem;word-break:break-all;
`;

const Caption = styled.p`
  margin:.75rem 0 0;font-size:.9rem;
`;

const Wrap = styled.div`
  overflow:hidden;height:1.2em;margin:.5rem 0 0;
`;
const List = styled.ul.attrs(p=>({$len:p.$len}))`
  list-style:none;margin:0;padding:0;
  display:inline-block;width:100%;text-align:center;
  animation:scroll ${({$len})=>$len*4}s linear infinite;
  @keyframes scroll{to{transform:translateY(-50%);}}
  li{height:1.2em;}
`;

/*════════ component ═══════════════════════════════════════*/
export default function OperationOverlay(props){
  const {
    mode='', status='', progress:progressProp=0, error,
    kt1, opHash, contractAddr,
    /* either pair accepted ↓ */
    current, step,
    total=1,
    onRetry=()=>{}, onCancel=()=>{},
  } = props;

  /* unify step/current naming */
  const cur = Number.isFinite(current) ? current
            : Number.isFinite(step)    ? step
            : 1;

  /* progress bar auto-calc when not supplied */
  const prog = progressProp || (total>0 ? (cur-1)/total : 0);

  const [gifOk,setGifOk] = useState(true);
  const panelRef = useRef(null);
  useWheelTunnel(panelRef);

  /* shuffled fun lines */
  const lines = useMemo(()=>{
    const a=[...FUN_LINES];
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a.concat(a);
  },[]);

  /*──────── success ───*/
  if (kt1 || opHash) {
    const linkBtn = (href,txt)=>(
      <PixelButton as="a" href={href} target="_blank" rel="noopener noreferrer">
        {txt}
      </PixelButton>
    );
    return (
      <Back>
        <CanvasFireworks active />
        <Panel>
          <Bar $p={1}/>
          <h2 style={{margin:'1rem 0 .5rem'}}>Success!</h2>

          {kt1 && <Addy>{kt1}</Addy>}
          {opHash && (
            <Addy style={{display:'flex',gap:6,justifyContent:'center'}}>
              {opHash}
              <a
                href={`${URL_TZKT_OP_BASE}${opHash}`}
                target="_blank" rel="noopener noreferrer"
                title="View on TzKT"
                style={{textDecoration:'none'}}
              >🔗</a>
            </Addy>
          )}

          <div style={{display:'flex',flexWrap:'wrap',gap:'1rem',
                       justifyContent:'center',marginTop:'1rem'}}>
            {kt1 && (
              <>
                {linkBtn(`${URL_BCD_BASE}${kt1}`,'BCD')}
                {linkBtn(`${URL_OBJKT_BASE}${kt1}`,'objkt')}
                <PixelButton as="a" href={`/manage?addr=${kt1}`}>Manage</PixelButton>
              </>
            )}
            <PixelButton onClick={()=>{
              navigator.clipboard.writeText(kt1||opHash);
            }}>Copy</PixelButton>
            <PixelButton onClick={()=>{
              onCancel(); onRetry();
            }}>Close</PixelButton>
          </div>
        </Panel>
      </Back>
    );
  }

  /* progress / error branch */
  const caption = error ? status : (status||'Preparing request…');
  const walletHint = /wallet/i.test(caption)&&!error;
  const showSig = total>1 && !error;

  return (
    <Back>
      <CanvasFireworks active={!!(kt1||opHash)}/>
      <Panel ref={panelRef}>
        <Bar $p={prog}/>
        {gifOk
          ? <Gif src="/sprites/loading48x48.gif" alt="loading" onError={()=>setGifOk(false)}/>
          : <Ring />}
        {showSig && (
          <h3 style={{margin:'.25rem 0 .4rem',fontSize:'1rem'}}>
            Signature {cur} of {total}
          </h3>
        )}

        {error && <h2 style={{color:'var(--zu-accent-sec)'}}>Error</h2>}
        <Caption>{caption}</Caption>

        {walletHint && (
          <p style={{fontSize:'.8rem',opacity:.8,marginTop:4}}>
            Wallet pop-up opening.<br/>
            <strong>Review total fees</strong> then sign.<br/>
            Confirmation may take a while.
          </p>
        )}

        {error && total>1 && (
          <p style={{ fontSize:'.8rem', opacity:.8, marginTop:4 }}>
            Already-confirmed slices won't be resent on retry.
          </p>
        )}

        {!error && (
          <Wrap>
            <List $len={lines.length}>
              {lines.map((l,i)=><li key={i}>{l}</li>)}
            </List>
          </Wrap>
        )}

        <div style={{display:'flex',gap:'1rem',justifyContent:'center',marginTop:'1rem'}}>
          {error
            ? (<>
                <PixelButton onClick={onRetry}>Retry</PixelButton>
                <PixelButton onClick={onCancel}>Close</PixelButton>
              </>)
            : <PixelButton onClick={onCancel}>Cancel</PixelButton>}
        </div>
      </Panel>
    </Back>
  );
}
/* EOF */
