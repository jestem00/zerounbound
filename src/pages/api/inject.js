import { RPC_URLS, selectFastestRpc } from '../../config/deployTarget.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { signedBytes } = req.body || {};
    if (!signedBytes) {
      return res.status(400).json({ error: 'Missing signedBytes' });
    }
    const fastest = await selectFastestRpc().catch(() => null);
    const pool = [process.env.RPC_URL, fastest, ...RPC_URLS]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);
    const sanitize = (u) => (u || '').split(/[?#]/)[0].replace(/\/+$/, '');
    const hex = signedBytes.replace(/^0x/, '');
    const variants = [
      { body: `"${hex}"`, ct: 'application/json' },
      { body: `"0x${hex}"`, ct: 'application/json' },
      { body: `0x${hex}`, ct: 'text/plain' },
      { body: hex, ct: 'text/plain' },
      { body: hex, ct: 'application/octet-stream' },
    ];

    for (const rpc of pool.map(sanitize)) {
      const url = `${rpc}/injection/operation?chain=main`;
      for (const { body, ct } of variants) {
        const hdr = ct ? { 'Content-Type': ct } : undefined;
        try {
          const resp = await fetch(url, { method: 'POST', headers: hdr, body });
          if (resp.ok) {
            const txt = (await resp.text()).replace(/"/g, '').trim();
            if (/^o[0-9A-Za-z]{50}$/.test(txt)) return res.json({ opHash: txt });
          }
        } catch {}
      }
    }
    res.status(500).json({ error: 'All RPC variants failed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}