/*Developed by @jams2blues with love for the Tezos community
  File: scripts/startDev.js
  Summary: CLI banner + port override.
*/
import { DEV_PORT, NETWORK_LABEL } from '../src/config/deployTarget.js';
import { spawn } from 'node:child_process';

console.log(`🚀  Launching ZeroUnbound (${NETWORK_LABEL}) on http://localhost:${DEV_PORT} …`);

spawn('next', ['dev', '-p', String(DEV_PORT)], {
  stdio: 'inherit',
  shell: true
});
/* What changed & why
   • Restored DEV_PORT export to config/deployTarget.js, so yarn dev works.
   • Uses spawn() to run next dev, so the process is inherited and can
*/