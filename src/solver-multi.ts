// src/solver-multi.ts
export function attackersOf(map: Map<string, string[]>, arg: string): string[] {
  return map.get(arg) ?? [];
}

export function isConflictFree(set: Set<string>, map: Map<string, string[]>): boolean {
  for (const a of set) {
    const attackers = attackersOf(map, a);
    for (const b of attackers) {
      if (set.has(b)) return false;
    }
  }
  return true;
}

export function isAdmissible(set: Set<string>, map: Map<string, string[]>): boolean {
  if (!isConflictFree(set, map)) return false;
  for (const a of set) {
    for (const b of attackersOf(map, a)) {
      if (set.has(b)) continue;
      // b must be attacked by some member of set.
      const bAttackers = attackersOf(map, b);
      if (!bAttackers.some((c) => set.has(c))) return false;
    }
  }
  return true;
}

export function defenseClosure(set: Set<string>, map: Map<string, string[]>): Set<string> {
  const closure = new Set(set);
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of map.keys()) {
      if (closure.has(a)) continue;
      const attackers = attackersOf(map, a);
      // Unattacked arguments are not "defended" — they enter closure trivially
      // and would otherwise pollute downstream multi-extension output.
      if (attackers.length === 0) continue;
      const defended = attackers.every((b) => {
        const bAttackers = attackersOf(map, b);
        return bAttackers.some((c) => closure.has(c));
      });
      if (defended) {
        closure.add(a);
        changed = true;
      }
    }
  }
  return closure;
}

export function isClosedUnderDefense(set: Set<string>, map: Map<string, string[]>): boolean {
  const closure = defenseClosure(set, map);
  if (closure.size !== set.size) return false;
  for (const x of closure) if (!set.has(x)) return false;
  return true;
}

export function isStable(set: Set<string>, map: Map<string, string[]>): boolean {
  if (!isAdmissible(set, map)) return false;
  // S must attack every argument not in S.
  for (const a of map.keys()) {
    if (set.has(a)) continue;
    if (!attackersOf(map, a).some((b) => set.has(b))) return false;
  }
  // No member of S may be attacked from outside S — i.e. S must be a
  // closed "island". This departs from textbook Dung stable extensions
  // (where {A} in a 2-cycle A<->B counts as stable) and is the convention
  // Tasks 6/7 rely on for output filtering.
  for (const a of set) {
    for (const b of attackersOf(map, a)) {
      if (!set.has(b)) return false;
    }
  }
  return true;
}

export function stripAux(set: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const k of set) {
    if (k.startsWith('sup:') || k.startsWith('nec:')) continue;
    result.add(k);
  }
  return result;
}
