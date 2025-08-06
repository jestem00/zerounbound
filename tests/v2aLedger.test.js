/* eslint-env jest */
const getLedgerBalanceV2a = require('../src/utils/getLedgerBalanceV2a.cjs');

describe('getLedgerBalanceV2a', () => {
  afterEach(() => {
    global.fetch?.mockReset?.();
  });

  it('resolves balance and token id when initial lookup is empty', async () => {
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
      // second ledger query (token_id - 1)
      .mockResolvedValueOnce({
        json: async () => [],
      })
      // third ledger query (token_id + 1)
      .mockResolvedValueOnce({
        json: async () => [{ value: 7 }],
      });

    const res = await getLedgerBalanceV2a(toolkit, contract, pkh, 0);
    expect(res.balance).toBe(7);
    expect(res.tokenId).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[1][0]).toMatch('key.1=0');
    expect(fetch.mock.calls[2][0]).toMatch('key.1=-1');
    expect(fetch.mock.calls[3][0]).toMatch('key.1=1');
  });
});
