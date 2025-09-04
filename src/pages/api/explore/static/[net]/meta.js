import { FEED_STATIC_BASE } from '../../../../../config/deployTarget.js';

export default async function handler(req, res) {
  try {
    const { net } = req.query || {};
    const base = FEED_STATIC_BASE || '';
    if (!base) { res.status(400).json({ error: 'FEED_STATIC_BASE not configured' }); return; }
    const url = `${String(base).replace(/\/+$/, '')}/${encodeURIComponent(net)}/meta.json`;
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) { res.status(r.status).json({ error: `upstream ${r.status}` }); return; }
    const data = await r.json().catch(() => ({}));
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json({});
  }
}

