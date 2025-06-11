/*Developed by @jams2blues with love for the Tezos community
  File: scripts/generateBundles.js
  Summary: CLI that writes text-only source bundles defined in bundle.config.json
*/

import * as fsSync          from 'node:fs';               // for write streams
import fs                   from 'node:fs/promises';
import path                 from 'node:path';
import { fileURLToPath }    from 'node:url';
import glob                 from 'fast-glob';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const cfgPath     = path.join(projectRoot, 'bundle.config.json');

/*── helpers ───────────────────────────────────────────────────────────*/
const readJSON = async p => JSON.parse(await fs.readFile(p, 'utf8'));

/* quick binary sniff: >20 % weird bytes ⇒ treat as binary */
const isBinary = async abs => {
  const buf = await fs.readFile(abs);
  let weird = 0;
  for (const b of buf.subarray(0, 4000)) if (b < 9 || b > 0xF4) weird++;
  return weird / buf.length > 0.2;
};

/*── main ──────────────────────────────────────────────────────────────*/
async function buildBundles () {
  const { outputDir, bundles } = await readJSON(cfgPath);
  const outDir = path.join(projectRoot, outputDir);
  await fs.mkdir(outDir, { recursive: true });

  for (const { bundleName, patterns } of bundles) {
    const rels = await glob(patterns, { cwd: projectRoot, dot: true, onlyFiles: true });
    const bundlePath = path.join(outDir, `${bundleName}.txt`);
    const fh = await fs.open(bundlePath, 'w');

    for (const rel of rels.sort()) {
      const abs = path.join(projectRoot, rel);
      if (await isBinary(abs)) continue;                     // skip binaries
      const data = await fs.readFile(abs, 'utf8');

      await fh.write(`\n/*──────── ${rel} ────────*/\n`);
      await fh.write(data.trimEnd() + '\n');
    }
    await fh.close();
    console.log(`✓ ${bundleName}  → ${path.relative(projectRoot, bundlePath)}`);
  }
}

buildBundles().catch(e => { console.error(e); process.exit(1); });

/* What changed & why
   • Removed gzip step—now outputs only plain .txt bundles.
   • Streamlined imports (no zlib/pipeline needed).
*/
