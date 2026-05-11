/*──────── src/ui/Entrypoints/mintCallShape.cjs ────────*/
/* Canonical mint call shapes per contract version */

function buildMintCall(c, ver, amt, map, to) {
  const v = String(ver || '').replace(/^v/i, '').toLowerCase();
  const n = parseInt(amt, 10) || 1;
  if (v === '4a') return c.methodsObject.mint({ to_: to, amount: n, metadata: map });
  if (v === '1' || v === '2b') return c.methodsObject.mint({ metadata: map, to_: to });
  return c.methodsObject.mint({ amount: n, metadata: map, to_: to });
}

module.exports = { buildMintCall };
/* EOF */