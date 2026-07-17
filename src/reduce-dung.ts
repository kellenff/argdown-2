import type {
  Diagnostic,
  DungFramework,
  EntityId,
  GroundedDocument,
  Relation,
} from './model.js';

export type ReduceResult = {
  framework: DungFramework;
  warnings: readonly Diagnostic[];
};

function addAttack(
  attackersByTarget: Map<EntityId, Set<EntityId>>,
  from: EntityId,
  to: EntityId,
): void {
  const attackers = attackersByTarget.get(to);
  if (attackers !== undefined) attackers.add(from);
}

function omissionWarning(kind: 'support' | 'undercut', index: number): Diagnostic {
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
  if (relation.kind === 'attack') {
    addAttack(attackersByTarget, relation.from, relation.to);
  } else if (relation.kind === 'contradiction') {
    addAttack(attackersByTarget, relation.from, relation.to);
    addAttack(attackersByTarget, relation.to, relation.from);
  } else {
    warnings.push(omissionWarning(relation.kind, index));
  }
}

export function reduceToDung(document: GroundedDocument): ReduceResult {
  const nodes = new Set<EntityId>();
  for (const element of document.elements) {
    if (element.kind === 'statement' || element.kind === 'argument') nodes.add(element.id);
  }

  const attackersByTarget = new Map<EntityId, Set<EntityId>>();
  for (const node of nodes) attackersByTarget.set(node, new Set());

  const warnings: Diagnostic[] = [];
  document.elements.forEach((element, index) => {
    if (
      element.kind === 'attack' ||
      element.kind === 'contradiction' ||
      element.kind === 'support' ||
      element.kind === 'undercut'
    ) {
      reduceRelation(element, index, attackersByTarget, warnings);
    }
  });
  return { framework: { attackersByTarget, nodes }, warnings };
}
