import type { DungFramework, EntityId, Label } from "./model.js";

function allAttackersOut(
  node: EntityId,
  framework: DungFramework,
  labels: ReadonlyMap<EntityId, Label>,
): boolean {
  const attackers = framework.attackersByTarget.get(node) ??
    new Set<EntityId>();
  return [...attackers].every((attacker) => labels.get(attacker) === "out");
}

function markTargetsOut(
  newlyIn: ReadonlySet<EntityId>,
  framework: DungFramework,
  labels: Map<EntityId, Label>,
): void {
  for (const [target, attackers] of framework.attackersByTarget) {
    if (labels.get(target) !== "undec") continue;
    if ([...attackers].some((attacker) => newlyIn.has(attacker))) {
      labels.set(target, "out");
    }
  }
}

export function groundedLabels(
  framework: DungFramework,
): ReadonlyMap<EntityId, Label> {
  const labels = new Map<EntityId, Label>();
  for (const node of framework.nodes) labels.set(node, "undec");

  while (true) {
    const newlyIn = new Set<EntityId>();
    for (const node of framework.nodes) {
      if (
        labels.get(node) === "undec" && allAttackersOut(node, framework, labels)
      ) {
        newlyIn.add(node);
      }
    }
    if (newlyIn.size === 0) return labels;
    for (const node of newlyIn) labels.set(node, "in");
    markTargetsOut(newlyIn, framework, labels);
  }
}
