/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBar.jsx
  Rev :    r2     2025‑07‑22
  Summary: replace buy/list/offer events with a WIP overlay
           directing users to objkt.com for marketplace actions.
─────────────────────────────────────────────────────────────*/
import React, { useState } from 'react';
import PropTypes          from 'prop-types';
import PixelButton        from './PixelButton.jsx';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';
import { URL_OBJKT_BASE } from '../config/deployTarget.js';

export default function MarketplaceBar({ contractAddress, tokenId, marketplace }) {
  const [open, setOpen] = useState(false);

  // Build an objkt.com link appropriate to the current network.
  const objktUrl = `${URL_OBJKT_BASE}${contractAddress}/${tokenId}`;

  // Open the dialog on any button click instead of dispatching internal
  // marketplace events.  Users are guided to objkt.com until our
  // marketplace contract is finished.
  const handleClick = (e) => {
    e.preventDefault();
    setOpen(true);
  };

  return (
    <>
      <PixelButton onClick={handleClick}>BUY</PixelButton>
      <PixelButton onClick={handleClick}>LIST</PixelButton>
      <PixelButton onClick={handleClick}>OFFER</PixelButton>
      <PixelConfirmDialog
        open={open}
        title="Marketplace Unavailable"
        message={
          <span>
            Our marketplace contract is still a work in progress. Please
            list, buy or make offers on&nbsp;
            <a href={objktUrl} target="_blank" rel="noopener noreferrer">objkt.com</a>
            &nbsp;for now.
          </span>
        }
        okLabel="OK"
        onOk={() => setOpen(false)}
        cancelLabel=""
        hideCancel
      />
    </>
  );
}

MarketplaceBar.propTypes = {
  contractAddress: PropTypes.string.isRequired,
  tokenId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  marketplace: PropTypes.string,
};

MarketplaceBar.defaultProps = {
  marketplace: '',
};

/* What changed & why:
   • Introduced a WIP overlay via PixelConfirmDialog to inform
     users that marketplace functionality is not yet available.
   • Removed dispatch of zu:buyToken/listToken/makeOffer events and
     replaced them with a unified handler that triggers the dialog.
*/
/* EOF */