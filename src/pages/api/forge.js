/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/api/forge.js
  Rev :    r4   2025‑07‑19
  Summary: serverless API to forge an origination operation.  It
           imports RPC_URLS from deployTarget.js to select a
           battle‑tested RPC without relying on environment
           variables.  The endpoint estimates gas and storage,
           falls back to generous defaults on failure, and
           returns the forged bytes to the client.  Works in both
           local yarn dev and Vercel environments without any
           configuration.  Increases the request body size limit
           to 1 MB to accommodate large contracts.  Expects a
           POST body with `code`, `storage` and `source` (tz1/KT1
           address).
──────────────────────────────────────────────────────────────*/

import { TezosToolkit } from '@taquito/taquito';
import { LocalForger } from '@taquito/local-forging';
import { RPC_URLS } from '../../config/deployTarget.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
    }
  try {
    const { code, storage, source } = req.body;
    if (!code || !storage || !source) {
      return res.status(400).json({ error: 'Missing code, storage or source' });
    }
    // Use the first RPC from the network config.  No environment
    // variables are required; deployTarget.js centralises network
    // selection and RPC URLs.
    const rpcUrl = RPC_URLS[0];
    const toolkit = new TezosToolkit(rpcUrl);
    // Attempt to estimate limits.  Use high defaults on failure.
    let feeMutez = '200000';
    let gasLimit = '1040000';
    let storageLimit = '60000';
    try {
      const estimate = await toolkit.estimate.originate({ code, storage, balance: '0' });
      feeMutez = estimate.suggestedFeeMutez.toString();
      gasLimit = estimate.gasLimit.toString();
      storageLimit = estimate.storageLimit.toString();
    } catch (e) {
      // swallow estimation errors and use defaults
    }
    const blockHeader = await toolkit.rpc.getBlockHeader();
    const branch = blockHeader.hash;
    const counter = parseInt((await toolkit.rpc.getContract(source)).counter, 10) + 1;
    const contents = [
      {
        kind: 'origination',
        source,
        fee: feeMutez,
        counter: counter.toString(),
        gas_limit: gasLimit,
        storage_limit: storageLimit,
        balance: '0',
        script: { code, storage },
      },
    ];
    const forger = new LocalForger();
    const forgedBytes = await forger.forge({ branch, contents });
    return res.status(200).json({ forgedBytes });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Forge failed' });
  }
}

// Increase the request body size limit to 1 MB to accommodate large
// Michelson code and storage payloads.  Without this, Next.js API
// routes may reject requests with `413 Payload Too Large` errors
// when forging big contracts on Ghostnet/Mainnet.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

/* What changed & why: Added a new serverless function to offload
   operation forging to Vercel.  It uses Taquito to estimate gas
   limits but falls back to generous defaults on failure.  The
   operation is forged locally using LocalForger and returned to
   the client as a hex string. */