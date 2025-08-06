/*─────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File:    src/utils/getLedgerBalanceV2a.cjs
Rev :    r1    2025-08-06
Summary: Simple TzKT balance fetch for v2a offline_balance guard.
          Returns raw edition balance for a given owner and token.
*/
module.exports = async function getLedgerBalanceV2a(
  { tzktBase, contract, tokenId, owner },
) {
  const url = `${tzktBase}/v1/tokens/balances` +
              `?token.contract=${contract}&token.tokenId=${tokenId}` +
              `&account=${owner}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TzKT ${res.status}`);
  const [row] = await res.json();
  return row ? Number(row.balance) : 0;
};
