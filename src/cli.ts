#!/usr/bin/env -S deno run -A
import { formatUsage } from "@optique/core/usage";
import { run } from "@optique/run";
import { dispatch } from "./cli/dispatch.ts";
import { HELP_FOOTER, VERSION } from "./cli/help-footer.ts";
import { parser } from "./cli/parser.ts";

const programName = "argdown-2";
const args = Deno.args;

// Short-circuit --help so we can render the auto-gen block + the footer
// as plain text. Optique 1.2.0's `footer` option takes a Message, but
// `message` template literals collapse newlines into spaces, which would
// ruin the formatted footer. Printing the help ourselves is simpler.
if (args.includes("--help") || args.includes("-h")) {
  const text = formatUsage(programName, parser.usage) + HELP_FOOTER;
  Deno.stdout.writeSync(new TextEncoder().encode(text));
  Deno.exit(0);
}

// Short-circuit --version to preserve the "argdown-2 0.2.0" output format
// the old hand-rolled CLI used. Optique's `version` option prints only
// the value (e.g. "0.2.0"), which would break `cli.test.ts` and any
// scripts that match on the program-name prefix.
if (args.includes("--version")) {
  Deno.stdout.writeSync(new TextEncoder().encode(`${programName} ${VERSION}\n`));
  Deno.exit(0);
}

// Optique handles --version (via `version` option) and exit 2 for usage
// errors (via `errorExitCode`). All other paths land here with a parsed
// value, which the dispatcher routes to runValidate or runSolve.
const exitCode = await dispatch(
  run(parser, {
    programName,
    version: { value: VERSION, option: true },
    errorExitCode: 2,
  }),
);
Deno.exit(exitCode);
