/* eslint-env jest */
/**
 * @jest-environment jsdom
 */

let mimeFromFilename;
let unpackZipDataUri;
let isZipDataUri;
let findInlineRenderableDataUri;
let hasRenderablePreview;
let detectHazards;

beforeAll(async () => {
  ({ mimeFromFilename } = await import('../src/constants/mimeTypes.js'));
  ({ unpackZipDataUri, isZipDataUri } = await import('../src/utils/interactiveZip.js'));
  ({ findInlineRenderableDataUri, hasRenderablePreview } = await import('../src/utils/mediaPreview.js'));
  ({ default: detectHazards } = await import('../src/utils/hazards.js'));
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
  z1.file("index.html", '<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src \'none\'\"></head><body><noscript><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\" fill=\"#000\" /></svg></noscript></body></html>');
  z1.file('script.js', 'console.log(1)');
  const u1 = await z1.generateAsync({ type: 'uint8array' });
  const du1 = toDataUriZip(u1);
  expect(isZipDataUri(du1)).toBe(true);
  const ok1 = await unpackZipDataUri(du1);
  expect(ok1.ok).toBe(true);
  expect(typeof ok1.indexUrl).toBe('string');
  expect(typeof ok1.fallbackUrl).toBe('string');

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


test('interactive ZIP rewrites relative assets to blob URLs', async () => {
  const JSZip = (await import('jszip')).default;
  const z = new JSZip();
  z.file('index.html', '<!doctype html><html><head><link rel="stylesheet" href="./styles/app.css"></head><body></body></html>');
  z.file('styles/app.css', 'body{background:#000;}');
  const u = await z.generateAsync({ type: 'uint8array' });
  const res = await unpackZipDataUri(toDataUriZip(u));
  expect(res.ok).toBe(true);
  expect(res.debugHtml).toBeDefined();
  expect(res.debugHtml).toContain('href="blob:');
});
test('detectHazards treats application/zip as scripted media', () => {
  const sample = {
    artifactUri: 'data:application/zip;base64,ZmFrZQ==',
    mimeType: 'application/zip',
  };
  const res = detectHazards(sample);
  expect(res.scripts).toBe(true);
});


test('mediaPreview accepts data:application/zip', () => {
  const uri = 'data:application/zip;base64,UEs=';
  expect(findInlineRenderableDataUri({ artifactUri: uri })).toBe(uri);
});

test('mediaPreview allows tezos-storage pointers when requested', () => {
  const meta = { displayUri: 'tezos-storage:content' };
  expect(hasRenderablePreview(meta, { allowTezosStorage: true })).toBe(true);
  expect(hasRenderablePreview(meta, { allowTezosStorage: false })).toBe(false);
});

