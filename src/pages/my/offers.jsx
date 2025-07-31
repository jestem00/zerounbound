/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/offers.jsx
  Rev :    r22    2025‑07‑26 UTC
  Summary: enhance Tezos Domains reverse lookup by passing NETWORK_KEY to resolveTezosDomain() so Ghostnet addresses are resolved against the correct API; continue displaying .tez names or truncated addresses with copy button; retain responsive layout and all prior fixes.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState } from 'react';
import styledPkg                     from 'styled-components';
import { useWalletContext }          from '../../contexts/WalletContext.js';
import { TZKT_API, NETWORK_KEY }     from '../../config/deployTarget.js';
import ExploreNav                    from '../../ui/ExploreNav.jsx';
import PixelHeading                  from '../../ui/PixelHeading.jsx';
import PixelButton                   from '../../ui/PixelButton.jsx';
import OperationOverlay              from '../../ui/OperationOverlay.jsx';
import { getMarketContract }         from '../../core/marketplace.js';
import { Tzip16Module }              from '@taquito/tzip16';
// Import decodeHexFields and decodeHexJson to handle both hex‑encoded and JSON metadata
import decodeHexFields, { decodeHexJson } from '../../utils/decodeHexFields.js';
// Use the shared media renderer for consistent preview handling
import RenderMedia from '../../utils/RenderMedia.jsx';
// Consent and hazard detection helpers to respect NSFW/flashing flags
import useConsent                       from '../../hooks/useConsent.js';
import detectHazards                    from '../../utils/hazards.js';
// Tezos Domains resolver helper
import { resolveTezosDomain } from '../../utils/resolveTezosDomain.js';

/* ─── Marketplace contract addresses by network ───────────── */
const MARKET_CONTRACT = {
  ghostnet: 'KT1R1PzLhBXEd98ei72mFuz4FrUYEcuV7t1p',
  mainnet : 'KT1Pg8KjHptWXJgN79vCnuWnYUZF3gz9hUhu',
};

/* ─── Styled‑components helpers ────────────────────────────── */
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.6rem;
  font-size: 0.9rem;
  th, td {
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--zu-accent, #8f3ce1);
    text-align: left;
  }
  th { font-weight: bold; }
  tr:hover { background: rgba(255, 255, 255, 0.04); }
  /* Add a background colour so animated zeros don’t shine through */
  background: var(--zu-bg, #000);
  /* Ensure the table floats above animated backgrounds */
  position: relative;
  /* set a higher z-index than animated backgrounds to prevent bleed-through */
  z-index: 5;

  /*
   * Responsive layout: on narrow screens hide the table header and
   * display each row as a block with label/value pairs.  The
   * data-label attribute on each <td> supplies the label text.
   */
  @media (max-width: 640px) {
    /* Hide the header on small screens */
    thead {
      display: none;
    }
    /* Render each row as a block with its own border and spacing */
    tr {
      display: block;
      border: 1px solid var(--zu-accent, #8f3ce1);
      border-radius: 4px;
      margin-bottom: 0.8rem;
      overflow: hidden;
      background: var(--zu-bg, #000);
    }
    /* Disable row hover effect on mobile since rows are blocks */
    tr:hover {
      background: inherit;
    }
    /* Stack each cell vertically; label on the left, value on the right */
    td {
      display: flex;
      width: 100%;
      padding: 0.4rem 0.6rem;
      border-bottom: 1px solid var(--zu-accent, #8f3ce1);
      justify-content: space-between;
      align-items: center;
    }
    /* Remove bottom border on the last cell */
    td:last-child {
      border-bottom: none;
    }
    /* Prefix each value with its label using the data-label attribute */
    td:before {
      content: attr(data-label);
      font-weight: bold;
      color: var(--zu-fg, #fff);
      margin-right: 0.5rem;
    }
    /* For the action cell, stack the label and the button vertically */
    td[data-label="Action"] {
      flex-direction: column;
      align-items: flex-start;
    }
    /* Center the action button on mobile for better touchability */
    td[data-label="Action"] button,
    td[data-label="Action"] span {
      margin-top: 0.3rem;
    }
  }
`;

/* full list of metadata keys that may hold an image URI */
const THUMB_KEYS = [
  // order matters – match TokenCard’s pickDataUri() precedence
  'displayUri',   'display_uri',
  'imageUri',     'image',
  'thumbnailUri', 'thumbnail_uri',
  'artifactUri',  'artifact_uri',
  'mediaUri',     'media_uri',
];

/* pick the first viable on‑chain thumbnail URI.
 * Only data URIs are permitted per invariant I24. Remote resources
 * (ipfs:// or http://) are never dereferenced. */
function pickThumbUri(meta = {}) {
  // Check canonical preview keys for data URIs (case‑variant supported).
  for (const k of THUMB_KEYS) {
    const v = meta && typeof meta === 'object' ? meta[k] : undefined;
    if (typeof v === 'string') {
      const val = v.trim();
      if (val && /^data:/i.test(val)) return val;
    }
  }
  // Fallback: search formats array for data URIs
  if (meta && Array.isArray(meta.formats)) {
    for (const fmt of meta.formats) {
      if (fmt && typeof fmt === 'object') {
        const candidates = [];
        if (fmt.uri) candidates.push(String(fmt.uri));
        if (fmt.url) candidates.push(String(fmt.url));
        for (const cand of candidates) {
          const val = cand.trim();
          if (val && /^data:/i.test(val)) return val;
        }
      }
    }
  }
  return null;
}

// Fallback placeholder for when no valid data URI exists
const PLACEHOLDER = '/sprites/cover_default.svg';

/*
 * Extract the first embedded data URI from standard metadata keys.
 * Mirrors the logic used in TokenCard.jsx but supports both camelCase
 * and snake_case forms. Prefers displayUri/display_uri, then
 * imageUri/image_uri, then thumbnailUri/thumbnail_uri and finally
 * artifactUri/artifact_uri. Returns an empty string when none found.
 */
const pickDataUriLocal = (m = {}) => {
  const keys = [
    'displayUri', 'display_uri',
    'imageUri',   'image_uri',
    'thumbnailUri','thumbnail_uri',
    'artifactUri','artifact_uri',
  ];
  for (const k of keys) {
    const v = m && typeof m === 'object' ? m[k] : undefined;
    if (typeof v === 'string') {
      const val = v.trim();
      if (val && /^data:/i.test(val)) return val;
    }
  }
  return '';
};

/* ─── Component ────────────────────────────────────────────── */
export default function MyOffers() {
  const { address, toolkit } = useWalletContext() || {};
  const [tab, setTab]                       = useState('accept');
  const [offersToAccept, setOffersToAccept] = useState([]);
  const [myOffers, setMyOffers]             = useState([]);
  const [loading, setLoading]               = useState(false);
  const [previews, setPreviews]             = useState({});     // contract:tokenId → decoded metadata
  const [ov, setOv]                         = useState({ open: false, label: '' });

  // Cache of resolved domain names keyed by lowercased address.
  // Populated lazily via effect below. Null indicates no domain.
  const [domains, setDomains] = useState({});

  // NSFW / flashing consent flags. Default false means content is hidden until consent is granted.
  const [allowNSFW]  = useConsent('nsfw', false);
  const [allowFlash] = useConsent('flash', false);

  /* ── Fetch marketplace offers & listings ─────────────────── */
  async function fetchOffers() {
    if (!address) { setOffersToAccept([]); setMyOffers([]); return; }
    setLoading(true);

    try {
      const marketAddr = MARKET_CONTRACT[NETWORK_KEY] || MARKET_CONTRACT.ghostnet;

      /* Big‑map pointers */
      const maps      = await (await fetch(`${TZKT_API}/v1/bigmaps?contract=${marketAddr}`)).json();
      const offersMap   = maps.find(m => m.path === 'offers');
      const listingsMap = maps.find(m => m.path === 'listings');
      if (!offersMap) { console.warn('Offers map missing'); setLoading(false); return; }

      /* Pull all active offers */
      const allOffers = [];
      for (let offset = 0, limit = 1000;; offset += limit) {
        const chunk = await (await fetch(
          `${TZKT_API}/v1/bigmaps/${offersMap.ptr}/keys?active=true&offset=${offset}&limit=${limit}`
        )).json();
        allOffers.push(...chunk);
        if (chunk.length < limit) break;
      }

      const tokenSet = new Set(allOffers.map(e => `${e.key.address}:${Number(e.key.nat)}`));

      /* Attempt to enable off‑chain views once */
      let views = null;
      if (toolkit) {
        try { toolkit.addExtension(new Tzip16Module()); } catch (_) {/* idempotent */}
        try { views = await (await getMarketContract(toolkit)).tzip16().metadataViews(); } catch (_) {}
      }

      /* Helper: seller‑owned listing nonces via view */
      async function getSellerListingNoncesView(cAddr, tokenIdNum) {
        const out = [];
        if (!views?.get_listings_for_token) return out;
        try {
          const raw   = await views.get_listings_for_token().executeView(String(cAddr), Number(tokenIdNum));
          const iter  = raw?.entries ? raw.entries() : Object.entries(raw || {});
          for (const [lnStr, det] of iter) {
            const ln = Number(lnStr);
            if (det && det.seller?.toLowerCase() === address.toLowerCase() && det.active && Number(det.amount) > 0)
              out.push(ln);
          }
        } catch (_) {}
        return out;
      }

      /* Build fallback listing index from big‑map */
      const listingIndex = new Map();
      if (listingsMap) {
        for (let offset = 0, limit = 1000;; offset += limit) {
          const chunk = await (await fetch(
            `${TZKT_API}/v1/bigmaps/${listingsMap.ptr}/keys?active=true&offset=${offset}&limit=${limit}`
          )).json();
          chunk.forEach(entry => {
            const k = `${entry.key.address}:${Number(entry.key.nat)}`;
            const m = listingIndex.get(k) || new Map();
            Object.entries(entry.value || {}).forEach(([lnStr, det]) => {
              const ln = Number(lnStr);
              if (det && det.seller?.toLowerCase() === address.toLowerCase() && det.active && Number(det.amount) > 0)
                m.set(ln, det);
            });
            listingIndex.set(k, m);
          });
          if (chunk.length < limit) break;
        }
      }

      const acceptList = [];
      const mineList   = [];

      for (const idStr of tokenSet) {
        const [cAddr, tIdStr] = idStr.split(':');
        const tIdNum = Number(tIdStr);

        /* Gather offers for token */
        let offersForToken = [];
        let viewWorked = false;
        if (views?.get_offers_for_token) {
          try {
            const raw  = await views.get_offers_for_token().executeView(String(cAddr), tIdNum);
            const iter = raw?.entries ? raw.entries() : Object.entries(raw || {});
            for (const [offAddr, obj] of iter)
              if (!obj.accepted && Number(obj.amount) > 0)
                offersForToken.push({ offeror: offAddr, price: Number(obj.price), amount: Number(obj.amount), nonce: Number(obj.nonce) });
            viewWorked = offersForToken.length > 0;
          } catch (_) { viewWorked = false; }
        }
        if (!viewWorked) {
          allOffers
            .filter(e => e.key.address === cAddr && Number(e.key.nat) === tIdNum)
            .forEach(entry => {
              Object.entries(entry.value || {}).forEach(([offAddr, obj]) => {
                if (!obj.accepted && Number(obj.amount) > 0)
                  offersForToken.push({ offeror: offAddr, price: Number(obj.price), amount: Number(obj.amount), nonce: Number(obj.nonce) });
              });
            });
        }
        if (!offersForToken.length) continue;

        /* Seller listing nonces */
        let sellerNonces = await getSellerListingNoncesView(cAddr, tIdNum);
        if (!sellerNonces.length) {
          const m = listingIndex.get(idStr);
          if (m) sellerNonces = [...m.keys()];
        }
        if (sellerNonces.length > 1) sellerNonces.sort((a,b)=>b-a);

        offersForToken.forEach(off => {
          const row = {
            contract      : cAddr,
            tokenId       : tIdNum,
            offeror       : off.offeror,
            amount        : off.amount,
            priceMutez    : off.price,
            offerNonce    : off.nonce,
            listingNonces : [...sellerNonces],
            hasListing    : sellerNonces.length > 0,
          };
          (off.offeror.toLowerCase() === address.toLowerCase() ? mineList : acceptList).push(row);
        });
      }

      setOffersToAccept(acceptList);
      setMyOffers(mineList);
    } catch (err) {
      console.error('fetchOffers failed', err);
      setOffersToAccept([]); setMyOffers([]);   // graceful fallback
    } finally { setLoading(false); }
  }

  /* initial + reactive loads */
  useEffect(() => { fetchOffers(); }, [address]);
  useEffect(() => {
    const h = () => fetchOffers();
    window.addEventListener('zu:offersRefresh', h);
    return () => window.removeEventListener('zu:offersRefresh', h);
  }, []);

  /* Fetch previews lazily & decode metadata
   * Note: previews state is not a dependency so that this effect only runs
   * when the offers lists change.  Each token’s metadata is fetched once.
   */
  useEffect(() => {
    const idsNeeded = new Set(
      [...offersToAccept, ...myOffers].map(r => `${r.contract}:${r.tokenId}`),
    );
    idsNeeded.forEach(async idStr => {
      if (previews[idStr]) return;
      const [cAddr, tId] = idStr.split(':');
      try {
        /*
         * Attempt to fetch token metadata via the standard TzKT endpoint.  This
         * endpoint returns an array of token objects with a `metadata` field.  For
         * contracts using off‑chain views or storing metadata under the
         * token_metadata big‑map (v1–v3, v4a–v4d), this field may be empty or a
         * hex‑encoded JSON string.  We decode hex strings and parse JSON where
         * possible.  If no usable preview is found we fall back to the
         * token_metadata big‑map directly.
         */
        const url = `${TZKT_API}/v1/tokens?contract=${cAddr}&tokenId=${tId}&select=metadata`;
        const mdArr = await (await fetch(url)).json();
        const rawMeta = mdArr[0]?.metadata ?? {};
        let metaObj;
        if (typeof rawMeta === 'string') {
          // Try to decode hex‑encoded JSON first
          const dec = decodeHexJson(rawMeta);
          if (dec && typeof dec === 'object') {
            metaObj = dec;
          } else {
            // Fall back to plain JSON parsing
            try { metaObj = JSON.parse(rawMeta); }
            catch { metaObj = {}; }
          }
        } else {
          metaObj = rawMeta || {};
        }
        // Decode any hex‑encoded field values (recursive)
        let decoded = decodeHexFields(metaObj);
        // If no preview URI is present, attempt a fallback via big‑map
        let hasPreview = false;
        try {
          hasPreview = !!(pickDataUriLocal(decoded) || pickThumbUri(decoded));
        } catch { hasPreview = false; }
        if (!hasPreview) {
          try {
            // Fetch the token_metadata big‑map entry for this token
            const bmUrl = `${TZKT_API}/v1/contracts/${cAddr}/bigmaps/token_metadata/keys/${tId}`;
            const bmRes = await (await fetch(bmUrl)).json();
            const tokenInfo = bmRes?.value?.token_info || {};
            // Decode hex fields in token_info (values are hex‑encoded strings)
            const decodedTokenInfo = decodeHexFields(tokenInfo);
            // If the empty string key holds JSON metadata, parse and merge it
            let extra = {};
            const emptyVal = tokenInfo[''];
            if (typeof emptyVal === 'string' && emptyVal.trim()) {
              // decode hex → utf‑8 string
              const parsed = decodeHexJson(emptyVal);
              if (parsed && typeof parsed === 'object') {
                extra = decodeHexFields(parsed);
              } else {
                try {
                  extra = JSON.parse(decodedTokenInfo[''] || '');
                } catch { /* ignore */ }
              }
            }
            // Merge fallback metadata into the initially decoded object.
            decoded = { ...extra, ...decodedTokenInfo, ...decoded };
          } catch (bmErr) {
            // ignore bigmap errors silently; preview will remain unavailable
            console.warn('[MyOffers] bigmap metadata fetch failed for', idStr, bmErr);
          }
        }
        setPreviews(p => ({ ...p, [idStr]: decoded }));
      } catch (err) {
        console.error('[MyOffers] preview metadata fetch failed for', idStr, err);
        setPreviews(p => ({ ...p, [idStr]: {} }));
      }
    });
  }, [offersToAccept, myOffers]);

  /* Resolve Tezos domain names for offerors and contracts on demand.
   * This effect runs whenever the offers lists change. It collects all
   * distinct addresses (offerors and contract addresses) and triggers
   * reverse lookups for addresses that are not already in the domains
   * state. The domains state stores null to denote a negative result.
   */
  useEffect(() => {
    const addrSet = new Set();
    [...offersToAccept, ...myOffers].forEach(row => {
      if (row.offeror) addrSet.add(row.offeror.toLowerCase());
      if (row.contract) addrSet.add(row.contract.toLowerCase());
    });
    addrSet.forEach(addr => {
      if (domains[addr] !== undefined) return;
      // Launch asynchronous lookup; no await inside loop
      (async () => {
        const name = await resolveTezosDomain(addr, NETWORK_KEY);
        setDomains(prev => {
          // Avoid overwriting if already resolved by another invocation
          if (prev[addr] !== undefined) return prev;
          return { ...prev, [addr]: name };
        });
      })();
    });
  }, [offersToAccept, myOffers]);

  /* ── Helpers ─────────────────────────────────────────────── */
  const copyAddress = addr => {
    try { navigator.clipboard.writeText(addr); } catch {/* ignore */}
    window.dispatchEvent(new CustomEvent('zu:snackbar', {
      detail:{ message:'Contract copied', severity:'info' },
    }));
  };

  /* Accept offer */
  async function handleAccept(row) {
    if (!toolkit) return;
    if (!row.hasListing) {
      window.dispatchEvent(new CustomEvent('zu:snackbar', {
        detail:{ message:'List token first.', severity:'error' },
      }));
      return;
    }
    try {
      setOv({ open:true, label:'Accepting offer…' });
      const market = await getMarketContract(toolkit);

      const candidates = [...row.listingNonces].sort((a,b)=>b-a);
      if (!candidates.includes(row.offerNonce)) candidates.push(undefined);

      let success = false, lastErr = null;
      for (const cand of candidates) {
        const ln = cand !== undefined ? cand : row.offerNonce;
        try {
          const call = market.methodsObject.accept_offer({
            amount       : Number(row.amount),
            listing_nonce: Number(ln),
            nft_contract : row.contract,
            offeror      : row.offeror,
            token_id     : Number(row.tokenId),
          });
          const op = await toolkit.wallet.batch().withContractCall(call).send();
          await op.confirmation();
          success = true; break;
        } catch (err) {
          lastErr = err;
          if (String(err?.message||'').includes('Not listed')) continue;
          throw err;
        }
      }
      if (!success) throw lastErr || new Error('Offer not accepted');

      setOv({ open:false, label:'' });
      fetchOffers();
      window.dispatchEvent(new CustomEvent('zu:snackbar', {
        detail:{ message:'Offer accepted ✔', severity:'info' },
      }));
    } catch (err) {
      console.error('Accept failed', err);
      setOv({ open:false, label:'' });
      window.dispatchEvent(new CustomEvent('zu:snackbar', {
        detail:{ message:err?.message||'Tx failed', severity:'error' },
      }));
    }
  }

  /* Cancel offer */
  async function handleCancel(row) {
    if (!toolkit) return;
    try {
      setOv({ open:true, label:'Cancelling offer…' });
      const market = await getMarketContract(toolkit);
      const op = await toolkit.wallet.batch()
        .withContractCall(
          market.methodsObject.withdraw_offer({
            nft_contract: row.contract,
            token_id   : Number(row.tokenId),
          })
        )
        .send();
      await op.confirmation();
      setOv({ open:false, label:'' });
      fetchOffers();
      window.dispatchEvent(new CustomEvent('zu:snackbar', {
        detail:{ message:'Offer cancelled ✔', severity:'info' },
      }));
    } catch (err) {
      console.error('Cancel failed', err);
      setOv({ open:false, label:'' });
      window.dispatchEvent(new CustomEvent('zu:snackbar', {
        detail:{ message:err?.message||'Tx failed', severity:'error' },
      }));
    }
  }

  /* ── Render ──────────────────────────────────────────────── */
  const list = tab === 'accept' ? offersToAccept : myOffers;

  return (
    <div style={{ position:'relative', zIndex: 5 }}>
      {/*
        Root container positioned relative with high z-index so that
        animated backgrounds (ZerosBackground) never bleed through the
        offers table or its overlays. See invariants I47/I48.
      */}
      <ExploreNav hideSearch={false} />
      <PixelHeading level={3} style={{ marginTop:'1rem' }}>My Offers</PixelHeading>

      <div style={{ marginTop:'0.8rem', display:'flex', gap:'0.4rem' }}>
        <PixelButton warning={tab==='accept'} onClick={()=>setTab('accept')}>Offers to Accept</PixelButton>
        <PixelButton warning={tab==='mine'}   onClick={()=>setTab('mine')}>My Offers</PixelButton>
      </div>

      {loading && <p style={{ marginTop:'0.8rem' }}>Fetching offers…</p>}
      {!loading && list.length === 0 && (
        <p style={{ marginTop:'0.8rem' }}>
          {tab==='accept' ? 'There are no outstanding offers.' : 'You have not made any offers.'}
        </p>
      )}

      {!loading && list.length > 0 && (
        <Table>
          <thead>
            <tr>
              <th>Preview</th><th>Contract</th><th>Token ID</th>
              <th>Offeror</th><th>Amt</th><th>Price (ꜩ)</th>
              <th>Nonce</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(row => {
              const idStr    = `${row.contract}:${row.tokenId}`;
              const meta     = previews[idStr] || {};
              // Determine if preview should be hidden due to NSFW/flashing hazards and user consent
              const hazards  = detectHazards(meta);
              const blocked  = (hazards.nsfw && !allowNSFW) || (hazards.flashing && !allowFlash);
              // Select the best on-chain data-URI thumbnail (null when blocked or absent)
              const dataUriCandidate = pickDataUriLocal(meta);
              const thumbUri = blocked ? null
                : (dataUriCandidate || pickThumbUri(meta));
              // Debug: log when no thumbnail is available or blocked
              if (!thumbUri) {
                console.debug('[MyOffers] No preview for', idStr, 'hazards:', hazards, 'meta keys:', Object.keys(meta || {}));
              }
              return (
                <tr key={`${row.contract}:${row.tokenId}:${row.offerNonce}:${row.offeror}`}>
                  <td data-label="Preview" style={{ width:'40px' }}>
                    {thumbUri ? (
                      <RenderMedia
                        uri={thumbUri}
                        mime={meta.mimeType}
                        allowScripts={false}
                        style={{ width:32, height:32, objectFit:'cover' }}
                      />
                    ) : (
                      <img
                        src={PLACEHOLDER}
                        alt=""
                        style={{ width:32, height:32, opacity:.5 }}
                      />
                    )}
                  </td>
                  <td data-label="Contract">
                    <a
                      href={`/tokens/${row.contract}/${row.tokenId}`}
                      style={{ color:'var(--zu-accent)', textDecoration:'underline' }}
                    >
                      {row.contract.slice(0,6)}…{row.contract.slice(-4)}
                    </a>{' '}
                    <PixelButton size="xs" onClick={()=>copyAddress(row.contract)}>📋</PixelButton>
                  </td>
                  <td data-label="Token ID">{row.tokenId}</td>
                  <td data-label="Offeror">
                    {/* Display the resolved .tez domain if available, otherwise a truncated address */}
                    {(() => {
                      const addr      = row.offeror || '';
                      const norm      = addr.toLowerCase();
                      const domain    = domains[norm];
                      const shortAddr = `${addr.slice(0,6)}…${addr.slice(-4)}`;
                      const label     = domain || shortAddr;
                      return (
                        <>
                          <a
                            href={`/explore?cmd=tokens&admin=${addr}`}
                            style={{ color:'var(--zu-accent)', textDecoration:'underline' }}
                          >
                            {label}
                          </a>{' '}
                          <PixelButton size="xs" onClick={() => copyAddress(addr)}>📋</PixelButton>
                        </>
                      );
                    })()}
                  </td>
                  <td data-label="Amt">{row.amount}</td>
                  <td data-label="Price (ꜩ)">{(row.priceMutez/1_000_000).toLocaleString()}</td>
                  <td data-label="Nonce">{row.offerNonce}</td>
                  <td data-label="Action">
                    {tab==='accept' ? (
                      row.hasListing
                        ? <PixelButton size="xs" onClick={()=>handleAccept(row)}>ACCEPT</PixelButton>
                        : <span style={{ fontSize:'0.8rem', color:'var(--zu-warning,#f5a623)' }}>Needs Listing</span>
                    ) : (
                      <PixelButton size="xs" onClick={()=>handleCancel(row)}>CANCEL</PixelButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {ov.open && <OperationOverlay label={ov.label} onCancel={()=>setOv({ open:false, label:'' })} />}
    </div>
  );
}

/* What changed & why (r22):
   • Improved Tezos Domains resolution: pass NETWORK_KEY to
     resolveTezosDomain() so that addresses on Ghostnet use the
     correct ghostnet API endpoint. This change allows reverse
     lookups to work on test networks as well as mainnet.
   • Header revision bumped to r22 and summary updated accordingly.
   • Previous enhancements are preserved: stateful domain caching,
     interactive hyperlinks with copy buttons, mobile-friendly layout,
     big‑map metadata fallback, on‑chain thumbnails, consent handling,
     z-index/background fixes, OperationOverlay cancel wiring, and
     responsive design. */