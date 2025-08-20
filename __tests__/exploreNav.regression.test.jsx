/* eslint-env jest */
/*Developed by @jams2blues
  File: __tests__/ui/exploreNav.regression.test.jsx
  Rev:  r1
  Summary: Snapshot‑style guard to prevent accidental removal of
           ExploreNav buttons/labels. */

import React from 'react';
import { render, screen } from '@testing-library/react';
import ExploreNav from '../../src/ui/ExploreNav.jsx';

describe('ExploreNav no‑regression', () => {
  test('keeps all primary + personal buttons', () => {
    render(<ExploreNav />);
    [
      /COLLECTIONS/, /TOKENS/, /LISTINGS/, /SECONDARY/,
      /MY\u00A0COLLECTIONS/, /MY\u00A0TOKENS/, /MY\u00A0OFFERS/, /MY\u00A0LISTINGS/,
    ].forEach((re) => {
      expect(screen.getByText(re)).toBeInTheDocument();
    });
  });
});

/* What changed & why: Added a focused test that asserts presence of
   all ExploreNav labels, catching accidental deletions during refactors. */
