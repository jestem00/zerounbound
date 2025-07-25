/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/offers.jsx
  Rev :    r4    2025‑07‑25 UTC
  Summary: Lists marketplace offers tied to the connected
           wallet with improved listing resolution.  The
           page shows two tabs: "Offers to Accept" (offers
           made on tokens you listed) and "My Offers Sent" (offers
           you have placed on others’ tokens).  Offers are
           aggregated from the marketplace’s offers bigmap, and
           active listings are detected by scanning the listings
           bigmap for entries where the connected wallet is the
           seller and the amount is >0.  Each offer row stores
           both the offer’s nonce and the seller’s listing nonce;
           accept operations use the listing nonce to ensure
           transactions reference the correct sale.  Previews
           and cancel actions are maintained.  Integrates
           ExploreNav, PixelHeading and PixelButton.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState } from 'react';
import styledPkg from 'styled-components';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API, NETWORK_KEY } from '../../config/deployTarget.js';
import ExploreNav            from '../../ui/ExploreNav.jsx';
import PixelHeading          from '../../ui/PixelHeading.jsx';
import PixelButton           from '../../ui/PixelButton.jsx';
import OperationOverlay   from '../../ui/OperationOverlay.jsx';
import { getMarketContract } from '../../core/marketplace.js';

// Marketplace addresses per network.  These constants identify
// the ZeroSum marketplace contracts on ghostnet and mainnet.
const MARKET_CONTRACT = {
  ghostnet: 'KT1HmDjRUJSx4uUoFVZyDWVXY5WjDofEgH2G',
  mainnet : 'KT1Pg8KjHptWXJgN79vCnuWnYUZF3gz9hUhu',
};

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

export default function MyOffers() {
  const { address, toolkit } = useWalletContext() || {};
  const [tab, setTab]                     = useState('accept');
  const [offersToAccept, setOffersToAccept] = useState([]);
  const [myOffers, setMyOffers]           = useState([]);
  const [loading, setLoading]             = useState(false);
  // Selection state is unused since accept/cancel actions are handled directly
  // Cache of token metadata for preview thumbnails keyed by "contract:tokenId"
  const [previews, setPreviews]           = useState({});

  // Operation overlay state for accept/cancel transactions
  const [ov, setOv] = useState({ open: false, label: '' });

  // Helper to fetch offers from the marketplace. Wrapped outside of
  // useEffect so it can be called imperatively when modals close.
  async function fetchOffers() {
    // If no wallet connected, clear lists and exit
    if (!address) {
      setOffersToAccept([]);
      setMyOffers([]);
      return;
    }
    setLoading(true);
    try {
      const marketAddr = MARKET_CONTRACT[NETWORK_KEY] || MARKET_CONTRACT.ghostnet;
      // Fetch bigmap pointers for this marketplace
      const mapsRes = await fetch(`${TZKT_API}/v1/bigmaps?contract=${marketAddr}`);
      const maps = await mapsRes.json();
      const offersMap = maps.find((m) => m.path === 'offers');
      if (!offersMap) {
        console.warn('Offers bigmap not found for market:', marketAddr);
        setOffersToAccept([]);
        setMyOffers([]);
        setLoading(false);
        return;
      }
      // Retrieve all offer entries from the bigmap
      const offersRes = await fetch(`${TZKT_API}/v1/bigmaps/${offersMap.ptr}/keys?limit=1000`);
      const offerEntries = await offersRes.json();
      // Prepare new lists
      const acceptList = [];
      const mineList   = [];
      // We no longer rely on off‑chain views here. Listing resolution is performed via
      // the listings bigmap; thus no view initialisation is required.
      // Build an index of active listings keyed by contract:tokenId -> map of nonce -> details
      const sellerListingIndex = new Map();
      const listingsMap = maps.find((m) => m.path === 'listings');
      if (listingsMap) {
        try {
          const listRes = await fetch(`${TZKT_API}/v1/bigmaps/${listingsMap.ptr}/keys?active=true&limit=2000`);
          const listEntries = await listRes.json();
          listEntries.forEach((entry) => {
            const { key: lKey, value: lVal } = entry;
            const cAddr = lKey.address;
            const tId   = Number(lKey.nat);
            if (!lVal) return;
            const mapKey = `${cAddr}:${tId}`;
            let lmap = sellerListingIndex.get(mapKey);
            if (!lmap) {
              lmap = new Map();
              sellerListingIndex.set(mapKey, lmap);
            }
            Object.entries(lVal).forEach(([nonceStr, details]) => {
              const nonceNum = Number(nonceStr);
              if (details && Number(details.amount) > 0) {
                lmap.set(nonceNum, details);
              }
            });
          });
        } catch (errList) {
          console.warn('Failed to build seller listing index:', errList);
        }
      }
      // Process each offers bigmap entry
      for (const entry of offerEntries) {
        const { key: oKey, value: oVal } = entry;
        const contractAddr = oKey.address;
        const tokenId      = Number(oKey.nat);
        if (!oVal) continue;
        const mapKey = `${contractAddr}:${tokenId}`;
        const lmap = sellerListingIndex.get(mapKey) || new Map();
        // Determine first seller listing nonce for this token
        let sellerListingNonce;
        for (const [nonce, details] of lmap) {
          if (details.seller && details.seller.toLowerCase() === address.toLowerCase()) {
            sellerListingNonce = nonce;
            break;
          }
        }
        for (const [offeror, obj] of Object.entries(oVal)) {
          const amt  = Number(obj.amount);
          if (obj.accepted || amt <= 0) continue;
          const priceMutez = Number(obj.price);
          const offerNonce = Number(obj.nonce);
          const row = {
            contract    : contractAddr,
            tokenId     : tokenId,
            offeror     : offeror,
            amount      : amt,
            priceMutez  : priceMutez,
            offerNonce  : offerNonce,
            listingNonce: sellerListingNonce,
          };
          if (offeror.toLowerCase() === address.toLowerCase()) {
            // Include my offers if there is any active listing for this token
            if (lmap.size > 0) {
              mineList.push(row);
            }
          } else {
            // Include offers to accept if we have a listing nonce (i.e., we are seller)
            if (sellerListingNonce !== undefined) {
              acceptList.push(row);
            }
          }
        }
      }
      setOffersToAccept(acceptList);
      setMyOffers(mineList);
    } catch (err) {
      console.error('Failed to fetch marketplace offers:', err);
      setOffersToAccept([]);
      setMyOffers([]);
    } finally {
      setLoading(false);
    }
  }

  // Initial load and reload when address changes
  useEffect(() => {
    fetchOffers();
  }, [address]);

  // Note: acceptSel/cancelSel state was removed when migrating
  // accept/cancel handling into inline methods.  Reloads are now
  // triggered directly after accept/cancel and via the
  // zu:offersRefresh event handler below.

  // Listen for external refresh events (e.g., after accept/cancel)
  useEffect(() => {
    const handler = () => { fetchOffers(); };
    window.addEventListener('zu:offersRefresh', handler);
    return () => {
      window.removeEventListener('zu:offersRefresh', handler);
    };
  }, []);

  // Fetch preview metadata for all offers when lists change
  useEffect(() => {
    // Combine both lists to get unique contract-token pairs
    const allRows = [...offersToAccept, ...myOffers];
    const needed = new Set(allRows.map((row) => `${row.contract}:${row.tokenId}`));
    needed.forEach(async (idStr) => {
      if (previews[idStr]) return;
      const [cAddr, tIdStr] = idStr.split(':');
      try {
        const metaRes = await fetch(
          `${TZKT_API}/v1/tokens?contract=${cAddr}&tokenId=${tIdStr}&select=metadata`
        );
        const metaData = await metaRes.json();
        const metadataObj = metaData[0]?.metadata ?? metaData[0]?.['metadata'] ?? {};
        setPreviews((prev) => ({ ...prev, [idStr]: metadataObj }));
      } catch (err) {
        console.error('Failed to fetch preview metadata', err);
        setPreviews((prev) => ({ ...prev, [idStr]: {} }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offersToAccept, myOffers]);

  // Deprecated modal handlers (accept/cancel handled inline)

  // Choose which list to display based on the current tab
  const list = tab === 'accept' ? offersToAccept : myOffers;

  // Copy contract address to clipboard and notify
  const copyAddress = (addr) => {
    try {
      navigator.clipboard.writeText(addr);
      window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: 'Contract copied', severity: 'info' } }));
    } catch (_) {
      // fallback no-op
    }
  };

  // Accept an offer directly without opening a modal.  Uses the
  // marketplace accept_offer entrypoint with the offer details.  On
  // success refreshes the offer lists and shows a snackbar.
  async function handleAccept(row) {
    if (!toolkit) return;
    try {
      setOv({ open: true, label: 'Accepting offer…' });
      const market = await getMarketContract(toolkit);
      const call   = market.methodsObject.accept_offer({
        amount       : Number(row.amount),
        listing_nonce: Number(row.listingNonce ?? row.offerNonce),
        nft_contract : row.contract,
        offeror      : row.offeror,
        token_id     : Number(row.tokenId),
      });
      const op = await toolkit.wallet.batch().withContractCall(call).send();
      await op.confirmation();
      setOv({ open: false, label: '' });
      // Refresh offers
      await fetchOffers();
      // Notify user
      window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: 'Offer accepted ✔', severity: 'info' } }));
    } catch (err) {
      console.error('Accept offer failed:', err);
      setOv({ open: false, label: '' });
      window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: err.message || 'Transaction failed', severity: 'error' } }));
    }
  }

  // Cancel (withdraw) an offer directly.  Uses the marketplace
  // withdraw_offer entrypoint.  Cancels all offers by the user on
  // this token.  On success refreshes the offer lists and shows a
  // snackbar.
  async function handleCancel(row) {
    if (!toolkit) return;
    try {
      setOv({ open: true, label: 'Cancelling offer…' });
      const market = await getMarketContract(toolkit);
      const call = market.methodsObject.withdraw_offer({
        nft_contract: row.contract,
        token_id    : Number(row.tokenId),
      });
      const op = await toolkit.wallet.batch().withContractCall(call).send();
      await op.confirmation();
      setOv({ open: false, label: '' });
      // Refresh offers
      await fetchOffers();
      window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: 'Offer cancelled ✔', severity: 'info' } }));
    } catch (err) {
      console.error('Cancel offer failed:', err);
      setOv({ open: false, label: '' });
      window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: err.message || 'Transaction failed', severity: 'error' } }));
    }
  }

  return (
    <div>
      {/* Global explore navigation bar */}
      <ExploreNav hideSearch={false} />
      {/* Page heading */}
      <PixelHeading level={3} style={{ marginTop: '1rem' }}>My Offers</PixelHeading>
      {/* Tab controls */}
      <div style={{ marginTop:'0.8rem', display:'flex', gap:'0.4rem' }}>
        <PixelButton
          warning={tab === 'accept'}
          onClick={() => setTab('accept')}
        >
          Offers to Accept
        </PixelButton>
        <PixelButton
          warning={tab === 'mine'}
          onClick={() => setTab('mine')}
        >
          My Offers
        </PixelButton>
      </div>
      {/* Loading indicator */}
      {loading && <p style={{ marginTop:'0.8rem' }}>Fetching offers…</p>}
      {/* Empty state */}
      {!loading && list.length === 0 && (
        <p style={{ marginTop:'0.8rem' }}>
          {tab === 'accept'
            ? 'There are no outstanding offers on your listings.'
            : 'You have not made any offers.'}
        </p>
      )}
      {/* Offers table */}
      {!loading && list.length > 0 && (
        <Table>
          <thead>
            <tr>
              <th>Preview</th>
              <th>Contract</th>
              <th>Token ID</th>
              <th>Offeror</th>
              <th>Amount</th>
              <th>Price (ꜩ)</th>
              <th>Nonce</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={`${row.contract}:${row.tokenId}:${row.offerNonce}:${row.offeror}`}>
                {/* Preview thumbnail */}
                <td style={{ width: '40px' }}>
                  {(() => {
                    const idStr = `${row.contract}:${row.tokenId}`;
                    const m = previews[idStr];
                    if (m) {
                      // Prefer explicit keys but fall back to other recognised names
                      let uri = null;
                      const keys = ['thumbnailUri','thumbnail_uri','displayUri','display_uri','artifactUri','artifact_uri','imageUri','image','mediaUri','media_uri'];
                      for (const k of keys) {
                        if (m[k]) { uri = m[k]; break; }
                      }
                      if (uri) {
                        let src = uri;
                        // If IPFS, convert to gateway
                        if (typeof src === 'string' && src.startsWith('ipfs://')) {
                          src = src.replace('ipfs://', 'https://ipfs.io/ipfs/');
                        }
                        return (
                          <img
                            src={src}
                            alt="preview"
                            style={{ width: '32px', height: '32px', objectFit: 'cover' }}
                          />
                        );
                      }
                    }
                    return null;
                  })()}
                </td>
                {/* Contract address column: clickable and copyable */}
                <td>
                  <a
                    href={`/tokens/${row.contract}/${row.tokenId}`}
                    style={{ color: 'var(--zu-accent)', textDecoration: 'underline' }}
                  >
                    {row.contract.substring(0, 6)}…{row.contract.substring(row.contract.length - 4)}
                  </a>
                  &nbsp;
                  <PixelButton size="xs" onClick={() => copyAddress(row.contract)}>📋</PixelButton>
                </td>
                <td>{row.tokenId}</td>
                <td>{row.offeror.substring(0, 6)}…{row.offeror.substring(row.offeror.length - 4)}</td>
                <td>{row.amount}</td>
                <td>{(row.priceMutez / 1_000_000).toLocaleString()}</td>
                <td>{row.offerNonce}</td>
                <td>
                  {tab === 'accept' ? (
                    <PixelButton size="xs" onClick={() => handleAccept(row)}>ACCEPT</PixelButton>
                  ) : (
                    <PixelButton size="xs" onClick={() => handleCancel(row)}>CANCEL</PixelButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {/* Operation overlay for accept/cancel actions */}
      {ov.open && (
        <OperationOverlay
          label={ov.label}
          onClose={() => setOv({ open: false, label: '' })}
        />
      )}
    </div>
  );
}

/* What changed & why (r4):
   • Shifted offer aggregation to rely on the TzKT listings
     bigmap instead of off‑chain views: build an index of
     listings where the connected wallet is seller (amount > 0)
     and attach the corresponding listing nonce to each offer.
   • Accept operations now reference row.listingNonce (with
     fallback to offerNonce) when dispatching accept_offer;
     this prevents "Not listed" errors by ensuring the call
     targets an active sale.  Removed previous view-based
     checks and simplified the fetch algorithm.
   • Removed Tzip16Module import and updated header summary
     accordingly. */
/* EOF */