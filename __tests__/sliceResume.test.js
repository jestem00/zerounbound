/* eslint-env jest */
let planHead, cutTail, buildAppendCalls, countSlices;
beforeAll(async () => {
  ({ planHead, cutTail, buildAppendCalls } = await import('../src/core/slicing.js'));
  ({ countSlices } = await import('../src/core/feeEstimator.js'));
});

const mkData = (n) => `data:text/plain,${'a'.repeat(n)}`;

describe('slice resume', () => {
  test('estimator matches builder', () => {
    [8 * 1024, 40 * 1024, 138 * 1024].forEach((size) => {
      const data = mkData(size);
      const { expectedSlices } = countSlices(data);
      const { remainingHex } = planHead(data);
      const calls = buildAppendCalls({ contract: 'KT1', tokenId: 0, tailHex: remainingHex });
      expect(expectedSlices).toBe(1 + calls.length);
    });
  });

  test('resume produces exact tail', () => {
    const data = mkData(10 * 1024);
    const { headStr } = planHead(data);
    const prefix = headStr.slice(0, headStr.length - 20);
    const tailHex = cutTail({ fullStr: data, onChainPrefixStr: prefix });
    const rebuilt = prefix + Buffer.from(tailHex, 'hex').toString('utf8');
    expect(rebuilt).toBe(data);
  });
});
