/*---------------------------------------------------------------
Developed by @jams2blues - ZeroContract Studio
File:    jest.config.cjs
Rev :    r5   2025-09-19
Summary: ESM-aware Jest harness (babel-jest with inline next/babel preset, .jsx as ESM, unstable_mockModule mocks).
---------------------------------------------------------------*/
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['next/babel'] }],
  },
  transformIgnorePatterns: [],
  moduleFileExtensions: ['js', 'jsx', 'json', 'node'],
  moduleNameMapper: {},
  extensionsToTreatAsEsm: ['.jsx'],
  testMatch: ['<rootDir>/__tests__/**/*.(test|spec).[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/summarized_files/', '/zerounbound.bak/'],
};
