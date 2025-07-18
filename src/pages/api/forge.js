import { TezosToolkit } from '@taquito/taquito';
import { selectFastestRpc } from '../../config/deployTarget.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { branch, contents, rpc: rpcHint } = req.body || {};
    if (!branch || !contents) {
      return res.status(400).json({ error: 'Missing branch/contents' });
    }

    const rpc = rpcHint || process.env.RPC_URL || (await selectFastestRpc().catch(() => null));
    if (!rpc) return res.status(500).json({ error: 'No reachable RPC' });

    const tk = new TezosToolkit(rpc);
    const forged = await tk.rpc.forgeOperations({ branch, contents });

    res.json({ forged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}