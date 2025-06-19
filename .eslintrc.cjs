/*Developed by @jams2blues with love for the Tezos community
  File:    .eslintrc.cjs
  Summary: add “no-local-estimator” guard; keep em-dash ban */

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

    /* ban em-dash characters */
    'no-restricted-syntax': [
      'error',
      /* em-dash guard (I22) */
      {
        selector: "Literal[value=/\\u2014/]",
        message : 'Use double hyphen instead of em-dash.',
      },
      /* NEW: forbid raw toolkit.estimate usage – centralise in feeEstimator.js */
      {
        selector:
          "MemberExpression[property.name='estimate']",
        message :
          'Use shared feeEstimator.estimateChunked() – local estimators are disallowed.',
      },
    ],
  },
  ignorePatterns: ['summarized_files/**', 'public/**'],
};
/* What changed & why:
   • Added explicit guard against direct `toolkit.estimate.*`
     (rule nick-named “no-local-estimator”, I85).
*/
/* EOF */
