/*Developed by @jams2blues – ZeroContract Studio
  File: forge_service_node/index.js
  Rev:  r2 2025‑07‑20
  Summary: add /healthz endpoint for Render health checks and improve logging */

const express = require('express');
const cors    = require('cors');
const { RpcClient }  = require('@taquito/rpc');
const { Parser }     = require('@taquito/michel-codec');

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

// Utility to fetch branch and counter
async function getBranchAndCounter(source) {
  // Get head block header for branch
  const header = await rpc.getBlockHeader();
  const branch = header.hash;
  // Get contract info to determine next counter
  const contract = await rpc.getContract(source);
  const counter  = parseInt(contract.counter, 10) + 1;
  return { branch, counter: counter.toString() };
}

// POST /forge: accept Michelson code/storage/source, return forged bytes
app.post('/forge', async (req, res) => {
  try {
    const { code, storage, source } = req.body;
    if (!code || !storage || !source) {
      return res.status(400).json({ error: 'Missing code, storage or source' });
    }
    // Parse Michelson strings to Micheline using Taquito parser
    const parser     = new Parser();
    const micCode    = typeof code    === 'string' ? parser.parseScript(code)    : code;
    const micStorage = typeof storage === 'string' ? parser.parseScript(storage) : storage;
    // Fetch branch and counter
    const { branch, counter } = await getBranchAndCounter(source);
    // Build operation content with conservative defaults
    const contents = [
      {
        kind: 'origination',
        source,
        fee: '100000',
        counter,
        gas_limit: '200000',
        storage_limit: '60000',
        balance: '0',
        script: {
          code:    micCode,
          storage: micStorage,
        },
      },
    ];
    const operation   = { branch, contents };
    // Forge operation via RPC helper
    const forgedBytes = await rpc.forgeOperations(operation);
    res.status(200).json({ forgedBytes, branch });
  } catch (err) {
    // Log detailed error to server logs
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
   – Added /healthz route to satisfy Render’s health check.
   – Added header with revision and summary for project tracking.
   – Improved error logging for /forge and /inject endpoints.
*/