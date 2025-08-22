/* eslint-env jest */
let planHead, cutTail, buildAppendCalls, ensureDataUri, isLikelySvg;
beforeAll(async () => {
  ({ planHead, cutTail, buildAppendCalls } = await import('../src/core/slicing.js'));
  ({ ensureDataUri, isLikelySvg } = await import('../src/utils/uriHelpers.js'));
});

const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

const bigSvg = `<svg xmlns="http://www.w3.org/2000/svg">${'<g></g>'.repeat(5000)}</svg>`;

describe('svg data uri', () => {
  test('round trip small svg', () => {
    const du = ensureDataUri(`data:image/svg+xml;utf8,${svg}`);
    expect(isLikelySvg(svg)).toBe(true);
    const { headStr } = planHead(du);
    const tailHex = cutTail({ fullStr: du, onChainPrefixStr: headStr });
    const calls = buildAppendCalls({ contract: 'KT1', tokenId: 0, tailHex });
    const rebuilt = headStr + Buffer.from(tailHex, 'hex').toString('utf8');
    expect(rebuilt).toBe(du);
    expect(Array.isArray(calls)).toBe(true);
  });

  test('large svg generates calls', () => {
    const du = ensureDataUri(`data:image/svg+xml;utf8,${bigSvg}`);
    const { remainingHex } = planHead(du);
    const calls = buildAppendCalls({ contract: 'KT1', tokenId: 0, tailHex: remainingHex });
    expect(calls.length).toBeGreaterThan(0);
  });
});