# Solver Multi-Extension Optimization — Design

**Date:** 2026-06-27
**Status:** Draft (awaiting user review)
**Cycle:** post `2026-06-26-multi-extension-solver` and `2026-06-26-solver-performance-bench`

## Context

The multi-extension finders (`findPreferredExtensions`, `findStableExtensions`, `findCompleteExtensions` in `src/solver-multi.ts`) currently run textbook Dung brute force over all subsets of the argument set. The complexity is O(2^n × p(n)), and recent workarounds in commits `d514fa4` and `e9d8f57` skip multi-extension tasks on the large-stress fixture and restrict cross-validation fixtures to brute-force-tractable size. The brute force is the bottleneck for any non-trivial argdown document.

The grounded extension is computable in polynomial time via strongly-connected-component (SCC) decomposition (Dung 1995; Modgil 2009 labeling variant). The textbook reduction says: every complete / preferred / stable extension S of F is of the form G ∪ T where G is the grounded extension of F and T is a corresponding extension of the induced sub-framework on the residue R = A \ G. In real argdown documents, |R| ≪ |A| (DAG-like structure with a small cyclic residue), so the O(2^k) search is on the residue, not the full argument set.

This cycle replaces the brute-force enumeration with the SCC-grounded + residue-search approach.

## Goals

- Make the previously-skipped large-stress multi-extension tasks actually run.
- Preserve all existing public API signatures, result types, and CLI behavior.
- Preserve the cross-validation invariant `∩ complete = grounded` by construction.
- Maintain or improve ops/sec on existing small/medium fixtures (no regression).
- Add bench timeouts so pathological cases (residue = A, e.g., pure-cycle frameworks) fail gracefully rather than burning CPU.
- Refresh `perf-baseline-solver.json` with the new numbers.

## Non-Goals

- New Dung semantics, ASPIC+ extensions, or new reductions.
- External solver integration (no SAT/SMT, no Z3 — pure domain-native algorithm).
- Memoization across `find*Extensions` calls.
- Built-in timeouts on the finders themselves (library-level concern, not solver concern).
- Exposing `findGroundedExtension` as a public API (internal helper; expose when a third consumer appears).
- New CLI flags beyond bench timeout overrides.
- Refactoring existing helpers (`attackersOf`, `isAdmissible`, `defenseClosure`, `isStable`, `isClosedUnderDefense`, `stripAux`).

## Architecture

`src/solver-multi.ts` is the single file that changes. Public API stays identical.

**Three new private helpers:**

```ts
// O(|A|+|R|). Returns SCCs in reverse topological order.
function tarjanScc(map: Map<string, string[]>): Scc[]

// O(|A|+|R|). Returns the grounded extension as a Set<string>.
function findGroundedExtension(map: Map<string, string[]>): Set<string>

// Returns { args: string[], subMap: Map<string, string[]> } —
//   the induced sub-framework on A \ grounded.
function residueOf(map: Map<string, string[]>, grounded: Set<string>): {
  args: string[];
  subMap: Map<string, string[]>;
}
```

**`Scc` type:**

```ts
type Scc = { id: number; members: Set<string>; cyclic: boolean };
```

- `cyclic = true` iff the SCC contains any attack cycle (i.e., a path a → b → … → a within the SCC).
- Order: SCCs returned in **topological order of the attack graph** — when processed in array order, every attacker's SCC comes before its attackee's SCC. (Equivalent: classical Tarjan sinks-first completion order. Under this codebase's "attackers-of" map convention — `map.get(arg) = [args that attack arg]` — this means the deepest unattacked attacker comes first. The plan uses this terminology: "attacker SCC first.")

**Updated finders** (signatures unchanged):

```ts
function findPreferredExtensions(map): Set<string>[] {
  const g = findGroundedExtension(map);
  const { args, subMap } = residueOf(map, g);
  // Existing brute-force body, inlined, with isAdmissible + subset-pruning.
  // Search domain is `args` (residue) and predicate is `subMap`.
  const ts = bruteForceMaximalAdmissible(args, subMap);
  return ts.map((t) => stripAux(lift(t, g)));   // lift then stripAux (single strip)
}

function findStableExtensions(map): Set<string>[] {
  const g = findGroundedExtension(map);
  const { args, subMap } = residueOf(map, g);
  const ts = bruteForceStable(args, subMap);
  return ts.map((t) => stripAux(lift(t, g)));
}

function findCompleteExtensions(map): Set<string>[] {
  const g = findGroundedExtension(map);
  const { args, subMap } = residueOf(map, g);
  // T ⊆ R is the residue of a complete extension iff:
  //   (a) T is admissible in F' (subMap), AND
  //   (b) T ∪ G is closed under defense closure in F (full map).
  // The defense check MUST use the full map, not subMap: a residue arg
  // attacked only by grounded args has an empty attackers list in subMap,
  // which would make defenseClosure((T∪G), subMap) erroneously treat it as
  // "vacuously defended" and admit candidates that aren't actually closed.
  const ts = bruteForceComplete(args, subMap);
  return ts.map((t) => stripAux(lift(t, g)));
}

function lift(t: Set<string>, g: Set<string>): Set<string> {
  return new Set([...t, ...g]);
}
```

**Internal extraction (rule of three applied):**

The three brute-force loops are now distinct enough (preferred has subset-pruning, complete has closure check, stable has different condition) that we name them — but they are NOT extracted into a shared helper because the bodies diverge beyond what a parameterized helper could share cleanly. The names are local to `solver-multi.ts`. If a future fourth finder appears that genuinely shares structure, extract then.

**Data flow:**

```
map ──► tarjanScc ──► ordered SCCs
                  └► findGroundedExtension ──► G
                                            └► residueOf ──► (args, subMap)
                                                              └► [bruteForceMaximalAdmissible / bruteForceStable / bruteForceComplete on residue]
                                                                 └► lift(t, g) = T ∪ G
                                                                    └► stripAux ──► Set<string>[]
```

**File-split decision:** keep everything in `solver-multi.ts`. Estimated post-change size ≈ 280–340 lines, comfortably under the 400-line lint cap. **Defer** extraction of `solver-scc.ts` until a third consumer needs Tarjan (rule of three).

**Cross-cutting invariants preserved by construction:**
- ∩ complete = grounded (every returned complete contains G)
- grounded ⊆ complete ⊆ preferred (G is computed and lifted identically across all three)

## Algorithm

### `findGroundedExtension(map)` — O(|A|² × |R|) worst case (argument-level Modgil)

Implemented as `defenseClosure(new Set(), map)` — Modgil's argument-level labeling fixpoint. Each arg a gets label `'in'` if all its attackers are `'out'`, `'out'` if it has an attacker labeled `'in'`, `'undec'` otherwise. Iterates until no labels change.

**Why not the SCC-based variant?** A first-pass SCC-based algorithm (process SCCs topologically; cyclic SCCs → `'undec'`, acyclic SCCs → `'in'` iff every attacker's SCC is `'out'`) is conservative: when a cyclic SCC contains a member counter-attacked by an external `'in'` arg, the SCC algorithm labels the whole SCC `'undec'` and misses the ripple that makes acyclic args (attacked only by that member) reachable from the grounded. For example, in a graph with a 13-node cyclic SCC plus a single-arg SCC attacked only by a member of that cycle, the SCC algorithm omits that arg from the grounded; argument-level Modgil correctly includes it. We therefore use `defenseClosure(new Set(), map)` directly.

The Tarjan SCC machinery is preserved (`tarjanScc`, `Scc` type) for future topological-order optimizations of the residue search, but is not used by `findGroundedExtension` itself.

**Complexity:** Argument-level Modgil is `O(|A|² × |R|)` in the worst case (each of `|A|` passes can change `|A|` labels). For practical argdown documents (sparse graphs with a small cyclic residue), this is fast. The original spec claimed `O(|A|+|R|)` via SCC; that complexity class is achievable only by the broken SCC algorithm above.

### `residueOf(map, G)`

```
R = A \ G
subMap = { a → attackers(a) ∩ R | a ∈ R }
args = [...R.keys()]   // for BigInt mask operations on residue
```

For DAGs (G = A), R = ∅; the finders return `[G]` without entering brute force. For pure cycles (G = ∅), R = A; brute force operates on the full graph (no win, no regression).

### Reduction theorems (textbook Dung 1995; Baroni-Caminada-Giacomin 2018)

- **Complete:** T ⊆ R is the residue of a complete extension of F iff T ∪ G is **admissible in F** AND T ∪ G is closed under defense closure in F. Both checks use the **full** `map`. Filtering attackers via `subMap` would (a) miss internal conflicts between G and T (subMap filters out G, hiding attacks from G to T and from T to G), and (b) miss defense attackers from G.
- **Preferred:** T ⊆ R is the residue of a preferred extension of F iff T ∪ G is admissible in F (full map) AND T is maximal admissible in F' (subMap). Internal conflicts between G and T are invisible to subMap.
- **Stable:** T ⊆ R is the residue of a stable extension of F iff T ∪ G is admissible in F (full map) AND T ∪ G attacks every arg in R \ T in F (full map). An arg in R \ T may be attacked by a grounded arg (in G) as well as by a residue member (in T); only the full map captures both.

The residue search uses the existing `isAdmissible`, `isClosedUnderDefense`, `isStable`, `stripAux`, `lift` helpers against the FULL map for the cross-cutting checks, with `subMap` used only for internal-residue maximality in preferred.

### Tarjan implementation — iterative, not recursive

Recursive Tarjan overflows JS call stacks on deep graphs. The very-large-fixture path this cycle exists to serve is exactly where recursion might fail. Implement Tarjan iteratively with an explicit work stack. Same correctness, no recursion limit.

## Components

### New helpers

**`tarjanScc(map)`** — iterative Tarjan. Returns `Scc[]` in reverse topological order.

State:
- `index = 0` — running DFS index.
- `stack: string[]` — current DFS path.
- `onStack: Set<string>` — args currently on the stack.
- `indices: Map<string, number>` — DFS index per arg.
- `lowlinks: Map<string, number>` — lowlink per arg.
- `sccs: Scc[]` — completed SCCs in completion order.

Per-arg work item pushed onto the work stack: `{ arg, iterator }` so we can resume DFS on a successor without recursion.

**`findGroundedExtension(map)`** — uses `tarjanScc`. Walks SCCs in array order (reverse topological). For each SCC:
- If `cyclic`: label all members `undec`.
- Else: label all members `in` iff for every attacker arg `x`, the SCC containing `x` (in the condensation) is labeled `out`.

Build a `sccOf: Map<string, number>` lookup once to avoid repeated scanning.

**`residueOf(map, grounded)`** — pure data transformation. Build subMap by filtering each entry's attackers to those in R. Return `{ args, subMap }`.

### Updated finders

Each finder:
1. Calls `findGroundedExtension`.
2. Calls `residueOf`.
3. Runs the residue-search loop on `(args, subMap)` using the helpers `bruteForceMaximalAdmissible` / `bruteForceStable` / `bruteForceComplete` (per the Architecture pseudocode).
4. Maps each result T through `lift(t, g) = new Set([...t, ...g])` then `stripAux` once on the lifted set.

**Attacker-lookup cache (constant-factor bonus):**
- Pre-compute `attackersOfCache: Map<string, string[]>` once per call by inverting `map`. The existing helpers (`isAdmissible`, `defenseClosure`, `isStable`) call `attackersOf` repeatedly during residue search; this cache is a 2–5× speedup on the inner loop.
- Cache is per-call (no cross-call memoization); see Non-Goals.

## Performance

### Complexity

| Operation | Current | New |
|-----------|---------|-----|
| `findGroundedExtension` (new) | n/a | O(\|A\| + \|R\|) |
| `findPreferredExtensions` | O(2^n × p(n)) | O(\|A\| + \|R\| + 2^k × p(k)) |
| `findStableExtensions` | O(2^n × p(n)) | O(\|A\| + \|R\| + 2^k × p(k)) |
| `findCompleteExtensions` | O(2^n × p(n)) | O(\|A\| + \|R\| + 2^k × p(k)) |

n = |A|, k = |R| (residue size), p(k) = per-subset admissibility check cost.

### Expected bench impact

| Fixture (estimated k) | Current behavior | New behavior |
|----------------------|-----------------|--------------|
| small-claim (k≈0) | ~644k ops/sec | similar (residue search is one call) |
| small-rule (k≈0) | ~342k ops/sec | similar |
| medium (k≈5–10) | ~1k ops/sec | ~100k+ ops/sec |
| large-stress (k≈0–3) | **SKIPPED** (timeout) | runs in milliseconds |

`perf-baseline-solver.json` will drop multi-extension task numbers by 10–1000× on fixtures where |R| > 0.

### Memory / GC

- **Win:** subset enumeration allocates sets of size k, not n. Less per-iteration allocation.
- **Cost:** one SCC array + G set + residue subMap + attackersOfCache per call. Linear in input size, not exponential.
- **Net:** lower GC pressure on residue-search path; same on small fixtures.

### Pathological case (k = n)

When G = ∅ (pure-cycle frameworks, e.g., odd cycles with no defended member), brute force on residue = brute force on A. No algorithmic win. Acceptable: bench timeouts handle it gracefully; the task is excluded from the baseline JSON rather than crashing the bench.

## Edge Cases

| Case | Behavior |
|------|----------|
| Empty map | `find*Extensions` returns `[]` (verify against current behavior before locking) |
| DAG (G = A) | residue is empty; finders return `[G]` for all three semantics. Fast path. |
| Pure cycles (G = ∅) | residue = A; brute force on residue = brute force on A. Same time-out as today. |
| Self-attack (`a → a`) | SCC = {a}, cyclic. G ∌ a. R ∋ a. Brute force on R handles. |
| Mixed SCC graph | Topological SCC order processes them correctly. |
| Result-order drift | Search order on residue may differ from search order on full graph. Existing tests must use set equality, not list order. |

**Tarjan stack safety:** iterative implementation (explicit work stack). Non-negotiable for the large-fixture path this work serves.

**Cross-validation invariant:** preserved by construction. Every returned complete is G ∪ T, so every returned complete contains G, so ∩ = G. Existing test passes unchanged.

## Testing & Coverage

### Existing tests that must pass unchanged

- `solver.preferred.test.ts`, `solver.stable.test.ts`, `solver.complete.test.ts` — direct equivalence.
- `solver.cross-validate.test.ts` — invariant: ∩ complete = grounded.
- `solver.bench.test.ts` — bench correctness (TASK_TYPES assertions, baseline schema).
- `solver.bipolar.test.ts`, `solver.evidential.test.ts`, `solver.aspic.test.ts` — multi-extension callers in other reductions.
- `solver.multi.test.ts`, `solver.test.ts` — direct callers.
- `cli.test.ts` — CLI integration.

### New tests

| Test | Purpose |
|------|---------|
| `solver.grounded.test.ts` | Unit tests for `findGroundedExtension`: empty, DAG, self-attack, 3-cycle, mixed SCCs, multi-component. Compare against `defenseClosure(∅)` on tractable graphs. |
| `solver.equivalence.test.ts` | Property-based: for random Dung frameworks up to N=20, new algorithm equals old `find*Extensions`. Catches correctness regressions. |
| `solver.large.test.ts` | Larger graphs (N=30–100) where only the new algorithm runs — verify invariants: ∩ complete = grounded, grounded ⊆ complete, G is in every preferred. |
| `solver.tarjan.test.ts` | SCC structure: known graphs → known SCC decompositions. Iterative Tarjan matches recursive reference implementation. |
| `solver.timeout.test.ts` | Feed a known-pathological graph (e.g., 10-arg pure cycle); verify the bench task times out within the cap, doesn't crash, produces `{ status: 'timeout' }`. Verify a fast graph completes well under the cap. |

### Methodology

- **Property-based** for equivalence: generate random Dung frameworks (sparse, ~5% attack density), compare new `findGroundedExtension` against `defenseClosure(∅)`; compare new `find*Extensions` against old on N ≤ 20.
- **Cross-validation invariant** verified on every generated graph.
- **Mutation testing** (Stryker) still applies — mutants must remain killed in the rewritten code.

## Benchmarks & Bench Refresh

### Skip-guard policy (unchanged from before this cycle)

The existing skip guard in `src/solver.bench.ts` (`isTaskSkippedOnFixture`: skip multi-extension tasks on the `large-stress` fixture) is **kept as-is**. The residue-search optimization helps when the residue `R = A \ G` is small (typical for argdown documents where cyclic sections are short), but does not help when `|R|` is large. For the large-stress fixture's random dense attacks, `|R|` is around 40-45 and `2^|R|` is infeasible regardless of any algorithmic optimization. No amount of clever pruning makes `2^40` tractable in seconds.

### What did NOT change

**No timeout infrastructure.** We considered adding per-task wall-clock timeouts but decided against it. The skip guard is sufficient: known-bad combinations are skipped up-front rather than running into timeouts that complicate the bench harness and produce noisy baselines. The trade-off is that a regression in a "skipped" combination would go undetected by the bench. Accepted.

### Baseline refresh

Refresh `perf-baseline-solver.json` once the new finders are verified. The baseline still excludes large-stress × multi-extension tasks (the skip guard is preserved). Solved and bipolar/aspic/evidential variants on small fixtures should improve (residue search), and grounded-only on all fixtures should be measurable.

### Verification gates (before merging)

1. All existing fixture/task combinations within baseline margin (no regression on tractable cases).
2. New solvers (preferred, complete, stable) on small fixtures within baseline margin.
3. Cross-validation invariant (`∩ complete = grounded`) holds for all test fixtures.

### No timeout on the finders themselves

`findPreferredExtensions` / `findStableExtensions` / `findCompleteExtensions` don't have built-in timeouts. Library callers can wrap if they need a guarantee. YAGNI.

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Result-order drift breaks an order-sensitive test | Med | Low | Audit tests for ordering assumptions before locking; switch any found to set-equality |
| Iterative Tarjan differs from recursive Tarjan on a degenerate graph | Low | Med | `solver.tarjan.test.ts` against known SCC decompositions |
| New G / residue search gives different result from old on multi-component SCCs | Low | High | Property-based equivalence (`solver.equivalence.test.ts`) for N ≤ 20 |
| Large-stress fixture still times out (residue = A) | High (for that one fixture) | Low | Skip guard preserved; large-stress × multi-extension tasks not run |
| Perf-baseline regression on small fixtures due to added SCC overhead | Low | Med | Verify small-claim / small-rule within baseline margin; abort if regression > 10% |
| Bench timeout budget too tight, false-positive timeouts | Low | Low | Default 30 s is generous; override flag available |
| Stryker mutants survive in new code | Low | Med | Existing Stryker config covers `solver-multi.ts`; verify mutation score post-change |
| `findGroundedExtension` becomes needed elsewhere, breaking rule-of-three | Low | Low | Extract to its own module then (same logic as parser-util extraction) |

## Implementation Sequencing

1. **`tarjanScc`** (iterative) — independent, easily testable.
2. **`findGroundedExtension`** — depends on `tarjanScc`; test against `defenseClosure(∅)`.
3. **`residueOf`** — depends on `findGroundedExtension`; pure data transformation.
4. **Rewrite `findCompleteExtensions`** first (smallest scope: textbook bijection is straightforward).
5. **Rewrite `findPreferredExtensions`** (maximal-admissible search on residue).
6. **Rewrite `findStableExtensions`** last (residue search + structural pruning).
7. **Bench:** remove skip guards, add timeout infrastructure, refresh `perf-baseline-solver.json`.

## ADR Touchpoints

This cycle aligns with the existing project ADR:

- **Granularity by responsibility** (`solver-multi.ts` keeps one clear purpose).
- **YAGNI but with explicit defer-until-needed path** (perf work lands now because the trigger fired).
- **Rule of three** (no premature extraction of `solver-scc.ts`).
- **AST is the contract** (no public-API surface changes).
- **Baseline files are checked in, not generated** (`perf-baseline-solver.json` refreshed, committed).

The deferred-until-needed cycle for solver perf, set up by the parser perf cycle on 2026-06-22, fires here: multi-extension finders are the next bottleneck after the bench harness was established on 2026-06-26.

## Open Questions

None at design time. Awaiting user review.
