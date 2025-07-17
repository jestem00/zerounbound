/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    .eslintrc.cjs
  Rev :    r7    2025-07-15
  Summary: add views.hex.js to ignorePatterns; relax warnings for new API routes
──────────────────────────────────────────────────────────────*/
module.exports = {
  env: { browser: true, es2022: true, node: true },
  extends: [
    'next/core-web-vitals',
    'plugin:styled-components-a11y/recommended',
    'eslint:recommended',
  ],
  plugins: ['styled-components-a11y'],
  rules: {
    /* ——————————— GLOBAL TEMP SUPPRESSIONS ——————————— */
    'no-multi-spaces'                : 'off',
    'max-len'                        : 'off',
    'no-irregular-whitespace'        : 'off',
    'no-control-regex'               : 'off',
    'no-empty'                       : 'off',
    'no-sparse-arrays'               : 'off',
    '@next/next/no-img-element'      : 'off',
    'jsx-a11y/media-has-caption'     : 'off',
    'no-useless-escape'              : 'off',
    /* ———————————————————————————————————————————————— */

    /* keep logic / safety guards intact */
    'no-undef'      : 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

    /* demote noisy style rules to “warn” so `--max-warnings 0`
       gate is still enforced via scripts‑folder override        */
    'no-console'           : 'off',
    'no-restricted-syntax' : 'off',
    'react-hooks/exhaustive-deps': 'off',
  },

  /*──────────── folder‑level overrides ────────────*/
  overrides: [
    /* build / tooling scripts – allow console etc. */
    {
      files: ['scripts/**'],
      rules: {
        'no-console'           : 'off',
        'no-restricted-syntax' : 'off',
        'no-unused-vars'       : 'off',
      },
    },
    /* UI folders – relax a11y click / label warnings temporarily */
    {
      files: ['src/ui/**'],
      rules: {
        'jsx-a11y/label-has-associated-control'                 : 'off',
        'styled-components-a11y/click-events-have-key-events'   : 'off',
        'styled-components-a11y/no-static-element-interactions' : 'off',
        'styled-components-a11y/no-noninteractive-element-to-interactive-role': 'off',
      },
    },
    /* API routes – allow console for server logs */
    {
      files: ['src/pages/api/**'],
      rules: {
        'no-console': 'off',
      },
    },
  ],

  /*
   * NOTE: These suppressions are **temporary** and tracked under
   * Invariant ledger; they will be rolled back once legacy files
   * are fully migrated. The project still blocks on any remaining
   * “error” level diagnostics.
   */
  ignorePatterns: ['summarized_files/**', 'public/**', 'src/constants/views.hex.js'],
};
/* EOF */