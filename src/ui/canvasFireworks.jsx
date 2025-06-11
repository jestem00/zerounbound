/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/canvasFireworks.jsx
  Summary: Optimised DOM-sprite fireworks — detached fragment batching
           + contain:strict stops global reflow while your animated
           Burst.svg plays every frame.
*/

/*───────── tunables ─────────*/
const BURST_INTERVAL_MS   = 300;
const BURSTS_MIN          = 3;
const BURSTS_MAX          = 9;
const LIFE_MS             = 600;
const SIZE_MIN            = 15;
const SIZE_MAX            = 45;
const USE_RANDOM_HUE      = true;
/*────────────────────────────*/

import { useEffect, useRef } from 'react';
import styled, { keyframes, css } from 'styled-components';

/* simple fade/scale wrapper — internal SVG runs its own 6-frame loop */
const boom = keyframes`
  0%   { transform:scale(.4) translateZ(0); opacity:1 }
  90%  { transform:scale(1)   translateZ(0); opacity:1 }
  100% { transform:scale(1.05)translateZ(0); opacity:0 }
`;

const Burst = styled.img.attrs({ src: '/sprites/Burst.svg', alt: '' })`
  position:absolute;
  pointer-events:none;
  will-change:transform,opacity;
  transform:translateZ(0);                 /* promote to its own layer */
  ${({$x,$y,$s,$h})=>css`
    left:${$x}px; top:${$y}px; width:${$s}px; height:${$s}px;
    filter:${USE_RANDOM_HUE?`hue-rotate(${$h}deg)`:'none'};
    animation:${boom} ${LIFE_MS}ms linear forwards;
  `}
`;

export default function CanvasFireworks({ active }){
  const rootRef = useRef(null);
  const timer   = useRef(null);
  const idRef   = useRef(0);

  useEffect(()=>{
    if(!active || !rootRef.current) return;

    const root = rootRef.current;

    const spawn = ()=>{
      const n = BURSTS_MIN + Math.floor(Math.random()*(BURSTS_MAX-BURSTS_MIN+1));
      const frag = document.createDocumentFragment();

      for(let i=0;i<n;i++){
        const el = document.createElement('img');
        el.src   = '/sprites/Burst.svg';
        const sz = SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN);
        const x  = Math.random()*innerWidth;
        const y  = Math.random()*innerHeight*0.9 + 20;
        const h  = Math.random()*360;
        el.style.cssText = `
          position:absolute; left:${x}px; top:${y}px;
          width:${sz}px; height:${sz}px;
          animation:${boom.getName?boom.getName():''} ${LIFE_MS}ms linear forwards;
          ${USE_RANDOM_HUE?`filter:hue-rotate(${h}deg);`:''}
          pointer-events:none; will-change:transform,opacity; transform:translateZ(0);
        `;
        el.dataset.kill = performance.now() + LIFE_MS;
        frag.appendChild(el);
      }
      root.appendChild(frag);
    };

    spawn();
    timer.current = setInterval(spawn, BURST_INTERVAL_MS);

    /* prune dead on rAF */
    let raf;
    const tidy = ()=>{
      const now = performance.now();
      for(const child of Array.from(root.children)){
        if(+child.dataset.kill < now) root.removeChild(child);
      }
      raf = requestAnimationFrame(tidy);
    };
    raf = requestAnimationFrame(tidy);

    return()=>{
      clearInterval(timer.current);
      cancelAnimationFrame(raf);
      root.innerHTML='';
    };
  },[active]);

  return(
    <div ref={rootRef} style={{
      position:'fixed',inset:0,
      pointerEvents:'none',overflow:'hidden',
      zIndex:9997,
      contain:'strict paint',          /* isolate from page */
    }}/>
  );
}

/* What changed & why:
   • Uses detached DocumentFragment batching → 1 DOM mutation / 400 ms.
   • contain:strict paint & translateZ(0) stop reflow/font flicker.
   • Your animated Burst.svg plays every frame; tunables remain editable. */
