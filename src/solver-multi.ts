// src/solver-multi.ts
export type Scc = { id: number; members: Set<string>; cyclic: boolean };

/**
 * Iterative Tarjan's strongly-connected-components algorithm.
 * Returns SCCs in reverse topological order: when processed in array order,
 * every attacker SCC comes before its attackee SCC.
 *
 * Iterative (not recursive) so JS call-stack limits don't bite on deep graphs.
 */
export function tarjanScc(map: Map<string, string[]>): Scc[] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: Scc[] = [];
  let nextId = 0;

  interface Frame {
    arg: string;
    successors: string[];
    succIdx: number;
  }

  for (const start of map.keys()) {
    if (indices.has(start)) continue;

    const workStack: Frame[] = [
      { arg: start, successors: map.get(start) ?? [], succIdx: 0 },
    ];
    indices.set(start, index);
    lowlinks.set(start, index);
    index++;
    stack.push(start);
    onStack.add(start);

    while (workStack.length > 0) {
      const frame = workStack[workStack.length - 1]!;
      const { arg, successors } = frame;

      if (frame.succIdx < successors.length) {
        const w = successors[frame.succIdx]!;
        frame.succIdx++;
        if (!indices.has(w)) {
          indices.set(w, index);
          lowlinks.set(w, index);
          index++;
          stack.push(w);
          onStack.add(w);
          workStack.push({
            arg: w,
            successors: map.get(w) ?? [],
            succIdx: 0,
          });
        } else if (onStack.has(w)) {
          lowlinks.set(frame.arg, Math.min(lowlinks.get(frame.arg)!, indices.get(w)!));
        }
      } else {
        if (lowlinks.get(arg) === indices.get(arg)) {
          const members = new Set<string>();
          let popped: string | undefined;
          do {
            popped = stack.pop();
            if (popped === undefined) break;
            onStack.delete(popped);
            members.add(popped);
          } while (popped !== arg);

          let cyclic = false;
          outer: for (const a of members) {
            const aAttacks = map.get(a) ?? [];
            for (const b of aAttacks) {
              if (members.has(b)) {
                cyclic = true;
                break outer;
              }
            }
          }

          sccs.push({ id: nextId++, members, cyclic });
        }
        workStack.pop();
        if (workStack.length > 0) {
          const parent = workStack[workStack.length - 1]!;
          lowlinks.set(
            parent.arg,
            Math.min(lowlinks.get(parent.arg)!, lowlinks.get(arg)!),
          );
        }
      }
    }
  }

  return sccs;
}

/**
 * Compute the grounded extension of a Dung framework.
 *
 * Returns the set of arguments labeled "in" by Modgil's argument-level
 * labeling: each arg a gets label 'in' if all its attackers are 'out',
 * 'out' if it has an attacker labeled 'in', and 'undec' otherwise.
 * Iterates until no labels change. Equivalent to defenseClosure(∅, F).
 *
 * SCC-based label propagation (acyclic SCCs → 'in'/'out', cyclic SCCs →
 * 'undec') is a conservative approximation: when a cyclic SCC contains
 * a member counter-attacked by an external 'in' arg, that member should
 * be 'out' and other args attacking it (or attacked only by it) may then
 * be 'in'. The SCC algorithm collapses these to 'undec' and misses the
 * ripple. Argument-level Modgil handles this correctly.
 *
 * The Tarjan SCC machinery (above) is kept for topological order in
 * future optimizations; this function uses the fixpoint directly.
 */
export function findGroundedExtension(map: Map<string, string[]>): Set<string> {
  return defenseClosure(new Set(), map);
}

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
  const skipMasks = new Set<bigint>();
  const ONE = 1n;

  // Textbook Dung: S is preferred iff S is a maximal admissible set. Iterate
  // subsets large-to-small; once we find an admissible S, mark all subsets
  // of S as skipped (any subset is non-maximal by definition of preferred).
  // The empty set is admissible vacuously and must be considered: for a
  // 3-cycle the only preferred extension is ∅ (no singleton is self-defending).
  // BigInt masks are required: JS `<<` truncates to 32 bits, so for graphs
  // with >32 keys `1 << n` would silently produce a small value and the loop
  // would terminate or wrap incorrectly.
  for (let mask = (ONE << BigInt(n)) - 1n; mask >= 0n; mask--) {
    if (skipMasks.has(mask)) continue;
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    if (isAdmissible(subset, map)) {
      results.push(stripAux(subset));
      // Mark all subsets of `mask` as skipped.
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

export function findStableExtensions(map: Map<string, string[]>): Set<string>[] {
  const args = [...map.keys()];
  const n = args.length;
  const results: Set<string>[] = [];
  const ONE = 1n;

  // Iterate all subsets. Textbook Dung: S is stable iff S is admissible AND
  // S attacks every arg not in S. The empty set is excluded by convention:
  // a stable extension must attack all outside arguments, which for an empty
  // framework is vacuously satisfied but yields no semantic content. (Used to
  // include a "no outside attacker on members" clause; that was a deviation
  // removed in Task 6 follow-up.) BigInt masks for graphs >32 keys.
  for (let mask = 1n; mask < (ONE << BigInt(n)); mask++) {
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
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
  const ONE = 1n;

  // Iterate all subsets. S is complete iff S is admissible AND closed under
  // defense closure (defenseClosure(S) === S). BigInt masks for graphs >32 keys.
  for (let mask = 0n; mask < (ONE << BigInt(n)); mask++) {
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    if (isClosedUnderDefense(subset, map) && isAdmissible(subset, map)) {
      results.push(stripAux(subset));
    }
  }
  return results;
}
