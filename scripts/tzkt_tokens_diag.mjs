// Quick diagnostic for explore/tokens performance against TzKT
// Usage: node zerounbound/scripts/tzkt_tokens_diag.mjs [mainnet|ghostnet]
// Prints timings and acceptance ratios for strict vs fallback queries.

import fs from 'node:fs';
import path from 'node:path';

const net = (process.argv[2] || 'mainnet').toLowerCase();
const base = net === 'ghostnet' ? 'https://api.ghostnet.tzkt.io/v1' : 'https://api.tzkt.io/v1';

function isDataUri(str) {
  return typeof str === 'string' && /^data:(image|video|audio|text\/html|image\/svg\+xml)/i.test(str.trim());
}

function hasRenderablePreview(m = {}) {
  const keys = [
    'displayUri', 'display_uri',
    'imageUri',   'image_uri', 'image',
    'thumbnailUri','thumbnail_uri',
    'artifactUri','artifact_uri',
    'mediaUri',   'media_uri',
  ];
  for (const k of keys) {
    const v = m && typeof m === 'object' ? m[k] : null;
    if (isDataUri(v)) return true;
  }
  if (Array.isArray(m?.formats)) {
    for (const f of m.formats) {
      const cand = f?.uri || f?.url;
      if (isDataUri(cand)) return true;
    }
  }
  return false;
}

const hashMatrixPath = path.join(process.cwd(), 'zerounbound', 'src', 'data', 'hashMatrix.json');
const hashText = fs.readFileSync(hashMatrixPath, 'utf8');
const hashObj = JSON.parse(hashText);
const TYPE_HASHES = Object.keys(hashObj).filter((k) => /^-?\d+$/.test(k)).join(',');

async function j(timeLabel, url) {
  const t0 = Date.now();
  const res = await fetch(url);
  const ms = Date.now() - t0;
  const ok = res.ok;
  const text = await res.text();
  let data = [];
  try { data = JSON.parse(text); } catch { data = []; }
  console.log(`${timeLabel}: ${ok ? 'OK' : res.status} ${ms}ms, rows=${Array.isArray(data) ? data.length : 0}, urlLen=${url.length}`);
  return Array.isArray(data) ? data : [];
}

async function main() {
  console.log(`Net=${net} Base=${base}`);
  // 1) Discover ZeroContract collections (top 200)
  const cq = new URLSearchParams();
  cq.set('typeHash.in', TYPE_HASHES);
  cq.set('select', 'address');
  cq.set('limit', '200');
  const contracts = await j('contracts', `${base}/contracts?${cq.toString()}`);
  const addrs = contracts.map((r) => (typeof r === 'string' ? r : r.address)).filter(Boolean);
  console.log(`contracts: got ${addrs.length}`);

  // 2) strict tokens call
  const qsStrict = new URLSearchParams();
  qsStrict.set('standard', 'fa2');
  qsStrict.set('sort.desc', 'firstTime');
  qsStrict.set('offset', '0');
  qsStrict.set('limit', '48');
  qsStrict.set('totalSupply.gt', '0');
  qsStrict.set('select', 'contract,tokenId,metadata,holdersCount,totalSupply,contract.typeHash');
  qsStrict.set('contract.typeHash.in', TYPE_HASHES);
  const strictRows = await j('strict tokens', `${base}/tokens?${qsStrict.toString()}`);
  const strictAccept = strictRows.filter((r) => hasRenderablePreview(r.metadata || {})).length;
  console.log(`strict accept: ${strictAccept}/${strictRows.length}`);

  // 3) fallback tokens call with contract.in
  const qsFb = new URLSearchParams();
  qsFb.set('standard', 'fa2');
  qsFb.set('sort.desc', 'firstTime');
  qsFb.set('offset', '0');
  qsFb.set('limit', '48');
  qsFb.set('totalSupply.gt', '0');
  qsFb.set('select', 'contract,tokenId,metadata,holdersCount,totalSupply,contract.typeHash');
  if (addrs.length) qsFb.set('contract.in', addrs.join(','));
  const fbRows = await j('fallback tokens', `${base}/tokens?${qsFb.toString()}`);
  const fbAccept = fbRows.filter((r) => hasRenderablePreview(r.metadata || {})).length;
  console.log(`fallback accept: ${fbAccept}/${fbRows.length}`);

  // 4) per-contract round: fetch top 6 contracts x 12 tokens
  const top = addrs.slice(0, 6);
  const tasks = top.map((kt) => {
    const q = new URLSearchParams();
    q.set('contract', kt);
    q.set('sort.desc', 'tokenId');
    q.set('limit', '12');
    q.set('offset', '0');
    q.set('totalSupply.gt', '0');
    q.set('select', 'contract,tokenId,metadata,holdersCount,totalSupply');
    return j(`byContract ${kt.slice(0,6)}`, `${base}/tokens?${q.toString()}`);
  });
  const results = await Promise.all(tasks);
  const merged = results.flat();
  const accept = merged.filter((r) => hasRenderablePreview(r.metadata || {})).length;
  console.log(`per-contract merged accept: ${accept}/${merged.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
