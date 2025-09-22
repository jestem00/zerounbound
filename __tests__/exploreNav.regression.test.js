/* eslint-env jest */
/*Developed by @jams2blues
  File: __tests__/ui/exploreNav.regression.test.jsx
  Rev:  r12
  Summary: Snapshot-style guard to prevent accidental removal of
           ExploreNav buttons/labels. */
import { describe, test, expect, jest } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react';

const buildStyledComponent = (tagName) => {
  const elementTag = typeof tagName === 'string' ? tagName : 'div';
  const StyledComponent = ({ children, ...rest }) => {
    const safeProps = Object.fromEntries(
      Object.entries(rest).filter(([key]) => !key.startsWith('$')),
    );
    return React.createElement(elementTag, safeProps, children);
  };
  StyledComponent.displayName = `styled(${elementTag})`;
  return StyledComponent;
};

const createTagFactory = (tagName) =>
  new Proxy(() => buildStyledComponent(tagName), {
    apply: () => buildStyledComponent(tagName),
  });

jest.unstable_mockModule('styled-components', () => {
  const styledProxy = new Proxy(
    (tagName) => buildStyledComponent(tagName),
    {
      apply: (_target, _thisArg, args) => buildStyledComponent(args[0]),
      get: (_target, prop) => createTagFactory(prop),
    },
  );
  const css = () => '';
  return {
    __esModule: true,
    default: styledProxy,
    css,
  };
});

jest.unstable_mockModule('next/router', () => ({
  __esModule: true,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    pathname: '/explore/tokens',
    query: {},
    events: {
      on: jest.fn(),
      off: jest.fn(),
    },
  }),
}));

jest.unstable_mockModule('../src/hooks/useConsent.js', () => ({
  __esModule: true,
  default: jest.fn(() => [true, () => {}, true]),
}));

const { default: ExploreNav } = await import('../src/ui/ExploreNav.jsx');

describe('ExploreNav no-regression', () => {
  test('keeps all primary + personal buttons', () => {
    render(React.createElement(ExploreNav));

    const primaryLabels = ['COLLECTIONS', 'TOKENS', 'LISTINGS', 'SECONDARY'];
    const personalLabels = ['MY\u00A0COLLECTIONS', 'MY\u00A0TOKENS', 'MY\u00A0OFFERS', 'MY\u00A0LISTINGS'];

    [...primaryLabels, ...personalLabels].forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    });
  });
});

/* What changed & why: Added a focused test that asserts presence of
   all ExploreNav labels, catching accidental deletions during refactors.
   r12: mocked styled-components/next/router/useConsent for ESM Jest and asserted
        buttons via accessible names (roles). */


