/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/api/forge.js
  Rev :    r1   2025‑07‑15
  Summary: serverless forge endpoint
──────────────────────────────────────────────────────────────*/
import { TezosToolkit } from '@taquito/taquito';
import { packDataBytes, forgeOperations } from '@taquito/rpc';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { code, storage } = req.body;
    if (!code || !storage) return res.status(400).json({ error: 'Missing code/storage' });

    const tk = new TezosToolkit(process.env.RPC_URL || 'https://rpc.tzkt.io/ghostnet');
    const packed = await packDataBytes(storage);
    const forged = await forgeOperations([{
      branch: 'head',
      contents: [{
        kind: 'origination',
        script: { code, storage: packed.bytes },
      }],
    }]);

    res.json({ forged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/* What changed & why: New serverless forge endpoint; rev r1. */