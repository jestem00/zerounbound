/*Developed by @jams2blues – ZeroContract Studio
  File: docs/OriginationAccelerationPlan.md
  Rev : r2    2025‑09‑06 UTC
  Summary: updated for wallet.originate flow; deprecated backend */
──────────────────────────────────────────────────────────────────
Origination Acceleration Plan — ZeroUnbound v4
══════════════════════════════════════════════

**Goal** Cut end‑to‑end contract origination time on mobile from
>8 min ➜ <90 s without sacrificing 100 % on‑chain storage or any
existing invariants (I00‑I117 or latest).

------------------------------------------------------------------
Step‑by‑Step Implementation (💎 = quick win, 🛠 = code change,
🧪 = test/QA, 📚 = docs update)
------------------------------------------------------------------

### 1 Pre‑build `views.hex.js` (💎🛠🧪📚)
1.1 Add a Rollup/webpack plugin in **next.config.js**  
  ▪ During `next build`, read  
    `contracts/metadata/views/Zero_Contract_v4_views.json`,  
    `JSON.stringify()` it and emit  
    `export default '0x' + char2Bytes(<json>)`.  
1.2 Place file at `src/constants/views.hex.js`; ensure bundle
  size < 11 KB (I26).  
1.3 Refactor `src/pages/deploy.js` &  
  `src/workers/originate.worker.js` to `import viewsHex from
  '../constants/views.hex.js'` instead of runtime encoding.  
1.4 Unit‑test with Jest: expect exported string length ===
  (views.json bytes × 2 + 2).  

### 2 Dual‑Tx “Slim Originate” Flow (🛠🧪📚)
2.1 Introduce `FAST_ORIGIN=true` flag in  
  `src/config/deployTarget.js`.  
2.2 If flag set, origination payload stores `"views":"0x00"`.  
2.3 Upon first confirmation, auto‑dispatch
  `update_contract_metadata` with the real viewsHex.  
2.4 Guard via invariant **I118** (add) so both TXs must succeed or
  UI toasts rollback hint.  
2.5 E2E Cypress test: mobile profile, expect wallet prompts twice,
  total chain time < 90 s on ghostnet.  

### 3 Serverless Forge & Inject Helper (deprecated)
As of r1017, contract deployment uses `wallet.originate` directly.
The helper APIs `/api/forge` and `/api/inject` are no longer required
and may be removed from future builds.

### 4 Fast RPC Selection (💎🛠)
4.1 Add `src/utils/chooseFastestRpc.js`: race three endpoints
  ({ghostnet, oxhead, rpc.tzkt.io}), cache winner 10 min in
  `sessionStorage`.  
4.2 WalletContext wraps Taquito toolkit with chosen node before
  origination.  
4.3 Unit test: mock three slow/fail endpoints, expect util to pick
  healthy one in < 2 s.  

### 5 Mobile Keyboard‑Safe Layout (🛠🧪)
5.1 Wrap `<CRTFrame>` on *deploy* page with  
  `style={{height:'calc(100vh - env(keyboard-inset-height))'}}`
  (behind feature‑detect).  
5.2 Manual QA on iOS 17 Safari & Android 14 Chrome.  

### 6 Progress Overlay Metrics (💎🛠)
6.1 Extend `OperationOverlay` to expose granular stages:  
  `PACK ▸ WALLET ▸ FORGE ▸ INJECT ▸ CONFIRM (1/2)`.  
6.2 Auto‑abort & suggest desktop after 90 s idle.  

### 7 Documentation & Invariants Update (📚)
7.1 Add **I118** “Two‑step slim origination must auto‑patch
  contract metadata within same UI session.”  
7.2 Update manifest §6 Quick‑Start: `yarn build` now generates
  `views.hex.js`.  
7.3 Add FAQ entry: “Why two signatures when creating a
  collection?”  

------------------------------------------------------------------
Parallelisation Hints
------------------------------------------------------------------
* Steps 1, 4, 5, 6 are isolated — can ship in one PR.  
* Step 3 requires Vercel config; feature‑flag behind env var.  
* Step 2 depends on Step 1 (needs viewsHex).  

------------------------------------------------------------------
Acceptance Criteria Matrix
------------------------------------------------------------------
| Metric                         | Current | Target |
|--------------------------------|---------|--------|
| Mobile build→wallet prompt     | ~7 min  | <45 s |
| Wallet sign→op inject          | ~60 s   | <10 s |
| Total confirmations (2 blocks) | ~8 min  | <90 s |
| UI freeze with soft keyboard   | yes     | no    |
| Bundle size delta              | +0 kB   | ≤ +12 kB |

------------------------------------------------------------------
Next / Pending
------------------------------------------------------------------
1. Approve two‑TX approach vs. single‑op purity.  
2. Confirm Vercel Edge function is acceptable in ZeroUnbound infra.  
3. Provide preferred ghostnet RPC list for §4.  
4. Green‑light invariant **I118** wording.

/* What changed & why: deprecated forge/inject helper; wallet.originate now standard; rev r2. */
/* EOF */
