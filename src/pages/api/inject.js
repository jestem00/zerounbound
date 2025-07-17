import { TezosToolkit } from '@taquito/taquito';
import { selectFastestRpc } from '../../config/deployTarget.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { signedBytes } = req.body || {};
    if (!signedBytes) {
      return res.status(400).json({ error: 'Missing signedBytes' });
    }
    const rpc = process.env.RPC_URL || (await selectFastestRpc().catch(() => null));
    if (!rpc) return res.status(500).json({ error: 'No reachable RPC' });
    const tk = new TezosToolkit(rpc);
    const hex = signedBytes.startsWith('0x') ? signedBytes : `0x${signedBytes}`;
    const opHash = await tk.rpc.injectOperation(hex);

    res.json({ opHash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}