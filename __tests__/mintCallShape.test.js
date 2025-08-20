/* eslint-env jest */
const { buildMintCall } = require('../src/ui/Entrypoints/mintCallShape.cjs');

const mkC = () => ({ methods: { mint: jest.fn(() => ({ _tag: 'ok' })) } });

test('v1 uses (map,to)', () => {
  const c = mkC();
  buildMintCall(c, 'v1', 1, 'MAP', 'TO');
  expect(c.methods.mint).toHaveBeenCalledWith('MAP', 'TO');
});

test('v2a uses (n,map,to)', () => {
  const c = mkC();
  buildMintCall(c, 'v2a', 5, 'MAP', 'TO');
  expect(c.methods.mint).toHaveBeenCalledWith(5, 'MAP', 'TO');
});

test('v2b uses (map,to)', () => {
  const c = mkC();
  buildMintCall(c, 'v2b', 1, 'MAP', 'TO');
  expect(c.methods.mint).toHaveBeenCalledWith('MAP', 'TO');
});

test('v3 uses (n,map,to)', () => {
  const c = mkC();
  buildMintCall(c, 'v3', 2, 'MAP', 'TO');
  expect(c.methods.mint).toHaveBeenCalledWith(2, 'MAP', 'TO');
});

test('v4a uses (to,n,map)', () => {
  const c = mkC();
  buildMintCall(c, 'v4a', 3, 'MAP', 'TO');
  expect(c.methods.mint).toHaveBeenCalledWith('TO', 3, 'MAP');
});
