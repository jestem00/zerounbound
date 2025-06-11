/*Developed by @jams2blues with love for the Tezos community
  File: scripts/generateManifest.js
  Summary: CLI helper — injects START_URL & THEME_COLOR from deployTarget.js
           and writes public/manifest.json. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import actual JS exports from deployTarget
import { START_URL, THEME_COLOR, MANIFEST_NAME } from '../src/config/deployTarget.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src  = path.join(__dirname, '..', 'public', 'manifest.base.json');
const dest = path.join(__dirname, '..', 'public', 'manifest.json');

const tpl = JSON.parse(fs.readFileSync(src, 'utf8'));
tpl.start_url   = START_URL;
tpl.theme_color = THEME_COLOR;
tpl.name        = MANIFEST_NAME;

fs.writeFileSync(dest, JSON.stringify(tpl, null, 2));
console.log('🚀  Manifest refreshed → public/manifest.json');

/* What changed & why:
   • Removed JSON assertion import (only valid for .json modules).
   • Fixed relative path to config file (../src/config/deployTarget.js).
   • Now correctly imports JS constants under CommonJS/ESM environment. */
