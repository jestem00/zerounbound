/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    forge_service_node/index.js
  Rev :    r10   2025‑07‑21
  Summary: Pass initial storage directly as Micheline JSON string to
           octez-client via --init.  This avoids the previous
           misaligned expression error caused by writing storage to a
           separate file and referencing it on the command line.
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
 * Michelson script is written to the OS temp directory and passed to
 * `octez-client originate contract dummy ... --dry-run`.  Unlike the
 * previous implementation, the initial storage is provided
 * inline via the `--init` flag as a Micheline JSON string.  This
 * eliminates misaligned expression errors caused by referencing a
 * separate storage file.  The command produces a "Raw operation
 * bytes" line which we extract with a regular expression.  The
 * temporary files are removed on completion.
 *
 * @param {any} code The contract code (string or Micheline array)
 * @param {any} storage The initial storage object (Micheline or high-level)
 * @param {string} source The tz1/KT1 address originating the contract
 * @returns {Promise<string>} Hex string of forged operation bytes
 */
async function forgeWithOctez(code, storage, source) {
  // Determine CLI path and RPC endpoint from environment with sensible
  // defaults.  `OCTEZ_CLIENT` can be set to override the binary
  // location; `RPC_URL` selects which Tezos RPC node to use.
  const octez = process.env.OCTEZ_CLIENT || 'octez-client';
  const rpc   = process.env.RPC_URL      || 'https://rpc.ghostnet.teztnets.com';
  // Create a temporary directory for this forge request
  const tmpDir   = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-'));
  const codeFile = path.join(tmpDir, 'contract.tz');
  // Write the code to disk.  If `code` is an object it will be stringified;
  // otherwise it is assumed to be a Michelson string.
  await fs.writeFile(codeFile, typeof code === 'string' ? code : JSON.stringify(code));
  // Convert the provided storage to a Micheline JSON string.  When storage
  // is already a string we reuse it verbatim; otherwise we JSON stringify
  // the object.  The resulting string is passed directly to --init.
  const storageMicheline = typeof storage === 'string' ? storage : JSON.stringify(storage);
  try {
    const args = [
      '--endpoint',
      rpc,
      'originate',
      'contract',
      'dummy',
      'transferring',
      '0',
      'from',
      source,
      'running',
      codeFile,
      '--init',
      storageMicheline,
      '--burn-cap',
      '3',
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
   – Provide initial storage to octez-client via --init as a Micheline
     JSON string instead of writing it to a file.  Passing the file
     path previously caused misaligned expression parsing errors on
     large contracts.  This fix yields correct forging for the Zero
     Contract v4 deployment when using Temple Wallet.
   – Bumped revision to r10 and updated the summary accordingly.
*/