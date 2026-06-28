// src/cli/solve.ts
// `argdown solve <file> [--semantics=X]` — run one of 16 argumentation
// semantics on the parsed AST and write the label summary to stdout.
//
//   --semantics=dung (default) | bipolar | aspic | evidential
//     → grounded extension: prints IN/OUT/UNDEC rows.
//
//   --semantics=preferred[-bipolar|-aspic|-evidential] |
//             stable    [-...] |
//             complete  [-...]
//     → multi-extension semantics: prints `Extension N: ...` lines.
//
// Warnings from the solver go to stderr. Parse errors and unknown --semantics
// values produce non-zero exit.

import {
  solve, solveBipolar, solveEvidential,
  solvePreferred, solvePreferredBipolar, solvePreferredEvidential,
  solveStable, solveStableBipolar, solveStableEvidential,
  solveComplete, solveCompleteBipolar, solveCompleteEvidential,
  type MultiSolveResult,
  type Label,
} from '../solver.js';
import {
  solveAspic,
  solvePreferredAspic,
  solveStableAspic,
  solveCompleteAspic,
} from '../solver-aspic.js';
import { parse, formatError } from '../parser.js';
import { loadInput, reportParseErrors } from './input.js';

export const COMMAND = 'solve';
export const DESCRIPTION =
  'Run an argumentation semantics and print the label summary (or extensions)';

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

const MULTI_PREFIXES = ['preferred', 'stable', 'complete'] as const;

function isMulti(semantics: string): semantics is MultiSemantics {
  return MULTI_PREFIXES.some((p) => semantics === p || semantics.startsWith(`${p}-`));
}

function dispatchMulti(semantics: MultiSemantics, ast: import('../ast.js').Document): MultiSolveResult {
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

function parseSemanticsFlag(argv: string[]): string | undefined {
  const idx = argv.findIndex((a) => a.startsWith('--semantics='));
  if (idx < 0) return undefined;
  const flag = argv[idx];
  if (flag === undefined) return undefined;
  return flag.slice('--semantics='.length);
}

function emitGrounded(solved: { labels: Map<string, Label>; warnings: string[] }): void {
  const groups: Record<Label, string[]> = { in: [], out: [], undec: [] };
  for (const [k, v] of solved.labels) groups[v].push(k);
  for (const v of ['in', 'out', 'undec'] as const) groups[v].sort();
  const lines: string[] = [];
  for (const v of ['in', 'out', 'undec'] as const) {
    lines.push(`${v.toUpperCase()} (${groups[v].length}): ${groups[v].join(', ')}`);
  }
  process.stdout.write(lines.join('\n') + '\n');
  for (const w of solved.warnings) process.stderr.write(`warning: ${w}\n`);
}

function emitMulti(solved: MultiSolveResult): void {
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
}

export async function run(argv: string[], binaryName: string): Promise<number> {
  const semantics = parseSemanticsFlag(argv);
  if (semantics !== undefined && !VALID_SEMANTICS.has(semantics)) {
    process.stderr.write(
      `${binaryName}: --semantics must be one of: ${[...VALID_SEMANTICS].join(', ')} (got "${semantics}")\n`,
    );
    return 1;
  }
  const filename = argv.find((a) => !a.startsWith('--'));
  const loaded = await loadInput(filename, parse);
  if (!loaded.ok) return reportParseErrors(loaded.errors, loaded.label, formatError, binaryName);

  if (semantics !== undefined && isMulti(semantics)) {
    emitMulti(dispatchMulti(semantics, loaded.ast));
    return 0;
  }

  // Grounded-extension dispatch (4 reductions). `dung` is the no-suffix default.
  const grounded =
    semantics === 'bipolar' ? solveBipolar(loaded.ast)
      : semantics === 'aspic' ? solveAspic(loaded.ast)
        : semantics === 'evidential' ? solveEvidential(loaded.ast)
          : solve(loaded.ast);
  emitGrounded(grounded);
  return 0;
}

/**
 * Used by the legacy flag-based dispatcher in src/cli.ts so the old
 * `--solve --semantics=…` invocation produces byte-identical output. Returns
 * the exit code; emits parse + validation errors itself.
 */
export async function runLegacy(argv: string[], binaryName: string): Promise<number> {
  return run(argv, binaryName);
}