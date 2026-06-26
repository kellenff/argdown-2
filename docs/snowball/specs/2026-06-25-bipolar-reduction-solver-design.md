# Bipolar Reduction Solver Design

**Date:** 2026-06-25
**Status:** Approved (pending user review of this written spec)
**Scope:** Add `solveBipolar()` to `argdown-2` — Dung's grounded extension on a Cayrol & Lagasquie-Schiex **deductive-support** reduction. Sibling to the just-shipped `solve()`. Method 2 of the Method 1/2/3 ladder; Method 3 (ASPIC+) remains a future cycle.

---

## 1. Context and goals

The grounded Dung solver (Method 1) treats `-->` as a dropped edge. Real argument maps need support — `[#A] --> [#B]` should mean "A supports B" and the labels should reflect that. This cycle adds a bipolar reduction: `-->` is a first-class support edge, and the standard deductive-support translation reduces the BAF to a Dung AF. The existing grounded-labeling fixpoint runs on the reduced graph unchanged.

**Goals**
- One new public function `solveBipolar(document)` next to `solve()`. Pure, synchronous.
- Deductive support reduction: each `A --> B` introduces an internal auxiliary `s` with attacks `B → s → A`. Auxiliaries never surface in the `labels` map.
- `<->` (equivalence) maps to **two** support edges (two auxiliaries).
- All other arrows (`--x`, `-.->`, `-.-`, `~>`, `?>`) collapse to attack, same as Method 1.
- CLI flag `--semantics=bipolar`; default `--solve` stays Method 1.
- `renderMermaid(document, labels)` works unchanged — same `Map<string, Label>` shape.
- 80%+ Stryker mutation score on the new code.

**Non-goals** (still future cycles)
- Evidential support (separate algorithm, different fixpoint — Cayrol & Lagasquie-Schiex 2005 §3.3).
- ASPIC+ (Method 3).
- Surfacing auxiliaries in the labels map.
- Multi-extension semantics (preferred, stable, complete).
- Solver perf bench.

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Reduction | Deductive support (Cayrol & Lagasquie-Schiex 2005, §3.2) |
| Construction | `A --> B` → auxiliary `s_{A→B}`, attacks `B → s` and `s → A` |
| API | Sibling `solveBipolar(document)` next to `solve()` in `src/solver.ts` |
| Return type | Unified: `{ labels, warnings }`. `solve()` loses `dropped` field. |
| `dropped` field | Removed. Replaced by a `warnings[]` summary when non-attack edges seen in `solve()`. |
| Auxiliaries | Internal only — never appear in `labels` |
| `<->` | Two support edges (two auxiliaries) |
| Other arrows | `--x` / `-.->` / `-.-` / `~>` / `?>` → all attack (same as Method 1) |
| CLI | `--semantics=bipolar` flag. `--solve` (no flag) or `--solve --semantics=dung` is Method 1. `--solve --semantics=bipolar` is Method 2. Any other `--semantics=<x>` is a CLI error. |
| Labeling | Reuse existing `label()` fixpoint. Augment the graph; auxiliaries get labels internally, then stripped from output. |
| Mermaid | Unchanged. `labels` flows through the same renderer. |
| Tests | Unit over each arrow kind, equivalence, mutual support, cycles, dangling supports |
| Mutation threshold | 80%+ (project standard) |

---

## 3. Architecture

`src/solver.ts` exports two functions and one unified type:

```ts
export type Label = 'in' | 'out' | 'undec';
export type SolveResult = { labels: Map<string, Label>; warnings: string[] };
export function solve(document: Document): SolveResult;
export function solveBipolar(document: Document): SolveResult;
```

`src/solver.ts` imports types only from `ast.js`. No new runtime deps. Stays under the 400-line lint cap; if it grows past it, split per the existing pattern (the parser and stringifier did this).

```
index.ts ──▶ solver.ts ──▶ ast.ts (types only)
   │            │
   │            ├──▶ mermaid.ts (consumes labels — unchanged)
   │            └──▶ cli.ts (--semantics=bipolar dispatch)
```

---

## 4. Public API change (breaking)

`solve()`'s return shape loses `dropped`:

```ts
// Before
export type SolveResult = { labels; dropped; warnings };

// After (this cycle)
export type SolveResult = { labels; warnings };
```

**Reason:** `dropped` counted arrows the *Dung* solver ignored. Bipolar has nothing to drop. Two result types (`SolveResult` with `dropped`, `BipolarSolveResult` without) is more code than one type. Unify on the smaller shape; the same info is in `warnings` as a summary string.

**CLI effect:** the `--solve` summary line `Dropped: 0 support, 0 undercut, ...` is replaced by a stderr warning: `` solve(): dropped N non-attack edge(s): support=N, undercut=N, ... ``. Existing `cli.test.ts` snapshot updates to drop the "Dropped:" stdout line.

**`renderMermaid(document, labels)`** — unchanged signature, unchanged behavior. `labels` shape is identical between both solvers.

**README** — update the "Quick start" example and add a "Solver API" note listing both functions.

---

## 5. Algorithm

### 5.1 Build attack graph (shared by both solvers)

Two passes, same as Method 1 §5:

1. **Node keying** — facts by `FactRef` (identifier or `title:` text), arguments by `arg:L:C`.
2. **Edge extraction** — per `Relation`:
   - `--x`, `-.->`, `-.-`, `~>`, `?>` → `attacks.get(toKey).push(fromKey)`
   - `-->` and `<->` handled differently per solver (see §5.2 / §5.3)
3. **Dangling edges** → warning (`dangling <kind> edge: <fromKey> --> <toKey>`)

### 5.2 `solve()` (Method 1, unchanged behavior, new return shape)

For `-->` and `<->`:
- Increment a local counter for the summary warning.
- Do not add to `attacks`.
- After all edges: if any counter > 0, push one summary warning string. The `dropped` object is gone — just the warning.

### 5.3 `solveBipolar()` (Method 2, new)

For each `-->` edge `A --> B`:
1. Compute `auxKey = 'sup:' + fromKey + '->' + toKey`.
2. **B → s**: push `toKey` (= B) into `attacks.get(auxKey)`. Initialize `attacks.set(auxKey, [])` if absent.
3. **s → A**: push `auxKey` into `attacks.get(fromKey)`.

For each `<->` edge `A <-> B`:
- Process as two `-->` edges: `A --> B` and `B --> A`.
- Two auxiliaries, two `B → s → A` chains.

Pseudocode:

```ts
function addSupportEdge(
  attacks: Map<string, string[]>,
  fromKey: string,
  toKey: string,
): void {
  const auxKey = `sup:${fromKey}->${toKey}`;
  // B → s: s is attacked by toKey
  const sAttackers = attacks.get(auxKey) ?? [];
  sAttackers.push(toKey);
  attacks.set(auxKey, sAttackers);
  // s → A: fromKey is attacked by s
  const aAttackers = attacks.get(fromKey) ?? [];
  aAttackers.push(auxKey);
  attacks.set(fromKey, aAttackers);
}
```

### 5.4 Why this construction

**Claim:** with `B → s → A` as the chain, if `A` is `IN` then `B` is `IN`.

*Proof sketch.* Suppose `A` is `IN`. Suppose `B` is `OUT`. Then `s` is `IN` (its only attacker is `B`, which is `OUT`). `s` attacks `A`. In this setup `s` is the only attacker of `A`, so all of `A`'s attackers are `IN`, hence `A` is `OUT` (fixpoint rule: all attackers `IN` ⇒ `OUT`). Contradiction. So `B` is `IN`. ∎

Equivalently: `B` `OUT` → `A` `OUT`. Contrapositive: `A` `IN` → `B` `IN`. The chain propagates support from A through to B's acceptance.

**Comparison to evidential support (deferred):** evidential would be `A → s → B`, propagating "B IN requires A IN" — opposite direction. Different algorithm; future cycle.

### 5.5 Cycle behavior

The grounded extension handles cycles by reporting `undec` for nodes the fixpoint can't resolve. With auxiliaries, mutual support (`A --> B`, `B --> A`) creates a 4-node cycle through the two auxiliaries; the fixpoint labels all four `undec`. Correct for grounded semantics; preferred/stable are future cycles.

### 5.6 Self-supports

`[#A] --> [#A]` (a node supporting itself): the construction creates `s` with attacks `A → s → A`, a self-loop through `s`. Standard fixpoint labels both `A` and `s` `undec`. No special warning — match Method 1's treatment of self-attacks.

### 5.7 Label stripping

After the fixpoint runs on the augmented graph, walk the labels map and remove any key starting with `'sup:'`. The auxiliaries are gone from the output.

```ts
for (const key of [...result.keys()]) {
  if (key.startsWith('sup:')) result.delete(key);
}
```

---

## 6. CLI integration

`src/cli.ts` accepts `--semantics=bipolar`:

```
npx argdown-mermaid --solve --semantics=bipolar example.argdown
```

- `--solve` alone (default) → Method 1.
- `--solve --semantics=bipolar` → Method 2.
- `--semantics=bipolar` without `--solve` → CLI error: `--semantics requires --solve`.
- `--semantics=dung` (explicit) → Method 1. Same as no flag.
- Any other `--semantics=<x>` → CLI error listing valid values.

Output format: same IN/OUT/UNDEC summary table. No `Dropped:` line. `warnings[]` go to stderr as before.

Update `src/cli.test.ts` snapshot to drop the `Dropped:` line; add a new snapshot for `--solve --semantics=bipolar`.

---

## 7. Mermaid integration

No change to `src/mermaid.ts`. The renderer reads `labels: Map<string, Label>` and applies classDefs to keys matching rendered node IDs. Auxiliaries (keyed `sup:...`) don't match any rendered ID and are silently skipped — same defensive posture as the existing `arg:L:C` argument keys.

A worked example for `src/mermaid.test.ts` snapshot:

Source:
```argdown
[#A] The sky is blue.
[#B] Therefore it is daytime.
[#A] --> [#B].
```

After `solveBipolar(parse(src).ast)`: `A=in`, `B=in`. Mermaid shows both nodes colored as winners.

---

## 8. Testing strategy

`src/solver.test.ts` keeps existing Method 1 cases (with the `dropped` field removed from assertions). New file `src/solver.bipolar.test.ts` for the new function. `src/cli.test.ts` gets the snapshot update and a new bipolar snapshot.

### 8.1 Method 1 test updates (existing file)

For each existing test that asserted `result.dropped.support === N`, change to assert `result.warnings.some(w => w.includes('dropped N non-attack'))`. Drop the `dropped` field from the destructured result.

### 8.2 Method 2 tests (new file)

| Case | Setup | Expected |
|---|---|---|
| Single support | `A --> B` | A=`in`, B=`in` |
| Support + counter-attack on supporter | `A --> B`, `X --x A` | X=`in`, A=`in`, B=`in` (auxiliary is OUT because B is IN, so the fixpoint's `someOut → IN` rule promotes A — diverges from Method 1 where A=`out`, B=`in`) |
| Support + attack on supported | `A --> B`, `X --x B` | X=`in`, A=`out`, B=`out` (B out propagates to A via support chain — diverges from Method 1 where A=`in`) |
| Mutual support | `A --> B`, `B --> A` | A=`undec`, B=`undec` |
| Self-support | `A --> A` | A=`undec` |
| Equivalence | `A <-> B` | A=`undec`, B=`undec` (same as mutual support) |
| Equivalence + attack | `A <-> B`, `X --x A` | X propagates; verify direction |
| Dangling support | `A --> NONEXISTENT` | Warning emitted; A=`in` |
| Dangling equivalence | `A <-> NONEXISTENT` | Warning emitted |
| All arrow kinds | mix of `--x`, `-->`, `-.->`, `-.-`, `~>`, `?>`, `<->` | No "dropped" warnings; non-support arrows behave as attack |
| Method 1 vs Method 2 sanity | `A --> B` — same doc, both solvers | Method 1: B=`in` (unattacked); Method 2: A=`in`, B=`in` via support |
| Argument support | `A --> ([#B]) -> [#C]` | Outer argument (`arg:2:1`) and its premise `B` are IN. The relation's argument-as-endpoint on line 3 is a separate AST node (`arg:3:10`) not in `argByNode`, so it emits a `dangling support edge` warning and the auxiliary chain is not built. |
| Equivalence not equal to two `--x` | `A --> B`, `A <-> C` | B labeled via support chain; C labeled via two support chains (different fixpoint outcome than if they were two attacks) |
| Self-attack preserved | `A --x A` plus `A --> B` | A=`out`; B's status depends on whether B is unattacked (then `in` via support from out-supporter — actually now `out` because the supporter is out) |

Each test builds a `Document` via the public `parse()` function and asserts on `solveBipolar(parse(src).ast)`.

**Stryker** enforces 80% on new code; mutations like swapped attack direction in the `B → s → A` construction, missing `sup:` prefix, wrong strip-after-fixpoint predicate, and `-->` accidentally going through Method 1's drop-counter must fail.

---

## 9. Acceptance criteria

1. `solveBipolar` exported from `src/index.ts`.
2. `SolveResult` type unified to `{ labels, warnings }`. `dropped` removed.
3. `yarn lint && yarn typecheck && yarn test` green; new cases pass.
4. Stryker mutation score ≥ 80% on the new code.
5. CLI: `--solve` (default), `--solve --semantics=dung` (explicit), `--solve --semantics=bipolar` all work. Invalid `--semantics=<x>` errors clearly.
6. `renderMermaid(document, solveBipolar(doc).labels)` works unchanged.
7. README updated: example shows `--semantics=bipolar`; "Solver API" lists both functions.
8. All existing Method 1 tests updated to drop `dropped` field assertions.

---

## 10. Skipped (YAGNI)

- Two result types instead of one unified `SolveResult` — the unified shape wins.
- Auxiliary surfacing in the labels map — internal-only, as chosen.
- Evidential support — separate algorithm, separate cycle.
- Solver config object / options bag — no opts in v1.
- CLI flag for output format (json / table) — stdout text is enough.
- Caching `solveBipolar` results — YAGNI.
- Pluggable reduction strategies (user-supplied mapping from arrows) — defer.
- Argument-construction layer — arguments stay atomic; future cycle.

---

## 11. References

- Cayrol, C., & Lagasquie-Schiex, M.-C. (2005). *On the acceptability of arguments in bipolar argumentation frameworks.* ECSQARU 2005. §3.2 for the deductive-support Dung reduction.
- Existing `docs/snowball/specs/2026-06-25-grounded-dung-solver-design.md` — Method 1 baseline.