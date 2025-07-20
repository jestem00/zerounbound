/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    forge_service_node/index.js
  Rev :    r5   2025‑07‑21
  Summary: Express backend for remote forging and injection.  Uses
           Taquito's RpcClient and LocalForger to construct operations.
           Automatically encodes high‑level storage via Schema and
           prepends a reveal operation when the manager key is not
           revealed.  Supports both ghostnet and mainnet via RPC_URL.
──────────────────────────────────────────────────────────────────*/

const express = require('express');
const cors    = require('cors');
const { RpcClient }   = require('@taquito/rpc');
const { LocalForger } = require('@taquito/local-forging');
const { Parser }      = require('@taquito/michel-codec');
const { Schema }      = require('@taquito/michelson-encoder');

// Create Express app and enable JSON and CORS
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

// Health check endpoint required by Render
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Determine RPC URL from environment variable or default to Ghostnet
const rpcUrl = process.env.RPC_URL || 'https://rpc.ghostnet.teztnets.com';
const rpc    = new RpcClient(rpcUrl);

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
 * POST /forge
 * Accepts a contract code, storage, source address and optional
 * publicKey from the client.  Encodes storage, checks if the source
 * account needs a reveal operation and constructs the contents array
 * accordingly.  Uses LocalForger to forge the operation bytes and
 * returns them in the response.  Clients should handle signing and
 * injection separately.
 */
app.post('/forge', async (req, res) => {
  try {
    const { code, storage, source, publicKey } = req.body || {};
    if (!code || !storage || !source) {
      return res.status(400).json({ error: 'Missing code, storage or source' });
    }
    // Parse code and storage into Micheline if necessary
    const parser = new Parser();
    const micCode    = typeof code === 'string' ? parser.parseScript(code) : code;
    const micStorage = typeof storage === 'string' ? parser.parseScript(storage) : storage;
    // Encode high‑level storage for complex types
    const encodedStorage = encodeStorageForForge(micCode, micStorage);
    // Fetch branch and initial counter for the source
    const { branch, counter } = await getBranchAndCounter(source);
    let nextCounter = parseInt(counter, 10);
    const contents = [];
    // Check if reveal is required by inspecting manager key
    let needsReveal = false;
    if (publicKey) {
      try {
        const mgrKey = await rpc.getManagerKey(source);
        if (!mgrKey) needsReveal = true;
      } catch (err) {
        // If manager key lookup fails, assume reveal is required
        needsReveal = true;
      }
    }
    // If reveal is needed, prepend reveal operation
    if (needsReveal && publicKey) {
      contents.push({
        kind         : 'reveal',
        source       : source,
        fee          : '1300',      // typical fee for reveal
        counter      : nextCounter.toString(),
        gas_limit    : '10000',
        storage_limit: '0',
        public_key   : publicKey,
      });
      nextCounter += 1;
    }
    // Append origination operation
    contents.push({
      kind         : 'origination',
      source       : source,
      fee          : '100000',      // conservative fee; clients may override
      counter      : nextCounter.toString(),
      gas_limit    : '200000',
      storage_limit: '60000',
      balance      : '0',
      script: {
        code   : micCode,
        storage: encodedStorage,
      },
    });
    // Forge the operation using LocalForger
    const forger      = new LocalForger();
    const forgedBytes = await forger.forge({ branch, contents });
    return res.status(200).json({ forgedBytes });
  } catch (err) {
    console.error('Error in /forge:', err);
    return res.status(500).json({ error: err.message });
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
    return res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Forge service listening on port ${PORT}`);
});

/* What changed & why:
   • Introduced LocalForger and Schema-based storage encoding to avoid RPC
     forging errors.  Added encodeStorageForForge() helper to encode
     high‑level storage types via Schema.  Ensured code and storage are
     parsed via Parser.
   • Added reveal support: if the source account has no manager key and
     a publicKey is provided, a reveal operation is prepended.  Counter
     handling ensures sequential counters for reveal and origination.
   • Added optional publicKey parameter for /forge to support reveal
     logic.  Maintained environment-based RPC selection for ghostnet and
     mainnet deployments.  Added extensive error handling and logging. */