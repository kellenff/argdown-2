// src/cli/ast.ts
// `argdown ast <file>` — parse the input and dump the AST as JSON to stdout.
// The AST is plain data (README §"AST is plain data") so JSON.stringify is
// the canonical serialisation. Useful for tooling that wants to inspect the
// parsed structure without rendering it.

import { parse, formatError } from '../parser.js';
import { loadInput, reportParseErrors } from './input.js';

export const COMMAND = 'ast';
export const DESCRIPTION =
  'Parse an Argdown document and dump the AST as JSON to stdout';

export async function run(argv: string[], binaryName: string): Promise<number> {
  const filename = argv[0];
  const loaded = await loadInput(filename, parse);
  if (!loaded.ok) return reportParseErrors(loaded.errors, loaded.label, formatError, binaryName);
  process.stdout.write(JSON.stringify(loaded.ast, null, 2) + '\n');
  return 0;
}