#!/usr/bin/env node
// One-shot codemod: rewrites `kind: 'Rule'` and `visitRule` to `Argument` / `visitArgument`.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function migrate(content) {
  return content
    .replace(/kind:\s*'Rule'/g, "kind: 'Argument'")
    .replace(/\bvisitRule\b/g, 'visitArgument')
    .replace(/\bparseRule\b/g, 'parseArgument')
    .replace(/\bparseRuleStatement\b/g, 'parseArgumentStatement')
    .replace(/\bparseRuleExpr\b/g, 'parseArgExpr')
    .replace(/\bRuleExpr\b/g, 'ArgExpr');
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

const args = process.argv.slice(2);
const targets = args.includes('--all')
  ? walk('src')
  : args.filter((a) => !a.startsWith('--'));

let totalChanges = 0;
for (const file of targets) {
  const original = readFileSync(file, 'utf-8');
  const migrated = migrate(original);
  if (migrated !== original) {
    writeFileSync(file, migrated);
    console.log(`migrated: ${file}`);
    totalChanges++;
  }
}
console.log(`Done. ${totalChanges} files changed.`);
