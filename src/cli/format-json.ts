import type { ComponentSolveResult, EntityId, SolverTag } from "../model.js";

function shortSolverName(solver: SolverTag): string {
  const idx = solver.lastIndexOf("/");
  return idx >= 0 ? solver.slice(idx + 1) : solver;
}

function shapeComponent(
  // accepted for API parity with formatTable; unused until statement elements are emitted
  result: ComponentSolveResult,
  _textLookup: ReadonlyMap<EntityId, string> | undefined,
): Record<string, unknown> {
  const labels: Record<string, string> = {};
  if (result.native.kind === "labels") {
    for (const [id, label] of result.native.values) {
      labels[id] = label;
    }
  }
  const children: Record<string, unknown>[] = [];
  for (const [id, child] of result.children) {
    children.push({ id, ...shapeComponent(child, _textLookup) });
  }
  return {
    id: result.id,
    solver: result.solver ? shortSolverName(result.solver) : undefined,
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
    // TODO: wire when solve exposes diagnostics (currently result has warnings only)
    diagnostics: [],
    warnings: result.warnings,
  };
  return JSON.stringify(body, null, 2) + "\n";
}
