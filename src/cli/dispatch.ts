import { readInput } from "./input.ts";
import { normalize } from "./parser.ts";
import type { ParserOutput } from "./parser.ts";
import { runSolve } from "./solve.ts";
import { runValidate } from "./validate.ts";

/** Route a parsed CLI invocation to its action handler. */
export async function dispatch(parsed: ParserOutput): Promise<number> {
  const result = normalize(parsed);
  const source = await readInput(result.path);
  switch (result.action) {
    case "validate":
      return runValidate(source, { quiet: result.quiet });
    case "solve":
      return runSolve(source, {
        quiet: result.quiet,
        format: result.format,
      });
  }
}
