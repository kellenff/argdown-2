import { Effect } from "effect";

import { load } from "../index.js";
import type { Document, LoadError } from "../model.js";
import { writeDiagnostic, writeStderr } from "./output.js";

export interface Diagnostic {
  code: string;
  message: string;
}

export type LoadReport =
  | { ok: true; document: Document; diagnostics: readonly Diagnostic[] }
  | { ok: false; document: undefined; diagnostics: readonly Diagnostic[] };

function diagnosticsFromLoadError(
  err: LoadError,
): readonly { code: string; message: string }[] {
  const list = err._tag === "RootCount" || err._tag === "ReadError"
    ? [err.diagnostic]
    : err.diagnostics;
  return list;
}

export function loadAndReport(
  source: string,
  options: { quiet: boolean },
): LoadReport {
  const result = Effect.runSync(
    Effect.match(load(source), {
      onFailure: (err) => ({ ok: false as const, err }),
      onSuccess: (document) => ({ ok: true as const, document }),
    }),
  );

  const diagnostics: Diagnostic[] = result.ok
    ? []
    : diagnosticsFromLoadError(result.err).map((e) => ({
      code: e.code.startsWith("edn/") ? e.code : `edn/${e.code}`,
      message: e.message,
    }));

  for (const d of diagnostics) {
    if (!options.quiet) writeStderr(writeDiagnostic(d));
  }

  if (result.ok) {
    return { ok: true, document: result.document, diagnostics };
  }
  return { ok: false, document: undefined, diagnostics };
}
