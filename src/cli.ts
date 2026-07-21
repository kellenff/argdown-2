#!/usr/bin/env -S deno run -A
import { HELP, VERSION } from "./cli/help.js";
import { writeStderr, writeStdout } from "./cli/output.js";

interface Args {
  path: string;
  format: "table" | "dot" | "mermaid" | "json";
  dryRun: boolean;
  quiet: boolean;
}

const VALID_FORMATS = ["table", "dot", "mermaid", "json"] as const;

function parseArgs(argv: string[]): Args | { error: string } {
  let path: string | null = null;
  let format: Args["format"] = "table";
  let dryRun = false;
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help") {
      writeStdout(HELP);
      Deno.exit(0);
    } else if (arg === "--version") {
      writeStdout(`argdown-2 ${VERSION}\n`);
      Deno.exit(0);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--quiet") {
      quiet = true;
    } else if (arg.startsWith("--format=")) {
      const value = arg.slice("--format=".length);
      if (!VALID_FORMATS.includes(value as Args["format"])) {
        return {
          error: `Unknown format '${value}'. Valid: ${
            VALID_FORMATS.join(", ")
          }.\n`,
        };
      }
      format = value as Args["format"];
    } else if (arg.startsWith("--")) {
      return { error: `Unknown flag '${arg}'.\n` };
    } else if (path === null) {
      path = arg;
    } else {
      return { error: `Unexpected positional argument '${arg}'.\n` };
    }
  }

  if (path === null) {
    return { error: "Missing required argument <path|->.\n" };
  }

  return { path, format, dryRun, quiet };
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    writeStderr(`Usage: argdown-2 [flags] <path|->\n\n${parsed.error}`);
    return 2;
  }

  const { runValidate } = await import("./cli/validate.js");
  const { runSolve } = await import("./cli/solve.js");
  const { readInput } = await import("./cli/input.js");

  const source = await readInput(parsed.path);
  if (parsed.dryRun) {
    return runValidate(source, { quiet: parsed.quiet });
  }
  return runSolve(source, { quiet: parsed.quiet, format: parsed.format });
}

if (import.meta.main) {
  const code = await main(Deno.args);
  Deno.exit(code);
}

export { main, parseArgs };
