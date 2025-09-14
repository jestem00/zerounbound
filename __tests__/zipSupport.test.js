/* eslint-env jest */
/**
 * @jest-environment jsdom
 */

let mimeFromFilename;
let unpackZipDataUri;
let isZipDataUri;

beforeAll(async () => {
  ({ mimeFromFilename } = await import('../src/constants/mimeTypes.js'));
  ({ unpackZipDataUri, isZipDataUri } = await import('../src/utils/interactiveZip.js'));
});

function toDataUriZip(uint8) {
  const b64 = Buffer.from(uint8).toString('base64');
  return `data:application/zip;base64,${b64}`;
}

test('svgz maps to image/svg+xml', () => {
  expect(mimeFromFilename('artwork.SVGZ')).toBe('image/svg+xml');
});

test('unpackZipDataUri validates top-level index.html', async () => {
  const JSZip = (await import('jszip')).default;
  // ZIP with top-level index.html
  const z1 = new JSZip();
  z1.file('index.html', '<!doctype html><html><head></head><body>hi</body></html>');
  z1.file('script.js', 'console.log(1)');
  const u1 = await z1.generateAsync({ type: 'uint8array' });
  const du1 = toDataUriZip(u1);
  expect(isZipDataUri(du1)).toBe(true);
  const ok1 = await unpackZipDataUri(du1);
  expect(ok1.ok).toBe(true);
  expect(typeof ok1.indexUrl).toBe('string');

  // ZIP missing index.html
  const z2 = new JSZip();
  z2.file('main.html', '<!doctype html>');
  const u2 = await z2.generateAsync({ type: 'uint8array' });
  const du2 = toDataUriZip(u2);
  const ok2 = await unpackZipDataUri(du2);
  expect(ok2.ok).toBe(false);
});

test('hazard scan detects remote refs', async () => {
  const JSZip = (await import('jszip')).default;
  const z = new JSZip();
  z.file('index.html', '<!doctype html><html><body><script src="https://example.com/x.js"></script></body></html>');
  const u = await z.generateAsync({ type: 'uint8array' });
  const du = toDataUriZip(u);
  const res = await unpackZipDataUri(du);
  expect(res.ok).toBe(true);
  expect(Array.isArray(res.hazards?.remotes)).toBe(true);
  expect(res.hazards.remotes.length).toBeGreaterThan(0);
});
