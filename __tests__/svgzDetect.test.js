/* eslint-env jest */

let isSvgzDataUri, normalizeSvgDataUri, isLikelySvg;
beforeAll(async () => {
  ({ isSvgzDataUri, normalizeSvgDataUri } = await import('../src/utils/uriHelpers.js'));
  ({ isLikelySvg } = await import('../src/utils/uriHelpers.js'));
});

function makeSvg(text) {
  return `data:image/svg+xml;utf8,${text}`;
}

test('detects gzipped svg data uri and normalizes', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
  // Build a gzipped variant using Node Buffer + zlib if available; fallback to plain
  let gzB64 = '';
  try {
    const zlib = await import('node:zlib');
    const buf = zlib.gzipSync(Buffer.from(svg, 'utf8'));
    gzB64 = buf.toString('base64');
  } catch {
    // skip if zlib unavailable in env
  }
  if (!gzB64) {
    // Environment without zlib; sanity-check detectors on plain
    const du = makeSvg(svg);
    expect(isSvgzDataUri(du)).toBe(false);
    const norm = await normalizeSvgDataUri(du);
    expect(typeof norm).toBe('string');
    return;
  }
  const du = `data:image/svg+xml;base64,${gzB64}`;
  expect(isSvgzDataUri(du)).toBe(true);
  const norm = await normalizeSvgDataUri(du);
  expect(typeof norm).toBe('string');
  // After normalization we should still have an SVG data URI
  expect(norm.startsWith('data:image/svg+xml')).toBe(true);
});

