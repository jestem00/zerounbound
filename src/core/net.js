/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/net.js
  Rev :    r1017   2025‑09‑06
  Summary: remove unused forge/inject helpers
─────────────────────────────────────────────────────────────*/
const LIMIT = 4;
let   active = 0;
const queue  = [];



export const sleep = (ms = 500) => new Promise(r => setTimeout(r, ms));


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

/* EOF */
/* What changed & why: removed forgeOrigination and injectSigned; now unused; rev r1017. */
