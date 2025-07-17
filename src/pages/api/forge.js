import { packDataBytes } from '@taquito/rpc';
import { TezosToolkit } from '@taquito/taquito';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { code, storage, branch, contents } = req.body;
    // If full operation (branch + contents) is provided, forge using RPC
    if (branch && contents) {
      const tk = new TezosToolkit(process.env.RPC_URL || 'https://rpc.tzkt.io/ghostnet');
      const forged = await tk.rpc.forgeOperations({ branch, contents });
      return res.json({ forged });
    }
    if (!code || !storage) {
      return res.status(400).json({ error: 'Missing code/storage' });
    }

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
