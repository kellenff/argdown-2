import type {
  Confidence,
  Diagnostic,
  DungFramework,
  EntityId,
  Relation,
  SolverComponent,
} from "./model.js";

export type ReduceResult = {
  framework: DungFramework;
  warnings: readonly Diagnostic[];
};

function addAttack(
  attackersByTarget: Map<EntityId, Set<EntityId>>,
  from: EntityId,
  to: EntityId,
): void {
  const attackers = attackersByTarget.get(to) ?? new Set<EntityId>();
  attackers.add(from);
  attackersByTarget.set(to, attackers);
  if (!attackersByTarget.has(from)) attackersByTarget.set(from, new Set());
}

function omissionWarning(
  kind: "support" | "undercut",
  index: number,
): Diagnostic {
  return {
    code: `reduce/${kind}-omitted`,
    message: `${kind} is represented but omitted from grounded Dung reduction`,
    path: [index],
  };
}

function reduceRelation(
  relation: Relation,
  index: number,
  attackersByTarget: Map<EntityId, Set<EntityId>>,
  warnings: Diagnostic[],
): void {
  if (relation.kind === "attack") {
    addAttack(attackersByTarget, relation.from, relation.to);
  } else if (relation.kind === "contradiction") {
    addAttack(attackersByTarget, relation.from, relation.to);
    addAttack(attackersByTarget, relation.to, relation.from);
  } else {
    warnings.push(omissionWarning(relation.kind, index));
  }
}

const blockerId = (child: EntityId): EntityId =>
  `\0argdown:blocker:${child}` as EntityId;

export function isSyntheticEntity(id: EntityId): boolean {
  return id.startsWith("\0argdown:");
}

export function reduceToDung(
  component: SolverComponent,
  childBoundaries: ReadonlyMap<EntityId, Confidence> = new Map(),
): ReduceResult {
  const nodes = new Set<EntityId>();
  for (const element of component.elements) {
    if (
      element.kind === "statement" ||
      element.kind === "argument" ||
      element.kind === "solver"
    ) {
      nodes.add(element.id);
    }
  }

  const attackersByTarget = new Map<EntityId, Set<EntityId>>();
  for (const node of nodes) attackersByTarget.set(node, new Set());

  for (const [child, confidence] of childBoundaries) {
    if (confidence === 0) {
      const blocker = blockerId(child);
      nodes.add(blocker);
      addAttack(attackersByTarget, blocker, child);
    } else if (confidence === null) {
      addAttack(attackersByTarget, child, child);
    }
  }

  const warnings: Diagnostic[] = [];
  component.elements.forEach((element, index) => {
    if (
      element.kind === "attack" ||
      element.kind === "contradiction" ||
      element.kind === "support" ||
      element.kind === "undercut"
    ) {
      reduceRelation(element, index, attackersByTarget, warnings);
    }
  });
  return { framework: { attackersByTarget, nodes }, warnings };
}
