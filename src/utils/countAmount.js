/*──────── src/utils/countAmount.js ────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/countAmount.js
  Rev :    r2     2025‑09‑10
  Summary: subtract burn‑address balance from edition count
──────────────────────────────────────────────────────────────*/
const BURN_ADDR = 'tz1burnburnburnburnburnburnburjAYjjX';

/**
 * Safely determine the number of live editions for a token,
 * optionally excluding any copies parked at the canonical
 * burn address (default = true).
 *
 * @param {object}  token          tzkt token row (or similar schema)
 * @param {boolean} excludeBurn    omit burn‑address holdings
 * @returns {number} editions ≥ 1
 */
export default function countAmount(token = {}, excludeBurn = true) {
  if (!token || typeof token !== 'object') return 1;

  /*── 1 · totalSupply heuristics ───────────────────────────*/
  let supply = Number(
    token.totalSupply
    ?? token.total_supply
    ?? token.supply
    ?? token.metadata?.totalSupply
    ?? token.metadata?.total_supply
    ?? token.metadata?.amount
    ?? token.metadata?.editions,
  );
  if (!Number.isFinite(supply) || supply <= 0) supply = 1;

  /*── 2 · subtract burn holdings when known ───────────────*/
  if (excludeBurn) {
    let burned = 0;

    /* balances array – canonical tzkt `balances` hydrate      */
    if (Array.isArray(token.balances)) {
      const hit = token.balances.find(
        (b) => (b?.address || b?.holder || b?.account) === BURN_ADDR,
      );
      if (hit) burned = Number(hit.balance ?? hit.amount ?? hit.qty ?? 0);
    }

    /* explicit fields occasionally injected upstream          */
    burned = Number.isFinite(burned) ? burned : 0;
    supply = Math.max(1, supply - Math.max(0, burned));
  }

  return supply;
}
/* EOF */
