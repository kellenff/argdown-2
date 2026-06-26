#!/usr/bin/env node
// src/cli.ts
// Read an Argdown document (stdin or first arg) and write a Mermaid diagram
// to stdout. Parse errors go to stderr with non-zero exit. With `--solve`,
// write the grounded-extension label summary instead.

import { readFileSync } from 'node:fs';

import { parse, formatError } from './parser.js';
import { renderMermaid } from './mermaid.js';
import { solve, type Label } from './solver.js';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const solveMode = argv.includes('--solve');
  const positional = argv.filter((a) => a !== '--solve');
  const filename = positional[0];
  const source = filename ? readFileSync(filename, 'utf8') : await readStdin();

  const result = parse(source, filename ? { filename } : {});
  if (!result.ok) {
    const label = filename ?? '<stdin>';
    for (const err of result.errors) {
      process.stderr.write(`${formatError(err, label)}\n`);
    }
    process.exit(1);
  }

  if (solveMode) {
    const solved = solve(result.ast);
    const groups: Record<Label, string[]> = { in: [], out: [], undec: [] };
    for (const [k, v] of solved.labels) groups[v].push(k);
    for (const v of ['in', 'out', 'undec'] as const) groups[v].sort();

    const lines: string[] = [];
    for (const v of ['in', 'out', 'undec'] as const) {
      lines.push(`${v.toUpperCase()} (${groups[v].length}): ${groups[v].join(', ')}`);
    }
    process.stdout.write(lines.join('\n') + '\n');
    for (const w of solved.warnings) {
      process.stderr.write(`warning: ${w}\n`);
    }
    return;
  }

  process.stdout.write(renderMermaid(result.ast));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`argdown-mermaid: ${msg}\n`);
  process.exit(1);
});
