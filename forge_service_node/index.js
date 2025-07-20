/*Developed by @jams2blues – ZeroContract Studio
  File: forge_service_node/index.js
  Rev:  r4 2025‑07‑21
  Summary: enhanced /forge to handle unrevealed keys; accepts publicKey and inserts
           a reveal operation when necessary; encodes storage and forges locally. */

const express = require('express');
const cors    = require('cors');
const { RpcClient }      = require('@taquito/rpc');
const { Parser }         = require('@taquito/michel-codec');
const { LocalForger }    = require('@taquito/local-forging');
const { Schema }         = require('@taquito/michelson-encoder');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const rpcUrl = process.env.RPC_URL || 'https://rpc.ghostnet.teztnets.com';
const rpc    = new RpcClient(rpcUrl);

async function getBranchAndCounter(source) {
  const header   = await rpc.getBlockHeader();
  const branch   = header.hash;
  const contract = await rpc.getContract(source);
  const counter  = parseInt(contract.counter, 10) + 1;
  return { branch, counter: counter.toString() };
}

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
  } catch (e) { }
  return storage;
}

// POST /forge: build and forge an operation.
// Includes a reveal operation when the source account is unrevealed and
// the caller supplies a publicKey.
app.post('/forge', async (req, res) => {
  try {
    const { code, storage, source, publicKey } = req.body;
    if (!code || !storage || !source) {
      return res.status(400).json({ error: 'Missing code, storage or source' });
    }
    const parser    = new Parser();
    const micCode   = typeof code === 'string' ? parser.parseScript(code) : code;
    const micStorage = typeof storage === 'string' ? parser.parseScript(storage) : storage;
    const encodedStorage = encodeStorageForForge(micCode, micStorage);
    const { branch, counter } = await getBranchAndCounter(source);
    let counterInt = parseInt(counter, 10);
    const contents = [];
    try {
      const managerKey = await rpc.getManagerKey(source);
      if (!managerKey) {
        if (!publicKey) {
          return res.status(400).json({ error: 'Unrevealed key requires publicKey' });
        }
        contents.push({
          kind         : 'reveal',
          source       : source,
          fee          : '100000',
          counter      : counterInt.toString(),
          gas_limit    : '10000',
          storage_limit: '0',
          public_key   : publicKey,
        });
        counterInt += 1;
      }
    } catch (e) {
      console.error('getManagerKey error:', e);
    }
    contents.push({
      kind         : 'origination',
      source       : source,
      fee          : '100000',
      counter      : counterInt.toString(),
      gas_limit    : '200000',
      storage_limit: '60000',
      balance      : '0',
      script: {
        code   : micCode,
        storage: encodedStorage,
      },
    });
    const forger      = new LocalForger();
    const forgedBytes = await forger.forge({ branch, contents });
    res.status(200).json({ forgedBytes, branch });
  } catch (err) {
    console.error('Error in /forge:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /inject remains unchanged …

/* What changed & why:
   • Rev bumped to r4; /forge now accepts publicKey and prepends a reveal operation
     when the manager key is unrevealed, ensuring the origination is valid.
   • Uses encodeStorageForForge() and LocalForger to build and forge operations
     with correct counters.  Returns error if publicKey is required but missing.
*/
