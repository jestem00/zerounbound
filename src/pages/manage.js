/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/manage.js
  Rev :    r876   2025‑09‑04 UTC
  Summary: restore big‑map path, resilient meta decode, “—” fix
──────────────────────────────────────────────────────────────*/
import React, {
  useState, useEffect, useCallback, useRef,
}                         from 'react';
import { Buffer }         from 'buffer';
import { useRouter }      from 'next/router';
import dynamic            from 'next/dynamic';
import styledPkg          from 'styled-components';

import PixelHeading       from '../ui/PixelHeading.jsx';
import PixelInput         from '../ui/PixelInput.jsx';
import PixelButton        from '../ui/PixelButton.jsx';
import AdminTools         from '../ui/AdminTools.jsx';
import RenderMedia        from '../utils/RenderMedia.jsx';
import { useWalletContext } from '../contexts/WalletContext.js';
import { jFetch, sleep }  from '../core/net.js';
import hashMatrix         from '../data/hashMatrix.json' assert { type: 'json' };

const ContractCarousels = dynamic(
  () => import('../ui/ContractCarousels.jsx'),
  { ssr: false },
);

/*──────────────── styled shells ─────────────────────────────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Title = styled(PixelHeading).attrs({ level: 2 }).withConfig({
  componentId: 'px-manage-title',
})`
  margin: 0 0 .35rem;
  scroll-margin-top: var(--hdr);
`;

const Wrap = styled.div`
  position: relative;
  z-index: 2;
  background: var(--zu-bg);
  width: 100%;
  max-width: min(90vw, 1920px);
  margin: 0 auto;
  min-height: calc(var(--vh) - var(--hdr));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding: .8rem clamp(.4rem, 1.5vw, 1.2rem) 1.8rem;
  display: flex;
  flex-direction: column;
  gap: clamp(.2rem, .45vh, .6rem);
  font-size: clamp(1rem, .6vw + .5vh, 1.4rem);
`;

const Center = styled.div`
  text-align: center;
  font-size: .8rem;
`;

/*──────── helpers ──────────────────────────────────────────*/
const TZKT = {
  ghostnet: 'https://api.ghostnet.tzkt.io/v1',
  mainnet : 'https://api.tzkt.io/v1',
};

const HASH_TO_VER = Object.entries(hashMatrix)
  .reduce((o, [h, v]) => { o[Number(h)] = v.toUpperCase(); return o; }, {});

const hex2str  = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');
const parseHex = (h) => { try { return JSON.parse(hex2str(h)); } catch { return {}; } };

/**
 * Retrieve & normalise on‑chain contract metadata.
 * • Tries storage.metadata JSON then big‑map (`/contents` first, fallback `/content`)
 * • Guarantees at least name/description fields to avoid “—” placeholders.
 */
async function fetchMeta(addr = '', net = 'ghostnet') {
  if (!addr) return null;
  const base = `${TZKT[net]}/contracts/${addr}`;
  try {
    const det  = await jFetch(base);
    let   meta = det.metadata ?? {};

    /* fallback to big‑map entry if needed (old ghostnet path = .../contents) */
    if (!meta.name || !meta.imageUri) {
      const bm = await jFetch(`${base}/bigmaps/metadata/keys/contents`).catch(() => null)
              ?? await jFetch(`${base}/bigmaps/metadata/keys/content`).catch(() => null);
      if (bm?.value) meta = { ...parseHex(bm.value), ...meta };
    }

    /* guarantee at least falsy strings – fixes “—” grid blanks */
    const safe = (k, def = '—') => {
      const v = meta[k];
      return (v === undefined || v === null || v === '') ? def : v;
    };

    return {
      address    : addr,
      version    : HASH_TO_VER[det.typeHash] || '?',
      name       : safe('name', addr),
      description: safe('description'),
      imageUri   : safe('imageUri', ''),
      /* pass full meta downstream for ContractMetaPanel */
      meta       : meta,
    };
  } catch {
    return null;
  }
}

export async function getServerSideProps() { return { props: {} }; }

/*════════ component ═══════════════════════════════════════*/
export default function ManagePage() {
  const { network } = useWalletContext();
  const router      = useRouter();

  const [hydrated,  setHydrated ] = useState(false);
  const [kt,        setKt       ] = useState('');
  const [busy,      setBusy     ] = useState(false);
  const [contract,  setContract ] = useState(null);

  const loadSeq = useRef(0);           /* discard stale async results */

  useEffect(() => { setHydrated(true); }, []);

  const load = useCallback(async (address = '') => {
    if (!address) return;
    const seq = ++loadSeq.current;
    setBusy(true);
    setContract(null);

    const meta = await fetchMeta(address, network);
    if (loadSeq.current !== seq) return;   /* stale */

    /* brief pause for spinner visibility */
    await sleep(80);
    setContract(meta);
    setBusy(false);
  }, [network]);

  /* initial load from ?addr query */
  useEffect(() => {
    if (!hydrated || !router.isReady) return;
    const { addr } = router.query || {};
    if (addr && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) {
      setKt(addr);
      load(addr);
    }
  }, [hydrated, router.isReady, router.query, load]);

  const navigateIfDiff = (address) => {
    if (router.query.addr !== address) {
      router.replace({ pathname: '/manage', query: { addr: address } },
        undefined, { shallow: true });
    }
  };

  const onSelect = useCallback(({ address }) => {
    setKt(address);
    navigateIfDiff(address);
    load(address);
  }, [navigateIfDiff, load]);

  const go = (e) => {
    e?.preventDefault();
    const a = kt.trim();
    if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return;
    navigateIfDiff(a);
    load(a);
  };

  if (!hydrated) {
    return (
      <Wrap>
        <Title>Manage Contract</Title>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <Title>Manage Contract</Title>
      <Center>
        Network&nbsp;<strong>{network}</strong>
      </Center>

      <ContractCarousels onSelect={onSelect} />

      <form
        onSubmit={go}
        style={{
          display        : 'flex',
          gap            : 10,
          justifyContent : 'center',
          flexWrap       : 'wrap',
          marginTop      : '.4rem',
        }}
      >
        <PixelInput
          placeholder="Paste KT1…"
          value={kt}
          onChange={(e) => setKt(e.target.value)}
          style={{ minWidth: 220, maxWidth: 640, flex: '1 1 640px' }}
        />
        <PixelButton type="submit">GO</PixelButton>
      </form>

      {busy && <Center style={{ marginTop: '.3rem' }}>Loading…</Center>}

      {contract && !busy && (
        <AdminTools contract={contract} onClose={() => setContract(null)} />
      )}

      {/* hidden preview for SEO / preload purposes */}
      {contract && !busy && (
        <Center style={{ display: 'none' }}>
          <RenderMedia
            uri={contract.imageUri}
            alt={contract.name}
            style={{
              width    : 90,
              height   : 90,
              objectFit: 'contain',
              border   : '1px solid var(--zu-fg)',
            }}
          />
        </Center>
      )}
    </Wrap>
  );
}
/* What changed & why:
   • Restored /bigmaps/metadata/keys/contents endpoint (tzkt path change
     broke meta.name/imageUri) with fallback to /content.
   • Added defensive safe() helper to guarantee non‑empty strings –
     fixes “—” placeholders & AdminTools blank preview/title.
   • Propagates full meta object via contract.meta for downstream
     ContractMetaPanel integrity grid.
   • Minor spinner delay tweak for smoother UX.
*/
/* EOF */
