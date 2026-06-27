# Multi-Extension Solver Design

**Date:** 2026-06-26
**Status:** Approved
**Scope:** Add 12 new `solve*` functions to `argdown-2` — Dung's preferred, stable, and complete semantics, each composing with the existing four edge reductions (Dung, bipolar, ASPIC+, evidential). Retires the multi-extension deferral noted in all four prior solver specs (grounded, bipolar, ASPIC+, evidential).

---

## 1. Context and goals

`argdown-2` ships four solvers, **all of which compute Dung's grounded extension** (the unique least fixpoint — single `Label` per node): `solve()` (Method 1, pure-attack), `solveBipolar()` (Method 2, deductive support), `solveAspic()` (Method 3, structured argumentation with `preference:`), `solveEvidential()` (Method 4, necessary support).

The grounded extension is the *least* admissible set. Real argumentation also needs the *maximal* admissible sets (**preferred**), admissible sets whose complement is fully attacked (**stable**), and admissible sets closed under the defense operator (**complete**). These return *multiple* extensions and have a fundamentally different return shape.

All four prior solver specs explicitly defer this cycle:
- ASPIC+ spec §10: "Multi-extension semantics (preferred, stable, complete). Different return shape, separate cycle."
- Bipolar spec §10: same deferral.
- Evidential spec §10: same deferral.

This cycle ships a complete multi-extension layer that composes with all four edge reductions.

**Goals**
- Twelve new public functions in `src/solver.ts` (with three exceptions in `src/solver-aspic.ts`): `solvePreferred`, `solvePreferredBipolar`, `solvePreferredAspic`, `solvePreferredEvidential`; same for `solveStable` and `solveComplete`. Pure, synchronous, no I/O, no mutation of input.
- Three Dung-style multi-extension semantics (preferred, stable, complete) over any of the four existing edge reductions.
- ASPIC+ multi-extension: Dung's preferred/stable/complete fixpoint on the ASPIC+ defeat map (consistent with how `solveAspic` already uses Dung's fixpoint on the defeat graph for grounded).
- New `MultiSolveResult` type with `extensions: Set<string>[]` (each extension is the set of in-arg keys under that extension) and `warnings: string[]`.
- CLI: 12 new `--semantics` whitelist values; default prints all extensions as a numbered list.
- Cross-validation invariant: `solveComplete(doc).extensions.reduce(intersect)` equals the in-set of `solve(doc).labels` (Dung's theorem: grounded = ∩ complete).
- Existing 4 grounded solvers and `SolveResult` type **unchanged**.
- 80%+ Stryker mutation score on the new code.

**Non-goals (deferred)**
- Modgil & Prakken §4.6 full ASPIC+ multi-extension semantics (distinct from Dung on defeat map).
- Refactor of the 4 existing grounded solvers to share the new `buildArgumentGraph` helper.
- SAT-based or SCC-based optimization of the multi-extension algorithms (naïve enumeration is correct and fast enough on existing fixtures).
- Credulous/skeptical consensus labeling as a built-in field.
- Mermaid consensus rendering.
- Runtime performance caps (worst-case exponential; documented, not enforced).
- 13th semantics (semi-stable, ideal, eager, CF2).
- Recursive sub-argument expansion.

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Semantics covered | Preferred, stable, complete — all three |
| Edge reductions covered | Dung, bipolar, ASPIC+, evidential — all four |
| Composition | 12 combinations: `solve<S>(doc)` and `solve<S><R>(doc)` where `S ∈ {Preferred, Stable, Complete}` and `R ∈ {Bipolar, Aspic, Evidential}` (with the default no-suffix using Dung reduction) |
| Output shape | `MultiSolveResult = { extensions: Set<string>[], warnings: string[] }`. Each extension is the set of in-arg keys. |
| Algorithm: preferred | Enumerate subsets (large-to-small), filter admissible, return maximal |
| Algorithm: stable | Enumerate subsets, filter `isStable` (admissible + total attack on complement) |
| Algorithm: complete | Enumerate subsets, filter `isAdmissible` AND closed under defense operator |
| Auxiliary stripping | `sup:` (bipolar) and `nec:` (evidential) keys stripped from each extension before returning. `arg:L:C` (ASPIC+) keys **not** stripped (consumers filter; Mermaid silently skips) |
| Shared layer | New `buildArgumentGraph(doc, reduction): { map, warnings }` covers pass 1 (keying) and pass 2 (relation walk + arrow reduction). Auxiliary stripping is done by the multi-extension algorithms on the output, not by `buildArgumentGraph`. Located in `src/solver-graph.ts`. |
| Multi-extension layer | Three functions in `src/solver-multi.ts`: `findPreferredExtensions(map)`, `findStableExtensions(map)`, `findCompleteExtensions(map)`. Universal over reductions. |
| ASPIC+ exception | `buildAspicDefeatMap(doc): { map, warnings }` extracted from `src/solver-aspic.ts`. Reused by `solveAspic` (refactored to call it) and by 3 new ASPIC+ multi-extension functions. |
| Existing solvers | Untouched. `solveAspic` refactor is contained to one file (extract defeat-derivation helper). Other 3 grounded solvers unchanged. |
| Return type | New `MultiSolveResult` type. Existing `SolveResult` unchanged. `defeats?: Map` field stays optional. |
| CLI | 12 new `--semantics` whitelist values. Default behavior: print all extensions as a numbered list of in-keys. |
| Mermaid | Skipped for multi-extension (no `labels` field to drive coloring). CLI emits a warning and falls back to extension-list output when Mermaid is requested. |
| Tests | Vitest. Per-algorithm tests (`src/solver-multi.test.ts`). Per-semantics × per-reduction tests (3 new files). 12 CLI snapshots. Cross-validation test (grounded = ∩ complete). |
| Bench | 12 new task types added to `src/solver.bench.ts`; `perf-baseline-solver.json` refreshed. |
| Mutation threshold | 80%+ on new code (`src/solver-graph.ts`, `src/solver-multi.ts`) |

---

## 3. Public API change

`src/solver.ts` adds a new type and 9 new exports. `src/solver-aspic.ts` adds 3 new exports and one internal helper extraction.

```ts
// New type
export type MultiSolveResult = {
  extensions: Set<string>[];   // each extension is the set of in-arg keys (aux keys stripped)
  warnings: string[];
};

// New exports (in src/solver.ts)
export function solvePreferred(document: Document): MultiSolveResult;
export function solvePreferredBipolar(document: Document): MultiSolveResult;
export function solvePreferredEvidential(document: Document): MultiSolveResult;

export function solveStable(document: Document): MultiSolveResult;
export function solveStableBipolar(document: Document): MultiSolveResult;
export function solveStableEvidential(document: Document): MultiSolveResult;

export function solveComplete(document: Document): MultiSolveResult;
export function solveCompleteBipolar(document: Document): MultiSolveResult;
export function solveCompleteEvidential(document: Document): MultiSolveResult;

// New exports (in src/solver-aspic.ts)
export function solvePreferredAspic(document: Document): MultiSolveResult;
export function solveStableAspic(document: Document): MultiSolveResult;
export function solveCompleteAspic(document: Document): MultiSolveResult;
```

**Backward compatibility:** `SolveResult`, `Label`, and the four existing `solve*` exports are unchanged. `MultiSolveResult` is a separate type. `defeats?: Map<...>` from `solveAspic` stays as it is.

**Re-exports:** all 12 new functions re-exported from `src/index.ts`.

---

## 4. AST change

None. The grammar is frozen. All new solvers operate on the existing `Document` AST.

---

## 5. Algorithm

### Shared layer: `buildArgumentGraph(doc, reduction)` (`src/solver-graph.ts`)

For `reduction ∈ {'dung', 'bipolar', 'evidential'}`:
1. **Pass 1 (keying)** — walk `document.elements`. For each `FactStatement`, key by `factKey(el)`. For each `Argument`, key by `argKey(el)`. Populate `labels: Map<string, Label>` (every node starts `'undec'`).
2. **Pass 2 (relation walk + arrow reduction)** — walk `RelationStatement`s. For each `Relation`:
   - `'dung'`: only `--x` becomes an attack; everything else dropped with per-type warning (matches `solve`).
   - `'bipolar'`: `-->` adds an auxiliary `sup:from->to` with attacks `to → sup`, `sup → from` (Cayrol/Lagasquie-Schiex 2005 §3.2, deductive support). `<->` adds two such auxiliaries. All other arrows collapse to attack.
   - `'evidential'`: `-->` adds an auxiliary `nec:from->to` with attacks `from → nec`, `nec → to` (CLS 2005 §3.3, necessary support). `<->` adds two such auxiliaries. All other arrows collapse to attack.
   - Dangling edges → warning, skip.
   - Duplicate IDs → warning.
3. **Return** `{ map: Map<string, string[]>, warnings: string[] }`. (`map` is target → attackers; same shape `label()` consumes.)

For `reduction === 'aspic'`:
- Delegates to `buildAspicDefeatMap(doc)` extracted from `src/solver-aspic.ts`.
- That helper runs the 6-pass ASPIC+ algorithm described in `docs/snowball/specs/2026-06-26-aspic-solver-design.md` §5, returning the defeat map (target → attackers) and warnings.
- Existing `solveAspic` is refactored to call `buildAspicDefeatMap(doc)` then `labelWithWeakAttacks(defeatMap)` — same observable behavior, no semantic change.

**Auxiliary stripping** (removing `sup:` and `nec:` keys from each extension's `Set<string>`) is done by the multi-extension algorithms on the output, not by `buildArgumentGraph`. ASPIC+'s `arg:L:C` keys are NOT stripped (consumers filter; Mermaid silently skips them).

### Multi-extension algorithms (`src/solver-multi.ts`)

#### Auxiliary operators

```ts
function attackersOf(map: Map<string, string[]>, arg: string): string[];
function isConflictFree(set: Set<string>, map: Map<string, string[]>): boolean;
function isAdmissible(set: Set<string>, map: Map<string, string[]>): boolean;
function defends(map: Map<string, string[]>, attacker: string, target: string): boolean;
function isClosedUnderDefense(set: Set<string>, map: Map<string, string[]>): boolean;
function isStable(set: Set<string>, map: Map<string, string[]>): boolean;
function defenseClosure(set: Set<string>, map: Map<string, string[]>): Set<string>;
function stripAux(set: Set<string>): Set<string>;  // removes sup:* and nec:* keys
```

`defends(map, c, a)` = for every attacker `b` of `a`, there exists some `c'` such that `c'` attacks `b` (where `c'` is in the team defending `a`). Since Dung-style defense is a property of the defender (the *team*), not a single node, this helper is invoked once per candidate team during enumeration rather than as a primitive. The implementation iterates attackers of `a` and checks whether the candidate team attacks each.

#### `findPreferredExtensions(map)`

```
args := all keys in map
results := []
for S := all subsets of args, iterated large-to-small (descending by |S|):
  if isAdmissible(S, map):
    results.push(S)
    // all subsets of S are automatically non-maximal; skip them
return results.map(stripAux)
```

**Iteration order:** descending by subset size. Once we find an admissible S, all subsets of S are provably non-maximal (S is admissible and a proper superset, so S is more admissible). This bounds the inner work; the outer enumeration is still exponential in the worst case.

#### `findStableExtensions(map)`

```
results := []
for S := all subsets of args:
  if isStable(S, map):
    results.push(S)
return results.map(stripAux)
```

**Empty result is valid.** A graph with an odd-length cycle has no stable extension (Dung's theorem). The function returns `[]` for such inputs.

#### `findCompleteExtensions(map)`

```
results := []
for S := all subsets of args:
  closure := defenseClosure(S, map)
  if closure === S and isAdmissible(S, map):
    results.push(S)
return results.map(stripAux)
```

**Sanity invariant:** the smallest complete extension equals the grounded extension. So `findCompleteExtensions(map).reduce(intersect)` equals the in-set of `label(map)`. Verified by test.

### Aux-stripping

After each algorithm produces its `Set<string>[]`, each extension is post-processed:
- Drop keys whose first 4 chars are `'sup:'` (bipolar aux).
- Drop keys whose first 4 chars are `'nec:'` (evidential aux).
- Keep `arg:L:C` keys (ASPIC+ argument keys; consumers filter; Mermaid silently skips).

### Complexity (documented, not enforced)

- **Preferred:** worst-case O(3^(N/3)) subsets to consider (Lonc & Truszczyński upper bound on number of preferred extensions). For N=20 nodes, theoretical worst-case is ~10^9 — but real inputs are far below this. Existing 7 parser fixtures all run sub-second.
- **Stable:** worst-case O(2^N · N).
- **Complete:** worst-case O(2^N · N).

No runtime cap. Document in README. Defer caps to a future cycle if users hit pathological inputs.

---

## 6. CLI integration

`src/cli.ts` extends the `--semantics` whitelist from 4 values to 16:

```
--semantics=dung                    → solve(doc)
--semantics=bipolar                 → solveBipolar(doc)
--semantics=aspic                   → solveAspic(doc)
--semantics=evidential              → solveEvidential(doc)
--semantics=preferred               → solvePreferred(doc)            NEW
--semantics=preferred-bipolar       → solvePreferredBipolar(doc)     NEW
--semantics=preferred-aspic         → solvePreferredAspic(doc)       NEW
--semantics=preferred-evidential    → solvePreferredEvidential(doc)  NEW
--semantics=stable                  → solveStable(doc)               NEW
--semantics=stable-bipolar          → solveStableBipolar(doc)        NEW
--semantics=stable-aspic            → solveStableAspic(doc)          NEW
--semantics=stable-evidential       → solveStableEvidential(doc)     NEW
--semantics=complete                → solveComplete(doc)             NEW
--semantics=complete-bipolar        → solveCompleteBipolar(doc)      NEW
--semantics=complete-aspic          → solveCompleteAspic(doc)        NEW
--semantics=complete-evidential     → solveCompleteEvidential(doc)   NEW
```

Any other value → CLI error listing the 16 valid values. `--semantics=<x>` without `--solve` → existing error: `--semantics requires --solve`.

**Output format (multi-extension):** print all extensions to stdout as a numbered list of in-keys (sorted lexicographically for deterministic output):

```
Extension 1: A, B, D
Extension 2: A, C, E
```

Empty extension (`Extension 1: (empty set)`) is allowed when the stable semantics yields an empty set (odd cycles).

**Warnings:** emitted to stderr, same posture as the existing solvers.

**Mermaid fallback:** if Mermaid output is requested with a multi-extension `--semantics`, the CLI prints a stderr warning and falls back to the extension list (see §7).

---

## 7. Mermaid integration

No change to `src/mermaid.ts`.

The renderer reads `labels: Map<string, Label>` and applies classDefs to keys matching rendered node IDs. Multi-extension output has no `labels` field — it has `extensions: Set<string>[]`.

**CLI behavior when Mermaid output is requested with a multi-extension `--semantics`:** the CLI prints a warning to stderr (`multi-extension semantics do not produce a labels map; falling back to extension list`) and writes the extension list to stdout instead of Mermaid. The 4 existing grounded solvers retain their full Mermaid support.

---

## 8. Testing strategy

### `src/solver-multi.test.ts` (NEW, ~300 lines)

Tests for the three algorithms independent of any reduction. Cases:

| Case | Setup | Expected |
|---|---|---|
| Empty graph | `map = {}` | 0 extensions for all three semantics |
| Single source | `map = {A: []}` | 1 extension `{A}` for all three |
| Single attacker | `map = {A: [B]}` | 1 extension `{B}` for all three (A is attacked) |
| 2-cycle | `A → B, B → A` | preferred: 2 (`{A}`, `{B}`); stable: 0; complete: 2 (`{A}`, `{B}`) |
| 3-cycle | `A → B → C → A` | preferred: 3 (`{A}`, `{B}`, `{C}`); stable: 0; complete: 4 (∅, `{A}`, `{B}`, `{C}`) |
| Self-attack | `A → A` | preferred: 0; stable: 0; complete: 1 (∅) |
| Unattached source `A` | map `{A: []}` | preferred: 1 (`{A}`); stable: 1 (`{A}`); complete: 2 (∅, `{A}`) |

**Convention:** ∅ is always included in `findCompleteExtensions` results when it is admissible (which is always) and closed under defense closure (which is always true — defenseClosure(∅) = ∅). Consumers who want non-empty extensions can filter them out client-side. This convention is what makes the cross-validation invariant `∩ complete = grounded` work for empty-grounded cases (3-cycle, self-attack, etc.).
| Empty stable (odd cycle) | `A → B → A` | stable: `[]` (valid empty result) |
| Cross-validation | `findComplete(map).reduce(intersect) === label(map).filter('in')` | invariants hold for all 7 parser fixtures |
| Strip aux | bipolar input, `sup:` keys present in map | output extensions contain no `sup:` keys |
| Strip aux | evidential input, `nec:` keys present | output extensions contain no `nec:` keys |

### Per-semantics × per-reduction tests (NEW, ~150 lines each)

`src/solver.preferred.test.ts`, `src/solver.stable.test.ts`, `src/solver.complete.test.ts`.

Each file covers one semantics across all four reductions. Most cases are shared (since all three algorithms compose with any reduction); differences appear only in arrow-reduction specifics.

**Headline tests (12 — one per algorithm × reduction):**

- `solvePreferred`: 3-cycle `[#A] --x [#B]. [#B] --x [#C]. [#C] --x [#A].` → 3 preferred extensions `{A}, {B}, {C}`.
- `solveStable`: same 3-cycle → 0 stable extensions (odd cycle).
- `solveComplete`: same 3-cycle → 4 complete extensions `∅, {A}, {B}, {C}` (∅ included per the convention above).
- `solvePreferredBipolar`: `[#A] --> [#B]. [#C] --x [#A].` → 1 preferred extension `{B, C}` (aux stripped).
- `solveStableBipolar`: same input → 1 stable extension `{B, C}` (aux stripped; C is unattacked source, B is supported by C via bipolar — both IN).
- `solveCompleteBipolar`: same input → 1 complete extension `{B, C}`.
- `solvePreferredAspic`: `[#A] --x [#B].` with both `preference: 0` → 0 preferred (no defeats due to tied preference).
- `solveStableAspic`: same input → 0 stable.
- `solveCompleteAspic`: same input → 0 complete (no extensions; nothing admissible).
- `solvePreferredEvidential`: `[#A] --> [#B]. [#C] --x [#A].` → 1 preferred `{B, C}`.
- `solveStableEvidential`: same → 1 stable `{B, C}`.
- `solveCompleteEvidential`: same → 1 complete `{B, C}`.

**ASPIC+ exception tests:** verify that the existing ASPIC+ defeat-derivation logic is correctly reused via the extracted `buildAspicDefeatMap` helper. Existing `solveAspic` test cases should pass unchanged.

### CLI tests (`src/cli.test.ts`)

12 new snapshots (one per multi-extension `--semantics` value). Each snapshot covers:
- One example input (a 3-node graph with mutual attacks).
- Expected stdout: numbered list of extensions.
- Expected stderr: empty (or contains only expected warnings).

Snapshots use deterministic lex-sorted output.

### Cross-validation test (NEW)

One Vitest test that runs all 7 existing parser fixtures through both `solve(doc)` (grounded) and `solveComplete(doc)` (multi-extension), then asserts:

```ts
const groundedIn = new Set([...solve(doc).labels.entries()]
  .filter(([_, l]) => l === 'in').map(([k]) => k));
const completeIntersect = solveComplete(doc).extensions
  .reduce((acc, ext) => new Set([...acc].filter(k => ext.has(k))), null);
// ... assert groundedIn === completeIntersect
```

This locks in Dung's theorem (grounded = ∩ complete) as a tested invariant.

### Stryker (`stryker.config.mjs`)

≥80% mutation score on new code. Mutations to catch:
- `isAdmissible`: drop conflict-free check (accepts sets with internal attacks).
- `defends`: invert quantifier (defends nothing or everything).
- `findPreferredExtensions`: drop maximality check (returns all admissible, not just maximal).
- `findStableExtensions`: drop total-attack check (returns preferred, not stable).
- `findCompleteExtensions`: drop defense-closure check (returns preferred, not complete).
- `buildArgumentGraph`: route all reductions to one branch (always Dung).
- Strip predicate: off-by-one (`'sup'` instead of `'sup:'`) or wrong prefix (`'nec:'` instead of `'sup:'`).

### Bench (`src/solver.bench.ts`)

12 new task types: `solve-preferred`, `solve-preferred-bipolar`, `solve-preferred-aspic`, `solve-preferred-evidential`, same for stable and complete. `perf-baseline-solver.json` refreshes with the 12 new entries appended.

---

## 9. Acceptance criteria

1. Twelve new functions exported: `solvePreferred`, `solvePreferredBipolar`, `solvePreferredAspic`, `solvePreferredEvidential`, `solveStable`, `solveStableBipolar`, `solveStableAspic`, `solveStableEvidential`, `solveComplete`, `solveCompleteBipolar`, `solveCompleteAspic`, `solveCompleteEvidential`. All re-exported from `src/index.ts`.
2. `MultiSolveResult` type exported.
3. `buildAspicDefeatMap` extracted from `solver-aspic.ts` and reused by `solveAspic` + 3 new ASPIC+ multi-extension functions.
4. CLI accepts 12 new `--semantics` values; invalid values error with the 16-value whitelist.
5. Cross-validation test passes for all 7 parser fixtures: `solve(doc).in === solveComplete(doc).extensions.reduce(intersect)`.
6. `yarn lint && yarn typecheck && yarn test` green; existing 4 grounded solver tests untouched and passing.
7. Stryker mutation score ≥80% on `src/solver-graph.ts` and `src/solver-multi.ts`.
8. Mermaid renderer (`src/mermaid.ts`) unchanged; CLI emits a warning when Mermaid is requested with a multi-extension `--semantics` and falls back to extension list.
9. `perf-baseline-solver.json` refreshed with the 12 new task types.
10. README documents: the 12 new `--semantics` flags, the cross-validation invariant, worst-case complexity for each semantics, and the auxiliary-stripping rule (which keys are filtered).

---

## 10. Skipped (YAGNI)

- Modgil & Prakken §4.6 full ASPIC+ multi-extension semantics (different from Dung on defeat map; subtle cases around preference ordering).
- Refactor of the 4 existing grounded solvers to share `buildArgumentGraph`. (After this lands, there are 16 consumers — the refactor becomes much more attractive. Defer to a future cycle if pursued.)
- SAT-based preferred algorithm (Niemelä) or SCC-based decomposition.
- Credulous/skeptical consensus labeling as a built-in field on `MultiSolveResult`.
- Mermaid consensus rendering.
- Runtime performance caps.
- 13th semantics (semi-stable, ideal, eager, CF2).
- Recursive sub-argument expansion.
- Cross-reduction equivalence tests (e.g., bipolar preferred on a pure-attack graph should match Dung preferred; would be a strong invariant test but expands scope).
- Sub-extension reasoning utilities (e.g., "which extensions contain argument X?").
- `MultiSolveResult` extension to expose internal aux maps for debugging.
- CLI flag for limiting the number of extensions printed (e.g., `--max-extensions=N`).
- Stream/lazy output for graphs with very many extensions.

---

## 11. Future cycles (explicit, not v1)

- **Grounded-solver refactor:** once the multi-extension layer is in place, the 4 grounded solvers' pass 1/2/4 logic becomes 16× duplicated (4 grounded + 12 multi-extension). Extracting it into `buildArgumentGraph` becomes the obvious next refactor. Future cycle.
- **Modgil & Prakken §4.6 ASPIC+ multi-extension:** distinct from Dung on defeat map. Subtle cases around preferences and rebut/undermine ordering. Future cycle if user demand emerges.
- **Optimized algorithms:** SAT-based preferred (Niemelä 1999), SCC-based decomposition for stable/complete. Future cycle if benchmarks show naïve enumeration is too slow on realistic inputs.
- **Consensus labeling:** add `consensus: Map<argKey, Label>` to `MultiSolveResult` ('in' = in every extension, 'out' = in no extension, 'undec' = dependent). Future cycle if a consumer asks.
- **Mermaid consensus rendering:** color nodes by consensus label when multi-extension `--semantics` is selected. Future cycle.
- **Semi-stable, ideal, eager, CF2 semantics:** 13th–16th semantics if needed.
- **Recursive sub-argument expansion** for ASPIC+ multi-extension.
- **Performance caps:** warn or refuse when N exceeds a threshold; set threshold empirically via bench.
- **CLI flag for limiting extensions printed.**

---

## 12. References

- Dung, P. M. (1995). *On the acceptability of arguments and its fundamental role in nonmonotonic reasoning, logic programming and n-person games.* Artificial Intelligence, 77(2), 321-357. §3 (preferred/stable/complete semantics).
- Cayrol, C., & Lagasquie-Schiex, M.-C. (2005). *On the acceptability of arguments in bipolar argumentation frameworks.* Lecture Notes in Computer Science, vol. 3571. §3.2 (deductive support), §3.3 (necessary support).
- Modgil, S., & Prakken, H. (2014). *The ASPIC+ framework for structured argumentation: a tutorial.* Argument & Computation, 5(1), 31-62. §4 (standard dispute derivation). Note: §4.6 (full ASPIC+ multi-extension) is deferred.
- Lonc, Z., & Truszczyński, M. (2015). *On the number of preferred extensions.* Ann. Math. Artif. Intell. — upper bound O(3^(N/3)) on number of preferred extensions.
- Niemelä, I. (1999). *Implementing circumscription using a SAT solver.* (SAT-based approach referenced as future optimization.)
- Existing `docs/snowball/specs/2026-06-25-grounded-dung-solver-design.md` — Method 1 baseline.
- Existing `docs/snowball/specs/2026-06-25-bipolar-reduction-solver-design.md` — Method 2 baseline; §10 defers this cycle.
- Existing `docs/snowball/specs/2026-06-26-aspic-solver-design.md` — Method 3 baseline; §10 defers this cycle.
- Existing `docs/snowball/specs/2026-06-26-evidential-support-solver-design.md` — Method 4 baseline; §10 defers this cycle.
- ADR (project principles): `.codebase-memory/adr.md` — `SolveResult` shape, YAGNI discipline, rule of three, conservative TS.