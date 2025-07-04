import React from 'react';
import PropTypes from 'prop-types';
import PixelButton from './PixelButton.jsx';

export default function MakeOfferBtn({ contract, tokenId }) {
  const onClick = (e) => {
    e.stopPropagation();
    alert('TODO');
  };

  return (
    <PixelButton size="xs" warning onClick={onClick}>
      Make Offer
    </PixelButton>
  );
}

MakeOfferBtn.propTypes = {
  contract: PropTypes.string,
  tokenId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
