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
      // Unattacked arguments are defended vacuously — the universal quantifier
      // "every attacker is counter-attacked by some member of S" is trivially
      // satisfied when the attackers list is empty (Dung 1995 §3; Baroni,
      // Caminada, Giacomin 2018). They MUST enter the closure to preserve the
      // cross-validation invariant ∩ complete = grounded.
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
  // S must attack every argument not in S (textbook Dung).
  for (const a of map.keys()) {
    if (set.has(a)) continue;
    if (!attackersOf(map, a).some((b) => set.has(b))) return false;
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

export function findPreferredExtensions(map: Map<string, string[]>): Set<string>[] {
  const args = [...map.keys()];
  const n = args.length;
  const results: Set<string>[] = [];
  const skipMasks = new Set<number>();

  // Textbook Dung: S is preferred iff S is a maximal admissible set. Iterate
  // subsets large-to-small; once we find an admissible S, mark all subsets
  // of S as skipped (any subset is non-maximal by definition of preferred).
  // The empty set is admissible vacuously and must be considered: for a
  // 3-cycle the only preferred extension is ∅ (no singleton is self-defending).
  for (let mask = (1 << n) - 1; mask >= 0; mask--) {
    if (skipMasks.has(mask)) continue;
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.add(args[i]!);
    }
    if (isAdmissible(subset, map)) {
      results.push(stripAux(subset));
      // Mark all subsets of `mask` as skipped.
      let sub = mask;
      while (true) {
        skipMasks.add(sub);
        if (sub === 0) break;
        sub = (sub - 1) & mask;
      }
    }
  }
  return results;
}

export function findStableExtensions(map: Map<string, string[]>): Set<string>[] {
  const args = [...map.keys()];
  const n = args.length;
  const results: Set<string>[] = [];

  // Iterate all subsets. Textbook Dung: S is stable iff S is admissible AND
  // S attacks every arg not in S. The empty set is excluded by convention:
  // a stable extension must attack all outside arguments, which for an empty
  // framework is vacuously satisfied but yields no semantic content. (Used to
  // include a "no outside attacker on members" clause; that was a deviation
  // removed in Task 6 follow-up.)
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.add(args[i]!);
    }
    if (isStable(subset, map)) {
      results.push(stripAux(subset));
    }
  }
  return results;
}

export function findCompleteExtensions(map: Map<string, string[]>): Set<string>[] {
  const args = [...map.keys()];
  const n = args.length;
  const results: Set<string>[] = [];

  // Iterate all subsets. S is complete iff S is admissible AND closed under
  // defense closure (defenseClosure(S) === S).
  for (let mask = 0; mask < 1 << n; mask++) {
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.add(args[i]!);
    }
    if (isClosedUnderDefense(subset, map) && isAdmissible(subset, map)) {
      results.push(stripAux(subset));
    }
  }
  return results;
}
