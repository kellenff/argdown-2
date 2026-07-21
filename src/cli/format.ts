import type { ComponentSolveResult } from "../model.js";

export type FormatName = "table" | "dot" | "mermaid" | "json";

export interface FormatResult {
  text: string;
}

export function formatResult(
  // deno-lint-ignore no-unused-vars -- used by full dispatch in Tasks 6-10
  result: ComponentSolveResult,
  format: FormatName,
): FormatResult {
  // Placeholder; replaced by full dispatch in Task 6.
  return { text: `[format=${format} not yet implemented]\n` };
}
