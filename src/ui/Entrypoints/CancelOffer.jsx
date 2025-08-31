/*â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  Developed byÂ @jams2bluesÂ â€“Â ZeroContractÂ Studio
  File:    src/ui/Entrypoints/CancelOffer.jsx
  Rev :    r2    2025â€‘10â€‘26â€¯UTC
  Summary: Modal UI for withdrawing (canceling) offers made by the
           connected buyer on a given NFT token.  Lists the
           buyer's current offers (fetched via the marketplaceâ€™s
           offâ€‘chain view) and allows canceling individually or
           all at once via the marketplaceâ€™s withdraw_offer
           entrypoint.  This revision updates the Price (ꜩ)0, 0, 0, 0.65);
  z-index: 9999;
`;

// Modal box container
const ModalBox = styled.section`
  background: var(--zu-bg, #0a001e);
  border: 2px solid var(--zu-accent, #8f3ce1);
  padding: 1rem;
  width: min(90%, 600px);
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 0 0 4px var(--zu-dark, #1b023a);
`;

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

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 0.8rem;
  gap: 0.4rem;
`;

export default function CancelOffer({ open = false, contract = '', tokenId = '', onClose = () => {} }) {
  const { toolkit, address: walletAddr } = useWalletContext() || {};
  const [offers, setOffers] = useState([]);
  const [ov, setOv]       = useState({ open: false, label: '' });
  const [page, setPage]   = useState(0);
  const perPage = 8;

  // Snackbar helper
  const snack = (msg, sev = 'info') => {
    window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }));
  };

  // Fetch offers made by the connected wallet
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!open || !toolkit || !contract || tokenId === '' || tokenId === undefined) return;
      if (!walletAddr) return;
      try {
        // ensure Tzip16 extension
        try { toolkit.addExtension(new Tzip16Module()); } catch (errExt) { /* ignore */ }
        const market = await getMarketContract(toolkit);
        const views  = await market.tzip16().metadataViews();
        const raw    = await views.get_offers_for_token().executeView(String(contract), Number(tokenId));
        const list   = [];
        const push   = (offeror, obj) => {
          list.push({
            offeror: offeror,
            Price (ꜩ)obj.Price (ꜩ)obj.amount),
            nonce: Number(obj.nonce),
            accepted: obj.accepted,
          });
        };
        if (raw?.entries) {
          for (const [key, value] of raw.entries()) push(key, value);
        } else if (typeof raw === 'object' && raw !== null) {
          Object.entries(raw).forEach(([k, v]) => push(k, v));
        }
        // Filter offers by current wallet address and not yet accepted
        const filtered = list.filter((o) => !o.accepted && walletAddr && o.offeror.toLowerCase() === walletAddr.toLowerCase());
        if (!cancel) {
          setOffers(filtered);
          setPage(0);
        }
      } catch (err) {
        console.error('Failed to fetch offers:', err);
        if (!cancel) setOffers([]);
      }
    })();
    return () => { cancel = true; };
  }, [open, toolkit, contract, tokenId, walletAddr]);

  // Pagination logic
  const pages = Math.ceil(offers.length / perPage);
  const pageOffers = useMemo(() => {
    const start = page * perPage;
    return offers.slice(start, start + perPage);
  }, [offers, page]);

  // Cancel a single offer (withdraw)
  async function cancelSingle() {
    if (!toolkit) return;
    try {
      setOv({ open: true, label: 'Cancelling offerâ€¦' });
      const market = await getMarketContract(toolkit);
      const call = market.methodsObject.withdraw_offer({
        nft_contract: contract,
        token_id    : Number(tokenId),
      });
      const op = await toolkit.wallet.batch().withContractCall(call).send();
      await op.confirmation();
      setOv({ open: false, label: '' });
      snack('Offer cancelled âœ”');
      // Remove all offers from list (withdraw cancels all offers by the buyer on this token)
      setOffers([]);
      // Close the modal via onClose
      onClose();
      // Broadcast a refresh event so parent lists can update
      try {
        window.dispatchEvent(new CustomEvent('zu:offersRefresh'));
      } catch (_) {}
    } catch (err) {
      console.error('Cancel offer failed:', err);
      setOv({ open: false, label: '' });
      snack(err.message || 'Transaction failed', 'error');
    }
  }

  // Cancel all offers (same as single, but keep semantics)
  async function cancelAll() {
    await cancelSingle();
  }

  // do not render when closed
  if (!open) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()} data-modal="cancel-offer">
        <PixelHeading level={3}>Cancel Offer</PixelHeading>
        {offers.length === 0 ? (
          <p style={{ marginTop: '0.5rem' }}>You have no active offers to cancel.</p>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Offeror</th>
                  <th>Amount</th>
                  <th>Price (ꜩ)êœ©)</th>
                  <th>Nonce</th>
                </tr>
              </thead>
              <tbody>
                {pageOffers.map((offer) => (
                  <tr key={`${offer.offeror}-${offer.nonce}`}>
                    <td>{offer.offeror.substring(0, 6)}â€¦{offer.offeror.substring(offer.offeror.length - 4)}</td>
                    <td>{offer.amount}</td>
                    <td>{formatMutez(offer.Price (ꜩ)
              <Pagination>
                {Array.from({ length: pages }, (_, idx) => (
                  <PixelButton key={idx} onClick={() => setPage(idx)} disabled={idx === page} $size="sm">
                    {idx + 1}
                  </PixelButton>
                ))}
              </Pagination>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '0.8rem', flexWrap: 'wrap' }}>
              <PixelButton onClick={cancelSingle} $size="sm">
                CANCEL&nbsp;OFFER
              </PixelButton>
              <PixelButton onClick={cancelAll} $size="sm">
                CANCEL&nbsp;ALL
              </PixelButton>
            </div>
          </>
        )}
        {ov.open && (
          <OperationOverlay
            open={ov.open}
            label={ov.label}
            onClose={() => setOv({ open: false, label: '' })}
          />
        )}
        <PixelButton onClick={onClose} style={{ marginTop: '1rem' }} $size="sm">
          Close
        </PixelButton>
      </ModalBox>
    </ModalOverlay>
  );
}

CancelOffer.propTypes = {
  open    : PropTypes.bool,
  contract: PropTypes.string,
  tokenId : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose : PropTypes.func,
};

/* What changed & why:
   r2 â€“ Updated the price column to use toLocaleString with six
   minimum and eight maximum fractional digits, allowing prices
   like 1.23456789 êœ© to display every decimal digit without
   rounding while still showing at least six decimals for whole
   numbers.  Added smâ€‘sized buttons and improved spacing for
   consistency with the rest of the UI. */
//EOF

