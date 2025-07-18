
/*Developed by @jams2blues – ZeroContract Studio
  File: docs/ThinBackendsteps.md
  Rev : r2    2025‑07‑18 UTC
  Summary: revised origination acceleration plan; adds local signer,
  backend forge/inject helpers, FAST_ORIGIN dual-flow and updated
  acceptance criteria */
─────────────────────────────────────────────────────────────
Origination Acceleration Plan — ZeroUnbound v4
═════════════════════════════════════════════════════════════

**Goal** — Cut end‑to‑end contract origination time on mobile from
>8 min → <90 s without sacrificing 100 % on‑chain storage or any
existing invariants (I00–I117). The plan below updates the original
roadmap with lessons learned: large payloads require local signing and
serverless injection; a dual‑stage origination reduces Temple/Beacon
payload overhead.

—————————————————————————————————————————
Step‑by‑Step Implementation (🔱 = quick win, 🚧 = code change,
🤎 = test/QA, 📚 = docs update)
—————————————————————————————————————————

### 1 Pre‑build `views.hex.js` (🔱🚧🤎📚)
1.1 Next build task reads `contracts/metadata/views/Zero_Contract_v4_views.json`
   and writes `src/constants/views.hex.js` as `export default '0x' + char2Bytes(...)`.
1.2 Bundle size must stay <11 KB (I26). Test in Jest.
1.3 `deploy.js` and `originate.worker.js` should import
   `views.hex.js` instead of re-encoding JSON at runtime.

### 2 Dual‑Stage “Slim Originate” Flow (🚧🤎📚)
2.1 Add `FAST_ORIGIN=true` in `src/config/deployTarget.js` / env. When set,
   the origination storage writes `"views":"0x00"`.
2.2 After origination confirmation, front‑end automatically calls
   `update_contract_metadata` with the real views hex and requires a
   second signature. See invariants I118 and manifest for guidance.
2.3 Guard via a new invariant (I118) so both transactions either
   succeed or UI offers rollback instructions.
2.4 Add Cypress E2E test: on mobile profile expect two wallet prompts
   and total chain time <90 s on ghostnet.

### 3 Serverless Forge & Inject Helper (🚧🤎📚)
3.1 Create `src/pages/api/forge.js`: accept `{ branch, contents }` or
   `{ code, storage }`. Use Taquito’s `rpc.forgeOperations()` when
   branch/contents provided or `packDataBytes`/`forgeOperations` for
   local code+storage forging. Return `forged` hex without `0x`.
3.2 Create `src/pages/api/inject.js`: accept `{ signedBytes }`, ensure
   `0x` prefix, POST to the fastest RPC as chosen by
   `utils/chooseFastestRpc.js`, and return the operation hash.
3.3 Update `src/core/net.js` to detect `USE_BACKEND=true` and call
   `/api/forge` and `/api/inject` accordingly. When false, forge
   operations via RPC (`/helpers/forge/operations`) and inject via
   direct RPC.
3.4 Update `WalletContext` and `deploy.js` to support local signing
   (via InMemorySigner when a secret key is provided) and remote
   signing via Beacon Wallet. Signing payloads must start with
   watermark `03`; append curve id (00/01/02) to signature.
3.5 Security: private keys never leave the browser; back‑end only sees
   unsigned bytes and signatures.

### 4 Fast RPC Selection (🔱🚧)
4.1 Add `src/utils/chooseFastestRpc.js`: race the RPC list from
   `deployTarget.js` with a 2 s timeout; cache the winner in
   `sessionStorage` for 10 min.
4.2 Wrap Taquito toolkit creation in `WalletContext` with the chosen
   RPC before any origination or injection calls.
4.3 Unit test: mock three slow/fail endpoints; expect the util to
   return the responsive one.

### 5 Mobile Keyboard‑Safe Layout (🚧🤎)
5.1 Wrap collection deployment page content in a container with
   `style={{ height:'calc(100vh - env(keyboard-inset-height))' }}` to
   prevent soft keyboard overlay on mobile browsers.
5.2 Manual QA on iOS 17 Safari & Android 14 Chrome.

### 6 Progress Overlay Metrics (🔱🚧)
6.1 Extend `OperationOverlay` stages: `PACK ▸ WALLET ▸ FORGE ▸ INJECT ▸ CONFIRM (1/2)`.
6.2 Auto-abort after 90 s idle; suggest desktop if mobile network is slow.

### 7 Documentation & Invariants Update (📚)
7.1 Add new invariant I118: “**Two‑stage origination must auto‑patch
   contract metadata within the same UI session whenever FAST_ORIGIN
   is enabled.** Failure to patch is a critical error.”
7.2 Update `docs/TZIP_Compliance_Invariants_ZeroContract_V4.md` and
   `docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md` to
   reflect dual‑stage flow and environment flags.
7.3 Extend the quick‑start section: `yarn build` auto‑generates
   `views.hex.js` and reads `.env.local` for USE_BACKEND and FAST_ORIGIN.
7.4 Add FAQ entry: “Why do I sign twice when deploying a collection?”

### 8 Local Signing Guidelines (🚧)
8.1 Expose an optional “Private Key” field on the Deploy form. If
   provided, use `InMemorySigner` to sign the bytes and skip
   Beacon/Temple. Display a warning that secret keys never leave the
   client.
8.2 When no secret key is provided, rely on Beacon Wallet signing as
   usual.

------------------------------------------------------------------
Acceptance Criteria Matrix
------------------------------------------------------------------
| Metric                              | Current | Target  |
|-------------------------------------|---------|---------|
| Build→wallet prompt                 | ~7 min | <45 s |
| Wallet sign→op inject               | ~60 s | <10 s |
| Total confirmations (2 blocks)      | ~8 min | <90 s |
| UI freeze with soft keyboard        | yes     | no     |
| Bundle size delta                   | +0 kB | ≤ +12 kB |

------------------------------------------------------------------
Next / Pending
------------------------------------------------------------------
1. Review and approve FAST_ORIGIN approach versus single‑op purity.
2. Confirm Vercel Edge functions are acceptable in ZeroUnbound infra.
3. Provide preferred ghostnet RPC list for §4.
4. Lock wording of invariant I118 and update manifest.

/* What changed & why: inserted local signer & backend forge/inject flow,
added dual‑stage origination steps and acceptance criteria; upgraded
roadmap to reflect current environment flags and invariants */
