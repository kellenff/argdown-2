// src/cli/format.ts
// `argdown format <file>` — parse the input and emit the round-tripped source
// via `stringify`. Used as a normalisation/lint step: a file that parses and
// then re-stringifies byte-equal to itself is structurally canonical.

import { parse, formatError } from '../parser.js';
import { stringify } from '../stringifier.js';
import { loadInput, reportParseErrors } from './input.js';

export const COMMAND = 'format';
export const DESCRIPTION =
  'Parse an Argdown document and emit the round-tripped source via stringify';

export async function run(argv: string[], binaryName: string): Promise<number> {
  const filename = argv[0];
  const loaded = await loadInput(filename, parse);
  if (!loaded.ok) return reportParseErrors(loaded.errors, loaded.label, formatError, binaryName);
  process.stdout.write(stringify(loaded.ast));
  return 0;
}