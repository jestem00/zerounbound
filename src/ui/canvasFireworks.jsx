/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/canvasFireworks.jsx
  Rev :    r2    2025‑07‑27
  Summary: 60 fps tidy‑loop & pause on tab‑hide
──────────────────────────────────────────────────────────────*/
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
import { keyframes } from 'styled-components';

/* simple fade/scale wrapper — internal SVG runs its own 6‑frame loop */
const boom = keyframes`
  0%   { transform:scale(.4) translateZ(0); opacity:1 }
  90%  { transform:scale(1)   translateZ(0); opacity:1 }
  100% { transform:scale(1.05)translateZ(0); opacity:0 }
`;

export default function CanvasFireworks({ active }){
  const rootRef       = useRef(null);
  const intervalRef   = useRef(null);
  const rafRef        = useRef(null);

  /* util ─ spawn one burst block */
  const spawn = () => {
    const root = rootRef.current;
    if (!root) return;
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

  /* tidy @ native 60 fps rAF */
  const tidy = () => {
    const root = rootRef.current;
    if (!root) return;
    const now = performance.now();
    for(const child of Array.from(root.children)){
      if(+child.dataset.kill < now) root.removeChild(child);
    }
    rafRef.current = requestAnimationFrame(tidy);     /* 60 fps loop */
  };

  /* start / stop helpers */
  const start = () => {
    if (intervalRef.current || rafRef.current || document.hidden) return;
    spawn();                                         /* immediate burst */
    intervalRef.current = setInterval(spawn, BURST_INTERVAL_MS);
    rafRef.current      = requestAnimationFrame(tidy);
  };
  const stop = () => {
    clearInterval(intervalRef.current);
    cancelAnimationFrame(rafRef.current);
    intervalRef.current = null;
    rafRef.current      = null;
  };

  /* main effect */
  useEffect(()=>{
    if (!active) return;
    start();

    /* pause/resume on vis‑change */
    const vis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', vis);

    return ()=>{
      stop();
      document.removeEventListener('visibilitychange', vis);
      if (rootRef.current) rootRef.current.innerHTML='';
    };
  },[active]);

  return(
    <div ref={rootRef} style={{
      position:'fixed',inset:0,
      pointerEvents:'none',overflow:'hidden',
      zIndex:9997,
      contain:'strict paint',
    }}/>
  );
}
/* What changed & why:
   • Spawn/clean loops now halted when `document.hidden` to save CPU.  
   • rAF‑driven tidy capped naturally to 60 fps.  
   • Guarded start/stop functions prevent double‑intervals. */
/* EOF */
