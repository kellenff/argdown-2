#!/usr/bin/env node
/**
 * Apply the Yarn-checked-in edn-parser-js patch when this package is
 * installed via npm/npx (which ignore Yarn `resolutions` patches).
 * No-op when the dependency is missing or already patched.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const patchFile = join(
  here,
  '..',
  '.yarn',
  'patches',
  'edn-parser-js-npm-2.0.2.patch',
);

if (!existsSync(patchFile)) {
  process.exit(0);
}

let packageRoot;
try {
  packageRoot = dirname(
    createRequire(import.meta.url).resolve('edn-parser-js/package.json'),
  );
} catch {
  process.exit(0);
}

const indexPath = join(packageRoot, 'lib', 'index.js');
if (!existsSync(indexPath)) {
  process.exit(0);
}

const indexSource = readFileSync(indexPath, 'utf8');
if (indexSource.includes("./parser.js'")) {
  process.exit(0);
}

const result = spawnSync(
  'patch',
  ['-p1', '--forward', '--batch', '-i', patchFile],
  {
    cwd: packageRoot,
    encoding: 'utf8',
  },
);

if (result.status !== 0) {
  console.warn(
    '[argdown-2] failed to patch edn-parser-js; ESM imports may break:',
    result.stderr || result.stdout || `exit ${result.status}`,
  );
}
