/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/CRTFrame.jsx
  Summary: responsive centred frame; outer scroll handled by Layout. */

import React from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';

const Frame = styled.div`
  position: relative;
  z-index: 2;
  background: var(--zu-bg);
  border: 3px solid var(--zu-accent);
  width: min(92vw, 1400px);
  padding: clamp(1rem, 2.5vmin, 2rem);
  margin: 0 auto;
  box-sizing: border-box;
`;

export default function CRTFrame({ style = {}, children }) {
  return <Frame style={style}>{children}</Frame>;
}
CRTFrame.propTypes = { style: PropTypes.object, children: PropTypes.node.isRequired };
