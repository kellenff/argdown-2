#!/usr/bin/env node
// src/cli.ts
// Read an Argdown document (stdin or first arg) and write a Mermaid diagram
// to stdout. Parse errors go to stderr with non-zero exit. With `--solve`,
// write the grounded-extension label summary instead.

import { readFileSync } from 'node:fs';

import { parse, formatError } from './parser.js';
import { renderMermaid } from './mermaid.js';
import {
  solve, solveBipolar, solveEvidential,
  solvePreferred, solvePreferredBipolar, solvePreferredEvidential,
  solveStable, solveStableBipolar, solveStableEvidential,
  solveComplete, solveCompleteBipolar, solveCompleteEvidential,
  type MultiSolveResult,
  type Label,
} from './solver.js';
import {
  solveAspic,
  solvePreferredAspic,
  solveStableAspic,
  solveCompleteAspic,
} from './solver-aspic.js';

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

const VALID_SEMANTICS = new Set([
  'dung', 'bipolar', 'aspic', 'evidential',
  'preferred', 'preferred-bipolar', 'preferred-aspic', 'preferred-evidential',
  'stable', 'stable-bipolar', 'stable-aspic', 'stable-evidential',
  'complete', 'complete-bipolar', 'complete-aspic', 'complete-evidential',
]);

type MultiSemantics =
  | 'preferred' | 'preferred-bipolar' | 'preferred-aspic' | 'preferred-evidential'
  | 'stable' | 'stable-bipolar' | 'stable-aspic' | 'stable-evidential'
  | 'complete' | 'complete-bipolar' | 'complete-aspic' | 'complete-evidential';

function dispatchMulti(semantics: MultiSemantics, ast: import('./ast.js').Document): MultiSolveResult {
  switch (semantics) {
    case 'preferred': return solvePreferred(ast);
    case 'preferred-bipolar': return solvePreferredBipolar(ast);
    case 'preferred-aspic': return solvePreferredAspic(ast);
    case 'preferred-evidential': return solvePreferredEvidential(ast);
    case 'stable': return solveStable(ast);
    case 'stable-bipolar': return solveStableBipolar(ast);
    case 'stable-aspic': return solveStableAspic(ast);
    case 'stable-evidential': return solveStableEvidential(ast);
    case 'complete': return solveComplete(ast);
    case 'complete-bipolar': return solveCompleteBipolar(ast);
    case 'complete-aspic': return solveCompleteAspic(ast);
    case 'complete-evidential': return solveCompleteEvidential(ast);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const solveMode = argv.includes('--solve');
  const semanticsIdx = argv.findIndex((a) => a.startsWith('--semantics='));
  const semantics =
    semanticsIdx >= 0 ? (argv[semanticsIdx] as string).slice('--semantics='.length) : undefined;
  const positional = argv.filter((a) => a !== '--solve' && !a.startsWith('--semantics='));
  const filename = positional[0];

  if (semantics !== undefined && !solveMode) {
    process.stderr.write('argdown-mermaid: --semantics requires --solve\n');
    process.exit(1);
  }
  if (semantics !== undefined && !VALID_SEMANTICS.has(semantics)) {
    process.stderr.write(
      `argdown-mermaid: --semantics must be one of: ${[...VALID_SEMANTICS].join(', ')} (got "${semantics}")\n`,
    );
    process.exit(1);
  }

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
    const isMulti = semantics !== undefined && semantics !== 'dung' && semantics !== 'bipolar' && semantics !== 'aspic' && semantics !== 'evidential';
    if (isMulti) {
      const solved = dispatchMulti(semantics as MultiSemantics, result.ast);
      const lines: string[] = [];
      if (solved.extensions.length === 0) {
        lines.push('(no extensions)');
      } else {
        solved.extensions.forEach((ext, i) => {
          const sortedKeys = [...ext].sort();
          lines.push(`Extension ${i + 1}: ${sortedKeys.join(', ') || '(empty set)'}`);
        });
      }
      process.stdout.write(lines.join('\n') + '\n');
      for (const w of solved.warnings) process.stderr.write(`warning: ${w}\n`);
      return;
    }
    // existing 4-grounded dispatch (unchanged)
    const solved =
      semantics === 'bipolar'
        ? solveBipolar(result.ast)
        : semantics === 'aspic'
          ? solveAspic(result.ast)
          : semantics === 'evidential'
            ? solveEvidential(result.ast)
            : solve(result.ast);
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
