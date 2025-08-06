/*─────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File:    src/utils/getLedgerBalanceV2a.cjs
Rev :    r1    2025-08-10
Summary: Direct ledger lookup for v2a contracts with 1-based token ids.
         Attempts token_id and token_id+1 to fetch edition balance
         from the ledger big_map.
─────────────────────────────────────────────────────────────*/
async function getLedgerBalanceV2a(toolkit, contract, pkh, id) {
  try {
    const tzkt = /ghostnet|limanet/i.test(toolkit.rpc.getRpcUrl?.() ?? '')
      ? 'https://api.ghostnet.tzkt.io'
      : 'https://api.tzkt.io';
    const maps = await (await fetch(`${tzkt}/v1/contracts/${contract}/bigmaps`)).json();
    const ledMap = maps.find((m) => m.path === 'ledger');
    if (!ledMap) return 0;
    const mapId = ledMap.ptr ?? ledMap.id;
    const attempt = async (tokenId) => {
      const q = `${tzkt}/v1/bigmaps/${mapId}/keys?key.0=${pkh}&key.1=${tokenId}`;
      const rows = await (await fetch(q)).json();
      if (Array.isArray(rows) && rows.length > 0) {
        return Number(rows[0]?.value ?? 0);
      }
      return 0;
    };
    const bal = await attempt(id);
    if (bal > 0) return bal;
    return await attempt(id + 1);
  } catch {
    return 0;
  }
}
module.exports = getLedgerBalanceV2a;
/* What changed & why: Introduced helper for v2a ledger lookups with token_id+1 fallback. */