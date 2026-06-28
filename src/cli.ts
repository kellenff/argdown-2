#!/usr/bin/env node
// src/cli.ts
// Consolidated CLI entry point. Dispatches to one of the subcommand modules
// in src/cli/, with a backward-compat layer for the legacy `argdown-mermaid`
// flag shape (`--solve`, `--semantics=…`).

import { run as runRender } from './cli/render.js';
import { run as runSolve } from './cli/solve.js';
import { run as runAst } from './cli/ast.js';
import { run as runValidate } from './cli/validate.js';
import { run as runFormat } from './cli/format.js';
import { run as runMcp } from './cli/mcp.js';
import { HELP, VERSION, BINARY_NAME, SUBCOMMANDS } from './cli/help.js';

// Map of known subcommand names to their handlers. The lookup is
// case-insensitive so `argdown Render foo.argdown` works the same as
// `argdown render foo.argdown`.
const HANDLERS: Record<string, (argv: string[], binaryName: string) => Promise<number>> = {
  render: runRender,
  solve: runSolve,
  ast: runAst,
  validate: runValidate,
  format: runFormat,
  mcp: runMcp,
};

const LEGACY_FLAGS = new Set(['--solve']);

function isLegacyInvocation(argv: string[]): boolean {
  return argv.some((a) => LEGACY_FLAGS.has(a) || a.startsWith('--semantics='));
}

function emitDeprecationHint(): void {
  process.stderr.write(
    `${BINARY_NAME}: legacy flag form is deprecated; use 'argdown render' or 'argdown solve --semantics=…' instead.\n`,
  );
}

function printHelp(): void {
  process.stdout.write(HELP);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }
  if (argv.includes('--version') || argv.includes('-V')) {
    process.stdout.write(`${BINARY_NAME} ${VERSION}\n`);
    return;
  }

  const [head, ...rest] = argv;

  // Legacy path: `--solve` or `--semantics=…` with no subcommand. We have to
  // forward the full argv to the solve handler so it can find --semantics=…
  // and the optional positional file.
  if (!HANDLERS[head!] && isLegacyInvocation(argv)) {
    emitDeprecationHint();
    const exitCode = await runSolve(argv, BINARY_NAME);
    if (exitCode !== 0) process.exit(exitCode);
    return;
  }

  const handler = HANDLERS[head!];
  if (!handler) {
    process.stderr.write(
      `${BINARY_NAME}: unknown command "${head}". Known commands: ${SUBCOMMANDS.map((c) => c.name).join(', ')}.\n`,
    );
    printHelp();
    process.exit(1);
  }

  const exitCode = await handler(rest, BINARY_NAME);
  if (exitCode !== 0) process.exit(exitCode);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${BINARY_NAME}: ${msg}\n`);
  process.exit(1);
});