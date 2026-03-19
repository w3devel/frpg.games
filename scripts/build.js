/**
 * Build script — packages the extension and website for distribution.
 *
 * Usage: node scripts/build.js
 *
 * Outputs:
 *   dist/extension/   — ready-to-load unpacked extension
 *   dist/web/         — static website files
 */

import { cp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

async function build() {
  console.log('Building FRPG.games…');

  // Ensure dist directories exist
  await mkdir(path.join(DIST, 'extension'), { recursive: true });
  await mkdir(path.join(DIST, 'web'),       { recursive: true });

  // Copy extension files
  const extFiles = [
    'manifest.json',
    'src',
    'icons',
  ];

  for (const f of extFiles) {
    const src = path.join(ROOT, f);
    const dst = path.join(DIST, 'extension', f);
    if (existsSync(src)) {
      await cp(src, dst, { recursive: true });
      console.log(`  ✓ ${f}`);
    }
  }

  // Copy website files
  const webFiles = ['web', 'src'];
  for (const f of webFiles) {
    const src = path.join(ROOT, f);
    const dst = path.join(DIST, 'web', f);
    if (existsSync(src)) {
      await cp(src, dst, { recursive: true });
    }
  }

  // Write build manifest
  const pkg = JSON.parse(
    await (await import('node:fs/promises')).readFile(path.join(ROOT, 'package.json'), 'utf8')
  );
  await writeFile(
    path.join(DIST, 'build-info.json'),
    JSON.stringify({ version: pkg.version, built: new Date().toISOString() }, null, 2)
  );

  console.log(`\nBuild complete → ${DIST}`);
}

build().catch(err => { console.error(err); process.exit(1); });
