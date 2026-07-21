import { solve as libSolve } from "../index.js";
import { formatResult } from "./format.js";
import type { FormatName } from "./format.js";
import { loadAndReport } from "./load.js";
import { writeDiagnostic, writeStderr, writeStdout } from "./output.js";
import type {
  Document,
  EntityId,
  SolverComponent,
  Statement,
} from "../model.js";

function collectStatementText(
  component: SolverComponent,
  out: Map<EntityId, string>,
): void {
  for (const element of component.elements) {
    if (element.kind === "statement") {
      const stmt = element as Statement;
      if (stmt.text !== undefined) out.set(stmt.id, stmt.text);
    } else if (element.kind === "solver") {
      collectStatementText(element, out);
    }
  }
}

export function buildTextLookup(
  document: Document,
): ReadonlyMap<EntityId, string> {
  const lookup = new Map<EntityId, string>();
  collectStatementText(document.root, lookup);
  return lookup;
}

export function runSolve(
  source: string,
  options: { quiet: boolean; format: FormatName },
): number {
  const loaded = loadAndReport(source, options);
  if (!loaded.ok) return 1;

  const solveResult = libSolve(loaded.document);
  for (const w of solveResult.warnings) {
    if (!options.quiet) {
      writeStderr(writeDiagnostic(w));
    }
  }

  const textLookup = buildTextLookup(loaded.document);
  const formatted = formatResult(solveResult, options.format, textLookup);
  writeStdout(formatted.text);
  return 0;
}
