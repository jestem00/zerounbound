/*Developed by @jams2blues
  File: src/utils/tzkt.js
  Rev: r41
  Summary: TzKT helpers – safe base URL + batched fetch + discovery helpers. */

import { jFetch } from '../core/net.js';

/** Choose correct TzKT base for a network. */
export function tzktBase(network = 'mainnet') {
  const net = String(network || '').toLowerCase();
  return net === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';
}

/**
 * Batch fetch contract rows (address,typeHash,activity,metadata,tokensCount).
 * Adds a light fallback: if metadata is empty, attempts to read big‑map hex JSON.
 */
export async function contractsBatch(addresses = [], network = 'mainnet') {
  if (!addresses?.length) return [];
  const base = tzktBase(network);

  const out = [];
  const CHUNK = 50;
  for (let i = 0; i < addresses.length; i += CHUNK) {
    const slice = addresses.slice(i, i + CHUNK);
    const qs = new URLSearchParams({
      limit: String(slice.length),
      'address.in': slice.join(','),
      select: 'address,typeHash,firstActivityTime,lastActivityTime,metadata,tokensCount',
    });
    const rows = await jFetch(`${base}/contracts?${qs}`, 3).catch(() => []);
    for (const r of (rows || [])) {
      out.push({
        address: r.address,
        typeHash: r.typeHash ?? r.type_hash,
        firstActivityTime: r.firstActivityTime ?? r.first_activity_time,
        lastActivityTime: r.lastActivityTime ?? r.last_activity_time,
        metadata: r.metadata || {},
        tokensCount: (typeof r.tokensCount === 'number') ? r.tokensCount : r.tokens_count,
      });
    }
  }

  // Fallback metadata for rows missing it (try hex big‑map once)
  const need = out.filter((r) => !r.metadata || Object.keys(r.metadata).length === 0);
  await Promise.all(need.map(async (r) => {
    try {
      const [contents, content] = await Promise.all([
        jFetch(`${base}/contracts/${r.address}/bigmaps/metadata/keys/contents`, 2).catch(() => null),
        jFetch(`${base}/contracts/${r.address}/bigmaps/metadata/keys/content`, 2).catch(() => null),
      ]);
      const hex = contents?.value ?? content?.value;
      if (hex) {
        const clean = String(hex).replace(/^0x/i, '');
        const bytes = clean.match(/.{1,2}/g).map((b) => parseInt(b, 16));
        const str = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
        const obj = JSON.parse(str);
        r.metadata = { ...(r.metadata || {}), ...obj }; // eslint-disable-line no-param-reassign
      }
    } catch { /* ignore */ }
  }));

  return out;
}

/** quick collaborator check: supports array or bigmap forms */
export async function collabHasWallet(contractAddr, wallet, network = 'mainnet') {
  const base = tzktBase(network);
  try {
    const st = await jFetch(`${base}/contracts/${contractAddr}/storage`, 2);

    // common forms
    if (Array.isArray(st?.collaborators)) return st.collaborators.includes(wallet);
    if (Number.isInteger(st?.collaborators)) {
      const k = encodeURIComponent(`"${wallet}"`);
      const hit = await jFetch(`${base}/bigmaps/${st.collaborators}/keys/${k}?select=value`, 2).catch(() => null);
      return hit !== null;
    }

    // nested (storage.{data|state}.collaborators)
    const nested = st?.data?.collaborators || st?.state?.collaborators || null;
    if (Array.isArray(nested)) return nested.includes(wallet);
    if (Number.isInteger(nested)) {
      const k = encodeURIComponent(`"${wallet}"`);
      const hit = await jFetch(`${base}/bigmaps/${nested}/keys/${k}?select=value`, 2).catch(() => null);
      return hit !== null;
    }
  } catch {}
  return false;
}

/** reduce candidate space: recent active allowed contracts */
export async function listRecentAllowedContracts(typeHashList = [], network = 'mainnet', limit = 160) {
  const base = tzktBase(network);
  const qs = [
    typeHashList?.length ? `typeHash.in=${typeHashList.join(',')}` : '',
    'sort.desc=lastActivityTime',
    `limit=${limit}`,
    'select=address,typeHash,lastActivityTime,firstActivityTime',
  ].filter(Boolean).join('&');
  const rows = await jFetch(`${base}/contracts?${qs}`, 2).catch(() => []);
  return (rows || []).map((r) => ({
    address: r.address,
    typeHash: r.typeHash,
    timestamp: r.lastActivityTime || r.firstActivityTime || null,
  }));
}

/** created by a wallet = creator (legacy) + originations by initiator (factory) */
export async function listCreatedByWallet(wallet, network = 'mainnet', allowedHashes = []) {
  const base = tzktBase(network);
  const filter = allowedHashes?.length ? `&typeHash.in=${allowedHashes.join(',')}` : '';

  const legacy = await jFetch(`${base}/contracts?creator=${wallet}${filter}&limit=400`, 2).catch(() => []);
  const ops = await jFetch(`${base}/operations/originations?initiator=${wallet}&limit=400`, 2).catch(() => []);

  const map = new Map();

  (legacy || []).forEach((c) => {
    if (!c?.address) return;
    if (allowedHashes?.length && !allowedHashes.includes(Number(c.typeHash))) return;
    map.set(c.address, {
      address: c.address,
      typeHash: c.typeHash,
      timestamp: c.lastActivityTime || c.firstActivityTime || null,
    });
  });

  (ops || []).forEach((o) => {
    const oc = o?.originatedContract || o?.originated_contract;
    if (!oc?.address) return;
    const th = oc.typeHash ?? oc.type_hash;
    if (allowedHashes?.length && !allowedHashes.includes(Number(th))) return;
    const prev = map.get(oc.address) || {};
    map.set(oc.address, {
      address: oc.address,
      typeHash: th ?? prev.typeHash,
      timestamp: o.timestamp || prev.timestamp || null,
    });
  });

  return [...map.values()];
}

export default {
  tzktBase, contractsBatch, collabHasWallet, listRecentAllowedContracts, listCreatedByWallet,
};

/* What changed & why:
   • Single, consistent helper set used across the UI.
   • Matches names imported by contractDiscovery.js. */ // EOF
