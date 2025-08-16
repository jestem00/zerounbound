/*Developed by @jams2blues
  File: src/ui/TokenListingCard.jsx
  Rev:  r1232
  Summary: Attach .preview-1x1; no-crop fit; precise video-controls hit-test; remove stray prop. */

import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
} from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';

import PixelButton from './PixelButton.jsx';
import useConsent from '../hooks/useConsent.js';
import detectHazards from '../utils/hazards.js';
import { EnableScriptsToggle } from './EnableScripts.jsx';
import RenderMedia from '../utils/RenderMedia.jsx';
import BuyDialog from './BuyDialog.jsx';
import FullscreenModal from './FullscreenModal.jsx';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';
import { shortKt, shortAddr as _shortAddr } from '../utils/formatAddress.js';

import { useWalletContext } from '../contexts/WalletContext.js';
import { fetchLowestListing } from '../core/marketplace.js';
import decodeHexFields from '../utils/decodeHexFields.js';
import { NETWORK_KEY } from '../config/deployTarget.js';
import { tzktBase as tzktV1Base } from '../utils/tzkt.js';
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Card = styled.article`
  position: relative;
  width: 100%;
  border: 2px solid var(--zu-accent, #00c8ff);
  background: var(--zu-bg, #000);
  color: var(--zu-fg, #fff);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: box-shadow .15s, transform .05s;
  &:hover { box-shadow: 0 0 6px var(--zu-accent-sec,#ff0); }
  &:active { transform: translateY(1px); }
`;

const Thumb = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 1/1;            /* strict 1:1 */
  background: var(--zu-bg-dim, #111);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  outline: none;
  &:focus-visible { box-shadow: inset 0 0 0 3px rgba(0,200,255,.45); }
`;

const FSBtn = styled(PixelButton)`
  position: absolute;
  bottom: 4px;
  right: 4px;
  opacity: .45;
  z-index: 7; /* keep above tile click layer */
  &:hover { opacity: 1; }
`;

const Meta = styled.section`
  border-top: 2px solid var(--zu-accent, #00c8ff);
  background: var(--zu-bg-alt, #171717);
  padding: 8px;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    "title price"
    "creators creators"
    "collection collection"
    "buy buy"
    "scripts scripts";
  gap: 6px 8px;

  h4 {
    grid-area: title;
    margin: 0;
    font-size: .85rem;
    line-height: 1.15;
    font-family:'Pixeloid Sans',monospace;
  }
`;

const Price = styled.div`
  grid-area: price;
  align-self: start;
  font-family:'Pixeloid Sans',monospace;
  font-size: 1rem;
  line-height: 1;
  white-space: nowrap;
`;

const Creators = styled.p`
  grid-area: creators;
  margin: 0;
  font-size: .7rem;
  opacity: .9;
  word-break: break-word;
`;

const Collection = styled.p`
  grid-area: collection;
  margin: 0;
  font-size: .7rem;
  opacity: .85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  a { color: var(--zu-accent-sec,#6ff); text-decoration: none; }
`;

const BuyRow = styled.div` grid-area: buy; `;
const ScriptsRow = styled.div` grid-area: scripts; `;

/*──────── utilities ───────────────*/
const pickDataUri = (m = {}) => {
  if (!m || typeof m !== 'object') return '';
  const keys = [
    'displayUri','display_uri',
    'imageUri','image_uri','image',
    'thumbnailUri','thumbnail_uri',
    'artifactUri','artifact_uri',
    'mediaUri','media_uri',
  ];
  for (const k of keys) {
    const v = m[k];
    if (typeof v === 'string' && /^data:(image|video|audio|text\/html|image\/svg\+xml)/i.test(v.trim())) {
      return v.trim();
    }
  }
  if (Array.isArray(m.formats)) {
    for (const f of m.formats) {
      const cand = f?.uri || f?.url;
      if (typeof cand === 'string' && /^data:(image|video|audio|text\/html|image\/svg\+xml)/i.test(cand.trim())) {
        return cand.trim();
      }
    }
  }
  return '';
};
const PLACEHOLDER = '/sprites/cover_default.svg';
function toArray(src) {
  if (Array.isArray(src)) return src;
  if (typeof src === 'string') {
    try { const j = JSON.parse(src); return Array.isArray(j) ? j : [src]; }
    catch { return [src]; }
  }
  if (src && typeof src === 'object') return Object.values(src);
  return [];
}

/*──────── component ───────────────*/
export default function TokenListingCard({
  contract,
  tokenId,
  priceMutez,
  metadata: metadataProp,
  contractName,
}) {
  const [meta, setMeta] = useState(metadataProp || null);
  const [, setLoading] = useState(!metadataProp);

  const { address: walletAddr, toolkit } = useWalletContext() || {};
  const tzktV1 = useMemo(() => {
    const net = (toolkit && toolkit._network?.type && /mainnet/i.test(toolkit._network.type))
      ? 'mainnet'
      : (NETWORK_KEY || 'ghostnet');
    return tzktV1Base(net);
  }, [toolkit]);

  /* market polling */
  const [lowest, setLowest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  /* consent */
  const [allowNSFW, setAllowNSFW] = useConsent('nsfw', false);
  const [allowFlash, setAllowFlash] = useConsent('flash', false);
  const scriptKey = useMemo(() => `scripts:${contract}:${tokenId}`, [contract, tokenId]);
  const [allowScr, setAllowScr] = useConsent(scriptKey, false);
  const [fsOpen, setFsOpen] = useState(false);
  const [cfrmScr, setCfrmScr] = useState(false);
  const [scrTerms, setScrTerms] = useState(false);
  const askEnableScripts = useCallback(() => { setScrTerms(false); setCfrmScr(true); }, []);
  const confirmScripts   = useCallback(() => { if (scrTerms) { setAllowScr(true); setCfrmScr(false); } }, [scrTerms, setAllowScr]);

  /* fetch metadata (when not provided) */
  useEffect(() => {
    let canceled = false;
    if (metadataProp) { setMeta(metadataProp); setLoading(false); return () => {}; }
    (async () => {
      setLoading(true);
      try {
        const url = `${tzktV1}/tokens?contract=${contract}&tokenId=${tokenId}&select=metadata,name`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (!canceled && Array.isArray(data) && data.length > 0) {
            let md = data[0].metadata || {};
            try { md = decodeHexFields(md); } catch { /* best effort */ }
            if (data[0].name && !md.name) md.name = data[0].name;
            setMeta(md);
          }
        }
      } catch { /* ignore */ }
      if (!canceled) setLoading(false);
    })();
    return () => { canceled = true; };
  }, [contract, tokenId, tzktV1, metadataProp]);

  /* computed flags */
  const imageUri = useMemo(() => pickDataUri(meta) || PLACEHOLDER, [meta]);
  const hazards = useMemo(() => (meta ? detectHazards(meta) : { nsfw:false, flashing:false, scripts:false }), [meta]);
  const needsNSFW = hazards.nsfw && !allowNSFW;
  const needsFlash = hazards.flashing && !allowFlash;
  const blocked = needsNSFW || needsFlash;

  const artifactDataUri = useMemo(() => {
    const keys = ['artifactUri','artifact_uri','mediaUri','media_uri'];
    for (const k of keys) {
      const u = meta?.[k];
      if (typeof u === 'string' && /^data:/i.test(u.trim())) return u.trim();
    }
    return '';
  }, [meta]);
  const fsUri = useMemo(
    () => ((hazards.scripts && allowScr && artifactDataUri) ? artifactDataUri : imageUri),
    [hazards.scripts, allowScr, artifactDataUri, imageUri],
  );

  useEffect(() => {
    let stop = false;
    async function run() {
      if (!toolkit) return;
      setBusy(true);
      try {
        let res = null;
        try { res = await fetchLowestListing({ toolkit, nftContract: contract, tokenId }); }
        catch { /* fall through */ }
        if (!res) {
          try { res = await fetchLowestListing(toolkit, { nftContract: contract, tokenId }); }
          catch { /* ignore */ }
        }
        if (!stop) setLowest(res || null);
      } finally { if (!stop) setBusy(false); }
    }
    run();
    const t = setInterval(run, 15_000);
    return () => { stop = true; clearInterval(t); };
  }, [toolkit, contract, tokenId]);

  const isSeller = useMemo(() => {
    if (!walletAddr || !lowest?.seller) return false;
    return String(walletAddr).toLowerCase() === String(lowest.seller).toLowerCase();
  }, [walletAddr, lowest]);

  const effectiveMutez = (typeof priceMutez === 'number' ? priceMutez : lowest?.priceMutez);
  const priceXTZ = useMemo(() => {
    if (effectiveMutez == null) return null;
    return (effectiveMutez / 1_000_000).toLocaleString(undefined, {
      minimumFractionDigits: 6, maximumFractionDigits: 6,
    });
  }, [effectiveMutez]);

  const cardBuyDisabled = !toolkit || !lowest || lowest.priceMutez == null || isSeller;
  const title = meta?.name || `Token #${tokenId}`;
  const tokenHref = `/tokens/${contract}/${tokenId}`;

  /* creators/authors (domain‑aware) */
  const creators = useMemo(() => {
    const raw = toArray(meta?.creators);
    return raw.length ? raw : toArray(meta?.authors || meta?.artists);
  }, [meta]);
  const [domains, setDomains] = useState({});
  useEffect(() => {
    const set = new Set();
    creators.forEach((v) => {
      const s = typeof v === 'string' ? v : (v?.address || v?.wallet || '');
      if (/^tz/i.test(String(s))) set.add(String(s));
    });
    set.forEach((addr) => {
      const key = addr.toLowerCase();
      if (domains[key] !== undefined) return;
      resolveTezosDomain(addr, NETWORK_KEY).then((name) => {
        setDomains((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: name }));
      });
    });
  }, [creators, domains]);
  const fmtCreator = useCallback((v) => {
    const s = typeof v === 'string' ? v : (v?.address || v?.wallet || '');
    const key = String(s || '').toLowerCase();
    const dom = domains[key];
    if (dom) return dom;
    if (!/^(tz|kt)/i.test(String(s))) return String(v);
    return _shortAddr(String(s));
  }, [domains]);

  /* navigation: let native video controls work; click elsewhere navigates */
  const goDetail = useCallback(() => { window.location.href = tokenHref; }, [tokenHref]);
  const onKey = (e) => { if (e.key === 'Enter') goDetail(); };
  const isMediaControlsHit = (e) => {
    const v = e.target?.closest?.('video, audio');
    if (!v) return false;
    const r = v.getBoundingClientRect?.(); if (!r) return true;
    const band = Math.max(34, Math.min(64, r.height * 0.22));   // heuristic control band
    const yFromBottom = r.bottom - (e.clientY ?? 0);
    return yFromBottom <= band;
  };
  const onThumbClick = (e) => { if (!isMediaControlsHit(e)) goDetail(); };

  /*──────── render ───────────────*/
  return (
    <Card>
      {/* clickable 1:1 tile; media fits without cropping */}
      <Thumb className="preview-1x1" role="link" tabIndex={0} aria-label={`View ${title}`} onClick={onThumbClick} onKeyDown={onKey}>
        {!blocked ? (
          imageUri && imageUri !== PLACEHOLDER ? (
            <RenderMedia
              uri={imageUri}
              mime={meta?.mimeType}
              allowScripts={hazards.scripts && allowScr}
              onInvalid={() => { /* keep placeholder under */ }}
              /* Down‑scale only, center; prefer contain (avoid crop) */
              style={{ display:'block', width:'auto', height:'auto', maxWidth:'100%', maxHeight:'100%', objectFit:'contain', objectPosition:'center' }}
            />
          ) : (
            <img src={PLACEHOLDER} alt="" style={{ width:'60%', opacity:.45 }} />
          )
        ) : (
          <div style={{
            position:'absolute', inset:0, display:'flex', alignItems:'center',
            justifyContent:'center', gap:'6px', padding:'0 8px', flexDirection:'column',
          }}>
            {needsNSFW && (
              <PixelButton size="sm" warning onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAllowNSFW(true); }}>
                NSFW&nbsp;🔞
              </PixelButton>
            )}
            {needsFlash && (
              <PixelButton size="sm" warning onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAllowFlash(true); }}>
                Flashing&nbsp;🚨
              </PixelButton>
            )}
          </div>
        )}

        <FSBtn
          size="xs"
          disabled={!(!hazards.scripts || allowScr)}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); (!hazards.scripts || allowScr) ? setFsOpen(true) : askEnableScripts(); }}
          title={(!hazards.scripts || allowScr) ? 'Fullscreen' : 'Enable scripts first'}
        >
          ⛶
        </FSBtn>
      </Thumb>

      <Meta>
        <h4 title={title}>{title}</h4>
        <Price>{priceXTZ ? `${priceXTZ} ꜩ` : (busy ? '…' : '—')}</Price>

        {creators.length > 0 && (
          <Creators>
            Creator(s):{' '}
            {creators.map((c, i) => {
              const s = typeof c === 'string' ? c : (c?.address || c?.wallet || '');
              const content = fmtCreator(c);
              const pref = i ? ', ' : '';
              return /^(tz|kt)/i.test(String(s))
                ? <span key={`${String(s)}_${i}`}>{pref}<a href={`/explore?cmd=tokens&admin=${s}`} style={{ color: 'var(--zu-accent-sec,#6ff)', textDecoration: 'none' }}>{content}</a></span>
                : <span key={`${String(content)}_${i}`}>{pref}{content}</span>;
            })}
          </Creators>
        )}

        <Collection>
          Collection:&nbsp;
          <a href={`/contracts/${contract}`}>{contractName || shortKt(contract)}</a>
        </Collection>

        <BuyRow>
          <PixelButton
            size="xs"
            disabled={cardBuyDisabled}
            onClick={() => setBuyOpen(true)}
            title={
              isSeller
                ? 'You cannot buy your own listing'
                : lowest && lowest.priceMutez != null
                  ? `Buy for ${(lowest.priceMutez / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ꜩ`
                  : (busy ? '…' : 'No active listing')
            }
          >
            BUY
          </PixelButton>
        </BuyRow>

        <ScriptsRow>
          {hazards.scripts && (
            <EnableScriptsToggle
              enabled={allowScr}
              onToggle={allowScr ? () => setAllowScr(false) : askEnableScripts}
            />
          )}
        </ScriptsRow>
      </Meta>

      {buyOpen && lowest && (
        <BuyDialog
          open
          onClose={() => setBuyOpen(false)}
          contract={contract}
          nftContract={contract}
          contractAddress={contract}
          tokenId={tokenId}
          priceMutez={lowest.priceMutez}
          seller={lowest.seller}
          nonce={lowest.nonce}
          listingNonce={lowest.nonce}
          amount={1}
          available={lowest.amount || 1}
          listing={{ seller: lowest.seller, priceMutez: lowest.priceMutez, nonce: lowest.nonce, amount: lowest.amount || 1 }}
          toolkit={toolkit}
        />
      )}

      <FullscreenModal
        open={fsOpen}
        onClose={() => setFsOpen(false)}
        uri={fsUri}
        mime={meta?.mimeType}
        allowScripts={hazards.scripts && allowScr}
        scriptHazard={hazards.scripts}
      />

      {cfrmScr && (
        <PixelConfirmDialog
          open
          title="Enable scripts?"
          message={(
            <>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                <input type="checkbox" checked={scrTerms} onChange={(e) => setScrTerms(e.target.checked)} />
                I&nbsp;agree&nbsp;to&nbsp;<a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </label>
              Executable HTML / JS can be harmful. Proceed only if you trust the author.
            </>
          )}
          confirmLabel="OK"
          cancelLabel="Cancel"
          confirmDisabled={!scrTerms}
          onConfirm={confirmScripts}
          onCancel={() => setCfrmScr(false)}
        />
      )}
    </Card>
  );
}

TokenListingCard.propTypes = {
  contract    : PropTypes.string.isRequired,
  tokenId     : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  priceMutez  : PropTypes.number,
  metadata    : PropTypes.object,
  contractName: PropTypes.string,
};
/* What changed & why (r1232):
   • Use .preview-1x1 to enforce square, no-crop fitting.
   • Respect native media controls while keeping tile clickable.
   • Removed stray isOpen prop to avoid leaking unknown props. */ /* EOF */
