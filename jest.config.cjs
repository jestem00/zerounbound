/*──────── jest.config.cjs ────────*/
// jest.config.cjs
/*───────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File:    jest.config.cjs
Rev :    r2   2025‑07‑15
Summary: add tests for views.hex.js & chooseFastestRpc.js
───────────────────────────────────────────────────────────────*/
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  collectCoverage: false,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
/* What changed & why: Added setup file for jest-dom; rev r2. */