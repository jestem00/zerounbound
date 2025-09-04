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
const PAGE_SIZE = Math.max(10, Math.min(500, Number(args['page-size'] || 100)));
const MAX_PAGES = Math.max(1, Math.min(1000, Number(args['max-pages'] || 120)));
const MAX_ACCEPTED = PAGE_SIZE * MAX_PAGES;

const BURN_ADDR = 'tz1burnburnburnburnburnburnburjAYjjX';

const hashMatrix = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'data', 'hashMatrix.json'), 'utf8'));
const TYPE_HASHES = Object.keys(hashMatrix).filter(k => /^-?\d+$/.test(k)).join(',');

const apiBase = NETWORK === 'ghostnet' ? 'https://api.ghostnet.tzkt.io/v1' : 'https://api.tzkt.io/v1';

function isDataUri(str) {
  return typeof str === 'string' && /^data:(image|video|audio|text\/html|image\/svg\+xml)/i.test(str.trim());
}
function hasRenderablePreview(m = {}) {
  const keys = ['displayUri','display_uri','imageUri','image_uri','image','thumbnailUri','thumbnail_uri','artifactUri','artifact_uri','mediaUri','media_uri'];
  for (const k of keys) { const v = m && typeof m === 'object' ? m[k] : null; if (isDataUri(v)) return true; }
  if (Array.isArray(m?.formats)) for (const f of m.formats) { const u = f?.uri || f?.url; if (isDataUri(u)) return true; }
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
  if (!res.ok) throw new Error(String(res.status));
  const ct = (res.headers.get('content-type')||'').toLowerCase();
  return ct.includes('application/json') ? res.json() : res.text().then(t => { try{return JSON.parse(t);}catch{return [];}});
}

async function pageTokens(offset=0, limit=120){
  const qs = new URLSearchParams();
  qs.set('standard','fa2');
  qs.set('sort.desc','firstTime');
  qs.set('offset', String(offset));
  qs.set('limit',  String(limit));
  qs.set('totalSupply.gt','0');
  qs.set('select','contract,tokenId,metadata,holdersCount,totalSupply,contract.typeHash');
  qs.set('contract.typeHash.in', TYPE_HASHES);
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
  let offset = 0;
  const RAW_STEP = 180; // raw TzKT page per scan
  const HARD_TIME = Date.now()+ 1000*90; // 90s cap for action step

  while (accepted.length < MAX_ACCEPTED && Date.now() < HARD_TIME){
    const chunk = await pageTokens(offset, RAW_STEP);
    const rawLen = Array.isArray(chunk) ? chunk.length : 0;
    if (!rawLen) break;

    // decode + preview
    const prelim = []; for (const r of chunk){ const m = decodeHexFields(r?.metadata||{}); if (hasRenderablePreview(m)) prelim.push({ ...r, metadata:m }); }

    // singles burn filter
    const singles = new Map();
    for (const r of prelim){ const hc = Number(r.holdersCount); if (hc === 1){ const kt = r.contract?.address || r.contract; const id = Number(r.tokenId); if(kt && Number.isFinite(id)){ if(!singles.has(kt)) singles.set(kt, []); singles.get(kt).push(id); } } }
    const burnedMap = new Map();
    for (const [kt, ids] of singles.entries()){ burnedMap.set(kt, await singlesBurned(kt, ids)); }

    const kept = prelim.filter(r => {
      const hc = Number(r.holdersCount);
      if (hc > 1) return true;
      const kt = r.contract?.address || r.contract; const id = Number(r.tokenId);
      const bset = burnedMap.get(kt);
      return !(bset && bset.has(id));
    });

    accepted.push(...kept.map(r => ({
      contract: r.contract?.address || r.contract,
      tokenId : Number(r.tokenId),
      metadata: r.metadata,
      holdersCount: r.holdersCount,
    })));
    offset += rawLen;
  }

  // Write pages
  const outDir = path.join(repoRoot, 'feed-dist', NETWORK);
  fs.mkdirSync(outDir, { recursive: true });
  const pages = Math.ceil(accepted.length / PAGE_SIZE);
  for (let i=0;i<pages;i+=1){
    const slice = accepted.slice(i*PAGE_SIZE, (i+1)*PAGE_SIZE);
    const file = path.join(outDir, `page-${i}.json`);
    fs.writeFileSync(file, JSON.stringify(slice), 'utf8');
  }
  const meta = { network: NETWORK, pageSize: PAGE_SIZE, pages, total: accepted.length, lastUpdated: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta), 'utf8');
  console.log(`Feed built: ${NETWORK} pages=${pages} total=${accepted.length}`);
}

buildFeed().catch(e=>{ console.error(e); process.exit(1); });

