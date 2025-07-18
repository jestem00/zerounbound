import { TezosToolkit } from '@taquito/taquito';
import { RPC_URLS, selectFastestRpc } from '../../config/deployTarget.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { signedBytes, rpc: rpcHint } = req.body || {};
    if (!signedBytes)
      return res.status(400).json({ error: 'Missing signedBytes' });

    const fastest = await selectFastestRpc().catch(() => null);
    const pool = [rpcHint, process.env.RPC_URL, fastest, ...RPC_URLS]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);
    const hex = signedBytes.replace(/^0x/, '');

    for (const rpc of pool) {
      try {
        const tk = new TezosToolkit(rpc);
        const opHash = await tk.rpc.injectOperation(hex);
        if (opHash) return res.json({ opHash });
      } catch {}
    }

    res.status(500).json({ error: 'All RPC inject attempts failed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}