import type { ComponentSolveResult, EntityId } from "../model.js";
import { formatTable } from "./format-table.js";
import { formatJson } from "./format-json.js";
import { formatDot } from "./format-dot.js";
import { formatMermaid } from "./format-mermaid.js";

export type FormatName = "table" | "dot" | "mermaid" | "json";

export interface FormatResult {
  text: string;
}

export function formatResult(
  result: ComponentSolveResult,
  format: FormatName,
  textLookup?: ReadonlyMap<EntityId, string>,
): FormatResult {
  switch (format) {
    case "table":
      return { text: formatTable(result, textLookup) };
    case "json":
      return { text: formatJson(result, textLookup) };
    case "dot":
      return { text: formatDot(result) };
    case "mermaid":
      return { text: formatMermaid(result) };
  }
}
