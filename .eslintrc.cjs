/*Developed by @jams2blues with love for the Tezos community
  File: .eslintrc.cjs
  Summary: Lint ruleset enforcing user style prefs + a11y */

module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'next/core-web-vitals',
    'plugin:styled-components-a11y/recommended',
    'eslint:recommended',
  ],
  plugins: ['styled-components-a11y'],
  rules: {
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'max-len': ['error', { code: 100 }],
    'no-undef': 'error',
    'no-multi-spaces': 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // custom: ban em-dash unicode char
    'no-restricted-syntax': [
      'error',
      {
        selector: "Literal[value=/\\u2014/]",
        message: 'Use double hyphen instead of em-dash.',
      },
    ],
  },
  ignorePatterns: ['summarized_files/**', 'public/**'],
};
/* What changed & why: baseline ESLint config ensures repo-wide lint pass */
