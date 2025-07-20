/*Developed by @jams2blues – ZeroContract Studio
  File: forge_service_node/index.js
  Rev:  r4  2025‑07‑21
  Summary: switched to LocalForger and Schema encoding; added
           encodeStorageForForge() helper; loads env RPC_URL for
           network; maintains dual‑network support. */

const express = require('express');
const cors    = require('cors');
const { RpcClient }      = require('@taquito/rpc');
const { Parser }         = require('@taquito/michel-codec');
const { LocalForger }    = require('@taquito/local-forging');
const { Schema }         = require('@taquito/michelson-encoder');

// Create Express app and enable JSON and CORS
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

// Health check endpoint required by Render
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Determine RPC URL from environment variable or default to Ghostnet.  When
// deploying a mainnet forge service, set RPC_URL accordingly (see
// deployTarget.js for service selection).  This preserves support for
// both ghostnet and mainnet networks.
const rpcUrl = process.env.RPC_URL || 'https://rpc.ghostnet.teztnets.com';
const rpc    = new RpcClient(rpcUrl);

/**
 * Utility to fetch branch and counter.
 * Uses the RPC to get the current head block hash (branch) and the next
 * counter for the given source address.  This mirrors the client‑side
 * logic used during local forging and ensures the correct counter is used.
 */
async function getBranchAndCounter(source) {
  const header   = await rpc.getBlockHeader();
  const branch   = header.hash;
  const contract = await rpc.getContract(source);
  const counter  = parseInt(contract.counter, 10) + 1;
  return { branch, counter: counter.toString() };
}

/**
 * Encode a high‑level storage object into Micheline.  If the provided
 * storage is already Micheline (i.e., has a `prim` field), it is returned
 * unchanged.  Otherwise, extract the storage type from the contract script
 * and use Schema.Encode to convert the storage.  This helper centralises
 * encoding logic for big‑maps and other complex types.
 *
 * @param {any} code Parsed Michelson code (Micheline)
 * @param {any} storage High‑level storage object or Micheline
 * @returns {any} Micheline representation of the storage
 */
function encodeStorageForForge(code, storage) {
  if (storage && typeof storage === 'object' && storage.prim) {
    return storage;
  }
  try {
    let script = code;
    let storageExpr;
    if (Array.isArray(script)) {
      storageExpr = script.find((p) => p.prim === 'storage');
    } else if (script && script.prim === 'storage') {
      storageExpr = script;
    }
    if (storageExpr && Array.isArray(storageExpr.args) && storageExpr.args.length) {
      const storageType = storageExpr.args[0];
      const schema      = new Schema(storageType);
      return schema.Encode(storage);
    }
  } catch (e) {
    // Fall through: return original storage on errors
  }
  return storage;
}

// POST /forge: accept Michelson code/storage/source, return forged bytes
app.post('/forge', async (req, res) => {
  try {
    const { code, storage, source } = req.body;
    if (!code || !storage || !source) {
      return res.status(400).json({ error: 'Missing code, storage or source' });
    }
    // Parse Michelson strings to Micheline using the Taquito parser
    const parser  = new Parser();
    const micCode = typeof code === 'string' ? parser.parseScript(code) : code;
    // If storage is a string, parse to Micheline; otherwise use directly
    const micStorage = typeof storage === 'string'
      ? parser.parseScript(storage)
      : storage;
    // Ensure storage is properly encoded for big‑maps and other complex types
    const encodedStorage = encodeStorageForForge(micCode, micStorage);
    // Fetch branch and counter for the originating account
    const { branch, counter } = await getBranchAndCounter(source);
    // Build operation content with conservative defaults
    const contents = [
      {
        kind         : 'origination',
        source       : source,
        fee          : '100000',  // minimal fee; clients may adjust later
        counter      : counter,
        gas_limit    : '200000',
        storage_limit: '60000',
        balance      : '0',
        script: {
          code   : micCode,
          storage: encodedStorage,
        },
      },
    ];
    // Forge the operation using LocalForger instead of RPC.forgeOperations.
    // This avoids RPC parse errors and ensures consistency with client-side forging.
    const forger      = new LocalForger();
    const forgedBytes = await forger.forge({ branch, contents });
    res.status(200).json({ forgedBytes, branch });
  } catch (err) {
    console.error('Error in /forge:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /inject: accept signedBytes, broadcast to network
app.post('/inject', async (req, res) => {
  try {
    let { signedBytes } = req.body;
    if (!signedBytes) {
      return res.status(400).json({ error: 'Missing signedBytes' });
    }
    if (signedBytes.startsWith('0x')) {
      signedBytes = signedBytes.slice(2);
    }
    // The injection endpoint expects a JSON string of the hex bytes
    const injectionResult = await rpc.injectOperation(signedBytes);
    res.status(200).json({ opHash: injectionResult });
  } catch (err) {
    console.error('Error in /inject:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Forge service listening on port ${PORT}`);
});

/* What changed & why:
   • Bumped revision to r4 and updated summary.
   • Added Schema import and encodeStorageForForge() for proper storage encoding.
   • Switched from RPC.forgeOperations to LocalForger to align with
     client-side forging and avoid prevalidation parse errors.
   • Preserved environment-based RPC_URL selection, retaining support for
     ghostnet and mainnet deployments via deployTarget.js.
*/