/──────── docs/TZIP_Compliance_Invariants_ZeroContract_V4.md ────────/
/─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: docs/TZIP_Compliance_Invariants_ZeroContract_V4.md
Rev : r6 2025-07-24 UTC
Summary: update metadata invariants for single‑stage origination and remove dual‑stage guidance.
──────────────────────────────────────────────────────────────/

TZIP_Compliance_Invariants_ZeroContract_V4.md
Purpose
Standardise all metadata and storage invariants for ZeroContract V4 so that
collections and tokens remain 100 % TZIP‑compatible, interoperable with major
Tezos marketplaces (Objkt, ZeroUnbound, etc.), and fully on‑chain.

──────────────────────────────────────────────────────────────────────────────
1 · TZIP STANDARDS SUMMARY
──────────────────────────────────────────────────────────────────────────────
• TZIP‑12 (FA2 Token Metadata) — minimum per‑token keys: decimals, name and symbol (unchanged).
• TZIP‑16 (Contract Metadata) — minimum contract‑level keys: name, description, version,
license, authors, homepage (optional), interfaces (must list "TZIP‑012" when FA2).
• TZIP‑21 (Rich Token Metadata) — extends TZIP‑12; adds artifactUri, displayUri and thumbnailUri.

──────────────────────────────────────────────────────────────────────────────
2 · ZERO‑CONTRACT V4 — METADATA INVARIANTS
──────────────────────────────────────────────────────────────────────────────

2.1 Contract‑Level Metadata
The following keys must be present at origination in the order listed. The UI
constructs the full metadata JSON on the client and encodes it into a Michelson
big‑map. Single‑stage origination is now recommended for all wallets; there is
no longer a dual‑stage process. Consequently, the full views array and
imageUri are included at origination.

• tezos‑storage:content · Mandatory — header key ("0x74657a6f732d…") pointing to
metadata JSON stored at map key "content". Guarantees indexers resolve
contract metadata deterministically (TZIP‑16 §5.1).
• name · Mandatory — human‑readable collection title.
• symbol · Mandatory — short mandatory symbol for the contract, i.e. "symbol": "ZUART"
(3‑5 A‑Z/0‑9).
• description · Mandatory — short collection synopsis.
• version · Mandatory — auto‑injected "ZeroContractV4".
• license · Mandatory — dropdown; default “No License, All Rights Reserved”.
• authors · Mandatory — ≥ 1 comma‑separated names.
• homepage · Optional — validated http/https (future web3 schemes accepted).
• authoraddress · Mandatory — comma‑separated tz‑addresses (editable; pre‑filled from wallet).
• creators · Mandatory — comma‑separated tz‑addresses (editable; pre‑filled from wallet).
• type · Mandatory — dropdown: art | music | collectible | other.
• interfaces · Mandatory — auto‑includes ["TZIP‑012","TZIP‑016"]. Deduped and upper‑cased.
• imageUri · Mandatory — base64 data‑URI (1:1 aspect; validated). The real imageUri
is stored during the single‑stage origination; no placeholder is used.
• views · Mandatory — off‑chain view array (Michelson; stored in
/contracts/metadata/views/Zero_Contract_v4_views.json). The full JSON view
array is encoded and stored at origination; no placeholder pointer is used.

2.2 Token‑Level Metadata (applied at mint, and in this order)
• name · Mandatory — NFT title.
• description · Optional — strongly recommended (warning toast when blank).
• mimeType · Mandatory — auto‑detected on upload.
• authors · Optional — multiline comma‑list (warning when blank).
• artists · Optional — multiline comma‑list (warning when blank). (only exists for v4b SIFR ZERO initial deployment by Retro Manni, grandfathered in)
• creators · Mandatory — editable; pre‑filled from wallet.
• license · Mandatory — auto‑copied from contract metadata if present (editable).
• royalties · Mandatory — JSON string, max aggregate 25 %; UI enforces split logic.
• mintingTool · Mandatory — auto‑injected diverging constant from deployTarget.js (https://zerounbound.art | https://ghostnet.zerounbound.art).
• accessibility · Optional — JSON string. Format: {"hazards":["flashing"]}. ⚠ IMMUTABLE: once “flashing” hazard is set it can never be removed (see invariant I101). Omitting the key in a later edit is ignored.
• contentRating · Optional — string "mature". ⚠ IMMUTABLE: once "mature" is stored it can never be downgraded (see invariant I101).
• tags · Optional — array, clone‑protected.
• attributes · Optional — array, name/value pairs, clone‑protected.
• decimals · Mandatory — fixed to bytes("0"), hidden from user.
• artifactUri · Mandatory — base64 data‑URI, auto‑detected. Oversize uploads are chunked (see invariants I60–I61).
• extraUri · Optional — for v4 contracts only, appends extra Uri after artifactUri to allow infinite multiple assets in same token.

2.3 additional minting minutiae. not keys, but mandatory for mint forms:
• recipient address · Mandatory‑editable; pre‑filled from wallet. Wallet that receives token(s) after mint.

2.3 Additional minting minutiae (unchanged).

──────────────────────────────────────────────────────────────────────────────
3 · ZERO‑CONTRACT — STORAGE PAIRS (REFERENCE)
──────────────────────────────────────────────────────────────────────────────
see zerounbound\contracts\StorageReference in the repo or contracts bundle

──────────────────────────────────────────────────────────────────────────────
4 · ORIGINATION GUIDANCE
──────────────────────────────────────────────────────────────────────────────
Dual‑stage origination has been retired. The recommended method is a single‑stage
origination where the full contract metadata (including views and imageUri) is
encoded and stored at origination. All wallets now originate via a single
operation using TezosToolkit.wallet.originate(). The remote forge service and
FAST_ORIGIN flag are no longer used.

Implementations MAY provide resume support if desired: if the origination fails
after signing but before confirmation, the UI should persist the contract address
and metadata JSON in localStorage and allow the user to retry.

──────────────────────────────────────────────────────────────────────────────
/* What changed & why: Updated to r6. Removed dual‑stage origination guidance
and remote forge service references; clarified that the full metadata,
including the views array and imageUri, is stored during a single‑stage
origination. Other sections are unchanged from the previous revision. */