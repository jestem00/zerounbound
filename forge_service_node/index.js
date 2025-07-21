/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    forge_service_node/index.js
  Rev :    r6   2025‑07‑21
  Summary: Refactored remote forge service for Tezos origination.
           Uses Taquito’s TezosToolkit to estimate gas/fee/storage
           and LocalForger for deterministic forging.  Handles
           reveal operations when needed.  Returns forged bytes
           only; injection should be handled client‑side via
           injectSigned() to avoid RPC 500 errors.  Supports
           ghostnet and mainnet via RPC_URL environment variable.
──────────────────────────────────────────────────────────────────*/

const express = require('express');
const cors    = require('cors');
const { RpcClient }   = require('@taquito/rpc');
const { LocalForger } = require('@taquito/local-forging');
const { Parser }      = require('@taquito/michel-codec');
const { Schema }      = require('@taquito/michelson-encoder');
const { TezosToolkit, OpKind } = require('@taquito/taquito');

// Create Express app and enable JSON and CORS
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

// Health check endpoint required by Render
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Determine RPC URL from environment variable or default to Ghostnet.  We
// construct both a low-level RpcClient (for branch/counter queries) and
// a TezosToolkit instance (for fee/gas/storage estimation).
const rpcUrl = process.env.RPC_URL || 'https://rpc.ghostnet.teztnets.com';
const rpc    = new RpcClient(rpcUrl);
const Tezos  = new TezosToolkit(rpcUrl);

/**
 * Utility to fetch branch and counter for a given source address.
 * Uses the RPC to get the current head block hash (branch) and
 * the next counter for the source account.
 *
 * @param {string} source tz1/KT1 address
 * @returns {Promise<{ branch: string, counter: string }>}
 */
async function getBranchAndCounter(source) {
  const header   = await rpc.getBlockHeader();
  const branch   = header.hash;
  const contract = await rpc.getContract(source);
  const counter  = parseInt(contract.counter, 10) + 1;
  return { branch, counter: counter.toString() };
}

/**
 * Encode high‑level storage into Micheline using Schema.  If the code
 * argument is a string, it is parsed with Parser.  If the storage
 * already appears to be Micheline (has a prim property), it is
 * returned unchanged.  Otherwise, the storage type is extracted from
 * the Michelson script and encoded via Schema.  On error, the
 * original storage is returned.
 *
 * @param {any} code Michelson code array or string
 * @param {any} storage High‑level storage object or Micheline
 * @returns {any} Encoded storage in Micheline or original value
 */
function encodeStorageForForge(code, storage) {
  // If storage already looks like Micheline, return it directly
  if (storage && typeof storage === 'object' && storage.prim) {
    return storage;
  }
  try {
    let script = code;
    if (typeof code === 'string') {
      const parser = new Parser();
      script = parser.parseScript(code);
    }
    // Find the storage declaration
    let storageExpr;
    if (Array.isArray(script)) {
      storageExpr = script.find((d) => d.prim === 'storage');
    } else if (script && script.prim === 'storage') {
      storageExpr = script;
    }
    if (storageExpr && Array.isArray(storageExpr.args) && storageExpr.args.length) {
      const storageType = storageExpr.args[0];
      const schema = new Schema(storageType);
      return schema.Encode(storage);
    }
  } catch (err) {
    // Swallow errors and return original storage
  }
  return storage;
}

/**
 * Determine whether a reveal operation is required for the given source.
 * Queries the manager key; if undefined or errors, returns true.  A
 * publicKey must be provided by the caller for the reveal operation.
 *
 * @param {string} source tz address
 * @returns {Promise<boolean>} true if reveal is required
 */
async function needsReveal(source) {
  try {
    const mgrKey = await rpc.getManagerKey(source);
    return !mgrKey;
  } catch (err) {
    return true;
  }
}

/**
 * POST /forge
 * Accepts a contract code, storage, source address and optional
 * publicKey from the client.  Encodes storage, checks if the source
 * account needs a reveal operation and constructs the contents array
 * accordingly.  Uses TezosToolkit to estimate gas/fee/storage and
 * LocalForger to forge the operation bytes.  Returns the bytes in
 * the response.  Clients should handle signing and injection
 * separately (via injectSigned()).
 */
app.post('/forge', async (req, res) => {
  try {
    const { code, storage, source, publicKey } = req.body || {};
    if (!code || !storage || !source) {
      return res.status(400).json({ error: 'Missing code, storage or source' });
    }
    // Parse code if provided as a string
    let parsedCode = code;
    if (typeof code === 'string') {
      try {
        const parser = new Parser();
        parsedCode = parser.parseScript(code);
      } catch (errParse) {
        return res.status(400).json({ error: 'Invalid contract code: ' + errParse.message });
      }
    }
    // Encode storage
    const encodedStorage = encodeStorageForForge(parsedCode, storage);
    // Fetch branch and initial counter
    const { branch, counter } = await getBranchAndCounter(source);
    let nextCounter = parseInt(counter, 10);
    const contents = [];
    // Determine if reveal is needed
    let revealNeeded = false;
    if (publicKey) {
      revealNeeded = await needsReveal(source);
    }
    if (revealNeeded && publicKey) {
      contents.push({
        kind         : OpKind.REVEAL,
        source       : source,
        fee          : '1300',
        counter      : nextCounter.toString(),
        gas_limit    : '10000',
        storage_limit: '0',
        public_key   : publicKey,
      });
      nextCounter += 1;
    }
    // Estimate fee/gas/storage for the origination
    let feeMutez     = '200000';
    let gasLimit     = '200000';
    let storageLimit = '60000';
    try {
      const estimate = await Tezos.estimate.originate({ code: parsedCode, storage: encodedStorage, balance: '0' });
      feeMutez     = estimate.suggestedFeeMutez.toString();
      gasLimit     = estimate.gasLimit.toString();
      storageLimit = estimate.storageLimit.toString();
    } catch (e) {
      // If estimation fails, leave defaults
    }
    contents.push({
      kind         : OpKind.ORIGINATION,
      source       : source,
      fee          : feeMutez,
      counter      : nextCounter.toString(),
      gas_limit    : gasLimit,
      storage_limit: storageLimit,
      balance      : '0',
      script       : { code: parsedCode, storage: encodedStorage },
    });
    // Forge using LocalForger (avoid RPC forging to sidestep node parsing)
    try {
      const forger = new LocalForger();
      const forgedBytes = await forger.forge({ branch, contents });
      return res.status(200).json({ forgedBytes });
    } catch (forgeErr) {
      return res.status(500).json({ error: forgeErr.message || 'Forge failed' });
    }
  } catch (err) {
    console.error('Error in /forge:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * POST /inject
 * Accepts signedBytes in hex format.  Strips 0x prefix if present and
 * forwards the operation to the underlying RPC injection endpoint.
 * Returns the operation hash.  If injection fails, returns 500.
 */
app.post('/inject', async (req, res) => {
  try {
    let { signedBytes } = req.body || {};
    if (!signedBytes) {
      return res.status(400).json({ error: 'Missing signedBytes' });
    }
    if (signedBytes.startsWith('0x')) {
      signedBytes = signedBytes.slice(2);
    }
    const opHash = await rpc.injectOperation(signedBytes);
    return res.status(200).json({ opHash });
  } catch (err) {
    console.error('Error in /inject:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Forge service listening on port ${PORT}`);
});

/* What changed & why:
   • Introduced TezosToolkit to estimate gas/fee/storage, ensuring the
     origination has adequate limits for large contracts.  This
     prevents underestimation and prevalidation failures.
   • Added needsReveal() helper to determine reveal operations based
     on manager key.  Prepend reveal with typical fee/gas.
   • Refactored /forge to build contents using reveal + origination,
     estimate limits, and use LocalForger exclusively.  Returns
     forgedBytes only; injection is moved to client to avoid
     backend 500 errors.  This addresses malformed payloads and
     mismatched dependencies.
   • Added TezosToolkit dependency; removed RPC forging fallback; updated
     comments and header.  Rev bumped to r6.
*/