/*Developed by @jams2blues with love for the Tezos community
  File: scripts/updatePkgName.js
  Summary: Auto-rename the “name” field in package.json
           → zerounbound-ghostnet | zerounbound-mainnet
           based on TARGET declared in src/config/deployTarget.js */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*──────── read TARGET from deployTarget.js ───────*/
const deployFile = path.resolve('src/config/deployTarget.js');
const deploySrc  = fs.readFileSync(deployFile, 'utf8');
const m = /export const TARGET\s*=\s*'([^']+)'/.exec(deploySrc);
if (!m) {
  console.error('✖  TARGET not found in deployTarget.js');
  process.exit(1);
}
const target = m[1]; // 'ghostnet' | 'mainnet'

/*──────── patch package.json ───────*/
const pkgFile = path.resolve('package.json');
const pkg     = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));

const desired = `zerounbound-${target}`;
if (pkg.name !== desired) {
  pkg.name = desired;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✔  package.json name set to ${desired}`);
} else {
  console.log(`ℹ  package.json already set to ${desired}`);
}

/* EOF */
