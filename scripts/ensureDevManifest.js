/*Developed by @jams2blues with love for the Tezos community
  File: scripts/ensureDevManifest.js
  Summary: seed /public/manifest.json every `yarn dev`.
*/
import {
  MANIFEST_NAME,
  THEME_COLOR,
  START_URL
} from '../src/config/deployTarget.js';

import fs from 'node:fs/promises';

(async () => {
  const base = JSON.parse(
    await fs.readFile('./public/manifest.base.json', 'utf8')
  );

  base.name        = MANIFEST_NAME;
  base.short_name  = 'ZeroUnbound';
  base.start_url   = START_URL;
  base.theme_color = THEME_COLOR;

  await fs.writeFile('./public/manifest.json', JSON.stringify(base, null, 2));
  console.log('📄  Dev-manifest refreshed → public/manifest.json');
})();
/*What changed & why: import list now matches deployTarget exports; script continues without SyntaxError.
*/