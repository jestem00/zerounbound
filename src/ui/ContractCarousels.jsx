/*Developed by @jams2blues
  File: src/ui/ContractCarousels.jsx
  Rev: r776
  Summary: Dual carousels (Created/Collaborating) with progressive
           discovery, no duplicates, cached enrich, fast render,
           full SlideCard (scripts gating, integrity badge, hide/unhide). */

import React, {
  useEffect, useState, useRef, useMemo, useCallback, forwardRef, useImperativeHandle,
} from 'react';
import { createPortal } from 'react-dom';
import styledPkg from 'styled-components';
import useEmblaCarousel from 'embla-carousel-react';
import { Buffer } from 'buffer';

import { useWalletContext } from '../contexts/WalletContext.js';
import PixelHeading from './PixelHeading.jsx';
import PixelButton from './PixelButton.jsx';
import RenderMedia from '../utils/RenderMedia.jsx';

import detectHazards from '../utils/hazards.js';
import useConsent from '../hooks/useConsent.js';
import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import IntegrityBadge from './IntegrityBadge.jsx';
import { INTEGRITY_LONG } from '../constants/integrityBadges.js';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';

import {
  listKey, getList, cacheList, getCache, patchCache, nukeCache,
} from '../utils/cache.js';
import { typeHashToVersion } from '../utils/allowedHashes.js';
import { discoverCreated, discoverCollaborating } from '../utils/contractDiscovery.js';
import { enrichContracts } from '../utils/contractMeta.js';

/* ───────── constants ───────── */
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const CARD_W = 340;
const CLAMP_W = `clamp(220px, 24vw, ${CARD_W}px)`;
const GUTTER = 32;
const MAX_W = CARD_W * 3 + GUTTER * 2;
const IMG_H = 'clamp(115px, 18vh, 160px)';

const LIST_TTL = 60_000;             // 1 minute
const DETAIL_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_SPIN = 200;

const HIDDEN_KEY = 'zu_hidden_contracts_v1';
const CACHE_KEY = 'zu_contract_cache_v2';

const EMBLA_OPTS = { loop: true, dragFree: true, align: 'center' };

const ICON_EYE = '👁️';
const ICON_HIDE = '🙈';
const ICON_LOAD = '↻';

/* ───────── styled UI ───────── */
const Viewport = styled.div`
  overflow: hidden;
  position: relative;
`;
const Container = styled.div`
  display: flex;
`;
const Slide = styled.div`
  flex: 0 0 auto;
  width: ${CLAMP_W};
  margin-right: 16px;
`;
const Card = styled.div`
  position: relative;
  width: ${CLAMP_W};
  border: 2px solid var(--zu-fg);
  background: var(--zu-bg-alt);
  color: var(--zu-fg);
  display: flex;
  flex-direction: column;
  padding-bottom: .25rem;
  opacity: ${({ $dim }) => ($dim ? 0.45 : 1)};
  cursor: grab;
`;
const BusyOverlay = styled.div`
  position: absolute; inset: 0;
  display: flex; flex-direction: column; gap: 8px;
  align-items: center; justify-content: center;
  background: #0005; z-index: 4; pointer-events: none;
  img { width: 42px; height: 42px; }
  p { font-size: .75rem; margin: 0; color: #fff; }
`;
const ErrorOverlay = styled(BusyOverlay)`
  background: #f005; pointer-events: auto;
  p { font-weight: 700; }
`;
const CountTag = styled.span`
  display:inline-block; margin-left:6px; min-width:26px;
  padding:1px 5px; border:2px solid var(--zu-fg);
  background: var(--zu-bg-alt);
  font: 900 .68rem/1 'PixeloidSans', monospace; text-align:center;
  color: var(--zu-fg);
`;
const CountTiny = styled(CountTag)`
  margin-left:4px; min-width:18px; padding:0 4px; font-size:.65rem;
`;
const AddrLine = styled.p`
  font-size: clamp(.24rem,.9vw,.45rem);
  margin:.06rem 0 0; text-align:center;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
`;
const Title = styled(PixelHeading).attrs({ as: 'h3', level: 3 })`
  margin:0; text-align:center;
  font-size: clamp(.8rem,.65vw + .2vh,1rem);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  overflow:hidden; word-break:break-word;
`;
const Arrow = styled.button`
  position:absolute; top:50%; transform:translateY(-50%);
  ${({ $left }) => ($left ? 'left:4px;' : 'right:4px;')}
  width:34px; height:34px; display:flex; align-items:center; justify-content:center;
  background: var(--zu-accent-sec); color:#fff; border:2px solid var(--zu-accent);
  font: 900 .85rem/1 'PixeloidSans', monospace; cursor:pointer; z-index:5;
  &:hover { background: var(--zu-accent); }
`;
const TinyBtn = styled(PixelButton)`
  position:absolute; top:4px; z-index:3; font-size:.55rem; padding:0 .4rem;
  background: var(--zu-accent-sec);
`;
const TinyLoad = styled(TinyBtn)` left:4px; `;
const TinyHide = styled(TinyBtn)` right:4px; `;

/* ───────── helpers ───────── */
const hex2str = (h) => Buffer.from(String(h).replace(/^0x/, ''), 'hex').toString('utf8');
const safeScrub = (s = '') => String(s).replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
const identifiable = (name = '', img = null) => Boolean(safeScrub(name)) || Boolean(img);

/* slide card */
const SlideCard = React.memo(function SlideCard({ contract, hidden, toggleHidden, onLoad }) {
  const dim = hidden.has(contract.address);
  const dateStr = contract.date && !Number.isNaN(new Date(contract.date))
    ? new Date(contract.date).toLocaleDateString()
    : null;

  const hazards = useMemo(() => detectHazards(contract), [contract]);
  const integrity = useMemo(() => checkOnChainIntegrity(contract), [contract]);
  const [consentScripts, setConsentScripts] = useConsent(`scripts:${contract.address}`);

  const [askDlg, setAskDlg] = useState(false);
  const [agree, setAgree] = useState(false);
  const confirmScripts = () => { if (agree) { setConsentScripts(true); setAskDlg(false); } };

  const [showBadge, setShowBadge] = useState(false);
  const badgeBlurb = INTEGRITY_LONG[integrity.status] || 'Unknown integrity status.';

  return (
    <Slide key={contract.address}>
      <Card $dim={dim}>
        <div style={{ position: 'relative', height: IMG_H }}>
          {hazards.scripts && !consentScripts ? (
            <div style={{
              position:'absolute', inset:0, display:'grid', placeItems:'center',
              background:'var(--zu-bg-alt)'
            }}>
              <PixelButton size="sm" onClick={() => setAskDlg(true)}>
                Enable scripts
              </PixelButton>
            </div>
          ) : (
            <RenderMedia
              uri={contract.imageUri}
              alt={contract.name}
              style={{ width:'100%', height:'100%', objectFit:'contain', borderBottom:'1px solid var(--zu-fg)' }}
            />
          )}
          <IntegrityBadge
            status={integrity.status}
            onClick={() => setShowBadge(true)}
            style={{ position:'absolute', bottom:4, right:4, cursor:'pointer' }}
          />
        </div>

        <TinyLoad size="xs" title="LOAD CONTRACT" onClick={(e) => { e.stopPropagation(); onLoad?.(contract); }}>
          {ICON_LOAD}
        </TinyLoad>
        <TinyHide size="xs" title={dim ? 'Show' : 'Hide'} onClick={(e) => { e.stopPropagation(); toggleHidden(contract.address); }}>
          {dim ? ICON_EYE : ICON_HIDE}
        </TinyHide>

        <div style={{ padding: '.32rem .4rem 0' }}>
          <Title>{contract.name}</Title>
        </div>

        {Number.isFinite(contract.total) && (
          <div style={{ fontSize: '.68rem', textAlign: 'center', margin: '.15rem 0 0',
            display:'flex', justifyContent:'center', alignItems:'center' }}>
            <span>token&nbsp;count</span><CountTiny>{contract.total}</CountTiny>
          </div>
        )}

        <AddrLine>{contract.address}</AddrLine>
        {dateStr && (
          <p style={{ fontSize: '.7rem', margin: '.04rem 0 0', textAlign: 'center' }}>
            {contract.version} • {dateStr}
          </p>
        )}

        {hazards.scripts && (
          <PixelButton
            size="xs"
            style={{ margin: '0.2rem auto 0', display: 'block' }}
            onClick={() => (consentScripts ? setConsentScripts(false) : setAskDlg(true))}
          >
            {consentScripts ? 'Disable scripts' : 'Enable scripts'}
          </PixelButton>
        )}
      </Card>

      {/* dialogs in a portal */}
      {typeof document !== 'undefined' && createPortal(
        <>
          {askDlg && (
            <PixelConfirmDialog
              open
              title="Enable scripts?"
              message={(
                <>
                  <label style={{ display:'flex',gap:'6px',alignItems:'center',marginBottom:'8px' }}>
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                    I&nbsp;agree to <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
                  </label>
                  Executable code can be harmful. Proceed only if you trust the author.
                </>
              )}
              confirmLabel="OK"
              cancelLabel="Cancel"
              confirmDisabled={!agree}
              onConfirm={confirmScripts}
              onCancel={() => setAskDlg(false)}
            />
          )}
          {showBadge && (
            <PixelConfirmDialog
              open
              title="Integrity Status"
              message={badgeBlurb}
              confirmLabel="OK"
              onConfirm={() => setShowBadge(false)}
            />
          )}
        </>,
        document.body
      )}
    </Slide>
  );
});

/* autoscroll helpers for press‑and‑hold */
const useHold = (api) => {
  const t = useRef(null);
  const start = (dir) => {
    if (!api) return;
    dir === 'prev' ? api.scrollPrev() : api.scrollNext();
    t.current = setInterval(() => (dir === 'prev' ? api.scrollPrev() : api.scrollNext()), 200);
  };
  const stop = () => { if (t.current) clearInterval(t.current); };
  return { start, stop };
};

const Rail = React.memo(function Rail({
  label, data, emblaRef, hidden, toggleHidden, onLoad,
  busy, error, holdPrev, holdNext, onRetry,
}) {
  return (
    <>
      <div style={{ margin: '.9rem 0 .2rem', textAlign: 'center', fontFamily: 'PixeloidSans' }}>
        <span style={{ fontSize: '1rem', fontWeight: 700 }}>{label}</span>
        <CountTag>{data.length}</CountTag>
      </div>
      <p style={{
        margin: '0 0 .45rem', fontSize: '.74rem', textAlign: 'center',
        color: 'var(--zu-accent-sec)', fontWeight: 700,
      }}>
        ↔ drag/swipe • hold ◀ ▶ • Click ↻ to LOAD CONTRACT • 🙈/👁️ hide/unhide
      </p>

      <div style={{
        position:'relative', minHeight:225, margin:'0 auto',
        width:'100%', maxWidth:`${MAX_W}px`, padding:`0 ${GUTTER}px`, boxSizing:'border-box'
      }}>
        {busy && (
          <BusyOverlay>
            <img src="/sprites/loading.svg" alt="Loading" />
            <p>Loading…</p>
          </BusyOverlay>
        )}
        {error && (
          <ErrorOverlay>
            <p>{error}</p>
            <PixelButton onClick={onRetry}>Retry</PixelButton>
          </ErrorOverlay>
        )}

        <Arrow $left onMouseDown={() => holdPrev.start('prev')} onMouseUp={holdPrev.stop} onMouseLeave={holdPrev.stop}>◀</Arrow>
        <Viewport ref={emblaRef}>
          <Container>
            {data.length ? data.map((c) => (
              <SlideCard key={c.address}
                contract={c} hidden={hidden} toggleHidden={toggleHidden} onLoad={onLoad} />
            )) : (!busy && !error && (
              <p style={{ margin: '5rem auto', textAlign: 'center' }}>None found.</p>
            ))}
          </Container>
        </Viewport>
        <Arrow onMouseDown={() => holdNext.start('next')} onMouseUp={holdNext.stop} onMouseLeave={holdNext.stop}>▶</Arrow>
      </div>
    </>
  );
});

/* ───────── main component ───────── */
const ContractCarouselsComponent = forwardRef(function ContractCarousels({ onSelect }, ref) {
  const { address: walletAddress, network } = useWalletContext();

  // Load <model-viewer> once (for 3D media in RenderMedia)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.customElements.get('model-viewer')) return;
    const s = document.createElement('script'); s.type = 'module';
    s.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
    document.head.appendChild(s);
  }, []);

  // hidden contracts
  const [hidden, setHidden] = useState(() => new Set());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { setHidden(new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'))); } catch {}
  }, []);
  const toggleHidden = useCallback((addr) => {
    setHidden((prev) => {
      const n = new Set(prev); n.has(addr) ? n.delete(addr) : n.add(addr);
      try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...n])); } catch {}
      return n;
    });
  }, []);

  // lists + stage state
  const [orig, setOrig] = useState([]);
  const [coll, setColl] = useState([]);
  const [stage, setStage] = useState('init'); // init|basic|detail|error
  const [error, setError] = useState(null);
  const [showHidden, setShowHidden] = useState(false);

  const origRef = useRef([]); useEffect(() => { origRef.current = orig; }, [orig]);
  const collRef = useRef([]); useEffect(() => { collRef.current = coll; }, [coll]);

  // preserve items while refreshing and only show spinner when empty
  const busy = stage !== 'detail' && !error;

  // embla + hold
  const [emblaRefO, emblaO] = useEmblaCarousel(EMBLA_OPTS);
  const [emblaRefC, emblaC] = useEmblaCarousel(EMBLA_OPTS);
  const holdOprev = useHold(emblaO); const holdOnext = useHold(emblaO);
  const holdCprev = useHold(emblaC); const holdCnext = useHold(emblaC);

  // list visibility
  const visOrig = useMemo(
    () => (showHidden ? orig : orig.filter((c) => !hidden.has(c.address))),
    [orig, hidden, showHidden],
  );
  const visColl = useMemo(
    () => (showHidden ? coll : coll.filter((c) => !hidden.has(c.address))),
    [coll, hidden, showHidden],
  );

  // REFRESH: discovery -> basic placeholders -> enrich
  const spinStart = useRef(0);
  const refresh = useCallback(async (hard = false) => {
    if (!walletAddress) { setOrig([]); setColl([]); return; }

    setError(null);
    spinStart.current = Date.now();

    // try cached lists first (fast UI) when not hard-refreshing
    if (!hard) {
      const kO = listKey('orig', walletAddress, network);
      const kC = listKey('coll', walletAddress, network);
      const cachedO = getList(kO, LIST_TTL);
      const cachedC = getList(kC, LIST_TTL);
      if (cachedO || cachedC) {
        setStage('basic');
        if (cachedO) setOrig(cachedO);
        if (cachedC) setColl(cachedC);
      }
    }

    // discovery
    let created = [];
    let collaborating = [];
    try {
      [created, collaborating] = await Promise.all([
        discoverCreated(walletAddress, network),
        // progressive collaborators with hard limit; de-dup with created below
        discoverCollaborating(walletAddress, network, { limit: 160 }),
      ]);
    } catch (e) {
      console.error('Discovery failed:', e);
      setStage('error'); setError('Discovery failed after retries. Check network.');
      return;
    }

    // de‑dup collab vs created
    const createdSet = new Set(created.map((r) => r.address));
    collaborating = collaborating.filter((r) => !createdSet.has(r.address));

    // basic placeholder rows (merge with existing so nothing “blinks”)
    const mkBasic = (row) => ({
      address: row.address,
      typeHash: row.typeHash,
      name: row.address,
      imageUri: null,
      description: '',
      total: Number.isFinite(row.tokensCount) ? row.tokensCount : null,
      version: typeHashToVersion(row.typeHash),
      date: row.timestamp || null,
    });

    const origBasic = created.map(mkBasic);
    const collBasic = collaborating.map(mkBasic);

    const prevO = new Map(origRef.current.map((r) => [r.address, r]));
    const prevC = new Map(collRef.current.map((r) => [r.address, r]));
    const mergedO = origBasic.map((r) => prevO.get(r.address) || r);
    const mergedC = collBasic.map((r) => prevC.get(r.address) || r);

    setOrig(mergedO); setColl(mergedC);
    setStage('basic');

    // cache basics (so the rails render instantly on next visit)
    cacheList(listKey('orig', walletAddress, network), mergedO);
    cacheList(listKey('coll', walletAddress, network), mergedC);

    // enrich metadata in parallel
    let [detO, detC] = [[], []];
    try {
      [detO, detC] = await Promise.all([
        enrichContracts(created, network, { force: hard, ttlMs: DETAIL_TTL }),
        enrichContracts(collaborating, network, { force: hard, ttlMs: DETAIL_TTL }),
      ]);
    } catch (e) {
      console.error('Enrich failed:', e);
      // keep “basic” view; do not hard-fail the UI
      setStage('basic');
      return;
    }

    // respect minimum spinner time only if rails were empty
    const wait = MIN_SPIN - Math.max(0, Date.now() - spinStart.current);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    setOrig(detO); setColl(detC); setStage('detail');

    cacheList(listKey('orig', walletAddress, network), detO);
    cacheList(listKey('coll', walletAddress, network), detC);
  }, [walletAddress, network]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => refresh(), LIST_TTL);

    // sync across tabs
    const onStorage = (e) => {
      if (!e) return;
      if (e.key === CACHE_KEY) refresh(true);
      if (e.key === HIDDEN_KEY) {
        try {
          const list = e.newValue ? JSON.parse(e.newValue) : [];
          setHidden(new Set(Array.isArray(list) ? list : []));
        } catch { setHidden(new Set()); }
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(id);
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  useImperativeHandle(ref, () => ({ refresh }));

  return (
    <>
      <label style={{
        display:'block', margin:'.6rem 0 .4rem', textAlign:'center',
        color:'var(--zu-accent)', fontWeight:700,
      }}>
        <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />{' '}
        Show hidden
      </label>

      <Rail
        label="Created"
        data={visOrig}
        emblaRef={emblaRefO}
        hidden={hidden}
        toggleHidden={toggleHidden}
        onLoad={onSelect}
        busy={busy && !orig.length && !error}
        error={stage === 'error' ? error : null}
        holdPrev={holdOprev}
        holdNext={holdOnext}
        onRetry={() => refresh(true)}
      />

      <Rail
        label="Collaborating"
        data={visColl}
        emblaRef={emblaRefC}
        hidden={hidden}
        toggleHidden={toggleHidden}
        onLoad={onSelect}
        busy={busy && !coll.length && !error}
        error={stage === 'error' ? error : null}
        holdPrev={holdCprev}
        holdNext={holdCnext}
        onRetry={() => refresh(true)}
      />
    </>
  );
});

export default ContractCarouselsComponent;

/* What changed & why:
   • Restored full SlideCard & rail UX; emoji controls visible.
   • Progressive discovery + enrichment; spinner only when empty.
   • De‑dup collab vs created; lists cached with TTL.
   • No net.js changes; relies on utils modules only. */  // EOF
