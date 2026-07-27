import { Effect } from "effect";

import { load } from "./index.js";
import type { Diagnostic, Document, LoadError } from "./model.js";

export function diagnosticsFromLoadError(
  err: LoadError,
): readonly Diagnostic[] {
  return err._tag === "RootCount" || err._tag === "ReadError"
    ? [err.diagnostic]
    : err.diagnostics;
}

export function runLoad(source: string):
  | { ok: true; document: Document }
  | { ok: false; errors: readonly Diagnostic[] } {
  return Effect.runSync(
    Effect.match(load(source), {
      onFailure: (err) => ({
        ok: false as const,
        errors: diagnosticsFromLoadError(err),
      }),
      onSuccess: (document) => ({ ok: true as const, document }),
    }),
  );
}
