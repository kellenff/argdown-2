// src/cli/input.ts
// Shared helpers for the CLI subcommands: read stdin or a file, run the parser,
// and report parse errors uniformly. The parse + formatError pair is the only
// thing every subcommand needs, so it's centralised here.

import { readFileSync } from 'node:fs';
import type { Document } from '../ast.js';
import type { ParseResult } from '../parser.js';

export function readStdin(): Promise<string> {
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

export type LoadResult =
  | { ok: true; ast: Document }
  | { ok: false; errors: ParseResult['errors']; label: string };

/**
 * Read source from `filename` if given, otherwise from stdin, then parse it.
 * Treats `-` as a stdin sentinel (the conventional Unix form) so that
 * `argdown render -` works the same as `argdown render` with no argument.
 * On parse failure returns a tagged result; subcommands decide how to surface
 * the errors (most want stderr + non-zero exit).
 */
export async function loadInput(
  filename: string | undefined,
  parse: (source: string, options?: { filename?: string }) => ParseResult,
): Promise<LoadResult> {
  // `-` is the conventional stdin sentinel; collapse it to "no filename" so
  // every subcommand (render / solve / ast / validate / format) accepts it
  // without per-subcommand special-casing.
  const isStdin = filename === undefined || filename === '-';
  const source = isStdin ? await readStdin() : readFileSync(filename as string, 'utf8');
  const effectiveFilename = isStdin ? undefined : filename;
  const label = effectiveFilename ?? '<stdin>';
  const result = parse(source, effectiveFilename ? { filename: effectiveFilename } : {});
  if (!result.ok) return { ok: false, errors: result.errors, label };
  return { ok: true, ast: result.ast };
}

/**
 * Standard error reporter: write one `formatError(err, label)` line per error
 * to stderr and return the exit code. Centralised so every subcommand's
 * failure output is identical.
 */
export function reportParseErrors(
  errors: ParseResult['errors'],
  label: string,
  formatError: (err: ParseResult['errors'][number], label: string) => string,
  binaryName: string,
): number {
  for (const err of errors) {
    process.stderr.write(`${formatError(err, label)}\n`);
  }
  process.stderr.write(`${binaryName}: ${errors.length} parse error${errors.length === 1 ? '' : 's'}\n`);
  return 1;
}