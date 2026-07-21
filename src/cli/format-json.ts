import type { ComponentSolveResult, EntityId } from "../model.js";

function shapeComponent(
  result: ComponentSolveResult,
  textLookup: ReadonlyMap<EntityId, string> | undefined,
): Record<string, unknown> {
  const labels: Record<string, string> = {};
  for (const [id, label] of result.native.values) {
    labels[id] = label;
  }
  const children: Record<string, unknown>[] = [];
  for (const [id, child] of result.children) {
    children.push({ id, ...shapeComponent(child, textLookup) });
  }
  return {
    id: result.id,
    solver: result.solver,
    labels,
    children,
  };
}

export function formatJson(
  result: ComponentSolveResult,
  textLookup?: ReadonlyMap<EntityId, string>,
): string {
  const body = {
    root: shapeComponent(result, textLookup),
    diagnostics: [],
    warnings: result.warnings,
  };
  return JSON.stringify(body, null, 2) + "\n";
}
