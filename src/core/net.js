/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/net.js
  Rev :    r1180   2025‑08‑16
  Summary: Host‑aware rate limiter + retry/backoff + in‑flight dedupe +
           memory TTL cache.  Keeps app under TzKT free‑tier limits
           (≤10 rps) while maintaining snappy UX.  API compatible with
           previous jFetch(url, retries) signature.
──────────────────────────────────────────────────────────────────*/

/* eslint-disable no-console */

// Public API
export { jFetch, sleep, setNetDebug };

/*──────── tiny sleep helper ─────────────────────────────────────*/
function sleep(ms = 0) { return new Promise((r) => setTimeout(r, ms)); }

/*──────── global debug toggle ──────────────────────────────────*/
let DEBUG = false;
function setNetDebug(v = true) { DEBUG = !!v; }

/*──────── constants ───────────────────────────────────────────*/
const DEFAULT_GET_TTL   = 30_000;        // 30s cache for GET
const JSON_TTL_LONG     = 10 * 60_000;   // 10m for stable JSON (e.g., storage, metadata)
const MAX_RETRIES       = 3;
const JITTER            = 120;           // ms jitter for backoff
const SOFT_TIMEOUT_MS   = 14_000;        // guard against hung requests

// Per‑host token buckets.  Keep us below ~9 req/s (under free‑tier 10 rps).
const DEFAULT_BUCKET = {
  capacity: 9,            // tokens
  refillPerSec: 9,        // tokens per second
  tokens: 9,
  blockedUntil: 0,
  inFlight: new Map(),    // urlKey -> Promise
  queueHi: [],            // [{run, key}]
  queueLo: [],
  lastRefill: Date.now(),
  warnCounter: 0,
  warnWindow: 0,
};

const buckets = new Map(); // hostname -> bucket

function getBucket(host) {
  let b = buckets.get(host);
  if (!b) {
    b = { ...DEFAULT_BUCKET, inFlight: new Map(), queueHi: [], queueLo: [] };
    buckets.set(host, b);
  }
  return b;
}

/*──────── memory cache ───────────────────────────────────────*/
const memCache = new Map(); // key -> {expires, data}

function cacheGet(key) {
  const now = Date.now();
  const ent = memCache.get(key);
  if (!ent) return null;
  if (ent.expires > now) return ent.data;
  memCache.delete(key);
  return null;
}
function cacheSet(key, data, ttl) {
  memCache.set(key, { data, expires: Date.now() + Math.max(0, ttl|0) });
}

/*──────── helpers ───────────────────────────────────────────*/
function urlKey(url, opts = {}) {
  const m = typeof opts.dedupeKey === 'string' ? opts.dedupeKey : '';
  return m ? `${url}::${m}` : url;
}
function hostOf(url) {
  try { return new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://x/').host; }
  catch { return 'local'; }
}
function chooseQueue(opts = {}) { return (opts.priority === 'low' ? 'queueLo' : 'queueHi'); }

function pump(host) {
  const b = getBucket(host);
  const now = Date.now();

  // Refill tokens
  const elapsed = Math.max(0, now - b.lastRefill) / 1000;
  if (elapsed >= 0.01) {
    b.tokens = Math.min(b.capacity, b.tokens + b.refillPerSec * elapsed);
    b.lastRefill = now;
  }

  if (now < b.blockedUntil) return;                  // back‑off active
  if (b.tokens < 1) return;                          // no capacity

  const q = b.queueHi.length ? b.queueHi : b.queueLo;
  if (!q.length) return;

  const item = q.shift();
  b.tokens -= 1;
  // Run in microtask to preserve ordering
  Promise.resolve().then(item.run).catch(() => {});
}

/* schedule pumps at ~50fps to allow smooth token release */
setInterval(() => {
  buckets.forEach((_, host) => pump(host));
}, 20);

/*──────── core request executor with queueing ───────────────*/
async function execWithBucket(url, opts = {}) {
  const host = hostOf(url);
  const b = getBucket(host);
  const key = urlKey(url, opts);
  const qName = chooseQueue(opts);

  // In‑flight dedupe (only for GET)
  if (!opts.method || opts.method === 'GET') {
    const existing = b.inFlight.get(key);
    if (existing) return existing;
  }

  let resolve, reject;
  const p = new Promise((res, rej) => { resolve = res; reject = rej; });

  const run = async () => {
    // Soft timeout via AbortController
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort('soft-timeout'), SOFT_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...opts, signal: ac.signal });
      clearTimeout(to);

      if (res.status === 429) { // Rate limited
        const ra = Number(res.headers.get('Retry-After')) || 1.1;  // seconds
        b.blockedUntil = Date.now() + Math.ceil(ra * 1000);
        // Moderate console noise
        const now = Date.now();
        if (now > b.warnWindow + 10_000) { b.warnWindow = now; b.warnCounter = 0; }
        if (b.warnCounter++ < 3 && DEBUG) console.warn('[jFetch] 429 from', host, 'retry-after', ra, 's');
        // Re‑queue at front of low queue
        b[chooseQueue({ priority: 'low' })].unshift({ run, key });
        // small delay so we don't spin
        await sleep(Math.ceil(ra * 1000) + 50);
        return;
      }

      if (!res.ok) {
        // Pass through non‑OK responses (handled in jFetch retry loop)
        resolve(res);
        return;
      }
      resolve(res);
    } catch (e) {
      clearTimeout(to);
      reject(e);
    } finally {
      b.inFlight.delete(key);
      // Allow other queued tasks to run
      Promise.resolve().then(() => pump(host));
    }
  };

  b.inFlight.set(key, p);
  b[qName].push({ run, key });
  pump(host);

  return p;
}

/*──────── main jFetch (JSON‑first) ──────────────────────────*/
/**
 * jFetch(url: string, retries?: number, options?: {
 *   priority?: 'high'|'low',
 *   ttl?: number,              // GET cache TTL
 *   dedupeKey?: string,        // custom in‑flight dedupe key
 *   parse?: 'json'|'text'      // default: auto by content‑type
 *   headers?: Record<string,string>
 *   method?: string, body?: any, signal?: AbortSignal, etc.
 * })
 * 
 * Returns parsed JSON when possible; falls back to text.
 */
async function jFetch(url, retries = 2, options = {}) {
  const opts = { credentials: 'omit', ...options };
  const isGet = !opts.method || opts.method.toUpperCase() === 'GET';
  const ttl = Number(opts.ttl ?? (isGet ? DEFAULT_GET_TTL : 0));
  const key = urlKey(url, opts);

  // Memory cache first
  if (isGet && ttl > 0) {
    const cached = cacheGet(key);
    if (cached !== null) return cached;
  }

  let attempt = 0;
  let lastErr = null;

  while (attempt <= Math.max(0, retries ?? MAX_RETRIES)) {
    try {
      const res = await execWithBucket(url, opts);

      // For non‑OK responses (other than 429 handled earlier)
      if (!res.ok) {
        // Retry on 5xx
        if (res.status >= 500 && attempt < retries) throw new Error(`HTTP ${res.status}`);
        // parse error body with best effort
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt?.slice(0, 180)}`);
      }

      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      let data;
      if (opts.parse === 'text') data = await res.text();
      else if (opts.parse === 'json' || ctype.includes('application/json')) data = await res.json();
      else data = await res.text();

      if (isGet && ttl > 0) {
        cacheSet(key, data, ttl);
      }
      return data;
    } catch (e) {
      lastErr = e;
      attempt += 1;
      if (attempt > retries) break;
      // exponential backoff with jitter; longer for HTTP errors
      const base = 300 * attempt + (e && String(e).includes('HTTP') ? 350 : 0);
      await sleep(base + Math.random() * JITTER);
    }
  }
  if (DEBUG) console.warn('[jFetch] failed', url, lastErr?.message || lastErr);
  throw lastErr || new Error('Network error');
}

/* What changed & why:
   • Added host‑aware token bucket with high/low priority queues to
     smooth request rate to ~9 rps per host (TzKT free‑tier safe).
   • Implemented in‑flight deduplication and 30s GET memory cache.
   • Respected Retry‑After on 429 and auto‑requeued requests.
   • Added soft timeout to avoid hangs; exponential backoff on 5xx.
   • Maintained backward‑compatible signature.
*/
// EOF
