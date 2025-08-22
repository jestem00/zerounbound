/──────── docs/TZIP_Compliance_Invariants_ZeroContract_V4.md ────────/
/─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: docs/TZIP_Compliance_Invariants_ZeroContract_V4.md
Rev : r7 2025-09-07 UTC
Summary: add canonical slicing + IDB-only checkpoints; reinforce diff-aware append rules.
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
2 · ZERO‑CONTRACT V4(now v4e) — METADATA INVARIANTS
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

### 2.2 Token‑Level Metadata (applied at mint, and in this order)

- **name** · Mandatory — NFT title.  
- **description** · Optional — strongly recommended (warning toast when blank).  
- **mimeType** · **Mandatory** — auto‑detected on upload.  
- **authors** · Optional — multiline comma‑list (warning when blank).  
- **artists** · Optional — multiline comma‑list (legacy/v4b only).  
- **creators** · **Mandatory** — editable; pre‑filled from wallet.  
- **license** · **Mandatory** — copied from contract metadata if present (editable).  
- **royalties** · **Mandatory** — JSON object; max aggregate 25 %; UI enforces split logic.  
- **mintingTool** · **Mandatory** — injected constant reflecting deploy target (ghostnet/mainnet).  
- **accessibility** · Optional — e.g. `{"hazards":["flashing"]}`. **Immutable flags**: cannot be removed later.  
- **contentRating** · Optional — `"mature"`. **Immutable** once present.  
- **tags** · Optional — array, clone‑protected.  
- **attributes** · Optional — **array** of `{name, value}` pairs (TZIP‑21 style), clone‑protected.  
- **decimals** · **Mandatory** — fixed to bytes("0"), hidden in UI.  
- **artifactUri** · **Mandatory** — base64 data‑URI preferred; oversize uploads are chunked in Append flows.  
- **displayUri** · **Optional (soft)** — recommended for some off‑chain card views, **not required** on ZeroUnbound’s fully on‑chain flow.  Can add in our EditTokenMetadata.jsx, but not manditory on Mint.jsx  
- **thumbnailUri** · **Optional (soft)** — recommended for off‑chain card views, **not required** on ZeroUnbound’s fully on‑chain flow.  Can add in our EditTokenMetadata.jsx, but not manditory on Mint.jsx  
- **extraUri** · Optional (v4) — allows additional assets.

> **Soft policy**: while `displayUri` and `thumbnailUri` exist in TZIP‑21, ZeroUnbound’s fully on‑chain platform does not require them. The UI shows a soft “➖” when missing and only warns if a present media key is **not** a `data:` URI.

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

Slice checkpoints for oversized uploads are now stored in IndexedDB only;
legacy localStorage paths must be migrated on first access.

All append/repair flows must recompute the on-chain artifactUri prefix after
each confirmed slice using the canonical slicer to prevent duplicate bytes.
The fee estimator and batch builder share this module so expected signature
counts match wallet prompts. Data URIs must pass `isValidDataUri`/`isLikelySvg`
checks before slicing; malformed payloads are rejected.

Tokens with `extrauri_*` metadata MUST expose those assets via the `get_extrauris` view. UIs MUST provide navigation across all returned items and offer a MIME‑accurate download link for each value.

──────────────────────────────────────────────────────────────────────────────
/* What changed & why: Updated to r7. Added canonical slicer rules,
IndexedDB-only checkpoint note, data-URI validation guidance, and extrauri viewer requirement. Other sections remain unchanged. */