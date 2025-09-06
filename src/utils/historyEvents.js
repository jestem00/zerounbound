/*
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/historyEvents.js
  Rev :    r1
  Summary: Aggregate token history from TzKT transfers + ZeroSum
           marketplace operations, with best‑effort OBJKT trade
           enrichment. Produces normalized rows suitable for UI.
*/

import { jFetch } from '../core/net.js';
import { URL_TZKT_OP_BASE, OBJKT_MARKET_ADDRESS } from '../config/deployTarget.js';

const BURN_ADDR = 'tz1burnburnburnburnburnburnburjAYjjX';
import { tzktBase as tzktV1 } from './tzkt.js';
import { NETWORK_KEY, MARKETPLACE_ADDRESS, MARKETPLACE_ADDRESSES } from '../config/deployTarget.js';

const isTz = (s) => /^tz[1-4][0-9A-Za-z]{33}$/i.test(String(s||''));
const isKt = (s) => /^KT1[0-9A-Za-z]{33}$/i.test(String(s||''));

function marketAddrFor(net = NETWORK_KEY) {
  const key = /mainnet/i.test(String(net)) ? 'mainnet' : 'ghostnet';
  return (MARKETPLACE_ADDRESS || (MARKETPLACE_ADDRESSES && MARKETPLACE_ADDRESSES[key]) || '').trim();
}

// Normalize a single event row for UI
function row({ kind, from, to, amount, priceMutez = null, time, hash, opId, xferId, source }) {
  return {
    kind,
    from,
    to,
    amount: Number(amount || 0),
    priceMutez: (priceMutez == null ? null : Number(priceMutez)),
    time: new Date(time).toISOString(),
    hash: hash || null,
    xferId: xferId || null,
    source: source || 'TzKT',
    tzktUrl: (hash ? `${URL_TZKT_OP_BASE}${hash}` : null),
  };
}

export async function fetchTransfersHistory(contract, tokenId, net = NETWORK_KEY) {
  const base = tzktV1(net);
  // Use explicit nested token filters to avoid accidental broad matches
  const qs = new URLSearchParams({
    'token.contract': contract,
    'token.tokenId' : String(tokenId),
    limit           : '10000',
    'sort.asc'      : 'id',
  });
  const rows = await jFetch(`${base}/tokens/transfers?${qs}`, 2).catch(() => []);
  const out = [];
  const needTxIds = [];
  const needOrigIds = [];
  const needToByTx = [];
  const needToByHash = [];
  const needToByXferId = [];
  for (const t of rows || []) {
    const from = t.from?.address || t.from;
    const to   = t.to?.address   || t.to;
    const isBurn = String(to || '').toLowerCase() === BURN_ADDR.toLowerCase();
    const kind = from ? (isBurn ? 'Burn' : 'Transfer') : 'Mint';
    const opId = t.transactionId || t.id || null;
    const origId = t.originationId || null;
    if (!t.hash && opId) needTxIds.push(opId);
    if (!t.hash && !opId && origId) needOrigIds.push(origId);
    if (!to && t.transactionId) needToByTx.push(t.transactionId);
    if (!to && !t.transactionId && t.id) needToByXferId.push(t.id);
    if (!to && (t.hash || t.opHash)) needToByHash.push(t.hash || t.opHash);
    out.push(row({ kind, from: from || null, to: to || null, amount: t.amount || 1, priceMutez: null, time: t.timestamp, hash: t.hash || t.opHash || null, opId: t.transactionId || null, xferId: t.id || null, source: 'TzKT' }));
  }
  // Batch resolve missing hashes from TzKT ids
  const baseV1 = tzktV1(net);
  const idToHash = new Map();
  const chunk = (arr, n) => { const o = []; for (let i=0;i<arr.length;i+=n) o.push(arr.slice(i,i+n)); return o; };
  for (const grp of chunk([...new Set(needTxIds)], 50)) {
    if (!grp.length) continue;
    const qs2 = new URLSearchParams({ 'id.in': grp.join(','), select: 'id,hash' });
    const r = await jFetch(`${baseV1}/operations/transactions?${qs2}`, 2).catch(() => []);
    for (const x of r || []) if (x.id && x.hash) idToHash.set(Number(x.id), x.hash);
  }
  for (const grp of chunk([...new Set(needOrigIds)], 50)) {
    if (!grp.length) continue;
    const qs2 = new URLSearchParams({ 'id.in': grp.join(','), select: 'id,hash' });
    const r = await jFetch(`${baseV1}/operations/originations?${qs2}`, 2).catch(() => []);
    for (const x of r || []) if (x.id && x.hash) idToHash.set(Number(x.id), x.hash);
  }
  out.forEach((e) => { if (!e.hash && e.opId && idToHash.has(Number(e.opId))) { e.hash = idToHash.get(Number(e.opId)); e.tzktUrl = `${URL_TZKT_OP_BASE}${e.hash}`; } });

  // Resolve missing 'to' addresses from transactionId, filtered by this token (no cross-token bleed)
  const toMapTx = new Map();
  for (const grp of chunk([...new Set(needToByTx)], 50)) {
    if (!grp.length) continue;
    const qs3 = new URLSearchParams({
      'transactionId.in': grp.join(','),
      'token.contract'  : contract,
      'token.tokenId'   : String(tokenId),
      select            : 'transactionId,to.address',
    });
    const r2 = await jFetch(`${baseV1}/tokens/transfers?${qs3}`, 2).catch(() => []);
    for (const x of r2 || []) {
      const id = Number(x.transactionId);
      const addr = x['to.address'] || (x.to && x.to.address) || null;
      if (id && addr) toMapTx.set(id, addr);
    }
  }
  const toMapId = new Map();
  for (const grp of chunk([...new Set(needToByXferId)], 50)) {
    if (!grp.length) continue;
    const qs4 = new URLSearchParams({
      'id.in': grp.join(','),
      'token.contract'  : contract,
      'token.tokenId'   : String(tokenId),
      select            : 'id,to.address',
    });
    const r3 = await jFetch(`${baseV1}/tokens/transfers?${qs4}`, 2).catch(() => []);
    for (const x of r3 || []) {
      const id = Number(x.id);
      const addr = x['to.address'] || (x.to && x.to.address) || null;
      if (id && addr) toMapId.set(id, addr);
    }
  }
  out.forEach((e) => {
    if (!e.to && e.opId && toMapTx.has(Number(e.opId))) {
      const addr = toMapTx.get(Number(e.opId));
      e.to = String(addr);
      if (e.to.toLowerCase() === BURN_ADDR.toLowerCase()) e.kind = 'Burn';
    }
    if (!e.to && e.xferId && toMapId.has(Number(e.xferId))) {
      const addr = toMapId.get(Number(e.xferId));
      e.to = String(addr);
      if (e.to.toLowerCase() === BURN_ADDR.toLowerCase()) e.kind = 'Burn';
    }
  });

  // Final fallback: resolve by operation hash for this token
  const toMapHash = new Map();
  for (const grp of chunk([...new Set(needToByHash)], 20)) {
    if (!grp.length) continue;
    const qs5 = new URLSearchParams({
      'hash.in'       : grp.join(','),
      'token.contract': contract,
      'token.tokenId' : String(tokenId),
      select          : 'hash,to.address',
      limit           : '200',
    });
    const r4 = await jFetch(`${baseV1}/tokens/transfers?${qs5}`, 2).catch(() => []);
    for (const x of r4 || []) {
      const h = x.hash || x.opHash; const addr = x['to.address'] || (x.to && x.to.address) || null;
      if (h && addr) toMapHash.set(h, addr);
    }
  }
  out.forEach((e) => {
    if (!e.to && e.hash && toMapHash.has(e.hash)) {
      const addr = toMapHash.get(e.hash);
      e.to = String(addr);
      if (e.to.toLowerCase() === BURN_ADDR.toLowerCase()) e.kind = 'Burn';
    }
  });

  // Definitive fix A): For any row still missing `to`, resolve via hash filtered to this token.
  // 1) If row has a hash, query token-filtered FA2 transfers by that hash to get to.address
  const stillMissing = out.filter((e) => !e.to);
  const uniq = (arr) => [...new Set(arr)];
  const missingHashes = uniq(stillMissing.map((e) => e.hash).filter(Boolean));
  if (missingHashes.length) {
    const toMapByHash = new Map();
    for (const grp of chunk(missingHashes, 30)) {
      const qs = new URLSearchParams({
        'hash.in'        : grp.join(','),
        'token.contract' : contract,
        'token.tokenId'  : String(tokenId),
        select           : 'hash,to.address',
        limit            : '10000',
      });
      const r = await jFetch(`${base}/tokens/transfers?${qs}`, 2).catch(() => []);
      for (const x of r || []) {
        const h = x.hash || x.opHash; const addr = x['to.address'] || (x.to && x.to.address) || null;
        if (h && addr) toMapByHash.set(h, addr);
      }
    }
    for (const e of out) {
      if (!e.to && e.hash && toMapByHash.has(e.hash)) {
        e.to = String(toMapByHash.get(e.hash));
        if (e.to.toLowerCase() === BURN_ADDR.toLowerCase()) e.kind = 'Burn';
      }
    }
  }

  // 2) If still missing and we have transactionId, derive hash via id->hash then reuse the hash path above
  const stillMissingAfterHash = out.filter((e) => !e.to && e.opId);
  if (stillMissingAfterHash.length) {
    const ids = uniq(stillMissingAfterHash.map((e) => Number(e.opId)).filter((n) => Number.isFinite(n)));
    const idToHash2 = new Map();
    for (const grp of chunk(ids, 50)) {
      const qs = new URLSearchParams({ 'id.in': grp.join(','), select: 'id,hash' });
      const r = await jFetch(`${base}/operations/transactions?${qs}`, 2).catch(() => []);
      for (const x of r || []) if (x.id && x.hash) idToHash2.set(Number(x.id), x.hash);
    }
    const newHashes = uniq(stillMissingAfterHash.map((e) => idToHash2.get(Number(e.opId))).filter(Boolean));
    if (newHashes.length) {
      const toMapByHash2 = new Map();
      for (const grp of chunk(newHashes, 30)) {
        const qs = new URLSearchParams({
          'hash.in'        : grp.join(','),
          'token.contract' : contract,
          'token.tokenId'  : String(tokenId),
          select           : 'hash,to.address',
          limit            : '10000',
        });
        const r = await jFetch(`${base}/tokens/transfers?${qs}`, 2).catch(() => []);
        for (const x of r || []) {
          const h = x.hash || x.opHash; const addr = x['to.address'] || (x.to && x.to.address) || null;
          if (h && addr) toMapByHash2.set(h, addr);
        }
      }
      for (const e of out) {
        if (!e.to && e.opId && idToHash2.has(Number(e.opId))) {
          const h = idToHash2.get(Number(e.opId));
          if (toMapByHash2.has(h)) {
            e.to = String(toMapByHash2.get(h));
            if (e.to.toLowerCase() === BURN_ADDR.toLowerCase()) e.kind = 'Burn';
          }
        }
      }
    }
  }

  // 3) Burn-aware fallback: if still missing `to`, detect burn entrypoints on this
  //    contract for the given hashes. If found, set `to` to BURN_ADDR and kind to 'Burn'.
  {
    // First, for entries missing hash but having a transfer id, try to derive hash
    const needHashByXfer = out.filter((e) => !e.to && !e.hash && e.xferId).map((e) => Number(e.xferId));
    if (needHashByXfer.length) {
      const xferToTx = new Map();
      for (const grp of chunk([...new Set(needHashByXfer)], 50)) {
        const qs = new URLSearchParams({ 'id.in': grp.join(','), select: 'id,transactionId' });
        const r = await jFetch(`${baseV1}/tokens/transfers?${qs}`, 2).catch(() => []);
        for (const x of r || []) if (x.id && x.transactionId) xferToTx.set(Number(x.id), Number(x.transactionId));
      }
      const opIds = [...new Set([...xferToTx.values()])];
      const idToHash3 = new Map();
      for (const grp of chunk(opIds, 50)) {
        const qs = new URLSearchParams({ 'id.in': grp.join(','), select: 'id,hash' });
        const r = await jFetch(`${baseV1}/operations/transactions?${qs}`, 2).catch(() => []);
        for (const x of r || []) if (x.id && x.hash) idToHash3.set(Number(x.id), x.hash);
      }
      for (const e of out) {
        if (!e.to && !e.hash && e.xferId && xferToTx.has(Number(e.xferId))) {
          const opId = xferToTx.get(Number(e.xferId));
          if (idToHash3.has(opId)) { e.hash = idToHash3.get(opId); e.opId = opId; e.tzktUrl = `${URL_TZKT_OP_BASE}${e.hash}`; }
        }
      }
    }

    const unresolved = out.filter((e) => !e.to && e.hash);
    const hashes = [...new Set(unresolved.map((e) => e.hash).filter(Boolean))];
    if (hashes.length) {
      const CHUNK = 30;
      const burnHashes = new Set();
      const parseBurnArgs = (p) => {
        const out = { amount: null, tokenId: null };
        if (!p) return out;
        // try parameter.json first
        const j = p.json || p.value_json || null;
        if (j) {
          if (typeof j === 'object' && !Array.isArray(j)) {
            const amt = j.amount ?? j.qty ?? j.quantity ?? null;
            const tid = j.token_id ?? j.tokenId ?? j.token?.id ?? null;
            out.amount = (amt != null && Number.isFinite(Number(amt))) ? Number(amt) : out.amount;
            out.tokenId = (tid != null && Number.isFinite(Number(tid))) ? Number(tid) : out.tokenId;
            return out;
          } else if (Array.isArray(j) && j.length >= 2) {
            const amt = j[0]?.int ?? j[0];
            const tid = j[1]?.int ?? j[1];
            out.amount = (amt != null && Number.isFinite(Number(amt))) ? Number(amt) : out.amount;
            out.tokenId = (tid != null && Number.isFinite(Number(tid))) ? Number(tid) : out.tokenId;
            return out;
          }
        }
        // fallback: Micheline Pair [ amount, tokenId ]
        const v = p.value || null;
        try {
          const args = v?.args || [];
          const first = args[0];
          const second = args[1];
          const amt = (first && (Number(first.int) || Number(first))) || null;
          const tid = (second && (Number(second.int) || Number(second))) || null;
          out.amount = Number.isFinite(amt) ? Number(amt) : out.amount;
          out.tokenId = Number.isFinite(tid) ? Number(tid) : out.tokenId;
        } catch {}
        return out;
      };
      for (let i = 0; i < hashes.length; i += CHUNK) {
        const grp = hashes.slice(i, i + CHUNK);
        const qs = new URLSearchParams({ 'hash.in': grp.join(','), target: contract, status: 'applied' });
        const ops = await jFetch(`${baseV1}/operations/transactions?${qs}`, 2).catch(() => []);
        for (const op of ops || []) {
          const ep = (op?.parameter?.entrypoint || '').toLowerCase();
          if (ep === 'burn' || /burn/.test(ep)) {
            const { amount: amt, tokenId: tid } = parseBurnArgs(op?.parameter || {});
            // Strict: only count burns for THIS tokenId
            if (Number.isFinite(Number(tid)) && Number(tid) === Number(tokenId)) {
              burnHashes.add(op.hash);
              if (!op._zu) op._zu = {};
              op._zu.burnAmt = Number.isFinite(amt) ? Number(amt) : null;
            }
          }
        }
      }
      if (burnHashes.size) {
        // build amount map from ops once to avoid re-parsing
        const amtMap = new Map();
        for (let i = 0; i < hashes.length; i += CHUNK) {
          const grp = hashes.slice(i, i + CHUNK);
          const qs = new URLSearchParams({ 'hash.in': grp.join(','), target: contract, status: 'applied' });
          const ops2 = await jFetch(`${baseV1}/operations/transactions?${qs}`, 2).catch(() => []);
          for (const op of ops2 || []) {
            const ep = (op?.parameter?.entrypoint || '').toLowerCase();
            if (ep === 'burn' || /burn/.test(ep)) {
              const { amount: amt, tokenId: tid } = parseBurnArgs(op?.parameter || {});
              if (Number.isFinite(amt) && Number.isFinite(Number(tid)) && Number(tid) === Number(tokenId)) {
                amtMap.set(op.hash, Number(amt));
              }
            }
          }
        }
        for (const e of out) {
          if (!e.to && e.hash && burnHashes.has(e.hash)) {
            e.to = BURN_ADDR;
            e.kind = 'Burn';
            if (amtMap.has(e.hash)) e.amount = Number(amtMap.get(e.hash));
          }
        }

        // If some burn hashes still don't have a corresponding transfer row,
        // synthesize a Burn row from the operation itself so UI reflects it.
        const haveHash = new Set(out.map((e) => e.hash).filter(Boolean));
        const missing = [...burnHashes].filter((h) => !haveHash.has(h));
        if (missing.length) {
          for (let i = 0; i < missing.length; i += CHUNK) {
            const grp = missing.slice(i, i + CHUNK);
            const qs = new URLSearchParams({ 'hash.in': grp.join(','), target: contract, status: 'applied' });
            const ops3 = await jFetch(`${baseV1}/operations/transactions?${qs}`, 2).catch(() => []);
            for (const op of ops3 || []) {
              const from = op?.sender?.address || op?.initiator?.address || op.sender || op.initiator || null;
              const amt = amtMap.get(op.hash) || 1;
              // Only synthesize if we have a verified amount for this tokenId
              if (amtMap.has(op.hash)) {
                out.push(row({ kind:'Burn', from, to: BURN_ADDR, amount: amt, priceMutez: null, time: op.timestamp, hash: op.hash, source: 'TzKT' }));
              }
            }
          }
        }
      }
    }
  }
  return out;
}

// Best‑effort scan of marketplace ops and map them to token events.
export async function fetchZeroSumOps(contract, tokenId, net = NETWORK_KEY) {
  const base = tzktV1(net).replace(/\/+$/, '');
  const market = marketAddrFor(net);
  if (!isKt(market)) return [];
  // Pull a bounded window of recent ops for the market; filter client‑side
  const ops = await jFetch(`${base}/operations/transactions?target=${market}&status=applied&limit=10000&sort.asc=id`, 2).catch(() => []);
  const match = (val, k) => {
    if (!val) return undefined;
    if (typeof val === 'object') return val[k] ?? val[0]?.[k];
    return undefined;
  };
  const out = [];
  for (const op of ops || []) {
    const ep = op.parameter?.entrypoint || op.entrypoint || '';
    const v  = op.parameter?.value || op.parameter?.json || op.parameter?.value_json || op.parameter || {};
    // Try to pluck fields from either named map or nested pairs
    const nft  = v.nft_contract || match(v, 'nft_contract') || v.contract || v.collection || null;
    const tid  = Number(v.token_id ?? match(v, 'token_id') ?? v.tokenId ?? v.token?.id ?? v.token?.token_id ?? NaN);
    if (String(nft) !== String(contract) || tid !== Number(tokenId)) continue;

    const price  = Number(v.price ?? v.priceMutez ?? NaN);
    const qty    = Number(v.amount ?? v.quantity ?? 1);
    const sender = op.sender?.address || op.initiator?.address || op.sender || null;
    const buyer  = v.offeror || v.buyer || null;
    const ts     = op.timestamp;
    const hash   = op.hash;

    if (ep === 'list_token' || /list.*token/i.test(ep)) {
      out.push(row({ kind: 'List', from: sender, to: market, amount: qty || 1, priceMutez: Number.isFinite(price)?price:null, time: ts, hash, source: 'ZeroSum' }));
    } else if (ep === 'cancel_listing') {
      out.push(row({ kind: 'Unlist', from: sender, to: market, amount: 0, priceMutez: null, time: ts, hash, source: 'ZeroSum' }));
    } else if (ep === 'buy') {
      // price comes from the transaction amount (mutez)
      const paidMutez = Number(op.amount || 0);
      out.push(row({ kind: 'Sale', from: null, to: sender, amount: qty || 1, priceMutez: paidMutez || null, time: ts, hash, source: 'ZeroSum' }));
    } else if (ep === 'make_offer') {
      out.push(row({ kind: 'Offer', from: sender, to: market, amount: qty || 1, priceMutez: Number.isFinite(price)?price:null, time: ts, hash, source: 'ZeroSum' }));
    } else if (ep === 'accept_offer') {
      // price not present; try to infer from a prior make_offer by the same offeror
      let inferred = null;
      if (isTz(buyer)) {
        for (let i = out.length - 1; i >= 0; i -= 1) {
          const r = out[i];
          if (r.kind === 'Offer' && r.from && r.from.toLowerCase() === buyer.toLowerCase()) { inferred = r.priceMutez; break; }
        }
      }
      // seller (sender) accepts the buyer's offer
      out.push(row({ kind: 'Accept', from: sender, to: buyer || null, amount: qty || 1, priceMutez: inferred, time: ts, hash, source: 'ZeroSum' }));
    }
  }
  return out;
}

// Best‑effort OBJKT trades (optional). Gracefully no‑op on errors.
export async function fetchObjktTrades(contract, tokenId) {
  try {
    const url = `/api/objkt/trades?fa2=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(String(tokenId))}`;
    const j = await (await import('../core/net.js')).jFetch(url, 1).catch(() => null);
    if (!j) return [];
    const rows = Array.isArray(j?.trades) ? j.trades : [];
    return rows.map((r) => {
      const xtz = Number(r.price_xtz ?? r.price ?? 0);
      return row({
        // Consider all trade entries as sales of 1 unit for our history purposes
        kind: 'Sale',
        from: r.seller_address || r.seller || null,
        to: r.buyer_address || r.buyer || null,
        amount: 1,
        priceMutez: Number.isFinite(xtz) ? Math.round(xtz * 1_000_000) : null,
        time: r.timestamp,
        hash: r.ophash,
        source: 'OBJKT',
      });
    });
  } catch { return []; }
}

export async function buildHistory({ contract, tokenId, includeObjkt = true, net = NETWORK_KEY } = {}) {
  if (!isKt(contract) || !Number.isFinite(Number(tokenId))) return [];
  const [tf, zs, ob] = await Promise.all([
    fetchTransfersHistory(contract, tokenId, net),
    fetchZeroSumOps(contract, tokenId, net),
    includeObjkt ? fetchObjktTrades(contract, tokenId).catch(() => []) : Promise.resolve([]),
  ]);
  // Correlate OBJKT via hash first; if trades missing: use TzKT market ops by hash
  const burns = [];
  const transfers = [];
  for (const r of tf) { (r.kind === 'Burn' ? burns : transfers).push(r); }

  // If OBJKT trades are empty or lack hashes, try TzKT fulfill_ask ops for transfer hashes
  let sales = ob;
  if ((!sales || !sales.length) && OBJKT_MARKET_ADDRESS) {
    const hashes = [...new Set(transfers.map((t) => t.hash).filter(Boolean))];
    const chunk = (arr, n) => { const o = []; for (let i=0;i<arr.length;i+=n) o.push(arr.slice(i,i+n)); return o; };
    const gathered = [];
    for (const grp of chunk(hashes, 30)) {
      // Use hash.in (not anyof.hash) to avoid 400 responses
      const qs = new URLSearchParams({ 'hash.in': grp.join(','), target: OBJKT_MARKET_ADDRESS, status: 'applied', select: 'hash,amount,parameter.entrypoint' });
      const r = await jFetch(`${tzktV1(net)}/operations/transactions?${qs}`, 2).catch(() => []);
      for (const x of r || []) gathered.push({ hash: x.hash, priceMutez: Number(x.amount||0), from: null, to: null, kind:'Sale', source:'OBJKT' });
    }
    sales = gathered;
  }

  const used = new Set();
  const combined = [];
  // Hash-correlate sales to transfers
  const saleByHash = new Map((sales || []).filter((s) => s.hash).map((s) => [s.hash, s]));
  for (let i=0;i<transfers.length;i+=1) {
    const tr = transfers[i];
    const s = tr.hash ? saleByHash.get(tr.hash) : null;
    if (s) {
      combined.push(row({ kind:'Sale', from: tr.from, to: tr.to, amount: tr.amount, priceMutez: (s.priceMutez ?? tr.priceMutez), time: tr.time, hash: tr.hash, source: 'OBJKT' }));
      used.add(i);
    }
  }
  // Keep unmatched transfers (gifts etc.)
  const remainingTransfers = transfers.filter((_, i) => !used.has(i));
  const remainingSales = (sales || []).filter((s) => !(s.hash && saleByHash.has(s.hash))); // rare
  const all = [...combined, ...remainingTransfers, ...burns, ...zs, ...remainingSales];
  // Latest first
  all.sort((a, b) => new Date(b.time) - new Date(a.time));
  return all;
}

export default { buildHistory };
