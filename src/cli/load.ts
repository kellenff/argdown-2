import type { Document } from "../model.js";
import { load } from "../index.js";
import { writeDiagnostic, writeStderr } from "./output.js";

export interface Diagnostic {
  code: string;
  message: string;
}

export type LoadReport =
  | { ok: true; document: Document; diagnostics: readonly Diagnostic[] }
  | { ok: false; document: undefined; diagnostics: readonly Diagnostic[] };

export function loadAndReport(
  source: string,
  options: { quiet: boolean },
): LoadReport {
  const result = load(source);
  const diagnostics: Diagnostic[] = result.ok ? [] : result.errors.map((e) => ({
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
