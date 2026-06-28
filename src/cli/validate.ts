// src/cli/validate.ts
// `argdown validate <file>` — parse the input and exit 0 on success, 1 on
// parse error. Nothing is written to stdout. Stderr gets the formatted error
// lines so a CI script can still surface what went wrong. Designed for
// pre-commit hooks and CI lint steps.

import { parse, formatError } from '../parser.js';
import { loadInput, reportParseErrors } from './input.js';

export const COMMAND = 'validate';
export const DESCRIPTION =
  'Parse an Argdown document; exit 0 on success, 1 on parse error, no stdout';

export async function run(argv: string[], binaryName: string): Promise<number> {
  const filename = argv[0];
  const loaded = await loadInput(filename, parse);
  if (!loaded.ok) return reportParseErrors(loaded.errors, loaded.label, formatError, binaryName);
  return 0;
}