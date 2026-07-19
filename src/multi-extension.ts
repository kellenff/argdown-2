import type { DungFramework, EntityId } from "./model.js";
import { groundedLabels } from "./grounded.js";

const AUX_PREFIXES = ["sup:", "nec:"] as const;

export function frameworkToAttackMap(
  framework: DungFramework,
): Map<EntityId, EntityId[]> {
  const map = new Map<EntityId, EntityId[]>();
  const allNodes = new Set(framework.nodes);
  for (const [target, attackers] of framework.attackersByTarget) {
    allNodes.add(target);
    for (const attacker of attackers) allNodes.add(attacker);
  }
  for (const node of allNodes) {
    const attackers = framework.attackersByTarget.get(node);
    map.set(node, attackers ? [...attackers] : []);
  }
  return map;
}

export function attackersOf(
  map: Map<EntityId, EntityId[]>,
  arg: EntityId,
): EntityId[] {
  return map.get(arg) ?? [];
}

export function isConflictFree(
  set: ReadonlySet<EntityId>,
  map: Map<EntityId, EntityId[]>,
): boolean {
  for (const node of set) {
    for (const attacker of attackersOf(map, node)) {
      if (set.has(attacker)) return false;
    }
  }
  return true;
}

export function isAdmissible(
  set: ReadonlySet<EntityId>,
  map: Map<EntityId, EntityId[]>,
): boolean {
  if (!isConflictFree(set, map)) return false;
  for (const node of set) {
    for (const attacker of attackersOf(map, node)) {
      if (set.has(attacker)) continue;
      const attackerAttackers = attackersOf(map, attacker);
      if (!attackerAttackers.some((defender) => set.has(defender))) {
        return false;
      }
    }
  }
  return true;
}

export function defenseClosure(
  set: ReadonlySet<EntityId>,
  map: Map<EntityId, EntityId[]>,
): Set<EntityId> {
  const closure = new Set(set);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of map.keys()) {
      if (closure.has(node)) continue;
      const attackers = attackersOf(map, node);
      const defended = attackers.every((attacker) =>
        attackersOf(map, attacker).some((defender) => closure.has(defender))
      );
      if (defended) {
        closure.add(node);
        changed = true;
      }
    }
  }
  return closure;
}

export function isClosedUnderDefense(
  set: ReadonlySet<EntityId>,
  map: Map<EntityId, EntityId[]>,
): boolean {
  const closure = defenseClosure(set, map);
  if (closure.size !== set.size) return false;
  for (const node of closure) {
    if (!set.has(node)) return false;
  }
  return true;
}

export function isStable(
  set: ReadonlySet<EntityId>,
  map: Map<EntityId, EntityId[]>,
): boolean {
  if (!isAdmissible(set, map)) return false;
  for (const node of map.keys()) {
    if (set.has(node)) continue;
    if (!attackersOf(map, node).some((attacker) => set.has(attacker))) {
      return false;
    }
  }
  return true;
}

export function stripAux(set: ReadonlySet<EntityId>): Set<EntityId> {
  const result = new Set<EntityId>();
  for (const key of set) {
    if (AUX_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    result.add(key);
  }
  return result;
}

export function findGroundedExtension(
  map: Map<EntityId, EntityId[]>,
): Set<EntityId> {
  const framework: DungFramework = {
    nodes: new Set(map.keys()),
    attackersByTarget: new Map(
      [...map.entries()].map((
        [target, attackers],
      ) => [target, new Set(attackers)]),
    ),
  };
  const labels = groundedLabels(framework);
  const grounded = new Set<EntityId>();
  for (const [node, label] of labels) {
    if (label === "in") grounded.add(node);
  }
  return grounded;
}

export function residueOf(
  map: Map<EntityId, EntityId[]>,
  grounded: ReadonlySet<EntityId>,
): { args: EntityId[]; subMap: Map<EntityId, EntityId[]> } {
  const args: EntityId[] = [];
  const subMap = new Map<EntityId, EntityId[]>();
  for (const [arg, attackers] of map) {
    if (grounded.has(arg)) continue;
    args.push(arg);
    subMap.set(
      arg,
      attackers.filter((attacker) => !grounded.has(attacker)),
    );
  }
  return { args, subMap };
}

export function lift(
  subset: ReadonlySet<EntityId>,
  grounded: ReadonlySet<EntityId>,
): Set<EntityId> {
  return new Set([...subset, ...grounded]);
}

export function findPreferredExtensions(
  map: Map<EntityId, EntityId[]>,
): Set<EntityId>[] {
  const grounded = findGroundedExtension(map);
  const { args } = residueOf(map, grounded);
  if (args.length === 0) {
    return [stripAux(lift(new Set(), grounded))];
  }

  const results: Set<EntityId>[] = [];
  const skipMasks = new Set<bigint>();
  const ONE = 1n;
  const n = args.length;

  for (let mask = (ONE << BigInt(n)) - 1n; mask >= 0n; mask--) {
    if (skipMasks.has(mask)) continue;
    const subset = new Set<EntityId>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    const lifted = lift(subset, grounded);
    if (isAdmissible(lifted, map)) {
      results.push(stripAux(lifted));
      let sub = mask;
      while (true) {
        skipMasks.add(sub);
        if (sub === 0n) break;
        sub = (sub - 1n) & mask;
      }
    }
  }
  return results;
}

export function findStableExtensions(
  map: Map<EntityId, EntityId[]>,
): Set<EntityId>[] {
  const grounded = findGroundedExtension(map);
  const { args } = residueOf(map, grounded);
  if (args.length === 0) {
    return grounded.size === 0 ? [] : [stripAux(lift(new Set(), grounded))];
  }

  const results: Set<EntityId>[] = [];
  const ONE = 1n;
  const n = args.length;

  for (let mask = 0n; mask < (ONE << BigInt(n)); mask++) {
    const subset = new Set<EntityId>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    const lifted = lift(subset, grounded);
    if (!isAdmissible(lifted, map)) continue;
    let attacksAllOutside = true;
    for (const arg of args) {
      if (subset.has(arg)) continue;
      const attackers = map.get(arg) ?? [];
      if (!attackers.some((attacker) => lifted.has(attacker))) {
        attacksAllOutside = false;
        break;
      }
    }
    if (attacksAllOutside) results.push(stripAux(lifted));
  }
  return results;
}

export function findCompleteExtensions(
  map: Map<EntityId, EntityId[]>,
): Set<EntityId>[] {
  const grounded = findGroundedExtension(map);
  const { args } = residueOf(map, grounded);
  if (args.length === 0) {
    return [stripAux(lift(new Set(), grounded))];
  }

  const results: Set<EntityId>[] = [];
  const ONE = 1n;
  const n = args.length;

  for (let mask = 0n; mask < (ONE << BigInt(n)); mask++) {
    const subset = new Set<EntityId>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    const lifted = lift(subset, grounded);
    if (isAdmissible(lifted, map) && isClosedUnderDefense(lifted, map)) {
      results.push(stripAux(lifted));
    }
  }
  return results;
}

export function intersectExtensions(
  extensions: readonly ReadonlySet<EntityId>[],
): Set<EntityId> {
  if (extensions.length === 0) return new Set();
  let result = new Set(extensions[0]);
  for (let index = 1; index < extensions.length; index++) {
    const next = extensions[index]!;
    result = new Set([...result].filter((node) => next.has(node)));
  }
  return result;
}
