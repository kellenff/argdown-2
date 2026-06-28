// src/cli/help.ts
// Help text + version constants for the consolidated CLI.

import { COMMAND as RENDER_COMMAND, DESCRIPTION as RENDER_DESC } from './render.js';
import { COMMAND as SOLVE_COMMAND, DESCRIPTION as SOLVE_DESC } from './solve.js';
import { COMMAND as AST_COMMAND, DESCRIPTION as AST_DESC } from './ast.js';
import { COMMAND as VALIDATE_COMMAND, DESCRIPTION as VALIDATE_DESC } from './validate.js';
import { COMMAND as FORMAT_COMMAND, DESCRIPTION as FORMAT_DESC } from './format.js';

export const BINARY_NAME = 'argdown';

export const SUBCOMMANDS: ReadonlyArray<{ name: string; description: string }> = [
  { name: RENDER_COMMAND, description: RENDER_DESC },
  { name: SOLVE_COMMAND, description: SOLVE_DESC },
  { name: AST_COMMAND, description: AST_DESC },
  { name: VALIDATE_COMMAND, description: VALIDATE_DESC },
  { name: FORMAT_COMMAND, description: FORMAT_DESC },
];

export const HELP: string = `${BINARY_NAME} — parse, render, solve, and validate Argdown documents.

Usage:
  ${BINARY_NAME} <command> [options] [file]
  ${BINARY_NAME} --help | --version

Commands:
${SUBCOMMANDS.map((c) => `  ${c.name.padEnd(10)} ${c.description}`).join('\n')}

If no command is given but legacy flags (--solve, --semantics=…) are present,
the binary falls back to the legacy flag-based dispatch and prints a one-time
deprecation hint on stderr.

If <file> is omitted, each command reads from stdin.
`;

export const VERSION = '0.0.0';