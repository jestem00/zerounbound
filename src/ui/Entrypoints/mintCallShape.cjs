/*──────── src/ui/Entrypoints/mintCallShape.cjs ────────*/
/* Canonical mint call shapes per contract version */

function buildMintCall(c, ver, amt, map, to) {
  const v = String(ver || '').replace(/^v/i, '').toLowerCase();
  const n = parseInt(amt, 10) || 1;
  if (v === '4a') return c.methods.mint(to, n, map);
  if (v === '1' || v === '2b') return c.methods.mint(map, to);
  return c.methods.mint(n, map, to);
}

module.exports = { buildMintCall };
/* EOF */