/*Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/sliceCache.js
  Rev :    r591   2025-06-15
  Summary: API unchanged; clarify comment – now also used by
           Mint.jsx to checkpoint oversize slice uploads. */

const PREFIX     = 'zuSliceCache';
const MS_PER_DAY = 24*60*60*1000;

/** DJB2 string hash → uint32 */
export function strHash (s='') {
  return s.split('').reduce((h,c)=>(h<<5)+h+c.charCodeAt(0),5381)>>>0;
}
const makeKey = (a,i,l='artifact') => `${PREFIX}:${a}:${i}:${l}`;

/*──────── CRUD ───────────────────────────────────────────*/
export const loadSliceCache  = (a,i,l)=>JSON.parse(localStorage.getItem(makeKey(a,i,l))||'null');
export const saveSliceCache  = (a,i,l,info)=>localStorage.setItem(makeKey(a,i,l),JSON.stringify({ ...info,timestamp:Date.now() }));
export const clearSliceCache = (a,i,l)=>localStorage.removeItem(makeKey(a,i,l));

/** Purge any checkpoint older than <maxAgeDays> (default 1 day) */
export function purgeExpiredSliceCache (maxAgeDays=1){
  const now=Date.now(), maxAge=maxAgeDays*MS_PER_DAY;
  for(const k of Object.keys(localStorage)){
    if(!k.startsWith(PREFIX)) continue;
    try{
      const { timestamp } = JSON.parse(localStorage.getItem(k)||'{}');
      if(typeof timestamp==='number' && now-timestamp>maxAge){
        localStorage.removeItem(k);
      }
    }catch{ localStorage.removeItem(k); }
  }
}

/* Used by:
   • AppendArtifactUri / AppendExtraUri for resumable uploads
   • Mint.jsx (r590+) to checkpoint each oversized mint slice so a
     failed multi-sig can be repaired later via Append. */
/* EOF */
