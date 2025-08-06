/* eslint-env jest */
const getLedgerBalanceV2a = require('../src/utils/getLedgerBalanceV2a.cjs');

describe('getLedgerBalanceV2a', () => {
  afterEach(() => {
    global.fetch?.mockReset?.();
  });

  it('falls back to token_id + 1 when initial lookup is empty', async () => {
    const toolkit = { rpc: { getRpcUrl: () => 'https://ghostnet.example' } };
    const contract = 'KT1TEST';
    const pkh = 'tz1abc';

    global.fetch = jest
      .fn()
      // bigmaps lookup
      .mockResolvedValueOnce({
        json: async () => [{ path: 'ledger', ptr: 123 }],
      })
      // first ledger query (token_id)
      .mockResolvedValueOnce({
        json: async () => [],
      })
      // second ledger query (token_id + 1)
      .mockResolvedValueOnce({
        json: async () => [{ value: 7 }],
      });

    const bal = await getLedgerBalanceV2a(toolkit, contract, pkh, 0);
    expect(bal).toBe(7);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1][0]).toMatch('key.1=0');
    expect(fetch.mock.calls[2][0]).toMatch('key.1=1');
  });
});
