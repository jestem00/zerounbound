/*Developed by @jams2blues – ZeroContract Studio
  File: scripts/startDev.js
  Rev : r4 2025‑07‑22
  Summary: dynamic port selection and environment alignment for
local development.  Reads network and port from deployTarget
and sets environment variables so Next.js and client hooks
select the correct API endpoints.  Fixes ENOENT by invoking
Next.js via the shell so the binary in node_modules/.bin is
discovered.  Displays a banner indicating the active network.
──────────────────────────────────────────────────────────────*/
import { DEV_PORT, NETWORK_LABEL, NETWORK_KEY } from '../src/config/deployTarget.js';
import { spawn } from 'child_process';

// Display a friendly banner showing which network is active.
console.log(`🚀 Launching ZeroUnbound (${NETWORK_LABEL}) on http://localhost:${DEV_PORT} …`);

// Ensure that both build‑time and runtime code pick up the correct network.
// Some components and hooks read process.env.NETWORK or process.env.NEXT_PUBLIC_NETWORK
// to determine which RPC and API base URLs to use.  Without setting these here,
// the app may default to Ghostnet even when TARGET is mainnet during development.
process.env.NETWORK = NETWORK_KEY;
process.env.NEXT_PUBLIC_NETWORK = NETWORK_KEY;

// Build a single command string.  Running via shell ensures that the local
// node_modules/.bin folder is searched for the “next” executable.  Without
// shell: true, Node cannot find “next” and throws ENOENT.
const devCommand = `next dev -p ${DEV_PORT}`;

const dev = spawn(devCommand, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env },
});

dev.on('exit', (code) => {
  process.exit(code);
});

/* What changed & why:
   • Added dynamic port selection by reading DEV_PORT from deployTarget.js.
   • Injected NETWORK and NEXT_PUBLIC_NETWORK env variables so that hooks
     pick up the correct network (mainnet or ghostnet) during development.
   • Switched spawn to shell mode so the “next” binary in node_modules/.bin
     can be found, preventing ENOENT errors.
   • Removed duplicate spawn calls and simplified logic.
   • Added a banner with the active network label for clarity.
*/
/* EOF */
