import type {
  Diagnostic,
  DungFramework,
  EntityId,
  GroundedDocument,
} from "./model.js";
import type { ReduceResult } from "./reduce-dung.js";

function auxKey(from: EntityId, to: EntityId): EntityId {
  return `nec:${from}->${to}` as EntityId;
}

function addAttack(
  attackersByTarget: Map<EntityId, Set<EntityId>>,
  nodes: Set<EntityId>,
  from: EntityId,
  to: EntityId,
): void {
  nodes.add(from);
  nodes.add(to);
  const attackers = attackersByTarget.get(to) ?? new Set<EntityId>();
  attackers.add(from);
  attackersByTarget.set(to, attackers);
  if (!attackersByTarget.has(from)) attackersByTarget.set(from, new Set());
}

function addNecessarySupport(
  attackersByTarget: Map<EntityId, Set<EntityId>>,
  nodes: Set<EntityId>,
  from: EntityId,
  to: EntityId,
): void {
  const necessary = auxKey(from, to);
  addAttack(attackersByTarget, nodes, from, necessary);
  addAttack(attackersByTarget, nodes, necessary, to);
}

function undercutWarning(index: number): Diagnostic {
  return {
    code: "reduce/undercut-omitted",
    message:
      "undercut is represented but omitted from evidential Dung reduction",
    path: [index],
  };
}

export function reduceToEvidential(document: GroundedDocument): ReduceResult {
  const nodes = new Set<EntityId>();
  for (const element of document.elements) {
    if (element.kind === "statement" || element.kind === "argument") {
      nodes.add(element.id);
    }
  }

  const attackersByTarget = new Map<EntityId, Set<EntityId>>();
  for (const node of nodes) attackersByTarget.set(node, new Set());

  const warnings: Diagnostic[] = [];
  document.elements.forEach((element, index) => {
    if (element.kind === "attack") {
      addAttack(
        attackersByTarget,
        nodes,
        element.from,
        element.to,
      );
    } else if (element.kind === "contradiction") {
      addAttack(attackersByTarget, nodes, element.from, element.to);
      addAttack(attackersByTarget, nodes, element.to, element.from);
    } else if (element.kind === "support") {
      addNecessarySupport(attackersByTarget, nodes, element.from, element.to);
    } else if (element.kind === "undercut") {
      warnings.push(undercutWarning(index));
    }
  });

  const framework: DungFramework = { attackersByTarget, nodes };
  return { framework, warnings };
}
