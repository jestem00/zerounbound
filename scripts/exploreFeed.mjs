// Build a static, burn-safe Explore feed and write JSON pages to feed-dist/
// Usage:
//   node zerounbound/scripts/exploreFeed.mjs --network mainnet --page-size 100 --max-pages 120
//   node zerounbound/scripts/exploreFeed.mjs --network ghostnet --page-size 100 --max-pages 60

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

// Lightweight args
const args = Object.fromEntries(process.argv.slice(2).map(s => {
  const m = s.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [s.replace(/^--/, ''), true];
}));
const NETWORK   = String(args.network || 'mainnet').toLowerCase();
const STRICT_ZERO_GATING = String(process.env.STRICT_ZERO_GATING || '1') !== '0';
const PAGE_SIZE = Math.max(10, Math.min(500, Number(args['page-size'] || 100)));
const MAX_PAGES = Math.max(1, Math.min(1000, Number(args['max-pages'] || 120)));
const MAX_ACCEPTED = PAGE_SIZE * MAX_PAGES;

const BURN_ADDR = 'tz1burnburnburnburnburnburnburjAYjjX';

const hashMatrix = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'data', 'hashMatrix.json'), 'utf8'));
const TYPE_HASH_VALUES = Object.keys(hashMatrix).filter(k => /^-?\d+$/.test(k)).map(Number);
const TYPE_HASHES = TYPE_HASH_VALUES.join(',');
const TYPE_HASH_SET = new Set(TYPE_HASH_VALUES);

const apiBase = NETWORK === 'ghostnet' ? 'https://api.ghostnet.tzkt.io/v1' : 'https://api.tzkt.io/v1';

function isDataUri(str) {
  return typeof str === 'string' && /^data:(?:image|audio|video)\//i.test(str.trim());
}
function isSvgDataUri(str) {
  return typeof str === 'string' && /^data:image\/svg\+xml/i.test(str.trim());
}

function isRemoteMedia(str){
  return typeof str === 'string' && /^(ipfs:|https?:|ar:|arweave:)/i.test(str.trim());
}
function isTezosStorage(str) {
  return typeof str === 'string' && /^tezos-storage:/i.test(str.trim());
}
function hasRenderablePreview(m = {}) {
  const keys = ['displayUri','display_uri','imageUri','image_uri','image','thumbnailUri','thumbnail_uri','artifactUri','artifact_uri','mediaUri','media_uri'];
  for (const k of keys) {
    const v = m && typeof m === 'object' ? m[k] : null;
    if (isTezosStorage(v) || isDataUri(v) || isSvgDataUri(v) || isRemoteMedia(v)) return true;
  }
  if (Array.isArray(m?.formats)) {
    for (const f of m.formats) {
      const u = f?.uri || f?.url;
      if (isTezosStorage(u) || isDataUri(u) || isSvgDataUri(u) || isRemoteMedia(u)) return true;
    }
  }
  return false;
}

// Minimal hex decoder (inline to avoid imports during Actions)
const RE_HEX_WITH_0x = /^0x[0-9a-f]+$/i;
const RE_HEX_BARE    = /^[0-9a-f]+$/i;
function hexToUtf8(hex=''){
  try{ const clean = hex.replace(/^0x/,''); if(!RE_HEX_BARE.test(clean)||clean.length%2) return hex; const bytes = new Uint8Array(clean.match(/.{1,2}/g).map(b=>parseInt(b,16))); return new TextDecoder().decode(bytes).replace(/[\u0000-\u001F\u007F]/g,''); }catch{ return hex; }
}
function decodeHexFields(v){
  if (Array.isArray(v)) return v.map(decodeHexFields);
  if (v && typeof v === 'object') { const out={}; for (const [k,val] of Object.entries(v)) out[k]=decodeHexFields(val); return out; }
  if (typeof v === 'string' && (RE_HEX_WITH_0x.test(v) || RE_HEX_BARE.test(v))) return hexToUtf8(v);
  return v;
}

async function j(url){
  const res = await fetch(url, { headers: { accept:'application/json' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const ct = (res.headers.get('content-type')||'').toLowerCase();
  return ct.includes('application/json') ? res.json() : res.text().then(t => { try{return JSON.parse(t);}catch{return [];}});
}

const FORBIDDEN_EP_MARKERS = [
  'add_bootloader', 'add_moderator', 'airdrop', 'create_generator', 'create_generator_v2',
  'disable_generator', 'disable_sale', 'enable_generator', 'enable_sale', 'mint_reserved',
  'remove_moderator', 'set_bootloader_code', 'set_bootloader_name', 'set_bootloader_thumbnail',
  'set_generator_reserved', 'set_generator_thumbnail', 'set_price', 'set_split_fee',
  'start_sale', 'stop_sale', 'update_generator', 'update_thumbnail', 'withdraw_funds',
];

let allowedContractsCache = null;
const rejectedContracts = new Set();

async function probeEntrypoints(addr){
  try{
    const res = await j(`${apiBase}/contracts/${encodeURIComponent(addr)}/entrypoints`).catch(()=>null);
    const list = Array.isArray(res) ? res : (Array.isArray(res?.entrypoints) ? res.entrypoints : (res && typeof res === 'object' ? Object.keys(res) : []));
    const names = new Set((list||[]).map(s => String(s?.name ?? s).toLowerCase()));
    const forbidden = FORBIDDEN_EP_MARKERS.some(m => names.has(m));
    return { names, forbidden };
  }catch{
    return { names: new Set(), forbidden: false };
  }
}


async function buildAllowedContracts(){
  const allowed = new Map();
  const codeHashes = new Set();
  const rows = [];
  const PAGE = 400;
  for (let offset = 0; offset < 50000; offset += PAGE) {
    const qs = new URLSearchParams();
    qs.set('typeHash.in', TYPE_HASHES);
    qs.set('select', 'address,codeHash,typeHash');
    qs.set('sort.desc', 'lastActivityTime');
    qs.set('limit', String(PAGE));
    qs.set('offset', String(offset));
    const chunk = await j(`${apiBase}/contracts?${qs.toString()}`).catch(()=>[]);
    if (!Array.isArray(chunk) || !chunk.length) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  for (const r of rows) {
    const address = r?.address;
    const typeHash = Number(r?.typeHash ?? r?.type_hash);
    const codeHash = Number(r?.codeHash ?? r?.code_hash);
    if (!address || !Number.isFinite(typeHash) || !TYPE_HASH_SET.has(typeHash)) continue;
    if (!allowed.has(address)) {
      allowed.set(address, { typeHash, codeHash: Number.isFinite(codeHash) ? codeHash : undefined });
      if (Number.isFinite(codeHash)) codeHashes.add(codeHash);
    }
  }
  return { addresses: allowed, addressList: [...allowed.keys()], codeHashes };
}

async function ensureAllowedContracts(){
  if (allowedContractsCache) return allowedContractsCache;
  allowedContractsCache = await buildAllowedContracts();
  return allowedContractsCache;
}

async function fetchContractFingerprint(addr){
  try{
    const meta = await j(`${apiBase}/contracts/${encodeURIComponent(addr)}?select=address,codeHash,typeHash`).catch(()=>null);
    if (!meta) return null;
    const typeHash = Number(meta?.typeHash ?? meta?.type_hash);
    if (!Number.isFinite(typeHash) || !TYPE_HASH_SET.has(typeHash)) return null;
    let rejected = false;
    if (STRICT_ZERO_GATING) {
      const probe = await probeEntrypoints(addr);
      rejected = probe.forbidden;
    }
    if (rejected) return null;
    const codeHash = Number(meta?.codeHash ?? meta?.code_hash);
    return { typeHash, codeHash: Number.isFinite(codeHash) ? codeHash : undefined };
  }catch{ return null; }
}

async function ensureContractsKnown(addresses){
  const cache = await ensureAllowedContracts();
  const pending = [];
  for (const addr of addresses){
    const normalized = String(addr || '');
    if (!normalized) continue;
    if (cache.addresses.has(normalized) || rejectedContracts.has(normalized)) continue;
    pending.push(normalized);
  }
  for (const addr of pending){
    const info = await fetchContractFingerprint(addr);
    if (info) {
      cache.addresses.set(addr, info);
      cache.addressList = [...cache.addresses.keys()];
      if (Number.isFinite(info.codeHash)) cache.codeHashes.add(info.codeHash);
    } else {
      rejectedContracts.add(addr);
    }
  }
  return cache;
}


async function pageTokens(cursorId = null, limit = 120){
  const qs = new URLSearchParams();
  qs.set('standard','fa2');
  qs.set('sort.desc','id');
  qs.set('limit',  String(limit));
  qs.set('totalSupply.gt','0');
  qs.set('select','id,contract,tokenId,metadata,holdersCount,totalSupply,firstTime,contract.typeHash');
  qs.set('contract.typeHash.in', TYPE_HASHES);
  if (cursorId !== null) qs.set('id.lt', String(cursorId));
  return j(`${apiBase}/tokens?${qs.toString()}`).catch(()=>[]);
}

async function singlesBurned(kt, ids){
  if (!ids.length) return new Set();
  const qs = new URLSearchParams();
  qs.set('token.contract', kt);
  qs.set('token.tokenId.in', ids.join(','));
  qs.set('account', BURN_ADDR);
  qs.set('balance.gt','0');
  qs.set('select','token.tokenId');
  qs.set('limit', String(Math.max(1000, ids.length)));
  const rows = await j(`${apiBase}/tokens/balances?${qs.toString()}`).catch(()=>[]);
  const out = new Set();
  for (const r of rows||[]) { const id = +(r['token.tokenId'] ?? r?.tokenId ?? NaN); if (Number.isFinite(id)) out.add(id); }
  return out;
}

async function buildFeed(){
const accepted = [];
const seenKeys = new Set();
let cursorId = null;
const RAW_STEP = 360; // raw TzKT page per scan
const HARD_TIME = Date.now() + 1000 * 180; // 180s cap for action step
const discovered = await ensureAllowedContracts();
const allowed = discovered.addresses || new Map();

while (accepted.length < MAX_ACCEPTED && Date.now() < HARD_TIME){
  const chunk = await pageTokens(cursorId, RAW_STEP);
  const rawLen = Array.isArray(chunk) ? chunk.length : 0;
  if (!rawLen) break;

  cursorId = (() => {
    const last = chunk[rawLen - 1];
    const id = Number(last?.id ?? last?.token?.id ?? NaN);
    return Number.isFinite(id) ? id : cursorId;
  })();

  const prelim = [];
  for (const r of chunk || []){
    const contract = r?.contract?.address || r?.contract;
    if (!contract) continue;
    let typeHash = Number(r?.['contract.typeHash'] ?? r?.contract?.typeHash ?? r?.typeHash ?? NaN);
    if (!Number.isFinite(typeHash)) {
      const info = allowed.get(contract);
      if (info && Number.isFinite(info.typeHash)) typeHash = info.typeHash;
    }
    if (!Number.isFinite(typeHash) || !TYPE_HASH_SET.has(typeHash)) continue;
    const metadata = decodeHexFields(r?.metadata || {});
    if (!hasRenderablePreview(metadata)) continue;
    const holdersCount = Number(r?.holdersCount);
    const tokenId = Number(r?.tokenId);
    if (!Number.isFinite(tokenId)) continue;
    const key = `${contract}:${tokenId}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    prelim.push({
      contract,
      tokenId,
      metadata,
      holdersCount,
      firstTime: r?.firstTime,
      typeHash,
    });
  }

  const singles = new Map();
  for (const item of prelim){
    if (item.holdersCount === 1){
      if (!singles.has(item.contract)) singles.set(item.contract, []);
      singles.get(item.contract).push(item.tokenId);
    }
  }
  const burnedMap = new Map();
  for (const [kt, ids] of singles.entries()){ burnedMap.set(kt, await singlesBurned(kt, ids)); }

  const kept = prelim.filter(item => {
    if (item.holdersCount !== 1) return true;
    const bset = burnedMap.get(item.contract);
    return !(bset && bset.has(item.tokenId));
  });

  const slot = MAX_ACCEPTED - accepted.length;
  if (slot <= 0) break;
  const normalized = kept.slice(0, slot);
  accepted.push(...normalized);
}

  const finalAccepted = accepted.slice(0, MAX_ACCEPTED);
  const outBase = process.env.FEED_OUT_DIR ? path.resolve(process.env.FEED_OUT_DIR) : path.join(repoRoot, 'feed-dist');
  const outDir = path.join(outBase, NETWORK);
  fs.mkdirSync(outDir, { recursive: true });
  const pages = Math.ceil(finalAccepted.length / PAGE_SIZE);
  for (let i=0;i<pages;i+=1){
    const slice = finalAccepted.slice(i*PAGE_SIZE, (i+1)*PAGE_SIZE);
    const file = path.join(outDir, `page-${i}.json`);
    fs.writeFileSync(file, JSON.stringify(slice), 'utf8');
  }
  const meta = { network: NETWORK, pageSize: PAGE_SIZE, pages, total: finalAccepted.length, lastUpdated: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta), 'utf8');

  const versionOf = (th) => {
    try { return hashMatrix[String(th)] || null; } catch { return null; }
  };
  const curated = finalAccepted
    .map(t => ({ contract: t.contract, tokenId: t.tokenId, typeHash: typeof t.typeHash === 'number' ? t.typeHash : undefined }))
    .filter(t => typeof t.typeHash === 'number' && versionOf(t.typeHash));
  const indexDir = path.join(outDir, 'index');
  fs.mkdirSync(indexDir, { recursive: true });
  const pagesIdx = Math.ceil(curated.length / PAGE_SIZE);
  for (let i=0;i<pagesIdx;i+=1){
    const slice = curated.slice(i*PAGE_SIZE, (i+1)*PAGE_SIZE).map(t => ({
      contract: t.contract,
      tokenId: t.tokenId,
      zerocontractversion: versionOf(t.typeHash),
    }));
    fs.writeFileSync(path.join(indexDir, `page-${i}.json`), JSON.stringify(slice), 'utf8');
  }
  const metaIdx = { network: NETWORK, pageSize: PAGE_SIZE, pages: pagesIdx, total: curated.length, lastUpdated: new Date().toISOString(), kind: 'index' };
  fs.writeFileSync(path.join(indexDir, 'meta.json'), JSON.stringify(metaIdx), 'utf8');
  console.log(`Feed built: ${NETWORK} pages=${pages} total=${finalAccepted.length}`);
}

buildFeed().catch(e=>{ console.error(e); process.exit(1); });
