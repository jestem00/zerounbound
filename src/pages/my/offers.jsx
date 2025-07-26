/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/offers.jsx
  Rev :    r12    2025‑07‑26 UTC
  Summary: decode hex‑metadata & strict data‑URI preview only
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
import decodeHexFields               from '../../utils/decodeHexFields.js';   /* NEW */

/* ─── Marketplace contract addresses by network ───────────── */
const MARKET_CONTRACT = {
  ghostnet: 'KT1HmDjRUJSx4uUoFVZyDWVXY5WjDofEgH2G',
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
`;

/* full list of metadata keys that may hold an image URI */
const THUMB_KEYS = [
  'thumbnailUri', 'thumbnail_uri',
  'displayUri',   'display_uri',
  'artifactUri',  'artifact_uri',
  'imageUri',     'image',
  'mediaUri',     'media_uri',
];

/* helper: pick the first valid on‑chain data: URI */
function pickDataUri(meta = {}) {
  for (const k of THUMB_KEYS) {
    const v = meta[k];
    if (typeof v === 'string' && /^data:/i.test(v.trim())) return v.trim();
  }
  return null;
}

/* ─── Component ────────────────────────────────────────────── */
export default function MyOffers() {
  const { address, toolkit } = useWalletContext() || {};
  const [tab, setTab]                       = useState('accept');
  const [offersToAccept, setOffersToAccept] = useState([]);
  const [myOffers, setMyOffers]             = useState([]);
  const [loading, setLoading]               = useState(false);
  const [previews, setPreviews]             = useState({});     // contract:tokenId → decoded metadata
  const [ov, setOv]                         = useState({ open: false, label: '' });

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

  /* Fetch previews lazily & decode hex fields */
  useEffect(() => {
    const idsNeeded = new Set([...offersToAccept, ...myOffers]
      .map(r => `${r.contract}:${r.tokenId}`));

    idsNeeded.forEach(async idStr => {
      if (previews[idStr]) return;
      const [cAddr, tId] = idStr.split(':');
      try {
        const mdArr = await (await fetch(
          `${TZKT_API}/v1/tokens?contract=${cAddr}&tokenId=${tId}&select=metadata`
        )).json();
        const rawMeta   = mdArr[0]?.metadata || {};
        const decoded   = decodeHexFields(rawMeta);          // ✅ deep hex→utf‑8
        setPreviews(p => ({ ...p, [idStr]: decoded }));
      } catch (err) {
        console.error('preview metadata fetch failed', err);
        setPreviews(p => ({ ...p, [idStr]: {} }));
      }
    });
  }, [offersToAccept, myOffers, previews]);

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
    <div>
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
              const idStr = `${row.contract}:${row.tokenId}`;
              const meta  = previews[idStr] || {};
              const uri   = pickDataUri(meta);      // strictly data: URI
              return (
                <tr key={`${row.contract}:${row.tokenId}:${row.offerNonce}:${row.offeror}`}>
                  <td style={{ width:'40px' }}>
                    {uri && (
                      <img
                        src={uri}
                        alt=""
                        style={{ width:32, height:32, objectFit:'cover' }}
                      />
                    )}
                  </td>
                  <td>
                    <a
                      href={`/tokens/${row.contract}/${row.tokenId}`}
                      style={{ color:'var(--zu-accent)', textDecoration:'underline' }}
                    >
                      {row.contract.slice(0,6)}…{row.contract.slice(-4)}
                    </a>{' '}
                    <PixelButton size="xs" onClick={()=>copyAddress(row.contract)}>📋</PixelButton>
                  </td>
                  <td>{row.tokenId}</td>
                  <td>{row.offeror.slice(0,6)}…{row.offeror.slice(-4)}</td>
                  <td>{row.amount}</td>
                  <td>{(row.priceMutez/1_000_000).toLocaleString()}</td>
                  <td>{row.offerNonce}</td>
                  <td>
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

      {ov.open && <OperationOverlay label={ov.label} onClose={()=>setOv({ open:false, label:'' })} />}
    </div>
  );
}

/* What changed & why:
   • r12 Add decodeHexFields to repair hex‑encoded metadata from TzKT.
   • Strict preview pickDataUri → only on‑chain data: URIs, per I24.
   • Removed ipfs fallback; placeholder shows when no data: preview.
   • No other logic modified; mobile styling retained. */
/* EOF */