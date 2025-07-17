/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/net.js
  Rev :    r1002   2025‑08‑02
  Summary: complete forge + inject overhaul; fixes 415; adds
           reveal handling, curve‑tag compliance, multi‑CT
─────────────────────────────────────────────────────────────*/
const LIMIT = 4;
let   active = 0;
const queue  = [];

import { Parser }  from '@taquito/michel-codec';
import { Schema }  from '@taquito/michelson-encoder';
import {
  selectFastestRpc, RPC_URLS,
}                   from '../config/deployTarget.js';

export const sleep = (ms = 500) => new Promise(r => setTimeout(r, ms));

const USE_BACKEND = process.env.USE_BACKEND !== 'false';  /* default on */

/*──────── throttled fetch ─────────────────────────────────*/
function exec(task){ active++; return task().finally(()=>{ active--; if(queue.length) queue.shift()();}); }
export function jFetch(url, opts = {}, tries){
  if(typeof opts==='number'){ tries=opts; opts={}; }
  if(!Number.isFinite(tries)) tries=/tzkt\.io/i.test(url)?10:5;
  return new Promise((resolve,reject)=>{
    const run = ()=>exec(async()=>{
      for(let i=0;i<tries;i++){
        const ctrl=new AbortController();
        const timer=setTimeout(()=>ctrl.abort(),45_000);
        try{
          const res=await fetch(url,{...opts,signal:ctrl.signal});
          clearTimeout(timer);
          if(res.status===429){ await sleep(800*(i+1)); continue; }
          if(!res.ok) throw new Error(`HTTP ${res.status}`);
          const ct=res.headers.get('content-type')||'';
          const data=ct.includes('json')?await res.json():await res.text();
          return resolve(data);
        }catch(e){
          clearTimeout(timer);
          const m=e?.message||'';
          if(/Receiving end|ECONNRESET|NetworkError|failed fetch/i.test(m)){
            await sleep(800*(i+1)); continue;
          }
          if(i===tries-1) return reject(e);
          await sleep(600*(i+1));
        }
      }
    });
    active<LIMIT?run():queue.push(run);
  });
}

/*──────────────── forgeOrigination – r4 ───────────────────*/
export async function forgeOrigination(
  sourceTz,
  storageJs,
  sourceAddress,
  publicKey,
){
  if(!sourceAddress) throw new Error('forgeOrigination: missing sourceAddress');
  const rpc = await selectFastestRpc().catch(()=>{ throw new Error('No reachable RPC'); });

  /*↪ reveal? ------------------------------------------------*/
  let needsReveal = false;
  try{ const mk = await jFetch(`${rpc}/chains/main/blocks/head/context/contracts/${sourceAddress}/manager_key`); needsReveal = !mk; }catch{ needsReveal = true; }

  /*↪ parse code + encode storage ---------------------------*/
  const parser = new Parser({ expandMacros:true });
  const code   = parser.parseScript(sourceTz);
  const storageType = code.find(p=>p.prim==='storage')?.args?.[0];
  if(!storageType) throw new Error('Cannot locate storage type section');
  const schema  = new Schema(storageType);
  const storage = schema.Encode(storageJs);

  /*↪ context (branch/counter) ------------------------------*/
  const [branch, counterRaw] = await Promise.all([
    jFetch(`${rpc}/chains/main/blocks/head/hash`),
    jFetch(`${rpc}/chains/main/blocks/head/context/contracts/${sourceAddress}/counter`),
  ]);
  let counter = BigInt(counterRaw) + 1n;

  /*↪ assemble contents -------------------------------------*/
  const contents = [];

  if(needsReveal){
    contents.push({
      kind:'reveal',
      source:        sourceAddress,
      fee:           '1272',
      counter:       counter.toString(),
      gas_limit:     '10000',
      storage_limit: '0',
      public_key:    publicKey,
    });
    counter += 1n;
  }

  contents.push({
    kind:'origination',
    source:        sourceAddress,
    fee:           '20000',
    counter:       counter.toString(),
    gas_limit:     '250000',
    storage_limit: '60000',
    balance:       '0',
    script:        { code, storage },
  });

  const opObj = { branch, contents };

  /*↪ forge --------------------------------------------------*/
  if(USE_BACKEND){
    const { forged } = await jFetch('/api/forge',{
      method :'POST',
      headers:{'Content-Type':'application/json'},
      body   : JSON.stringify(opObj),
    });
    return forged.replace(/^0x/,'');
  }

  const res = await fetch(`${rpc}/chains/main/blocks/head/helpers/forge/operations`,{
    method :'POST',
    headers:{'Content-Type':'application/json'},
    body   : JSON.stringify(opObj),
  });
  if(!res.ok){
    const detail=await res.text().catch(()=>res.statusText);
    throw new Error(`Forge failed: HTTP ${res.status} – ${detail}`);
  }
  return (await res.text()).replace(/^0x/,'').replace(/"/g,'').trim();
}

/*──────────────── injectSigned – r6 ────────────────────────*/
export async function injectSigned(signedBytes){
  const fastest = await selectFastestRpc().catch(()=>null);
  const rpcPool = [...new Set([fastest, ...RPC_URLS])].filter(Boolean);
  const sanitize=u=>(u||'').split(/[?#]/)[0].replace(/\/+$/,'');
  const hex = signedBytes.replace(/^0x/,'');

  const variants = [
    { body:`"${hex}"`,   ct:'application/json'    },
    { body:`"0x${hex}"`, ct:'application/json'    },
    { body:`0x${hex}`,   ct:'text/plain'          },
    { body:hex,          ct:'text/plain'          },
    { body:hex,          ct:'application/octet-stream' },
  ];

  async function tryInject(rpc){
    const url = `${rpc}/injection/operation?chain=main`;
    for(const { body, ct } of variants){
      const hdr = ct ? { 'Content-Type': ct } : undefined;
      const res = await fetch(url,{ method:'POST', headers:hdr, body }).catch(()=>null);
      if(res && res.ok){
        const txt=(await res.text()).replace(/"/g,'').trim();
        if(/^o[0-9A-Za-z]{50}$/.test(txt)) return txt;
      }
    }
    return null;
  }

  if(USE_BACKEND){
    const { opHash } = await jFetch('/api/inject',{
      method :'POST',
      headers:{'Content-Type':'application/json'},
      body   : JSON.stringify({ signedBytes: hex }),
    });
    return opHash;
  }

  for(const rpc of rpcPool.map(sanitize)){
    const h=await tryInject(rpc);
    if(h) return h;
  }
  throw new Error('Inject failed: all RPC/variant attempts exhausted');
}
/* EOF */