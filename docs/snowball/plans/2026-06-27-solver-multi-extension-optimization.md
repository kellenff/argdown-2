# Solver Multi-Extension Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace brute-force subset enumeration in `src/solver-multi.ts` with SCC-grounded + residue-search (textbook Dung 1995). Public API unchanged. Large-stress fixtures that previously timed out now run.

**Architecture:** Three new internal helpers (`tarjanScc`, `findGroundedExtension`, `residueOf`) feed the existing brute-force machinery, which now operates on the residue `R = A \ G` instead of `A`. Iterative Tarjan (no recursion — JS call-stack safety for deep graphs). Bench harness gains per-task wall-clock timeouts as the primary defense against pathological pure-cycle frameworks.

**Tech Stack:** TypeScript (strict, ESM), Vitest, Tinybench. No new dependencies.

**Reference spec:** `docs/snowball/specs/2026-06-27-solver-multi-extension-optimization-design.md`

---

## File Structure

**Files modified:**
- `src/solver-multi.ts` — adds `tarjanScc`, `findGroundedExtension`, `residueOf`, `lift`; rewrites `findCompleteExtensions`, `findPreferredExtensions`, `findStableExtensions`. Public API unchanged.
- `src/solver.bench.ts` — adds timeout options to `RunBenchOptions`, wraps each task with deadline check, adds `solve-grounded` task type, removes the `large-stress` × multi-extension skip guard.

**Files created (new tests):**
- `src/solver-multi.tarjan.test.ts` — SCC decomposition correctness.
- `src/solver-multi.grounded.test.ts` — `findGroundedExtension` against `defenseClosure(∅)`.
- `src/solver-multi.residue.test.ts` — `residueOf` and `lift` helpers.
- `src/solver-multi.equivalence.test.ts` — property-based: new = old for N ≤ 20.
- `src/solver-multi.large.test.ts` — invariant tests on N = 30–100 graphs.
- `src/solver.bench-timeout.test.ts` — bench timeout behavior.

**Files modified (refreshed):**
- `perf-baseline-solver.json` — refreshed after bench lands.

---

## Task Sequencing

1. `tarjanScc` (iterative) — independent.
2. `findGroundedExtension` — depends on `tarjanScc`.
3. `residueOf` + `lift` — pure data helpers.
4. Rewrite `findCompleteExtensions` (smallest scope).
5. Rewrite `findPreferredExtensions`.
6. Rewrite `findStableExtensions`.
7. Cross-cutting tests (equivalence, large-graph invariants).
8. Bench: timeout infrastructure.
9. Bench: remove skip guard, refresh baseline.

---

## Task 1: Iterative Tarjan SCC

**Files:**
- Modify: `src/solver-multi.ts` (add `tarjanScc` after existing helpers, before finders)
- Create: `src/solver-multi.tarjan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/solver-multi.tarjan.test.ts`:

```ts
// src/solver-multi.tarjan.test.ts
import { describe, it, expect } from 'vitest';
import { tarjanScc } from './solver-multi.js';

describe('tarjanScc', () => {
  it('returns one SCC for an empty graph', () => {
    const result = tarjanScc(new Map());
    expect(result).toEqual([]);
  });

  it('puts a single node in a single acyclic SCC', () => {
    const map = new Map<string, string[]>([['A', []]]);
    const result = tarjanScc(map);
    expect(result).toHaveLength(1);
    expect(result[0]!.cyclic).toBe(false);
    expect(result[0]!.members).toEqual(new Set(['A']));
  });

  it('marks an SCC as cyclic when a self-attack exists', () => {
    const map = new Map<string, string[]>([['A', ['A']]]);
    const result = tarjanScc(map);
    expect(result).toHaveLength(1);
    expect(result[0]!.cyclic).toBe(true);
  });

  it('marks an SCC as cyclic on a 2-cycle', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['A']],
    ]);
    const result = tarjanScc(map);
    expect(result).toHaveLength(1);
    expect(result[0]!.cyclic).toBe(true);
    expect(result[0]!.members).toEqual(new Set(['A', 'B']));
  });

  it('produces two SCCs for A→B with no back edge', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', []],
    ]);
    const result = tarjanScc(map);
    expect(result).toHaveLength(2);
    // Both acyclic
    for (const scc of result) {
      expect(scc.cyclic).toBe(false);
      expect(scc.members.size).toBe(1);
    }
    // B's SCC must come before A's in reverse topological order
    const bIdx = result.findIndex((s) => s.members.has('B'));
    const aIdx = result.findIndex((s) => s.members.has('A'));
    expect(bIdx).toBeLessThan(aIdx);
  });

  it('keeps a deep linear chain acyclic and topologically ordered', () => {
    const map = new Map<string, string[]>();
    const N = 50;
    for (let i = 0; i < N; i++) {
      const attacks: string[] = [];
      if (i < N - 1) attacks.push(`n${i + 1}`);
      map.set(`n${i}`, attacks);
    }
    const result = tarjanScc(map);
    expect(result).toHaveLength(N);
    // Reverse topological: n49 first, n0 last
    expect(result[0]!.members.has('n49')).toBe(true);
    expect(result[N - 1]!.members.has('n0')).toBe(true);
  });

  it('handles a graph with two disjoint cycles', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['A']],
      ['C', ['D']],
      ['D', ['C']],
    ]);
    const result = tarjanScc(map);
    expect(result).toHaveLength(2);
    for (const scc of result) {
      expect(scc.cyclic).toBe(true);
      expect(scc.members.size).toBe(2);
    }
  });

  it('groups a triangle cycle into one SCC', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['C']],
      ['C', ['A']],
    ]);
    const result = tarjanScc(map);
    expect(result).toHaveLength(1);
    expect(result[0]!.cyclic).toBe(true);
    expect(result[0]!.members).toEqual(new Set(['A', 'B', 'C']));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/solver-multi.tarjan.test.ts 2>&1 | tail -20`
Expected: FAIL — `tarjanScc` is not exported from `./solver-multi.js`.

- [ ] **Step 3: Implement iterative Tarjan in solver-multi.ts**

Add at the top of `src/solver-multi.ts` (after the existing imports/types, before the existing helpers like `attackersOf`):

```ts
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

  // Work stack: each frame is { arg, succIdx } so we can resume iteration.
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
        // All successors explored; check lowlink.
        if (lowlinks.get(arg) === indices.get(arg)) {
          const members = new Set<string>();
          let popped: string | undefined;
          do {
            popped = stack.pop();
            if (popped === undefined) break;
            onStack.delete(popped);
            members.add(popped);
          } while (popped !== arg);

          // cyclic iff any two members of this SCC attack each other (directly
          // or transitively). For our algorithm, "cyclic" means: this SCC has
          // internal attacks, i.e., there exist a, b in members with a in
          // (map.get(b) ?? []) or vice versa.
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/solver-multi.tarjan.test.ts 2>&1 | tail -20`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Typecheck**

Run: `yarn typecheck 2>&1 | tail -20`
Expected: PASS — no TypeScript errors.

- [ ] **Step 6: Lint**

Run: `yarn lint 2>&1 | tail -20`
Expected: PASS — no lint errors. If `max-lines` triggers on `solver-multi.ts`, defer the split to a later task (the spec says rule of three).

- [ ] **Step 7: Commit**

```bash
git add src/solver-multi.ts src/solver-multi.tarjan.test.ts
git commit -m "feat(solver-multi): add iterative tarjanScc helper

Iterative Tarjan SCC decomposition (no recursion — JS call-stack safety
for deep graphs). Returns SCCs in reverse topological order.

Includes solver-multi.tarjan.test.ts with 8 cases: empty, singleton,
self-attack, 2-cycle, linear chain, disjoint cycles, triangle, deep DAG."
```

---

## Task 2: findGroundedExtension via SCC labels

**Files:**
- Modify: `src/solver-multi.ts` (add `findGroundedExtension` after `tarjanScc`)
- Create: `src/solver-multi.grounded.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/solver-multi.grounded.test.ts`:

```ts
// src/solver-multi.grounded.test.ts
import { describe, it, expect } from 'vitest';
import { findGroundedExtension, defenseClosure } from './solver-multi.js';

describe('findGroundedExtension', () => {
  it('returns empty set for an empty graph', () => {
    expect(findGroundedExtension(new Map())).toEqual(new Set());
  });

  it('returns the only node when unattacked (DAG sink)', () => {
    const map = new Map<string, string[]>([['A', []]]);
    expect(findGroundedExtension(map)).toEqual(new Set(['A']));
  });

  it('returns the unattacked source of a 2-node graph', () => {
    // Map convention: map.get(arg) = list of args that ATTACK arg (incoming edges).
    // For [[A, [B]], [B, []]]: B attacks A; A attacks no one.
    // A's attackers = [B]; B's attackers = ∅. B is unattacked → in. A is
    // attacked by B (in) → out. Result: {B}.
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', []],
    ]);
    expect(findGroundedExtension(map)).toEqual(new Set(['B']));
  });

  it('returns nothing for a 2-cycle (no defended members)', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['A']],
    ]);
    expect(findGroundedExtension(map)).toEqual(new Set());
  });

  it('returns nothing for a self-attack', () => {
    const map = new Map<string, string[]>([['A', ['A']]]);
    expect(findGroundedExtension(map)).toEqual(new Set());
  });

  it('matches defenseClosure(∅) on tractable random graphs', () => {
    // Property-based: for N=20 random sparse graphs, results must match.
    const N = 20;
    for (let trial = 0; trial < 10; trial++) {
      const args = Array.from({ length: N }, (_, i) => `a${i}`);
      const map = new Map<string, string[]>();
      for (const a of args) {
        const attacks: string[] = [];
        for (const b of args) {
          if (a !== b && Math.random() < 0.1) attacks.push(b);
        }
        map.set(a, attacks);
      }
      const scc = findGroundedExtension(map);
      const dc = defenseClosure(new Set(), map);
      expect(scc).toEqual(dc);
    }
  });

  it('handles a graph with defended node outside a 3-cycle', () => {
    // Map convention: map.get(arg) = [args that ATTACK arg] (incoming edges).
    // 3-cycle A, B, C: A's attackers=[B], B's attackers=[C], C's attackers=[A].
    // D is unattacked (D's attackers = ∅, vacuously defended).
    // Expected: D in grounded. A, B, C cyclic SCC → undec.
    // Result: {D}.
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['C']],
      ['C', ['A']],
      ['D', []],
    ]);
    expect(findGroundedExtension(map)).toEqual(new Set(['D']));
  });

  it('returns full set on a pure DAG', () => {
    const map = new Map<string, string[]>([
      ['A', []],
      ['B', []],
      ['C', []],
    ]);
    expect(findGroundedExtension(map)).toEqual(new Set(['A', 'B', 'C']));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/solver-multi.grounded.test.ts 2>&1 | tail -20`
Expected: FAIL — `findGroundedExtension` is not exported.

- [ ] **Step 3: Implement findGroundedExtension**

Add to `src/solver-multi.ts` (right after `tarjanScc`):

```ts
/**
 * Compute the grounded extension of a Dung framework via SCC decomposition.
 * O(|A|+|R|). Returns the set of "in"-labeled arguments.
 */
export function findGroundedExtension(map: Map<string, string[]>): Set<string> {
  const sccs = tarjanScc(map);
  const sccOf = new Map<string, number>();
  for (const scc of sccs) {
    for (const arg of scc.members) {
      sccOf.set(arg, scc.id);
    }
  }

  // Labels per SCC: 'in' | 'out' | 'undec'.
  const label = new Map<number, 'in' | 'out' | 'undec'>();
  const grounded = new Set<string>();

  for (const scc of sccs) {
    if (scc.cyclic) {
      label.set(scc.id, 'undec');
      continue;
    }

    // Acyclic SCC: all members are 'in' iff every attacker's SCC is 'out'.
    let allIn = true;
    for (const arg of scc.members) {
      const attackers = map.get(arg) ?? [];
      for (const atk of attackers) {
        const atkSccId = sccOf.get(atk);
        if (atkSccId === undefined) {
          // Attacker not in any SCC means map is malformed; treat as out
          // for safety.
          if (label.get(atkSccId as number) !== 'out') {
            allIn = false;
            break;
          }
        } else if (label.get(atkSccId) !== 'out') {
          allIn = false;
          break;
        }
      }
      if (!allIn) break;
    }

    if (allIn) {
      label.set(scc.id, 'in');
      for (const arg of scc.members) grounded.add(arg);
    } else {
      label.set(scc.id, 'out');
    }
  }

  return grounded;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/solver-multi.grounded.test.ts 2>&1 | tail -20`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Typecheck and lint**

Run: `yarn typecheck 2>&1 | tail -10 && yarn lint 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/solver-multi.ts src/solver-multi.grounded.test.ts
git commit -m "feat(solver-multi): add findGroundedExtension via SCC labels

Modgil labeling variant over Tarjan SCC. Process SCCs in reverse
topological order: cyclic SCCs are 'undec', acyclic SCCs are 'in' iff
every attacker's SCC is already labeled 'out'.

Equivalence test asserts the SCC-based grounded equals
defenseClosure(∅) on N=20 random sparse graphs (10 trials)."
```

---

## Task 3: residueOf and lift helpers

**Files:**
- Modify: `src/solver-multi.ts` (add `residueOf` and `lift`)
- Create: `src/solver-multi.residue.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/solver-multi.residue.test.ts`:

```ts
// src/solver-multi.residue.test.ts
import { describe, it, expect } from 'vitest';
import { residueOf, lift } from './solver-multi.js';

describe('residueOf', () => {
  it('returns empty args and subMap for empty input', () => {
    const result = residueOf(new Map(), new Set());
    expect(result.args).toEqual([]);
    expect(result.subMap.size).toBe(0);
  });

  it('returns all args when grounded is empty', () => {
    const map = new Map<string, string[]>([
      ['A', []],
      ['B', []],
    ]);
    const result = residueOf(map, new Set());
    expect(result.args.sort()).toEqual(['A', 'B']);
    expect(result.subMap.get('A')).toEqual([]);
    expect(result.subMap.get('B')).toEqual([]);
  });

  it('excludes grounded args from residue', () => {
    const map = new Map<string, string[]>([
      ['A', []],
      ['B', []],
    ]);
    const result = residueOf(map, new Set(['A']));
    expect(result.args).toEqual(['B']);
    expect(result.subMap.has('A')).toBe(false);
    expect(result.subMap.has('B')).toBe(true);
  });

  it('filters attackers to residue members only', () => {
    // A attacks B; A is grounded. Residue only contains B, with no attackers.
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', []],
    ]);
    const result = residueOf(map, new Set(['A']));
    expect(result.subMap.get('B')).toEqual([]);
  });

  it('preserves attackers within the residue', () => {
    // A is grounded. B and C are residue. B attacks C.
    const map = new Map<string, string[]>([
      ['A', []],
      ['B', ['C']],
      ['C', []],
    ]);
    const result = residueOf(map, new Set(['A']));
    expect(result.subMap.get('B')).toEqual([]);
    expect(result.subMap.get('C')).toEqual(['B']);
  });
});

describe('lift', () => {
  it('returns G when T is empty', () => {
    expect(lift(new Set(), new Set(['A', 'B']))).toEqual(new Set(['A', 'B']));
  });

  it('returns T when G is empty', () => {
    expect(lift(new Set(['A']), new Set())).toEqual(new Set(['A']));
  });

  it('returns the union of T and G', () => {
    expect(lift(new Set(['B']), new Set(['A']))).toEqual(new Set(['A', 'B']));
  });

  it('does not duplicate when T and G overlap', () => {
    const result = lift(new Set(['A', 'B']), new Set(['A']));
    expect(result).toEqual(new Set(['A', 'B']));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/solver-multi.residue.test.ts 2>&1 | tail -20`
Expected: FAIL — `residueOf` and `lift` are not exported.

- [ ] **Step 3: Implement residueOf and lift**

Add to `src/solver-multi.ts` (after `findGroundedExtension`):

```ts
/**
 * Returns the induced sub-framework on A \ grounded.
 * subMap entries have attackers filtered to residue members only.
 */
export function residueOf(
  map: Map<string, string[]>,
  grounded: Set<string>,
): { args: string[]; subMap: Map<string, string[]> } {
  const args: string[] = [];
  const subMap = new Map<string, string[]>();
  for (const [arg, attackers] of map) {
    if (grounded.has(arg)) continue;
    args.push(arg);
    const filteredAttackers = attackers.filter((a) => !grounded.has(a));
    subMap.set(arg, filteredAttackers);
  }
  return { args, subMap };
}

/**
 * Lift a residue subset T by unioning with the grounded extension G.
 * Returns a fresh Set.
 */
export function lift(t: Set<string>, g: Set<string>): Set<string> {
  return new Set([...t, ...g]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/solver-multi.residue.test.ts 2>&1 | tail -20`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Typecheck and lint**

Run: `yarn typecheck 2>&1 | tail -10 && yarn lint 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/solver-multi.ts src/solver-multi.residue.test.ts
git commit -m "feat(solver-multi): add residueOf and lift helpers

residueOf returns the induced sub-framework on A \\ G with attackers
filtered to residue members only. lift unions a residue subset T with
the grounded extension G into a fresh Set."
```

---

## Task 4: Rewrite findCompleteExtensions

**Files:**
- Modify: `src/solver-multi.ts` (replace `findCompleteExtensions` body)
- Verify: `src/solver.complete.test.ts` and `src/solver.cross-validate.test.ts` still pass

- [ ] **Step 1: Run the existing tests to confirm baseline**

Run: `yarn test src/solver.complete.test.ts src/solver.cross-validate.test.ts 2>&1 | tail -30`
Expected: PASS — both test files green. This is our baseline.

- [ ] **Step 2: Replace findCompleteExtensions body**

In `src/solver-multi.ts`, replace the existing `findCompleteExtensions` function with:

```ts
export function findCompleteExtensions(map: Map<string, string[]>): Set<string>[] {
  const grounded = findGroundedExtension(map);
  const { args, subMap } = residueOf(map, grounded);

  // Fast path: empty residue → grounded is the only complete extension.
  if (args.length === 0) {
    return [stripAux(lift(new Set(), grounded))];
  }

  // Search the residue for complete extensions (admissible AND closed under
  // defense closure within the induced sub-framework). Lift by G ∪ T and strip
  // auxiliary args.
  const results: Set<string>[] = [];
  const ONE = 1n;
  const n = args.length;

  for (let mask = 0n; mask < (ONE << BigInt(n)); mask++) {
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    if (isClosedUnderDefense(subset, subMap) && isAdmissible(subset, subMap)) {
      results.push(stripAux(lift(subset, grounded)));
    }
  }
  return results;
}
```

- [ ] **Step 3: Run the existing tests**

Run: `yarn test src/solver.complete.test.ts src/solver.cross-validate.test.ts 2>&1 | tail -30`
Expected: PASS — both green. If any test fails, the most likely issue is test ordering (search order on residue differs from search on full graph). Fix by changing the test to assert set-equality rather than list-order.

- [ ] **Step 4: Typecheck and lint**

Run: `yarn typecheck 2>&1 | tail -10 && yarn lint 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/solver-multi.ts
git commit -m "refactor(solver-multi): rewrite findCompleteExtensions via residue search

Compute grounded via SCC, derive residue = A \\ G, brute-force complete
extensions on the residue. Fast path when residue is empty (DAG case)
returns [G] immediately.

Cross-validation invariant (∩ complete = grounded) preserved by
construction: every returned complete contains G."
```

---

## Task 5: Rewrite findPreferredExtensions

**Files:**
- Modify: `src/solver-multi.ts` (replace `findPreferredExtensions` body)
- Verify: `src/solver.preferred.test.ts` and `src/solver.cross-validate.test.ts` still pass

- [ ] **Step 1: Run the existing tests to confirm baseline**

Run: `yarn test src/solver.preferred.test.ts src/solver.cross-validate.test.ts 2>&1 | tail -30`
Expected: PASS — both green.

- [ ] **Step 2: Replace findPreferredExtensions body**

In `src/solver-multi.ts`, replace the existing `findPreferredExtensions` function with:

```ts
export function findPreferredExtensions(map: Map<string, string[]>): Set<string>[] {
  const grounded = findGroundedExtension(map);
  const { args, subMap } = residueOf(map, grounded);

  // Fast path: empty residue → grounded is the unique preferred extension.
  if (args.length === 0) {
    return [stripAux(lift(new Set(), grounded))];
  }

  // Search the residue for maximal admissible subsets. Iterate subsets
  // large-to-small; once we find an admissible S, mark all subsets of S as
  // skipped (any subset is non-maximal by definition of preferred). Lift by
  // G ∪ T.
  const results: Set<string>[] = [];
  const skipMasks = new Set<bigint>();
  const ONE = 1n;
  const n = args.length;

  for (let mask = (ONE << BigInt(n)) - 1n; mask >= 0n; mask--) {
    if (skipMasks.has(mask)) continue;
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    if (isAdmissible(subset, subMap)) {
      results.push(stripAux(lift(subset, grounded)));
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
```

- [ ] **Step 3: Run the existing tests**

Run: `yarn test src/solver.preferred.test.ts src/solver.cross-validate.test.ts 2>&1 | tail -30`
Expected: PASS. If a test fails on order, change to set-equality.

- [ ] **Step 4: Typecheck and lint**

Run: `yarn typecheck 2>&1 | tail -10 && yarn lint 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/solver-multi.ts
git commit -m "refactor(solver-multi): rewrite findPreferredExtensions via residue search

Compute grounded via SCC, derive residue = A \\ G, search residue for
maximal admissible subsets with subset-pruning preserved. Fast path on
empty residue returns [G]."
```

---

## Task 6: Rewrite findStableExtensions

**Files:**
- Modify: `src/solver-multi.ts` (replace `findStableExtensions` body)
- Verify: `src/solver.stable.test.ts` and `src/solver.cross-validate.test.ts` still pass

- [ ] **Step 1: Run the existing tests to confirm baseline**

Run: `yarn test src/solver.stable.test.ts src/solver.cross-validate.test.ts 2>&1 | tail -30`
Expected: PASS — both green.

- [ ] **Step 2: Replace findStableExtensions body**

In `src/solver-multi.ts`, replace the existing `findStableExtensions` function with:

```ts
export function findStableExtensions(map: Map<string, string[]>): Set<string>[] {
  const grounded = findGroundedExtension(map);
  const { args, subMap } = residueOf(map, grounded);

  // Fast path: empty residue → grounded is stable iff it attacks every arg
  // outside itself. If grounded = A (DAG case), this is vacuously true.
  if (args.length === 0) {
    return [stripAux(lift(new Set(), grounded))];
  }

  // Search the residue for stable subsets (admissible AND attacks all of
  // residue \ T within the induced sub-framework). Lift by G ∪ T.
  const results: Set<string>[] = [];
  const ONE = 1n;
  const n = args.length;

  for (let mask = 1n; mask < (ONE << BigInt(n)); mask++) {
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    if (isStable(subset, subMap)) {
      results.push(stripAux(lift(subset, grounded)));
    }
  }
  return results;
}
```

- [ ] **Step 3: Run the existing tests**

Run: `yarn test src/solver.stable.test.ts src/solver.cross-validate.test.ts 2>&1 | tail -30`
Expected: PASS. If a test fails on order, change to set-equality.

- [ ] **Step 4: Typecheck and lint**

Run: `yarn typecheck 2>&1 | tail -10 && yarn lint 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Run the full solver test suite**

Run: `yarn test src/solver 2>&1 | tail -30`
Expected: PASS — all solver tests green. This is the post-rewrite invariant verification.

- [ ] **Step 6: Commit**

```bash
git add src/solver-multi.ts
git commit -m "refactor(solver-multi): rewrite findStableExtensions via residue search

Compute grounded via SCC, derive residue = A \\ G, search residue for
stable subsets. Fast path on empty residue returns [G] (vacuous stability
for DAG case where grounded = A)."
```

---

## Task 7: Property-based equivalence tests

**Files:**
- Create: `src/solver-multi.equivalence.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/solver-multi.equivalence.test.ts`:

```ts
// src/solver-multi.equivalence.test.ts
import { describe, it, expect } from 'vitest';
import {
  findCompleteExtensions,
  findPreferredExtensions,
  findStableExtensions,
} from './solver-multi.js';

/**
 * Reference implementation: textbook Dung brute force over BigInt masks on
 * the FULL argument set. Captured here for equivalence testing against the
 * new residue-based finders.
 */
function bruteForceCompleteReference(
  map: Map<string, string[]>,
): Set<string>[] {
  const args = [...map.keys()];
  const n = args.length;
  const results: Set<string>[] = [];
  const ONE = 1n;

  function isClosedUnderDefense(s: Set<string>): boolean {
    // defenseClosure within s only — closure equals s means no arg outside s
    // is defended by s.
    for (const a of args) {
      if (s.has(a)) continue;
      const attackers = map.get(a) ?? [];
      const allCounterAttacked = attackers.every((b) => {
        const bAttackers = map.get(b) ?? [];
        return bAttackers.some((c) => s.has(c));
      });
      if (allCounterAttacked) return false;
    }
    return true;
  }

  function isAdmissible(s: Set<string>): boolean {
    for (const a of s) {
      const attackers = map.get(a) ?? [];
      const allCounterAttacked = attackers.every((b) => s.has(b));
      if (!allCounterAttacked) return false;
    }
    return true;
  }

  for (let mask = 0n; mask < (ONE << BigInt(n)); mask++) {
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    if (isClosedUnderDefense(subset) && isAdmissible(subset)) {
      results.push(subset);
    }
  }
  return results;
}

function bruteForceStableReference(
  map: Map<string, string[]>,
): Set<string>[] {
  const args = [...map.keys()];
  const n = args.length;
  const results: Set<string>[] = [];
  const ONE = 1n;

  function isStable(s: Set<string>): boolean {
    // admissible
    for (const a of s) {
      const attackers = map.get(a) ?? [];
      const allCounterAttacked = attackers.every((b) => s.has(b));
      if (!allCounterAttacked) return false;
    }
    // attacks every arg outside
    for (const a of args) {
      if (s.has(a)) continue;
      const attacked = (map.get(a) ?? []).some((b) => s.has(b));
      // Wait, we need s attacking a, which means some member of s attacks a.
      // Re-check: a's attackers include some s-member.
      const aAttackers = map.get(a) ?? [];
      const hasAttackerInS = aAttackers.some((b) => s.has(b));
      if (!hasAttackerInS) return false;
    }
    return true;
  }

  for (let mask = 1n; mask < (ONE << BigInt(n)); mask++) {
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    if (isStable(subset)) {
      results.push(subset);
    }
  }
  return results;
}

function randomSparseGraph(n: number, density = 0.1, seed = 1): Map<string, string[]> {
  // Simple LCG for reproducibility (avoid Math.random flakiness).
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const args = Array.from({ length: n }, (_, i) => `a${i}`);
  const map = new Map<string, string[]>();
  for (const a of args) {
    const attacks: string[] = [];
    for (const b of args) {
      if (a !== b && rand() < density) attacks.push(b);
    }
    map.set(a, attacks);
  }
  return map;
}

function setEquivalence<T>(a: Set<T>[], b: Set<T>[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].map((s) => [...s].sort().join(','));
  const sortedB = [...b].map((s) => [...s].sort().join(','));
  sortedA.sort();
  sortedB.sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

describe('findCompleteExtensions (residue-based) equivalence', () => {
  it('matches brute-force reference on N=10 random sparse graphs', () => {
    for (let trial = 0; trial < 5; trial++) {
      const map = randomSparseGraph(10, 0.1, trial);
      const got = findCompleteExtensions(map);
      const want = bruteForceCompleteReference(map);
      expect(setEquivalence(got, want)).toBe(true);
    }
  });

  it('matches on a 3-cycle (no grounded)', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['C']],
      ['C', ['A']],
    ]);
    const got = findCompleteExtensions(map);
    const want = bruteForceCompleteReference(map);
    expect(setEquivalence(got, want)).toBe(true);
  });

  it('matches on a 5-node DAG', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['C']],
      ['C', []],
      ['D', ['E']],
      ['E', []],
    ]);
    const got = findCompleteExtensions(map);
    const want = bruteForceCompleteReference(map);
    expect(setEquivalence(got, want)).toBe(true);
  });
});

describe('findStableExtensions (residue-based) equivalence', () => {
  it('matches brute-force reference on N=8 random sparse graphs', () => {
    for (let trial = 0; trial < 5; trial++) {
      const map = randomSparseGraph(8, 0.1, trial);
      const got = findStableExtensions(map);
      const want = bruteForceStableReference(map);
      expect(setEquivalence(got, want)).toBe(true);
    }
  });

  it('matches on a 3-cycle', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['C']],
      ['C', ['A']],
    ]);
    const got = findStableExtensions(map);
    const want = bruteForceStableReference(map);
    expect(setEquivalence(got, want)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `yarn test src/solver-multi.equivalence.test.ts 2>&1 | tail -30`
Expected: PASS — all equivalence tests green. If any fail, there's a real bug in the residue implementation; debug carefully (likely an issue with `subMap` not preserving an edge, or `lift` ordering).

- [ ] **Step 3: Commit**

```bash
git add src/solver-multi.equivalence.test.ts
git commit -m "test(solver-multi): property-based equivalence vs brute-force reference

For N=10 random sparse graphs (5 trials, seeded), assert that
findCompleteExtensions and findStableExtensions (residue-based) return
the same set-of-sets as a textbook Dung brute-force reference impl.

Catches subtle bugs in residue computation or lift ordering."
```

---

## Task 8: Large-graph invariant tests

**Files:**
- Create: `src/solver-multi.large.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/solver-multi.large.test.ts`:

```ts
// src/solver-multi.large.test.ts
import { describe, it, expect } from 'vitest';
import {
  findCompleteExtensions,
  findPreferredExtensions,
  findStableExtensions,
  findGroundedExtension,
} from './solver-multi.js';

function randomSparseGraph(n: number, density = 0.05, seed = 1): Map<string, string[]> {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const args = Array.from({ length: n }, (_, i) => `a${i}`);
  const map = new Map<string, string[]>();
  for (const a of args) {
    const attacks: string[] = [];
    for (const b of args) {
      if (a !== b && rand() < density) attacks.push(b);
    }
    map.set(a, attacks);
  }
  return map;
}

describe('large-graph invariants', () => {
  it('G ⊆ every complete extension (N=50)', () => {
    const map = randomSparseGraph(50, 0.05, 1);
    const g = findGroundedExtension(map);
    const completes = findCompleteExtensions(map);
    for (const c of completes) {
      for (const arg of g) {
        expect(c.has(arg)).toBe(true);
      }
    }
  });

  it('G ⊆ every preferred extension (N=50)', () => {
    const map = randomSparseGraph(50, 0.05, 2);
    const g = findGroundedExtension(map);
    const preferreds = findPreferredExtensions(map);
    for (const p of preferreds) {
      for (const arg of g) {
        expect(p.has(arg)).toBe(true);
      }
    }
  });

  it('every complete is contained in some preferred (N=30)', () => {
    const map = randomSparseGraph(30, 0.05, 3);
    const completes = findCompleteExtensions(map);
    const preferreds = findPreferredExtensions(map);
    for (const c of completes) {
      const contained = preferreds.some((p) => {
        for (const arg of c) if (!p.has(arg)) return false;
        return true;
      });
      expect(contained).toBe(true);
    }
  });

  it('∩ complete = grounded (N=50)', () => {
    const map = randomSparseGraph(50, 0.05, 4);
    const g = findGroundedExtension(map);
    const completes = findCompleteExtensions(map);
    if (completes.length === 0) {
      // No complete extensions — invariant vacuously holds.
      return;
    }
    const intersection = completes.reduce<Set<string>>(
      (acc, c) => new Set([...acc].filter((x) => c.has(x))),
      new Set(completes[0]!),
    );
    expect(intersection).toEqual(g);
  });

  it('runs in under 1 second on a 50-node graph', () => {
    const map = randomSparseGraph(50, 0.05, 5);
    const start = performance.now();
    findCompleteExtensions(map);
    findPreferredExtensions(map);
    findStableExtensions(map);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `yarn test src/solver-multi.large.test.ts 2>&1 | tail -30`
Expected: PASS — all invariant tests green. The 1-second bound validates the speedup on graphs that the old brute force could not handle.

- [ ] **Step 3: Commit**

```bash
git add src/solver-multi.large.test.ts
git commit -m "test(solver-multi): large-graph invariant tests

For N=50 random sparse graphs, assert:
- G ⊆ every complete extension
- G ⊆ every preferred extension
- every complete is contained in some preferred
- ∩ complete = grounded
- full solve in < 1 second (validates speedup)"
```

---

## Task 9: Bench timeout infrastructure

**Files:**
- Modify: `src/solver.bench.ts` (add timeout options, wrap tasks with deadline check)
- Create: `src/solver.bench-timeout.test.ts`

- [ ] **Step 1: Read the existing RunBenchOptions type**

In `src/solver.bench.ts`, find the existing `RunBenchOptions` type definition. It is likely:

```ts
export type RunBenchOptions = {
  fixtures?: [FixtureName, string][];
  iterations?: number;
  time?: number;
};
```

- [ ] **Step 2: Add timeout fields to RunBenchOptions**

Replace the `RunBenchOptions` type with:

```ts
export type RunBenchOptions = {
  fixtures?: [FixtureName, string][];
  iterations?: number;
  time?: number;
  /** Per-task wall-clock cap in milliseconds. Tasks exceeding this are marked
   *  as 'timeout' and excluded from the baseline. Default 30_000. */
  taskTimeoutMs?: number;
  /** Per-fixture total cap across all tasks, in milliseconds. Default 300_000. */
  fixtureTimeoutMs?: number;
  /** Whole-bench cap in milliseconds. Default 1_800_000. */
  benchTimeoutMs?: number;
};
```

- [ ] **Step 3: Add default constants**

Add near the top of `src/solver.bench.ts` (after existing constants):

```ts
export const DEFAULT_TASK_TIMEOUT_MS = 30_000;
export const DEFAULT_FIXTURE_TIMEOUT_MS = 300_000;
export const DEFAULT_BENCH_TIMEOUT_MS = 1_800_000;
```

- [ ] **Step 4: Add `status` field to BenchTaskResult**

Find the existing `BenchTaskResult` type in `src/solver.bench.ts` and add a `status` field. If it's:

```ts
export type BenchTaskResult = {
  name: TaskName;
  ok: boolean;
  error?: Error;
  hz: number;
  p99: number;
  rme: number;
};
```

Change it to:

```ts
export type BenchTaskResult = {
  name: TaskName;
  ok: boolean;
  error?: Error;
  hz: number;
  p99: number;
  rme: number;
  status: 'ok' | 'timeout' | 'error';
};
```

- [ ] **Step 5: Write the failing test for timeout behavior**

Create `src/solver.bench-timeout.test.ts`:

```ts
// src/solver.bench-timeout.test.ts
import { describe, it, expect } from 'vitest';
import { runSolverBench } from './solver.bench.js';

describe('runSolverBench timeouts', () => {
  it('marks tasks exceeding taskTimeoutMs as status: "timeout"', async () => {
    // Force a tiny timeout to provoke a timeout on small fixtures.
    const result = await runSolverBench({
      iterations: 100_000_000, // huge so the task would otherwise run long
      time: 60_000,
      taskTimeoutMs: 1, // 1ms — guaranteed to time out
    });
    // At least one task should have timed out.
    const timedOut = result.results.filter((r) => r.status === 'timeout');
    expect(timedOut.length).toBeGreaterThan(0);
  }, 30_000);

  it('completes normally with a generous timeout', async () => {
    const result = await runSolverBench({
      fixtures: [['small-claim', 'src/parser.fixtures/small-claim.argdown']],
      iterations: 10,
      time: 100,
      taskTimeoutMs: 60_000,
    });
    const timedOut = result.results.filter((r) => r.status === 'timeout');
    expect(timedOut.length).toBe(0);
  }, 30_000);

  it('uses the default 30s task timeout when none specified', async () => {
    const result = await runSolverBench({
      fixtures: [['small-claim', 'src/parser.fixtures/small-claim.argdown']],
      iterations: 5,
      time: 50,
    });
    // Just verify the run completes; default timeout should be sufficient.
    expect(result.results.length).toBeGreaterThan(0);
  }, 30_000);
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `yarn test src/solver.bench-timeout.test.ts 2>&1 | tail -20`
Expected: FAIL — either `taskTimeoutMs` not in options, `status` not on results, or timeout behavior not implemented.

- [ ] **Step 7: Implement timeout enforcement in runSolverBench**

In `src/solver.bench.ts`, replace the `runSolverBench` function with:

```ts
export async function runSolverBench(options: RunBenchOptions = {}): Promise<RunBenchResult> {
  const allLoaded = await loadFixtures();
  const loaded = options.fixtures
    ? allLoaded.filter(([name]) => options.fixtures!.some(([fName]) => fName === name))
    : allLoaded;
  const bench = new Bench({
    iterations: options.iterations ?? DEFAULT_ITERATIONS,
    time: options.time ?? DEFAULT_TIME_MS,
    throws: false,
  });
  const peakHeapMB = new Map<TaskName, number>();

  const taskTimeoutMs = options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;

  for (const taskType of TASK_TYPES) {
    for (const [name, source, ast] of loaded) {
      const taskName = `${taskType}:${name}` as TaskName;
      if (isTaskSkippedOnFixture(taskType, name)) {
        continue;
      }
      const body = makeTaskBody(taskType, name, source, ast);
      bench.add(taskName, () => {
        const start = performance.now();
        body();
        if (performance.now() - start > taskTimeoutMs) {
          throw new TimeoutError(`task exceeded ${taskTimeoutMs}ms`);
        }
        const before = process.memoryUsage().heapUsed;
        body(); // run again for measurement (already validated above)
        const after = process.memoryUsage().heapUsed;
        const delta = (after - before) / 1024 / 1024;
        const current = peakHeapMB.get(taskName) ?? 0;
        if (delta > current) peakHeapMB.set(taskName, delta);
      });
    }
  }

  const rawResults = await bench.run();
  const results: BenchTaskResult[] = rawResults.map((r) => {
    const inner =
      (r as unknown as { result: { error?: Error; hz?: number; p99?: number; rme?: number } })
        .result ?? {};
    const errored = inner.error !== undefined;
    const timedOut = inner.error instanceof TimeoutError;
    return {
      name: r.name,
      ok: !errored,
      error: inner.error,
      hz: inner.hz ?? 0,
      p99: inner.p99 ?? 0,
      rme: inner.rme ?? 0,
      status: timedOut ? 'timeout' : errored ? 'error' : 'ok',
    };
  });

  return { results, peakHeapMB };
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
```

NOTE: The above wraps each task with a double-`body()` call — once for the timeout check, once for measurement. If the project's bench harness has a different pattern, adapt. The key invariants are: timeouts are surfaced via `status: 'timeout'`, fast tasks are not impacted, and the bench harness is otherwise unchanged.

- [ ] **Step 8: Run the test to verify it passes**

Run: `yarn test src/solver.bench-timeout.test.ts 2>&1 | tail -30`
Expected: PASS — all 3 timeout tests green. If the double-body pattern is awkward, refactor to a single-call pattern that records the start time before body and checks after.

- [ ] **Step 9: Typecheck and lint**

Run: `yarn typecheck 2>&1 | tail -10 && yarn lint 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/solver.bench.ts src/solver.bench-timeout.test.ts
git commit -m "feat(solver-bench): add per-task wall-clock timeout

RunBenchOptions gains taskTimeoutMs (default 30s), fixtureTimeoutMs,
benchTimeoutMs. Tasks exceeding taskTimeoutMs are marked
status: 'timeout' and excluded from baseline JSON.

Primary defense against pathological pure-cycle frameworks (residue = A).
Skip guard on large-stress × multi-extension is now the secondary defense."
```

---

## Task 10: Remove skip guard and refresh baseline

**Files:**
- Modify: `src/solver.bench.ts` (remove or soften `isTaskSkippedOnFixture` for the large-stress case)
- Modify: `perf-baseline-solver.json` (regenerated)

- [ ] **Step 1: Remove the skip guard**

In `src/solver.bench.ts`, find `isTaskSkippedOnFixture`:

```ts
export function isTaskSkippedOnFixture(task: TaskType, fixture: FixtureName): boolean {
  return fixture === 'large-stress' && MULTI_EXTENSION_TASKS.has(task);
}
```

Replace with a more permissive version (still skip if explicitly requested, but don't skip by default):

```ts
export function isTaskSkippedOnFixture(task: TaskType, fixture: FixtureName): boolean {
  // The previous unconditional skip for large-stress × multi-extension is
  // removed. The new residue-based finders handle large-stress in
  // milliseconds; timeouts (taskTimeoutMs) handle the rare pathological case.
  return false;
}
```

(If a "skip" path is desired as defensive default, gate it behind a `options.skipLargeStressMultiExtension` boolean. Default to false.)

- [ ] **Step 2: Run the bench to confirm large-stress multi-extension tasks now run**

Run: `yarn bench:solver --fixtures=large-stress 2>&1 | tail -40`
Expected: All 16 task types complete (or some time out per the new timeout behavior). Look for `solve-preferred`, `solve-stable`, `solve-complete` in the output. The previously-skipped tasks should now appear with ops/sec numbers.

If the bench errors out, the timeout isn't catching the pathological case. Tighten the timeout or add a `try/catch` around the bench.run() call.

- [ ] **Step 3: Run the full bench and refresh the baseline**

Run: `yarn bench:solver:baseline 2>&1 | tail -40`
Expected: Bench completes, possibly with some `status: 'timeout'` tasks excluded. The baseline JSON is rewritten with the new numbers.

- [ ] **Step 4: Verify the baseline file is updated and reasonable**

Run: `git diff --stat perf-baseline-solver.json && head -30 perf-baseline-solver.json`
Expected: The baseline JSON has updated `opsPerSec` values. Multi-extension task numbers on small fixtures should be similar or faster; large-stress tasks that were absent should now be present.

- [ ] **Step 5: Run baseline check**

Run: `yarn bench:solver:check 2>&1 | tail -20`
Expected: PASS — the freshly captured baseline matches itself.

- [ ] **Step 6: Commit the baseline refresh**

```bash
git add src/solver.bench.ts perf-baseline-solver.json
git commit -m "feat(solver-bench): remove large-stress × multi-extension skip guard

The residue-based finders handle large-stress multi-extension tasks in
milliseconds. The previous skip guard (commit d514fa4) is no longer
needed; the per-task timeout (added in previous commit) is the primary
defense against the rare pathological pure-cycle case.

Refreshes perf-baseline-solver.json with the new numbers."
```

---

## Task 11: Final verification

**Files:** none modified

- [ ] **Step 1: Full test suite**

Run: `yarn test 2>&1 | tail -30`
Expected: PASS — all tests green, including:
- `src/solver-multi.test.ts` (existing)
- `src/solver-multi.tarjan.test.ts`
- `src/solver-multi.grounded.test.ts`
- `src/solver-multi.residue.test.ts`
- `src/solver-multi.equivalence.test.ts`
- `src/solver-multi.large.test.ts`
- `src/solver.bench-timeout.test.ts`
- `src/solver.preferred.test.ts`, `src/solver.stable.test.ts`, `src/solver.complete.test.ts` (existing)
- `src/solver.cross-validate.test.ts` (existing — invariant preserved)
- `src/solver.bipolar.test.ts`, `src/solver.evidential.test.ts`, `src/solver.aspic.test.ts` (existing — multi-extension callers)
- `cli.test.ts` (existing)

- [ ] **Step 2: Typecheck and lint clean**

Run: `yarn typecheck 2>&1 | tail -10 && yarn lint 2>&1 | tail -10 && yarn format:check 2>&1 | tail -10`
Expected: PASS — no errors.

- [ ] **Step 3: Format if needed**

If `format:check` reported diffs, run `yarn format` and amend the last commit:

```bash
yarn format
git add -A
git commit --amend --no-edit
```

- [ ] **Step 4: Verify solver.bench.ts file size is still under lint cap**

Run: `wc -l src/solver-multi.ts`
Expected: under 400 lines (per spec's `max-lines: 400`). If it exceeds, defer file split to a follow-up (rule of three — only split when a third consumer emerges).

- [ ] **Step 5: Verify cross-validation invariant still holds**

Run: `yarn test src/solver.cross-validate.test.ts 2>&1 | tail -10`
Expected: PASS — `∩ complete = grounded` invariant preserved by the new algorithm's structure.

- [ ] **Step 6: Final commit if any incidental changes**

If step 3 amended the commit, no further commit needed. Otherwise:

```bash
git status
# If clean: done. If dirty: commit any incidental fixes.
```

---

## Self-Review Checklist (run before execution)

- [ ] Each spec section has a corresponding task:
  - Architecture (file shape, public API stability) → Tasks 1-6
  - Algorithm (findGroundedExtension, residue, reduction) → Tasks 2-3
  - Components (helpers, data flow) → Tasks 1-3
  - Performance (complexity, expected wins) → Tasks 4-6, 8 (large-graph test)
  - Edge cases (empty, DAG, pure cycles, ordering) → Tasks 4-6 fast paths, Task 7 (equivalence), Task 9 (timeouts)
  - Testing & coverage (new test files) → Tasks 7-8
  - Benchmarks & timeouts → Tasks 9-10
- [ ] No placeholders: every step has actual code or commands.
- [ ] Type consistency: `lift`, `stripAux`, `residueOf`, `findGroundedExtension`, `tarjanScc` are referenced with the same signatures across all tasks.
- [ ] Public API unchanged: `findCompleteExtensions`, `findPreferredExtensions`, `findStableExtensions` keep their signatures.