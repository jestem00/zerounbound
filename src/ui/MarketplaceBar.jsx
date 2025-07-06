/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBar.jsx
  Rev :    r1     2025-09-21
  Summary: tiny action-bar (Buy|List|Offer) for TokenDetailPage
─────────────────────────────────────────────────────────────*/
import React      from 'react';
import PropTypes  from 'prop-types';
import PixelButton from './PixelButton.jsx';

export default function MarketplaceBar({
  contractAddress,
  tokenId,
  marketplace,
}) {
  const post = (type, detail = {}) =>
    window.dispatchEvent(new CustomEvent(type, { detail }));

  return (
    <div style={{ display:'flex', gap:'.5rem', marginTop:'.8rem' }}>
      <PixelButton
        size="xs"
        onClick={() =>
          post('zu:buyToken', {
            contract: contractAddress,
            tokenId,
            market: marketplace,
          })}
      >
        BUY
      </PixelButton>

      <PixelButton
        size="xs"
        onClick={() =>
          post('zu:listToken', {
            contract: contractAddress,
            tokenId,
            market: marketplace,
          })}
      >
        LIST
      </PixelButton>

      <PixelButton
        size="xs"
        warning
        onClick={() =>
          post('zu:makeOffer', {
            contract: contractAddress,
            tokenId,
            market: marketplace,
          })}
      >
        OFFER
      </PixelButton>
    </div>
  );
}

MarketplaceBar.propTypes = {
  contractAddress: PropTypes.string.isRequired,
  tokenId        : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  marketplace    : PropTypes.string,
};

MarketplaceBar.defaultProps = {
  marketplace: '',
};
/* EOF */
