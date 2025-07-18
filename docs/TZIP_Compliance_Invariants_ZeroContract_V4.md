/*───────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File:    docs/TZIP_Compliance_Invariants_ZeroContract_V4.md
Rev :    r2    2025-07-18 UTC
Summary: adds dual-stage origination invariant I118 and clarifies
contract and token metadata rules
──────────────────────────────────────────────────────────────*/

TZIP_Compliance_Invariants_ZeroContract_V4.md
==============================================

Purpose
-------
Standardize all metadata and storage invariants for **ZeroContract V4** so that
collections and tokens remain 100 % TZIP-compatible, interoperable with major
Tezos marketplaces (Objkt, ZeroUnbound, etc.), and fully on-chain.

──────────────────────────────────────────────────────────────────────────────
1 · TZIP STANDARDS SUMMARY
──────────────────────────────────────────────────────────────────────────────
• TZIP-12  (FA2 Token Metadata) — minimum per-token keys:
  - decimals (bytes, use "0" for NFTs)
  - name     (bytes)
  - symbol   (bytes)

• TZIP-16  (Contract Metadata) — minimum contract-level keys:
  - name
  - description
  - version
  - license
  - authors  (array)
  - homepage (optional)
  - interfaces (must list "TZIP-012" when FA2)

• TZIP-21  (Rich Token Metadata) — extends TZIP-12; adds:
  - artifactUri  (main media)
  - displayUri   (larger display)
  - thumbnailUri (preview)

──────────────────────────────────────────────────────────────────────────────
2 · ZERO-CONTRACT V4 — METADATA INVARIANTS
──────────────────────────────────────────────────────────────────────────────
### 2.1 Contract-Level Metadata
(applied at origination, and in this order for human-readability, and parsing order)

• **tezos-storage:content**  · Mandatory — header key ("0x74657a6f732d…") pointing to
                          metadata JSON stored at map key "contents".
                          Guarantees indexers resolve contract metadata
                          deterministically (TZIP-16 §5.1).  (Invariant I38)
• **name**             · Mandatory — human-readable collection title.
• **symbol**           · Mandatory — short mandatory symbol for the contract, i.e. "symbol": "ZUART", (3‑5 A‑Z/0‑9)
• **description**      · Mandatory — short collection synopsis.
• **version**          · Mandatory — auto-injected “ZeroContractV4”.
• **license**          · Mandatory — dropdown; default “No License, All Rights Reserved”.
• **authors**          · Mandatory — ≥ 1 comma-separated names.
• **homepage**         · Optional  — validated http/https (future web3 schemes accepted).
• **authoraddress**    · Mandatory — comma-separated tz-addresses (editable; pre-filled from wallet).
• **creators**         · Mandatory — comma-separated tz-addresses (editable; pre-filled from wallet).
• **type**             · Mandatory — dropdown: art | music | collectible | other.
• **interfaces**       · Mandatory — auto-includes ["TZIP-012","TZIP-016"].
• **imageUri**         · Mandatory — base64 data-URI (1:1 aspect; validated).
• **views**            · Mandatory — off-chain view array (Michelson; appended automatically, stored in:
                               `/contracts/metadata/views/Zero_Contract_v4_views.json`).
• **dualStagePatch**   · Conditional — when `FAST_ORIGIN=true` the contract
                          must automatically call `update_contract_metadata` to
                          patch the real views hex after origination
                          confirmation. This two-step process is governed by
                          invariant I118 (added in this revision) and ensures
                          the final metadata remains compliant.  Omit this key
                          when FAST_ORIGIN is disabled.

### 2.2 Token-Level Metadata (applied at mint, and in this order)
• **name**             · Mandatory — NFT title.
• **description**      · Optional  — strongly recommended (warning toast when blank).
• **mimeType**         · Mandatory — auto-detected on upload.
• **authors**          · Optional  — multiline comma-list (warning when blank).
• **artists**          · Optional  — multiline comma-list (warning when blank). (only exists for v4b SIFR ZERO initial deployment by Retro Manni, grandfathered in)
• **creators**         · Mandatory — editable; pre-filled from wallet.
• **license**          · Mandatory — auto-copied from contract metadata if present (editable).
• **royalties**        · Mandatory — JSON string, max aggregate 25 %; UI enforces split logic.
• **mintingTool**      · Mandatory — auto-injected diverging constant from deployTarget.js
                       (https://zerounbound.art | https://ghostnet.zerounbound.art).
• **accessibility**    · Optional — JSON string
  Format: `{"hazards":["flashing"]}`.
  ⚠ **IMMUTABLE:** once “flashing” hazard is set it can never be removed (see invariant I101). Omitting the key in a later edit is ignored.
• **contentRating**    · Optional — string "mature".
  ⚠ **IMMUTABLE:** once "mature" is stored it can never be downgraded (see invariant I101).
• **tags**             · Optional — array, clone-protected.
• **attributes**       · Optional — array, name/value pairs, clone-protected.
• **decimals**         · Mandatory — fixed to bytes("0"), hidden from user.
• **artifactUri**      · Mandatory — base64 data-URI, auto-detected.
• **extraUri**         · Optional  - for v4 contracts only, appends extra Uri after artifactUri to allow infinite multiple assets in same token.

2.3 additional minting minutiae. not keys, but mandatory for mint forms:
• **recipient address** · Mandatory-editable; pre-filled from wallet. Wallet that receives token(s) after mint

──────────────────────────────────────────────────────────────────────────────
3 · ZERO-CONTRACT V4 — STORAGE PAIRS (REFERENCE)
──────────────────────────────────────────────────────────────────────────────
2.3 Hidden Storage Pairs (never user-editable)
• **contract_id**    · Bytes "ZeroContract" — ensures contract recognition across indexers and internal logic.
• **burn_address**   · tz1burnburnburnburnburnburnburjAYjjX — immutable burn link.

active_tokens        set(nat)
admin                address
burn_address         address
children             set(address)
collaborators        set(address)
contract_id          bytes
destroyed_tokens     set(nat)
extrauri_counters    big_map(nat, pair(descriptions map(nat,string) • labels map(nat,string) • names map(nat,string)))
ledger               big_map(pair(address,nat), nat)
lock                 bool
metadata             big_map(string, bytes)
next_token_id        nat
operators            big_map(pair(owner address, operator address, token_id nat), unit)
parents              set(address)
token_metadata       big_map(nat, pair(token_id nat, token_info map(string, bytes)))
total_supply         big_map(nat, nat)

──────────────────────────────────────────────────────────────────────────────
END OF TZIP_Compliance_Invariants_ZeroContract_V4.md
──────────────────────────────────────────────────────────────────────────────
/* What changed & why: added dualStagePatch key and invariant I118
notes; updated revision and clarified conditional metadata rules */
