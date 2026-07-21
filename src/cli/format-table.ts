import type {
  ComponentSolveResult,
  EntityId,
  Label,
  SolverTag,
} from "../model.js";

type LabelGroup = "IN" | "OUT" | "UNDETERMINED";

function labelGroup(label: Label): LabelGroup {
  if (label === "in") return "IN";
  if (label === "out") return "OUT";
  return "UNDETERMINED";
}

interface GroupedLabels {
  IN: string[];
  OUT: string[];
  UNDETERMINED: string[];
}

function emptyGrouped(): GroupedLabels {
  return { IN: [], OUT: [], UNDETERMINED: [] };
}

function shortSolverName(solver: SolverTag): string {
  const idx = solver.lastIndexOf("/");
  return idx >= 0 ? solver.slice(idx + 1) : solver;
}

function extractLabels(result: ComponentSolveResult): GroupedLabels {
  if (result.native.kind !== "labels") return emptyGrouped();
  const grouped = emptyGrouped();
  for (const [id, label] of result.native.values) {
    grouped[labelGroup(label)].push(id);
  }
  return grouped;
}

function formatGroup(
  level: 2 | 3,
  name: LabelGroup,
  ids: readonly string[],
  textLookup?: ReadonlyMap<EntityId, string>,
): string {
  const hashes = "#".repeat(level);
  const lines: string[] = ["", `${hashes} ${name}`, ""];
  for (const id of ids) {
    const text = textLookup?.get(id as EntityId);
    lines.push(text ? `- [#${id}] ${text}` : `- [#${id}]`);
  }
  return lines.join("\n");
}

function formatComponent(
  solver: SolverTag | null,
  result: ComponentSolveResult,
  textLookup?: ReadonlyMap<EntityId, string>,
): string {
  const grouped = extractLabels(result);
  // Single-semantics component (no nested solver children): emit groups
  // at level 2 (`## IN/OUT/UNDETERMINED`). Nested solver components
  // (mixed-semantics): emit groups at level 3 under `## solver/<name>`.
  const level: 2 | 3 = solver !== null ? 3 : 2;
  const lines: string[] = [];
  if (solver !== null) {
    lines.push(`## solver/${shortSolverName(solver)}`);
  }
  if (grouped.IN.length > 0) {
    lines.push(formatGroup(level, "IN", grouped.IN, textLookup));
  }
  if (grouped.OUT.length > 0) {
    lines.push(formatGroup(level, "OUT", grouped.OUT, textLookup));
  }
  if (grouped.UNDETERMINED.length > 0) {
    lines.push(
      formatGroup(level, "UNDETERMINED", grouped.UNDETERMINED, textLookup),
    );
  }
  return lines.join("\n") + "\n";
}

export function formatTable(
  result: ComponentSolveResult,
  textLookup?: ReadonlyMap<EntityId, string>,
): string {
  const sections: string[] = [];
  // Single-semantics docs: skip the solver heading so groups appear at
  // the top level. Mixed-semantics docs: emit `## solver/<name>` for
  // the root and each child solver component.
  const rootSolver = result.children.size === 0 ? null : result.solver;
  sections.push(formatComponent(rootSolver, result, textLookup));
  for (const [, child] of result.children) {
    sections.push("\n" + formatComponent(child.solver, child, textLookup));
  }
  return sections.join("");
}
