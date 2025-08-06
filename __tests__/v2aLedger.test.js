/* eslint-env jest */
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
    expect(fetch.mock.calls[0][0]).toBe(
      `${tzktBase}/v1/tokens/balances?token.contract=KT1TEST&token.tokenId=0&account=tz1abc`,
    );
  });
});