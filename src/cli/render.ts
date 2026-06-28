// src/cli/render.ts
// `argdown render <file>` — parse the input and write a Mermaid `flowchart TD`
// to stdout. Replaces the default mode of the legacy `argdown-mermaid` binary.

import { parse, formatError } from '../parser.js';
import { renderMermaid } from '../mermaid.js';
import { loadInput, reportParseErrors } from './input.js';

export const COMMAND = 'render';
export const DESCRIPTION =
  'Parse an Argdown document and write a Mermaid flowchart to stdout';

export async function run(argv: string[], binaryName: string): Promise<number> {
  const filename = argv[0];
  const loaded = await loadInput(filename, parse);
  if (!loaded.ok) return reportParseErrors(loaded.errors, loaded.label, formatError, binaryName);
  process.stdout.write(renderMermaid(loaded.ast));
  return 0;
}