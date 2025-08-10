/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/getLedgerBalanceV2a.cjs
  Rev :    r1    2025‑08‑07
  Summary: TzKT offline balance probe for v2a listings. Queries
           /v1/tokens/balances and returns numeric balance.
──────────────────────────────────────────────────────────────────*/

'use strict';

/**
 * getLedgerBalanceV2a
 * Offline balance probe via TzKT — used to bypass broken v2a balance_of.
 *
 * @param {Object} p
 * @param {string} p.tzktBase - e.g. "https://api.ghostnet.tzkt.io"
 * @param {string} p.contract - FA2 KT1 address
 * @param {number|string} p.tokenId - token id
 * @param {string} p.owner - tz1/tz2/tz3 address
 * @returns {Promise<number>} balance as integer editions
 */
module.exports = async function getLedgerBalanceV2a({ tzktBase, contract, tokenId, owner }) {
  if (!tzktBase || !contract || owner == null || tokenId == null) return 0;
  const url = `${tzktBase}/v1/tokens/balances?account=${encodeURIComponent(
    owner,
  )}&token.contract=${encodeURIComponent(contract)}&token.tokenId=${encodeURIComponent(tokenId)}`;

  try {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) return 0;
    const arr = await resp.json();
    if (Array.isArray(arr) && arr.length) {
      const n = Number(arr[0].balance);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  } catch {
    return 0;
  }
};

/* What changed & why: New helper to perform the "offline_balance" check
   required by the marketplace contract for v2a. Keeps network I/O simple,
   deterministic and browser‑safe (no external libs). */
