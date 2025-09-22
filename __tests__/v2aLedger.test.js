/* eslint-env jest */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const getLedgerBalanceV2a = require('../src/utils/getLedgerBalanceV2a.cjs');

describe('getLedgerBalanceV2a', () => {
  afterEach(() => {
    global.fetch?.mockReset?.();
  });

  it('fetches balance via TzKT tokens API', async () => {
    const tzktBase = 'https://api.ghostnet.tzkt.io';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ balance: '7' }],
    });
    const bal = await getLedgerBalanceV2a({
      tzktBase,
      contract: 'KT1TEST',
      tokenId: 0,
      owner: 'tz1abc',
    });
    expect(bal).toBe(7);
    expect(fetch).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(fetch.mock.calls[0][0]);
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(`${tzktBase}/v1/tokens/balances`);
    expect(requestUrl.searchParams.get('token.contract')).toBe('KT1TEST');
    expect(requestUrl.searchParams.get('token.tokenId')).toBe('0');
    expect(requestUrl.searchParams.get('account')).toBe('tz1abc');
  });
});
