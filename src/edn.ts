import { Effect } from "effect";
import { ednParseMulti } from "edn-parser-js";

import type { Diagnostic, EdnError } from "./model.js";

const ROOT_COUNT: Diagnostic = {
  code: "edn/root-count",
  message: "Expected exactly one top-level EDN value",
};

function toDiagnostic(error: unknown): Diagnostic {
  return {
    code: "edn/read-error",
    message: error instanceof Error ? error.message : String(error),
  };
}

export function readEdn(
  source: string,
): Effect.Effect<unknown, EdnError, never> {
  return Effect.gen(function* () {
    const forms = yield* Effect.try({
      try: () => ednParseMulti(source),
      catch: (error) =>
        ({ _tag: "ReadError", diagnostic: toDiagnostic(error) }) as const,
    });
    if (forms.length !== 1 || forms[0] === undefined) {
      return yield* Effect.fail(
        { _tag: "RootCount", diagnostic: ROOT_COUNT } as const,
      );
    }
    return forms[0];
  });
}
