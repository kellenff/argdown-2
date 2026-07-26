import { object, or } from "@optique/core/constructs";
import { optional, withDefault } from "@optique/core/modifiers";
import {
  argument,
  command,
  constant,
  option,
} from "@optique/core/primitives";
import { choice, string } from "@optique/core/valueparser";
import type { FormatName } from "./format.ts";

/** Final shape after dispatch normalization. */
export type CliResult =
  | { action: "solve"; path: string; format: FormatName; quiet: boolean }
  | { action: "validate"; path: string; quiet: boolean };

/** Raw shape produced by the parser combinator. */
export type ParserOutput = {
  action: "solve" | "validate";
  path: string;
  format?: FormatName;
  quiet?: boolean;
  dryRun?: boolean;
};

/** Collapse a parser output to the dispatcher's typed input. */
export function normalize(p: ParserOutput): CliResult {
  if (p.action === "validate" || p.dryRun === true) {
    return { action: "validate", path: p.path, quiet: p.quiet ?? false };
  }
  return {
    action: "solve",
    path: p.path,
    format: p.format ?? "table",
    quiet: p.quiet ?? false,
  };
}

const sharedQuiet = withDefault(option("--quiet"), false);
const sharedFormat = withDefault(
  option(
    "--format",
    choice(["table", "dot", "mermaid", "json"] as const),
  ),
  "table",
);

const solveCommand = command(
  "solve",
  object({
    action: constant("solve"),
    path: argument(string({ metavar: "PATH" })),
    format: optional(sharedFormat),
    quiet: optional(sharedQuiet),
    dryRun: optional(option("--dry-run")),
  }),
);

const validateCommand = command(
  "validate",
  object({
    action: constant("validate"),
    path: argument(string({ metavar: "PATH" })),
    quiet: optional(sharedQuiet),
    dryRun: optional(option("--dry-run")),
  }),
);

const bareInvocation = object({
  action: constant("solve"),
  path: argument(string({ metavar: "PATH" })),
  format: optional(sharedFormat),
  quiet: optional(sharedQuiet),
  dryRun: optional(option("--dry-run")),
});

export const parser = or(solveCommand, validateCommand, bareInvocation);
