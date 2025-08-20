/* eslint-env jest */

const {
  deriveSeedHex,
  seed32FromHex,
  sfc32,
} = require('../src/utils/generativeSeed.cjs');

test('deriveSeedHex stable and sfc32 reproducible', () => {
  const seedHex = deriveSeedHex('KT1TEST', 1, 'tz1abc', 'salt');
  expect(seedHex).toBe('c5aa056375f0979aa672532eda3520e4');
  const seed32 = seed32FromHex(seedHex);
  const rng = sfc32(
    seed32,
    seed32 ^ 0x9e3779b9,
    seed32 ^ 0x243f6a88,
    seed32 ^ 0xb7e15162,
  );
  expect([rng(), rng(), rng()]).toStrictEqual([
    0.6026178633328527,
    0.9656853480264544,
    0.9104090763721615,
  ]);
});
