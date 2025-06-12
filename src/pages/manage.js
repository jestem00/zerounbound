/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/manage.js
  Rev :    r652   2025-06-19
  Summary: Next.js mode-clash hot-fix
           • Removes any implicit SSG by declaring a
             no-op getServerSideProps()
           • Resolves “cannot mix SSG with GSSP” runtime error
           • All UI / logic untouched
──────────────────────────────────────────────────────────────*/

import React, { useState, useEffect, useCallback } from 'react';
import { Buffer }      from 'buffer';
import { useRouter }   from 'next/router';
import dynamic         from 'next/dynamic';
import styledPkg       from 'styled-components';

import PixelHeading    from '../ui/PixelHeading.jsx';
import PixelInput      from '../ui/PixelInput.jsx';
import PixelButton     from '../ui/PixelButton.jsx';
import AdminTools      from '../ui/AdminTools.jsx';
import RenderMedia     from '../utils/RenderMedia.jsx';
import { useWalletContext } from '../contexts/WalletContext.js';
import { jFetch, sleep }    from '../core/net.js';
import hashMatrix      from '../data/hashMatrix.json' assert { type:'json' };

const ContractCarousels = dynamic(
  () => import('../ui/ContractCarousels.jsx'),
  { ssr: false },
);

/*──────── styled shells ────────────────────────────────────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap = styled.div.attrs({ className: 'surface' })`
  position: relative; z-index: 2;
  width: 100%; max-width: 980px;
  margin: 2rem auto; padding: 0 0.8rem;
  background: var(--zu-bg);
  @media(max-width:480px){
    margin-top: 1.2rem;
    padding: 0 0.6rem;
  }
`;
const Center = styled.div`text-align:center;`;

/*──────── helpers ──────────────────────────────────────────*/
const TZKT = {
  ghostnet: 'https://api.ghostnet.tzkt.io/v1',
  mainnet : 'https://api.tzkt.io/v1',
};
const HASH_TO_VER = Object.entries(hashMatrix)
  .reduce((o, [h, v]) => { o[Number(h)] = v.toUpperCase(); return o; }, {});

const hex2str  = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');
const parseHex = (h) => { try { return JSON.parse(hex2str(h)); } catch { return {}; } };

async function fetchMeta(addr = '', net = 'ghostnet') {
  const base = `${TZKT[net]}/contracts/${addr}`;
  try {
    const det  = await jFetch(base);
    let  meta  = det.metadata || {};
    if (!meta.name || !meta.imageUri) {
      const bm = await jFetch(`${base}/bigmaps/metadata/keys/content`).catch(() => null);
      if (bm?.value) meta = { ...parseHex(bm.value), ...meta };
    }
    return {
      address    : addr,
      version    : HASH_TO_VER[det.typeHash] || '?',
      name       : meta.name || addr,
      description: meta.description || '—',
      imageUri   : meta.imageUri || '',
    };
  } catch {
    return null;
  }
}

/*──────── SSR fence — disables any accidental SSG mix ──────*/
export async function getServerSideProps() {
  return { props: {} };      /* noop, but tells Next we are GSSP-only */
}

/*════════ component ════════════════════════════════════════*/
export default function ManagePage() {
  const { network } = useWalletContext();
  const router      = useRouter();

  /* hydration gate (avoid SSR mismatch) */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  const [kt, setKt]             = useState('');
  const [busy, setBusy]         = useState(false);
  const [contract, setContract] = useState(null);

  /*──────── helpers ───────────────────────────────────────*/
  const load = useCallback(async (address) => {
    setBusy(true); setContract(null);
    const meta = await fetchMeta(address, network);
    await sleep(100);          // tiny UX grace
    setContract(meta);
    setBusy(false);
  }, [network]);

  /* deep-link ?addr=… */
  useEffect(() => {
    if (!hydrated || !router.isReady) return;
    const { addr } = router.query || {};
    if (addr && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) {
      setKt(addr); load(addr);
    }
  }, [hydrated, router.isReady, router.query, load]);

  /* safe router.replace (no redundant nav) */
  const navigateIfDiff = (address) => {
    if (router.query.addr !== address) {
      router.replace(
        { pathname: '/manage', query: { addr: address } },
        undefined,
        { shallow: true },
      );
    }
  };

  /* carousel → loader */
  const onSelect = useCallback(({ address }) => {
    setKt(address);
    navigateIfDiff(address);
    load(address);
  }, [navigateIfDiff, load]);

  /* manual GO */
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
        <PixelHeading level={2}>Manage Contract</PixelHeading>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <PixelHeading level={2}>Manage Contract</PixelHeading>
      <p style={{ fontSize: '.75rem', textAlign: 'center', margin: '0 0 1rem' }}>
        Network&nbsp;<strong>{network}</strong>
      </p>

      <ContractCarousels onSelect={onSelect} />

      <form
        onSubmit={go}
        style={{
          display: 'flex', gap: 10, justifyContent: 'center',
          flexWrap: 'wrap', marginTop: '1.2rem',
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

      {busy && <Center style={{ margin: '1.3rem 0' }}>Loading…</Center>}

      {contract && !busy && (
        <AdminTools contract={contract} onClose={() => setContract(null)} />
      )}

      {/* tiny preview hidden on ≤600 px */}
      {contract && !busy && (
        <Center style={{ marginTop: '1rem', display: 'none' }}>
          <RenderMedia
            uri={contract.imageUri}
            alt={contract.name}
            style={{
              width: 90, height: 90, objectFit: 'contain',
              border: '1px solid var(--zu-fg)',
            }}
          />
        </Center>
      )}
    </Wrap>
  );
}

/* What changed & why:
   • Added explicit getServerSideProps() returning empty props.
     This disables Next.js static-generation hooks for /manage,
     eliminating the fatal “SSG + GSSP mix” runtime error.
   • All client-side behaviour and styling untouched. */
/* EOF */
