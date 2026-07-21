import type { ComponentSolveResult, SolverTag } from "../model.js";

function shortSolverName(solver: SolverTag): string {
  const slash = solver.lastIndexOf("/");
  return slash === -1 ? solver : solver.slice(slash + 1);
}

function emitComponent(
  result: ComponentSolveResult,
  indent: string,
  solverName: string,
): string {
  const lines: string[] = [];
  lines.push(`${indent}subgraph ${solverName}`);
  if (result.native.kind === "labels") {
    for (const [id, label] of result.native.values) {
      lines.push(`${indent}  ${id}[${label}]`);
    }
  }
  for (const [, child] of result.children) {
    const childSolverName = shortSolverName(child.solver);
    lines.push(emitComponent(child, indent + "  ", childSolverName));
  }
  lines.push(`${indent}end`);
  return lines.join("\n");
}

export function formatMermaid(result: ComponentSolveResult): string {
  const rootSolverName = result.solver
    ? shortSolverName(result.solver)
    : "unknown";
  // TODO: render edges (`s1 --> s2`) when relations are exposed by solve().
  // Currently ComponentSolveResult.native carries labels/extensions only,
  // not relations. This is a known spec gap (flagged by Task 9 review).
  return `graph LR\n${emitComponent(result, "", rootSolverName)}\n`;
}
