/*──────── src/ui/MakeOfferBtn.jsx ────────*/
/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MakeOfferBtn.jsx
  Rev :    r1     2025‑09‑07
  Summary: tiny wrapper that spawns MakeOfferDialog; reusable in
           TokenCard & future listing panels
──────────────────────────────────────────────────────────────*/
import React, { useState } from 'react';
import PropTypes           from 'prop-types';
import PixelButton         from './PixelButton.jsx';
import MakeOfferDialog     from './MakeOfferDialog.jsx';

export default function MakeOfferBtn({ contract, tokenId }) {
  const [open, setOpen] = useState(false);
  const onOpen  = (e) => { e.stopPropagation(); setOpen(true); };

  return (
    <>
      <PixelButton size="xs" onClick={onOpen}>Make Offer</PixelButton>
      <MakeOfferDialog
        open={open}
        onClose={() => setOpen(false)}
        contract={contract}
        tokenId={tokenId}
        marketContract={process.env.NEXT_PUBLIC_MARKET_CONTRACT || ''}
      />
    </>
  );
}

MakeOfferBtn.propTypes = {
  contract: PropTypes.string.isRequired,
  tokenId : PropTypes.oneOfType([PropTypes.string,PropTypes.number]).isRequired,
};
/* EOF */
