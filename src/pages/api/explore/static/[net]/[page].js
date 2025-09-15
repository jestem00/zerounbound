/* Serverless proxy for static Explore feed pages.
 * Allows using GitHub Pages (or any static host) without CORS issues.
 * Base URL comes from deployTarget.js to respect repo invariants
 * (deployTarget is the only diverging file between branches).
 * Usage: /api/explore/static/mainnet/0 -> fetches ${FEED_STATIC_BASE}/mainnet/page-0.json
 */
import { FEED_STATIC_BASE } from '../../../../../config/deployTarget.js';

export default async function handler(req, res) {
  try {
    const { net, page } = req.query || {};
    const base = FEED_STATIC_BASE || '';
    if (!base) {
      res.status(400).json({ error: 'FEED_STATIC_BASE not configured' });
      return;
    }
    const url = `${String(base).replace(/\/+$/, '')}/${encodeURIComponent(net)}/page-${encodeURIComponent(page)}.json`;
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) { res.status(r.status).json({ error: `upstream ${r.status}` }); return; }
    const data = await r.json().catch(() => []);
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json([]);
  }
}