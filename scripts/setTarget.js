/*Developed by @jams2blues with love for the Tezos community
  File: scripts/setTarget.js
  Summary: one-liner helper — rewrite src/config/deployTarget.js
           so const TARGET = '<net>' (ghostnet | mainnet)
           No environment-variables needed; call once per build. */

import fs   from 'node:fs';
import path from 'node:path';

const ALLOWED = new Set(['ghostnet', 'mainnet']);
const net = (process.argv[2] || '').trim();

if (!ALLOWED.has(net)) {
  console.error(`✖  Usage:  node scripts/setTarget.js [ghostnet|mainnet]`);
  process.exit(1);
}

const file = path.resolve('src/config/deployTarget.js');
const src  = fs.readFileSync(file, 'utf8');

const next = src.replace(
  /export const TARGET = '.*?';/,
  `export const TARGET = '${net}';`,
);

fs.writeFileSync(file, next);
console.log(`✔  TARGET set to ${net} in deployTarget.js`);
