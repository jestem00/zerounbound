/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    forge_service_node/index.js
  Rev :    r9   2025‑07‑21
  Summary: Remote forging service built atop the official Octez CLI.
           This service exposes a single `/forge` endpoint which
           accepts a Michelson script, initial storage and the
           originating tz1/KT1 address.  It writes the script and
           storage to temporary files and shells out to the
           `octez-client` binary to construct and forge a dummy
           origination.  The resulting operation bytes are returned
           to the caller for signing.  An `/inject` endpoint is
           intentionally omitted; clients must inject using RPC via
           Taquito’s `injectSigned()` helper.  To use this service
           you must install the Octez client inside your deployment
           (see the accompanying Dockerfile for installation steps).
─────────────────────────────────────────────────────────────────*/

const express = require('express');
const cors    = require('cors');
const fs      = require('fs/promises');
const os      = require('os');
const path    = require('path');
const { execFile } = require('child_process');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Basic health check for Render’s liveness probe
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Execute a CLI command and return its stdout.  This helper wraps
 * Node’s child_process.execFile in a Promise and sets a generous
 * buffer to accommodate the large output produced by octez-client.
 *
 * @param {string} bin Path to the binary
 * @param {string[]} args List of command line arguments
 * @returns {Promise<string>} Stdout from the command
 */
function runCli(bin, args = []) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 1024 * 1024 * 50 }, (err, stdout) => {
      if (err) {
        return reject(err);
      }
      resolve(stdout.toString());
    });
  });
}

/**
 * Forge an origination using the Octez client.  A temporary
 * Michelson script and storage are written to the OS temp directory
 * and passed to `octez-client originate contract dummy ... --dry-run`.
 * The command produces a "Raw operation bytes" line which we
 * extract with a regular expression.  The temporary files are
 * removed on completion.
 *
 * @param {any} code The contract code (string or Micheline array)
 * @param {any} storage The initial storage object
 * @param {string} source The tz1/KT1 address originating the contract
 * @returns {Promise<string>} Hex string of forged operation bytes
 */
async function forgeWithOctez(code, storage, source) {
  // Determine CLI path and RPC endpoint from environment with sensible
  // defaults.  `OCTEZ_CLIENT` can be set to override the binary
  // location; `RPC_URL` selects which Tezos RPC node to use.
  const octez     = process.env.OCTEZ_CLIENT || 'octez-client';
  const rpc       = process.env.RPC_URL      || 'https://rpc.ghostnet.teztnets.com';
  // Create a temporary directory for this forge request
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-'));
  const codeFile    = path.join(tmpDir, 'contract.tz');
  const storageFile = path.join(tmpDir, 'storage.json');
  // Write the code and storage to disk.  If `code` is an object it
  // will be stringified; otherwise it is assumed to be a Michelson
  // string.  Storage is always stringified as JSON.
  await fs.writeFile(codeFile, typeof code === 'string' ? code : JSON.stringify(code));
  await fs.writeFile(storageFile, JSON.stringify(storage));
  try {
    // Build the originate command.  Using `--dry-run` and `--force`
    // constructs the operation without injecting it.  The dummy
    // alias can be anything; it is ignored on dry-run.  We set a
    // conservative burn cap since the CLI requires one even in dry
    // runs.  The RPC endpoint is passed via --endpoint.
    const args = [
      '--endpoint', rpc,
      'originate', 'contract', 'dummy',
      'transferring', '0',
      'from', source,
      'running', codeFile,
      '--init', storageFile,
      '--burn-cap', '3',
      '--dry-run',
      '--force',
    ];
    const output = await runCli(octez, args);
    // octez-client prints the raw bytes on a line that looks like:
    // "Raw operation bytes: 0385734d...".  Extract the hex string.
    const match = output.match(/Raw operation bytes:?\s*([0-9a-fA-F]+)/);
    if (!match) {
      throw new Error('Unable to parse forged bytes from Octez output');
    }
    return match[1];
  } finally {
    // Clean up temporary files regardless of success
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

app.post('/forge', async (req, res) => {
  try {
    const { code, storage, source } = req.body || {};
    if (!code || !storage || !source) {
      return res.status(400).json({ error: 'Missing code, storage or source' });
    }
    const bytes = await forgeWithOctez(code, storage, source);
    return res.json({ forgedBytes: bytes });
  } catch (err) {
    console.error('Forge error:', err);
    return res.status(500).json({ error: err.message || 'Forge failed' });
  }
});

// The inject endpoint is deliberately disabled.  Clients must sign
// and inject operations via TezosToolkit on the front‑end.  This
// preserves flexibility and avoids server‑side secrets.  Return 501
// to indicate that the functionality is not implemented.
app.post('/inject', (_req, res) => {
  return res.status(501).json({ error: 'Injection not supported on forge service' });
});

// Bind to the configured port (default 8000).  Render will respect
// the PORT environment variable and map it to the external service.
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Forge service listening on port ${PORT}`);
});

/* What changed & why:
   – Replaced Taquito-based forging logic with a CLI-driven workflow.
     Octez-client is invoked with a dry-run origination to construct
     operation bytes exactly as the protocol would.  This method
     handles large contracts reliably and avoids prevalidation errors
     seen with Temple.  The service no longer attempts to inject
     operations and instead delegates that responsibility to the
     client.  Revision bumped to r9 to reflect major overhaul.
*/