/*
  Developed by @jams2blues — ZeroContract Studio
  File:    src/pages/api/objkt/trades.js
  Rev :    r1
  Summary: Server-side proxy for OBJKT trades by token to avoid
           browser CORS. Returns a normalized list of trades.
*/

import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { fa2, tokenId } = req.query || {};
  const fa = String(fa2 || '').trim();
  const id = String(tokenId || '').trim();
  if (!/^KT1[0-9A-Za-z]{33}$/.test(fa) || id === '') {
    res.status(400).json({ ok: false, trades: [] });
    return;
  }

  const endpoint = 'https://data.objkt.com/v3/graphql';
  const query = `
    query TokenTrades($fa2: String!, $id: String!) {
      trades(where: {fa2_address: {_eq: $fa2}, token_id: {_eq: $id}}, order_by: {timestamp: asc}) {
        buyer_address
        seller_address
        price_xtz
        timestamp
        ophash
        type
      }
    }
  `;

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { fa2: fa, id } }),
    });
    if (!r.ok) { res.status(200).json({ ok: false, trades: [] }); return; }
    const j = await r.json();
    const rows = Array.isArray(j?.data?.trades) ? j.data.trades : [];
    const trades = rows.map((t) => ({
      buyer: t.buyer_address || null,
      seller: t.seller_address || null,
      price_xtz: typeof t.price_xtz === 'number' ? t.price_xtz : (t.price ? Number(t.price) : null),
      timestamp: t.timestamp,
      ophash: t.ophash,
      type: t.type,
    }));
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json({ ok: true, trades });
  } catch (e) {
    res.status(200).json({ ok: false, trades: [] });
  }
}

