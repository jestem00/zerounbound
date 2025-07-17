import { TezosToolkit } from '@taquito/taquito';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { signedBytes } = req.body;
    if (!signedBytes) {
      return res.status(400).json({ error: 'Missing signedBytes' });
    }
    const tk = new TezosToolkit(process.env.RPC_URL || 'https://rpc.tzkt.io/ghostnet');
    // Ensure signed bytes have 0x prefix for injection
    const hex = signedBytes.startsWith('0x') ? signedBytes : `0x${signedBytes}`;
    const opHash = await tk.rpc.injectOperation(hex);

    res.json({ opHash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
