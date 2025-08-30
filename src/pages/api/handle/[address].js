/*
  Developed by @jams2blues — ZeroContract Studio
  File:    src/pages/api/handle/[address].js
  Rev :    r2    2025-08-29
  Summary: API route that resolves a Tezos wallet address to an X/Twitter
           handle. Queries the objkt.com GraphQL API for holders and
           returns the `twitter` field when available. Results are
           cached in memory for 10 minutes to reduce external requests.
           If no handle is found, returns a shortened Tezos address.
*/

import fetch from 'node-fetch';

// In-memory cache
const CACHE = new Map(); // address -> { handle, alias, exp }
const TTL = 10 * 60 * 1000; // 10 minutes

// GraphQL query
const HOLDER_QUERY = `
  query HolderByAddress($address: String!) {
    holder(where: {address: {_eq: $address}}) {
      twitter
      tzdomain
    }
  }
`;

function sanitizeTwitterValue(v) {
  if (!v || typeof v !== 'string') return null;
  let s = v.trim();
  // Accept variants: @handle, https://twitter.com/handle, https://x.com/handle, twitter.com/handle, x.com/handle
  const m = s.match(/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,30})(?:[/?].*)?$/i);
  if (m && m[1]) s = m[1];
  // Strip leading @ and any trailing punctuation/whitespace
  s = s.replace(/^@+/, '').replace(/\s+$/, '');
  if (!s) return null;
  // Twitter/X handles are 1-15 chars (allow up to 30 to be lenient, later trimmed above)
  return s;
}

async function queryObjktHandle(address) {
  try {
    const res = await fetch('https://data.objkt.com/v3/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: HOLDER_QUERY, variables: { address } }),
    });
    if (!res.ok) return null;
    const { data } = await res.json();
    const holder = data?.holder?.[0];
    if (holder && typeof holder.twitter === 'string' && holder.twitter.trim()) {
      const norm = sanitizeTwitterValue(holder.twitter);
      if (norm) return norm;
    }
    return null;
  } catch {
    return null;
  }
}

function shortAddress(addr = '') {
  const s = String(addr);
  return s.length > 12 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
}

export default async function handler(req, res) {
  const { address } = req.query;
  const tz = String(address || '').trim();
  if (!tz || !/^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/i.test(tz)) {
    return res.status(400).json({ handle: null, alias: shortAddress(tz) });
  }
  const now = Date.now();
  const cached = CACHE.get(tz.toLowerCase());
  if (cached && cached.exp > now) {
    return res.status(200).json({ handle: cached.handle, alias: cached.alias });
  }
  let handle = null;
  let alias = shortAddress(tz);
  // Try objkt.com GraphQL API
  handle = await queryObjktHandle(tz);
  if (handle) alias = `@${handle}`;
  // TODO: in the future query tzprofiles or other identity services here
  CACHE.set(tz.toLowerCase(), { handle, alias, exp: now + TTL });
  return res.status(200).json({ handle, alias });
}

/* What changed & why:
   - Added a serverless API route for resolving Tezos wallets to X/Twitter
     handles using the objkt.com GraphQL API. Results are cached locally
     to reduce latency and external queries. When no handle exists the
     route returns a shortened address.
*/
