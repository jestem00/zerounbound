/Developed by @jams2blues – ZeroContract Studio
File: docs/ThinBackendsteps.md
Rev : r3 2025‑07‑19 UTC
Summary: simplify origination plan — remove forge/inject helpers
and dual‑stage flow; rely exclusively on wallet.originate. Update
acceptance criteria and remove secret‑key override./
──────────────────────────────────────────────────────────────
Origination Simplification Plan — ZeroUnbound v4
═════════════════════════════════════════════════════════════

Goal — Provide a single, reliable contract origination method
compatible with all Beacon wallets (Temple, Kukai, Umami) while
maintaining 100 % on‑chain storage. After extensive testing we
found that manual forging and injection via backend helpers caused
Temple to fail during injection. The new plan eliminates those
helpers and calls wallet.originate directly. This unifies the
flow, simplifies code, and relies on the wallet to handle gas
estimation, forging, signing and injection.

——————————————————————————————————————————
Step‑by‑Step Implementation (🚧 = code change, 🤎 = test/QA, 📚 = docs update)
——————————————————————————————————————————

1 Pre‑build views.hex.js (🚧🤎📚)
1.1 Next build task reads contracts/metadata/views/Zero_Contract_v4_views.json
and writes src/constants/views.hex.js as export default '0x' + char2Bytes(...).
1.2 Bundle size must stay <11 KB (I26). Test in Jest.
1.3 deploy.js and originate.worker.js should import
views.hex.js instead of re‑encoding JSON at runtime.

2 Single‑Stage Origination Flow (🚧🤎📚)
2.1 Remove all dual‑stage logic. FAST_ORIGIN and USE_BACKEND flags are
deprecated. The contract’s views are stored on‑chain within the
same origination transaction using the compressed views hex from
views.hex.js.
2.2 Deprecate src/pages/api/forge.js and src/pages/api/inject.js. All
forging, signing and injection are handled by the Beacon wallet.
2.3 Refactor src/pages/deploy.js to call toolkit.wallet.originate.
The wallet estimates fees, forges the operation, prompts for a
single signature and injects it over the appropriate transport.
2.4 Drop the secret‑key override; signing is always performed by the
connected wallet. This simplifies the UI and reduces attack
surface.

3 Fast RPC Selection (🚧)
3.1 Keep using chooseFastestRpc.js to select the fastest RPC for
toolkit initialization. Cache the winner in sessionStorage for
10 minutes. This ensures the wallet has a responsive RPC.
3.2 Wrap Taquito toolkit creation in WalletContext with the chosen
RPC before any origination calls.

4 Mobile Keyboard‑Safe Layout (🚧🤎)
4.1 Wrap collection deployment page content in a container with
style={{ height:'calc(100vh - env(keyboard-inset-height))' }} to
prevent soft keyboard overlay on mobile browsers.
4.2 Manual QA on iOS 17 Safari & Android 14 Chrome.

5 Progress Overlay Metrics (🚧)
5.1 Extend OperationOverlay stages: PACK ▸ WALLET ▸ CONFIRM.
5.2 Auto‑abort after 90 s idle; suggest desktop if mobile network is slow.

6 Documentation & Invariants Update (📚)
6.1 Remove invariant I118 and references to dual‑stage origination.
6.2 Update docs/TZIP_Compliance_Invariants_ZeroContract_V4.md and
docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md to
reflect the single‑stage flow.
6.3 Extend the quick‑start section: yarn build auto‑generates
views.hex.js. There is no need to set .env.local for origination.
6.4 Update the FAQ: explain that only one wallet signature is needed
when deploying a collection.

Acceptance Criteria Matrix
Metric	Current	Target
Build→wallet prompt	~7 min	<60 s
Wallet sign→op inject	~60 s	<30 s
Total confirmations (2 blocks)	~8 min	<90 s
UI freeze with soft keyboard	yes	no
Bundle size delta	+0 kB	≤ +12 kB

Next / Pending
1. Refactor front‑end to remove secret‑key override and backend APIs.
2. Audit the Manifest and Invariants for consistency with the single‑stage
origination flow.
3. Test the deployment flow across Temple, Kukai and Umami on ghostnet
and mainnet; measure the metrics above and tune UI accordingly.

/* What changed & why: Replaced dual‑stage and backend forging plan with
a simplified single‑stage origination that relies on wallet.originate.
Removed secret‑key overrides and environment flags. Updated metrics,
steps and pending tasks accordingly.*/