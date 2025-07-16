/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/api/inject.js
  Rev :    r1   2025‑07‑15
  Summary: serverless inject endpoint
──────────────────────────────────────────────────────────────*/
import { TezosToolkit } from '@taquito/taquito';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { signedBytes } = req.body;
    if (!signedBytes) return res.status(400).json({ error: 'Missing signedBytes' });

    const tk = new TezosToolkit(process.env.RPC_URL || 'https://rpc.tzkt.io/ghostnet');
    const opHash = await tk.rpc.injectOperation(signedBytes);

    res.json({ opHash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/* What changed & why: New serverless inject endpoint; rev r1. */