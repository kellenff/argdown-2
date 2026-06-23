#!/usr/bin/env node
// src/cli.ts
// Read an Argdown document (stdin or first arg) and write a Mermaid diagram
// to stdout. Parse errors go to stderr with non-zero exit.

import { readFileSync } from 'node:fs';

import { parse, formatError } from './parser.js';
import { renderMermaid } from './mermaid.js';

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
  const filename = process.argv[2];
  const source = filename ? readFileSync(filename, 'utf8') : await readStdin();

  const result = parse(source, filename ? { filename } : {});
  if (!result.ok) {
    const label = filename ?? '<stdin>';
    for (const err of result.errors) {
      process.stderr.write(`${formatError(err, label)}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(renderMermaid(result.ast));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`argdown-mermaid: ${msg}\n`);
  process.exit(1);
});
