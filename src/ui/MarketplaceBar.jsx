/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBar.jsx
  Rev :    r3    2025‑10‑17
  Summary: marketplace stub that directs users to objkt.com
           until our own marketplace contract is ready.  It
           computes the correct objkt.com asset URL for the
           current network and provides BUY, LIST and OFFER
           buttons that open a dismissible dialog.  No events
           are dispatched to internal marketplace handlers.
─────────────────────────────────────────────────────────────*/
import React, { useState } from 'react';
import PropTypes          from 'prop-types';
import PixelButton        from './PixelButton.jsx';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';
import { URL_OBJKT_BASE } from '../config/deployTarget.js';

/**
 * MarketplaceBar
 *
 * Displays BUY, LIST and OFFER buttons for a token.  When any
 * button is clicked, a modal appears informing the user that
 * marketplace actions are not yet available and provides a link
 * to objkt.com.  The objkt URL is constructed by replacing
 * '/collection/' in the base with '/asset/' and appending the
 * contract address and token ID.
 */
export default function MarketplaceBar({ contractAddress, tokenId, marketplace }) {
  const [open, setOpen] = useState(false);
  // Compute the correct objkt asset URL.  The base constant ends
  // with `/collection/`; replace it with `/asset/` to reach the
  // token detail page on objkt.  Then append the FA2 contract
  // address and token ID.
  const objktBase = URL_OBJKT_BASE.replace(/\/collection\/?$/, '/asset/');
  const objktUrl  = `${objktBase}${contractAddress}/${tokenId}`;

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
        onOk={() => setOpen(false)}
        okLabel="OK"
        cancelLabel=""
        hideCancel
        title="Marketplace Unavailable"
        message={(
          <span>
            Our marketplace contract is still a work in progress. Please
            list, buy or make offers on&nbsp;
            <a href={objktUrl} target="_blank" rel="noopener noreferrer">objkt.com</a>
            &nbsp;for now.
          </span>
        )}
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

/* What changed & why (r3):
   • Construct the objkt.com asset URL using the collection base
     constant by replacing `/collection/` with `/asset/` to fix
     broken links.
   • Provided a modal that closes on OK and does not have a
     cancel button, matching the stub behaviour.
*/
/* EOF */