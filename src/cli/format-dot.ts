import type { ComponentSolveResult, Label, SolverTag } from "../model.js";

function colorFor(label: Label): string {
  if (label === "in") return "green";
  if (label === "out") return "red";
  return "gray";
}

function shortSolverName(solver: SolverTag): string {
  const idx = solver.lastIndexOf("/");
  return idx >= 0 ? solver.slice(idx + 1) : solver;
}

function emitComponent(
  result: ComponentSolveResult,
  indent: string,
): string {
  const lines: string[] = [];
  const clusterId = `cluster_${result.id}`;
  lines.push(`${indent}subgraph ${clusterId} {`);
  lines.push(
    `${indent}  label = "solver/${
      result.solver ? shortSolverName(result.solver) : "unknown"
    }";`,
  );
  if (result.native.kind === "labels") {
    for (const [id, label] of result.native.values) {
      lines.push(`${indent}  "${id}" [color=${colorFor(label)}];`);
    }
  }
  for (const [, child] of result.children) {
    lines.push(emitComponent(child, indent + "  "));
  }
  lines.push(`${indent}}`);
  return lines.join("\n");
}

export function formatDot(result: ComponentSolveResult): string {
  return `digraph arguments { rankdir=LR;\n${emitComponent(result, "")}\n}\n`;
}
