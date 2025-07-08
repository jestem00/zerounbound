/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/TokenPreviewWindow.jsx
  Rev :    r101   2025‑10‑04
  Summary: fetch metadata locally → preview works; minor polish
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useRef, useState,
}                           from 'react';
import { createPortal }     from 'react-dom';
import styledPkg            from 'styled-components';
import PixelButton          from '../PixelButton.jsx';
import TokenMetaPanel       from '../TokenMetaPanel.jsx';
import { jFetch }           from '../../core/net.js';
import { TZKT_API }         from '../../config/deployTarget.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──── shells ────*/
const Backdrop = styled.div`
  position:fixed;inset:0;pointer-events:none;z-index:7000;
`;
const Panel = styled.div`
  position:absolute;top:${(p)=>p.top}px;left:${(p)=>p.left}px;
  background:#0b0b0b;border:2px solid #bebebe;
  box-shadow:0 0 0 2px #000,0 0 12px #000;
  width:300px;max-height:80vh;overflow:auto;color:#f0f0f0;
  font-family:var(--font-pixel);pointer-events:auto;
`;
const Head = styled.div`
  background:#222;padding:.4rem .5rem;cursor:move;display:flex;
  justify-content:space-between;align-items:center;
`;
const Title = styled.span`font-size:.85rem;`;
const Body  = styled.div`padding:1rem;`;

/*──── component ────*/
export default function TokenPreviewWindow({
  tokenId        = '',
  contractAddress= '',
  onClose        = () => {},
}) {
  const startPos = { x: 60 + Math.random()*30, y: 60 + Math.random()*30 };
  const [pos,  setPos ] = useState({ left:startPos.x, top:startPos.y });
  const [meta, setMeta] = useState(null);

  /* fetch metadata (so preview isn’t stuck on spinner) */
  const loadMeta = useCallback(async () => {
    setMeta(null);
    if (!contractAddress || tokenId === '') return;
    const [row] = await jFetch(
      `${TZKT_API}/v1/tokens?contract=${contractAddress}&tokenId=${tokenId}&limit=1`,
    ).catch(() => []);
    setMeta(row?.metadata || {});
  }, [contractAddress, tokenId]);
  useEffect(() => { void loadMeta(); }, [loadMeta]);

  /* drag */
  const ref  = useRef(null);
  const down = useRef(null);
  const handleDown = (e) => {
    down.current = { x:e.clientX, y:e.clientY, ...pos };
    e.preventDefault();
  };
  const handleMove = useCallback((e) => {
    if (!down.current) return;
    const dx = e.clientX - down.current.x;
    const dy = e.clientY - down.current.y;
    setPos({ left: down.current.left + dx, top: down.current.top + dy });
  }, [pos]);
  const clear = () => { down.current = null; };
  useEffect(() => {
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', clear);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', clear);
    };
  }, [handleMove]);

  const body = (
    <Backdrop>
      <Panel ref={ref} left={pos.left} top={pos.top}>
        <Head onMouseDown={handleDown}>
          <Title>Token&nbsp;#{tokenId}</Title>
          <PixelButton onClick={onClose}>✖</PixelButton>
        </Head>
        <Body>
          <TokenMetaPanel
            meta={meta}
            tokenId={tokenId}
            contractAddress={contractAddress}
          />
        </Body>
      </Panel>
    </Backdrop>
  );

  return typeof document === 'undefined'
    ? body
    : createPortal(body, document.body);
}
/* EOF */
