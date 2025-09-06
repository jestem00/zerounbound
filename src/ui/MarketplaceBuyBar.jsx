/*
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MarketplaceBuyBar.jsx
  Rev :    r1
  Summary: Lightweight wrapper around MarketplaceBar for card contexts.
           This file previously contained a mistaken copy of PixelButton.
           Restored correct purpose while preserving API compatibility.
*/

import React from 'react';
import PropTypes from 'prop-types';
import MarketplaceBar from './MarketplaceBar.jsx';

export default function MarketplaceBuyBar({ contractAddress, tokenId, marketplace }) {
  return (
    <MarketplaceBar contractAddress={contractAddress} tokenId={tokenId} marketplace={marketplace} />
  );
}

MarketplaceBuyBar.propTypes = {
  contractAddress: PropTypes.string.isRequired,
  tokenId        : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  marketplace    : PropTypes.any,
};
