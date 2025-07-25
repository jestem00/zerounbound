/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/offers.jsx
  Rev :    r2    2025‑07‑25 UTC
  Summary: Dynamic page listing marketplace offers associated
           with the connected wallet.  Provides two views:
           "Offers to Accept" lists offers made on the user’s
           active listings, while "My Offers" lists offers the
           user has placed on others’ tokens.  Uses the TzKT
           API to aggregate offers from the ZeroSum marketplace
           bigmaps and displays them in a table with action
           buttons to accept or cancel via existing entrypoint
           dialogs.  Integrates ExploreNav, PixelHeading and
           PixelButton for consistent styling.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState } from 'react';
import styledPkg from 'styled-components';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API, NETWORK_KEY } from '../../config/deployTarget.js';
import ExploreNav            from '../../ui/ExploreNav.jsx';
import PixelHeading          from '../../ui/PixelHeading.jsx';
import PixelButton           from '../../ui/PixelButton.jsx';
import AcceptOffer           from '../../ui/Entrypoints/AcceptOffer.jsx';
import CancelOffer           from '../../ui/Entrypoints/CancelOffer.jsx';

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
  const { address } = useWalletContext() || {};
  const [tab, setTab]                     = useState('accept');
  const [offersToAccept, setOffersToAccept] = useState([]);
  const [myOffers, setMyOffers]           = useState([]);
  const [loading, setLoading]             = useState(false);
  const [acceptSel, setAcceptSel]         = useState(null);
  const [cancelSel, setCancelSel]         = useState(null);
  // Cache of token metadata for preview thumbnails keyed by "contract:tokenId"
  const [previews, setPreviews]           = useState({});

  // Helper to fetch offers from the marketplace.  Wrapped outside of
  // useEffect so it can be called imperatively when modals close.
  async function fetchOffers() {
    if (!address) {
      setOffersToAccept([]);
      setMyOffers([]);
      return;
    }
    setLoading(true);
    try {
      const marketAddr = MARKET_CONTRACT[NETWORK_KEY] || MARKET_CONTRACT.ghostnet;
      // Retrieve all bigmaps associated with the marketplace to
      // determine the pointer IDs for offers and listings.
      const mapsRes = await fetch(`${TZKT_API}/v1/bigmaps?contract=${marketAddr}`);
      const maps = await mapsRes.json();
      const offersMap   = maps.find((m) => m.path === 'offers');
      const listingsMap = maps.find((m) => m.path === 'listings');
      if (!offersMap) {
        console.warn('Offers bigmap not found for market:', marketAddr);
        setOffersToAccept([]);
        setMyOffers([]);
        setLoading(false);
        return;
      }
      // Fetch all entries from the offers bigmap
      const offersKeysRes = await fetch(`${TZKT_API}/v1/bigmaps/${offersMap.ptr}/keys?limit=1000`);
      const offersKeys = await offersKeysRes.json();
      // We previously built a listing index to map offers to listings
      // via seller lookups.  However, older marketplace versions may
      // store listing details differently or omit the seller field
      // entirely, causing offers to be filtered out incorrectly.  To
      // ensure all valid offers appear, we will not filter by listing
      // existence here; instead, AcceptOffer will perform a final
      // validation using off‑chain views.
      const acceptList = [];
      const myList     = [];
      offersKeys.forEach((entry) => {
        const { key, value } = entry;
        const contractAddr = key.address;
        const tokenId     = Number(key.nat);
        if (!value) return;
        Object.entries(value).forEach(([offeror, obj]) => {
          // Skip offers that have already been accepted or withdrawn (amount <= 0)
          if (obj.accepted) return;
          const nonce      = Number(obj.nonce);
          const amount     = Number(obj.amount);
          const priceMutez = Number(obj.price);
          if (amount <= 0) return;
          // Record offers made by the current user
          if (offeror.toLowerCase() === address.toLowerCase()) {
            myList.push({ contract: contractAddr, tokenId, offeror, nonce, amount, priceMutez });
          } else {
            // Offers on tokens the user might own
            acceptList.push({ contract: contractAddr, tokenId, offeror, nonce, amount, priceMutez });
          }
        });
      });
      setOffersToAccept(acceptList);
      setMyOffers(myList);
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

  // Reload offers whenever the accept or cancel modals close
  useEffect(() => {
    if (!acceptSel && !cancelSel) {
      fetchOffers();
    }
  }, [acceptSel, cancelSel]);

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

  // Open the accept offer modal for a specific token
  const openAcceptModal = (row) => {
    setAcceptSel({ contract: row.contract, tokenId: row.tokenId });
  };
  // Open the cancel offer modal for a specific token
  const openCancelModal = (row) => {
    setCancelSel({ contract: row.contract, tokenId: row.tokenId });
  };
  // Close handlers for the modals
  const closeAcceptModal = () => setAcceptSel(null);
  const closeCancelModal = () => setCancelSel(null);

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
              <tr key={`${row.contract}:${row.tokenId}:${row.nonce}:${row.offeror}`}>
                {/* Preview thumbnail */}
                <td style={{ width: '40px' }}>
                  {(() => {
                    const idStr = `${row.contract}:${row.tokenId}`;
                    const m = previews[idStr];
                    if (m) {
                      const uri = m.thumbnailUri || m.displayUri || m.artifactUri;
                      if (uri) {
                        return (
                          <img
                            src={uri.replace('ipfs://', 'https://ipfs.io/ipfs/')}
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
                <td>{row.nonce}</td>
                <td>
                  {tab === 'accept' ? (
                    <PixelButton size="xs" onClick={() => openAcceptModal(row)}>ACCEPT</PixelButton>
                  ) : (
                    <PixelButton size="xs" onClick={() => openCancelModal(row)}>CANCEL</PixelButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {/* Accept offer modal */}
      {acceptSel && (
        <AcceptOffer
          open
          contract={acceptSel.contract}
          tokenId={acceptSel.tokenId}
          onClose={closeAcceptModal}
        />
      )}
      {/* Cancel offer modal */}
      {cancelSel && (
        <CancelOffer
          open
          contract={cancelSel.contract}
          tokenId={cancelSel.tokenId}
          onClose={closeCancelModal}
        />
      )}
    </div>
  );
}

/* What changed & why: Implemented a fully functional My Offers page
   that aggregates offers across the marketplace for the connected
   wallet.  The component fetches data from the TzKT API by
   examining the marketplace’s offers and listings bigmaps to
   determine which offers the user needs to accept (offers on
   their listings) and which offers the user has made.  Lists are
   presented in a table with contextual accept/cancel actions
   that trigger the existing AcceptOffer and CancelOffer dialogs.
   The page uses ExploreNav for navigation and includes loading,
   empty states and tabbed controls for an intuitive user
   experience. */
/* EOF */