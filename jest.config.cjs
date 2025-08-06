// jest.config.cjs
/*───────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File:    jest.config.cjs
Rev :    r3   2025‑08‑10
Summary: include tests/ directory and support CommonJS helper.
───────────────────────────────────────────────────────────────*/
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/tests/**/*.test.[jt]s?(x)'],
  collectCoverage: false,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
/* What changed & why: Added tests/ directory; switched helper to CJS. */
