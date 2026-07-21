import { solve as libSolve } from "../index.js";
import { formatResult } from "./format.js";
import type { FormatName } from "./format.js";
import { loadAndReport } from "./load.js";
import { writeDiagnostic, writeStderr, writeStdout } from "./output.js";

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

  const formatted = formatResult(solveResult, options.format);
  writeStdout(formatted.text);
  return 0;
}
