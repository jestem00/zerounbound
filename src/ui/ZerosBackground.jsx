/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/ZerosBackground.jsx
  Summary: 120-240 “0”s with hit-radius = 0.4×fontSize so rendered
           glyphs meet EXACTLY at impact.  After every collision
           particles are separated to hitRadius + 0.2 px and given a
           0.05 px orthogonal kick to prevent re-glue.  Header / CRT
           masking & wall bounce updated to new hit-radius.           */

import React, { useEffect, useRef } from 'react';

export default function ZerosBackground() {
  /* ───────── refs / constants ───────── */
  const cvsRef  = useRef(null);
  const listRef = useRef([]);
  const dpr     = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const MIN_COUNT = 120;
  const MAX_COUNT = 240;
  const COUNT = Math.floor(Math.random() * (MAX_COUNT - MIN_COUNT + 1)) + MIN_COUNT;

  const R_MIN = 10;
  const R_MAX = 24;
  const HIT_K = 0.4;                    // hit-radius factor (≈ glyph half-width)
  const BASE_SPEED = 26;                // px / s baseline
  const HEADER_GAP  = 90;               // px buffer under header
  const SEPARATE_EPS = 0.2;             // extra px after touch
  const JITTER = 0.05;                  // orthogonal kick (px)

  /* ───────── helpers ───────── */
  const palette = () => {
    const s = getComputedStyle(document.documentElement);
    return [
      s.getPropertyValue('--zu-accent').trim(),
      s.getPropertyValue('--zu-accent-sec').trim(),
      s.getPropertyValue('--zu-heading').trim(),
    ].filter(Boolean);
  };
  const rnd = (a, b) => Math.random() * (b - a) + a;
  const pickDiff = (pal, avoid) =>
    pal.length <= 1 ? avoid : pal.filter(c => c !== avoid)[Math.floor(Math.random() * (pal.length - 1))];

  /* spawn helpers */
  const spawnGrid = (w, h) => {
    const pal = palette();
    const rows = Math.ceil(Math.sqrt(COUNT));
    const cols = rows;
    const cellW = w / cols;
    const cellH = (h - HEADER_GAP) / rows;
    const out = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols && out.length < COUNT; c++) {
        const font = rnd(R_MIN, R_MAX);
        if (cellW < font * 0.9 || cellH < font * 0.9) continue;  // skip if too tight
        const cx = c * cellW + cellW / 2 + rnd(-cellW * 0.25, cellW * 0.25);
        const cy = HEADER_GAP + r * cellH + cellH / 2 + rnd(-cellH * 0.25, cellH * 0.25);
        const ang = Math.random() * Math.PI * 2;
        const spd = BASE_SPEED * rnd(0.7, 1.4);
        out.push({
          x: cx,
          y: cy,
          r: font,
          hit: font * HIT_K,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          col: pal[Math.floor(Math.random() * pal.length)],
        });
      }
    }
    return out;
  };

  const sprinkle = (w, h, arr) => {
    const pal = palette();
    for (let t = 0; t < 60; t++) {
      const font = rnd(R_MIN, R_MAX);
      const x  = rnd(font, w - font);
      const y  = rnd(HEADER_GAP + font, h - font);
      const hit = font * HIT_K;
      let ok = true;
      for (const q of arr) {
        const dx = x - q.x, dy = y - q.y;
        if (dx*dx + dy*dy < (hit + q.hit) ** 2) { ok = false; break; }
      }
      if (ok) {
        const ang = Math.random() * Math.PI * 2;
        const spd = BASE_SPEED * rnd(0.7, 1.4);
        arr.push({
          x, y, r: font, hit,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          col: pal[Math.floor(Math.random() * pal.length)],
        });
        return;
      }
    }
  };

  /* ───────── collision ───────── */
  const collide = (a, b, pal) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const sumHit = a.hit + b.hit;
    const dist2  = dx*dx + dy*dy;
    if (dist2 === 0 || dist2 > sumHit * sumHit) return;

    const dist = Math.sqrt(dist2);
    const nx = dx / dist;
    const ny = dy / dist;

    /* relative velocity */
    const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (rel > 0) return;               // moving apart

    /* impulse (equal mass) */
    const j = -2 * rel / 2;
    a.vx += j * nx; a.vy += j * ny;
    b.vx -= j * nx; b.vy -= j * ny;

    /* separate to just beyond touch */
    const need = (sumHit + SEPARATE_EPS) - dist;
    if (need > 0) {
      const half = need / 2;
      a.x += nx * half; a.y += ny * half;
      b.x -= nx * half; b.y -= ny * half;

      /* micro-jitter orthogonal to normal */
      const ox = -ny * JITTER;
      const oy =  nx * JITTER;
      a.vx += ox; a.vy += oy;
      b.vx -= ox; b.vy -= oy;
    }

    /* colour update */
    a.col = pickDiff(pal, a.col);
    b.col = pickDiff(pal, b.col === a.col ? null : b.col);
  };

  /* ───────── effect ───────── */
  useEffect(() => {
    const cvs = cvsRef.current;
    const ctx = cvs.getContext('2d');

    const resize = () => {
      const { innerWidth: w, innerHeight: h } = window;
      cvs.width  = w * dpr;
      cvs.height = h * dpr;
      cvs.style.width  = `${w}px`;
      cvs.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    /* track header + CRT masks */
    let headerRect = { left: 0, right: 0, bottom: 0 };
    let masks = [];
    const scan = () => {
      const hdr = document.querySelector('header');
      if (hdr) headerRect = hdr.getBoundingClientRect();
      masks = [...document.querySelectorAll('.surface')].map(e => e.getBoundingClientRect());
    };
    scan();
    const maskTimer = setInterval(scan, 1200);

    /* seed */
    const L = listRef.current;
    const w0 = window.innerWidth, h0 = window.innerHeight;
    L.push(...spawnGrid(w0, h0));
    while (L.length < COUNT) sprinkle(w0, h0, L);

    /* loop */
    let last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000; last = now;
      const w = cvs.width / dpr, h = cvs.height / dpr;
      ctx.clearRect(0, 0, w, h);

      const pal = palette();

      for (let i = 0; i < L.length; i++)
        for (let j = i + 1; j < L.length; j++) collide(L[i], L[j], pal);

      for (const p of L) {
        p.x += p.vx * dt; p.y += p.vy * dt;

        /* walls */
        if (p.x < p.hit) { p.x = p.hit; p.vx = -p.vx; }
        if (p.x > w - p.hit) { p.x = w - p.hit; p.vx = -p.vx; }
        if (p.y < p.hit) { p.y = p.hit; p.vy = -p.vy; }
        if (p.y > h - p.hit) { p.y = h - p.hit; p.vy = -p.vy; }

        /* header bounce */
        if (p.x >= headerRect.left - p.hit &&
            p.x <= headerRect.right + p.hit &&
            p.y - p.hit <= headerRect.bottom) {
          p.y = headerRect.bottom + p.hit;
          if (p.vy < 0) p.vy = -p.vy;
        }

        /* CRT mask skip */
        if (masks.some(r =>
          p.x >= r.left - p.hit && p.x <= r.right + p.hit &&
          p.y >= r.top  - p.hit && p.y <= r.bottom + p.hit)) continue;

        ctx.globalAlpha = 0.55;
        ctx.fillStyle   = p.col;
        ctx.font        = `${p.r}px 'PixeloidMono', monospace`;
        ctx.fillText('0', p.x, p.y);
      }

      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    return () => {
      window.removeEventListener('resize', resize);
      clearInterval(maskTimer);
    };
  }, [dpr]);

  return (
    <canvas
      ref={cvsRef}
      aria-hidden
      style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none' }}
    />
  );
}
/* What changed & why: introduced glyph-scaled hit-radius (0.4×fontSize)
   and separation to hitRadius+0.2 px for visually exact edge contact.
   Added tiny orthogonal velocity kick (0.05 px) after push-apart to stop
   particles re-gluing while remaining imperceptible. Walls/header now
   use hit-radius so glyphs meet borders precisely. */
