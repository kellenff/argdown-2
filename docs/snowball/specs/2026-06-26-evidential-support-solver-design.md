# Evidential Support Solver Design

**Date:** 2026-06-26
**Status:** Approved
**Scope:** Add `solveEvidential()` to `argdown-2` — Dung's grounded extension on a Cayrol & Lagasquie-Schiex 2005 **necessary-support** reduction. Sibling to `solve()` (Method 1, pure attack), `solveBipolar()` (Method 2, deductive support), and `solveAspic()` (Method 3, structured argumentation with preferences). Retires the §3.3 deferral noted in the bipolar and ASPIC+ specs.

---

## 1. Context and goals

`argdown-2` ships three solvers. Two treat `-->` as a dropped edge (`solve()`, `solveAspic()`); one treats it as **deductive** support (`solveBipolar()` — B's defeat propagates to A via an auxiliary). Real argument maps also need the opposite reading: **necessary** support, where A's defeat propagates to B. This cycle adds Method 4 of the Method 1/2/3/4 ladder: a full evidential-support solver that reinterprets `-->` (and `<->`) under the §3.3 necessary-support semantics.

**Goals**
- One new public function `solveEvidential(document) → SolveResult` next to the other three in `src/solver.ts`. Pure, synchronous, no I/O, no mutation of input.
- **Necessary-support reduction**: each `A --> B` introduces an internal auxiliary `nec:A->B` with attacks `A → nec:A->B` and `nec:A->B → B`. Auxiliaries never surface in the `labels` map.
- `<->` (equivalence) maps to **two** necessary supports (two auxiliaries), mirroring bipolar's handling.
- All other arrows (`--x`, `-.->`, `-.-`, `~>`, `?>`) collapse to plain attack — same posture as bipolar. No preference mechanics (those live in ASPIC+).
- CLI flag `--semantics=evidential`. Whitelist extended from `{dung, bipolar, aspic}` to `{dung, bipolar, aspic, evidential}`.
- `renderMermaid(document, labels)` works unchanged (silent skip of `arg:L:C` keys, as today).
- 80%+ Stryker mutation score on the new code.

**Non-goals (deferred)**
- Evidential labeling from Cayrol & Lagasquie-Schiex 2013 §3 (the full "evidential" framework with a non-Dung fixpoint). This cycle ships the §3.3 reduction; the 2013 framework is research-grade and YAGNI until a consumer names it.
- Multi-extension semantics (preferred, stable, complete). Different return shape, separate cycle.
- Recursive sub-argument expansion. ASPIC+-variant concern; this solver operates on the same flat AST as `solve()` and `solveBipolar()`.
- Preference mechanics. ASPIC+ owns `preference:`; evidential needs none.
- Shared scaffolding extraction across the four solvers. Rule-of-three fires after this lands; not in this cycle.
- New BNF arrow kinds. Same 7 arrow types; only the reduction for `-->`/`<->` changes.
- New parser fixtures. Reuse the existing 7.

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Reduction | Cayrol & Lagasquie-Schiex 2005 §3.3 (necessary support) |
| Reduction for `A --> B` | Add auxiliary `nec:A->B`; attach attacks `A → nec:A->B` and `nec:A->B → B` |
| Reduction for `A <-> B` | Two necessary supports (`A --> B`, `B --> A`); two auxiliaries |
| Reduction for `--x` | Plain attack (no aux) |
| Reduction for `-.->`, `-.-`, `~>`, `?>` | Collapse to plain attack (matches bipolar) |
| Aux key prefix | `nec:` (avoids collision with bipolar's `sup:` prefix; never both run on the same graph) |
| API | Sibling `solveEvidential(document)` next to `solve()` / `solveBipolar()` in `src/solver.ts` |
| Return type | Unified `{ labels, warnings }`. No `defeats` field (evidential is a Dung reduction, not a defeat-graph solver). |
| Output filtering | Strip aux keys (`nec:`-prefixed) from `labels` before returning |
| Dangling edges | Warning + skip, matching bipolar |
| Duplicate fact/arg IDs | Warning, matching bipolar |
| CLI | `--semantics=evidential` flag. Default `--solve` (no flag) stays Dung. Invalid value errors with the four-value whitelist. |
| Labeling | Reuse existing `label()` fixpoint unchanged on the augmented attack map |
| Mermaid | Unchanged. `labels` flows through the same renderer. |
| File location | `src/solver.ts` (matches the precedent of `solve` and `solveBipolar` cohabiting; ASPIC+ got its own file because its algorithm is significantly larger) |
| Tests | Vitest, ~18 cases covering empty graph, simple support, propagation direction, self-support, mutual support, equivalence, mixed attack, undercut collapse, cycle through auxiliaries, dangling edges, duplicates, output filtering |
| Mutation threshold | 80%+ (project standard) |
| Bench | Add `solve-evidential` and `parse-solve-evidential` task types; refresh `perf-baseline-solver.json` |

## 3. Public API change

`src/solver.ts` exports four functions and one unified type:

```ts
export type Label = 'in' | 'out' | 'undec';

export type SolveResult = {
  labels: Map<string, Label>;
  defeats?: Map<string, string[]>;  // only solveAspic populates
  warnings: string[];
};

export function solve(document: Document): SolveResult;
export function solveBipolar(document: Document): SolveResult;
export function solveAspic(document: Document): SolveResult;  // src/solver-aspic.ts
export function solveEvidential(document: Document): SolveResult;  // NEW
```

**Backward compatibility:** `solveEvidential` adds a new export; no existing export changes. `SolveResult` is unchanged. `defeats?` stays optional and stays `undefined` for the new function.

## 4. AST change

None. The grammar is frozen; the new solver operates on the same `Document` AST as the existing three.

## 5. Algorithm (`solveEvidential`)

Four passes:

1. **Node keying** — same as `solve()` and `solveBipolar()`. `arg:L:C` for `Argument`; `FactRef`-based key for `FactStatement`. Build `argByNode: Map<Argument, string>` for endpoint resolution.
2. **Edge classification** — walk `RelationStatement`s. For each `Relation`:
   - `-->` from `A` to `B` → call `addNecessarySupport(fromKey, toKey)`
   - `<->` from `A` to `B` → call `addNecessarySupport(A, B)` then `addNecessarySupport(B, A)`
   - All other arrows → attach as plain attack (`from` attacks `to`), same as bipolar
   - Dangling edges (target not in `labels`) → warning, skip
3. **`addNecessarySupport(fromKey, toKey)`** — the reduction:
   ```ts
   function addNecessarySupport(fromKey: string, toKey: string): void {
     const auxKey = `nec:${fromKey}->${toKey}`;
     // A → aux
     const auxAttackers = attacks.get(auxKey) ?? [];
     auxAttackers.push(fromKey);
     attacks.set(auxKey, auxAttackers);
     // aux → B
     const bAttackers = attacks.get(toKey) ?? [];
     bAttackers.push(auxKey);
     attacks.set(toKey, bAttackers);
   }
   ```
   **Note the direction**: this is the *opposite* of bipolar's `addSupport`, which routes `B → s → A`. The two reductions differ only in the order of the two `attacks.set` calls. This is the load-bearing detail; mutating it swaps the algorithm between deductive and necessary.
4. **Labeling** — run the existing `label()` fixpoint on the augmented attack map, then strip `nec:`-prefixed keys from the output. Self-support (`A --> A`) does *not* trigger the init pass's direct self-attack check (the auxiliary, not the raw source list, contains A); it stays `UNDEC` in the fixpoint. See the "Self-support" note below.

**Self-support:** `A --> A` produces `A → nec:A->A → A`. The init pass's direct self-attack check (`sources.includes(target)`) does *not* fire — the auxiliary, not the raw source list, contains A. A's attackers are `[nec:A->A]`; `nec:A->A`'s attackers are `[A]`. Both stay UNDEC in the fixpoint. Same behavior as bipolar's self-support (verified: bipolar also reports UNDEC for `A --> A`). Documented as a known edge case; not a defect.

**Mutual necessary support** (`A --> B`, `B --> A`): two auxiliaries, four-node cycle (A, nec1, B, nec2). No source — fixpoint reports `UNDEC` for all four.

**Cycle through auxiliaries** (`A --> B`, `B --> C`, `C --> A`): three auxiliaries, six-node cycle. No source — `UNDEC` for all six. Auxiliaries are then stripped from the output.

**Defeat propagation:** When A is directly attacked (e.g., `C --x A`) and `A --> B`, the fixpoint resolves cleanly because the auxiliary does *not* appear in A's attacker list (only B's). A becomes `out` from the direct attack; the auxiliary becomes `in` (some-out); B becomes `out` (all-in). This is the load-bearing property of the reduction: an `out` supporter forces a `out` supported, while an `in` supporter does *not* force an `in` supported.

## 6. CLI integration

`src/cli.ts` extends the `--semantics` whitelist:

```
npx argdown-mermaid --solve --semantics=evidential example.argdown
```

- `--solve` alone (default) → Method 1 (Dung).
- `--solve --semantics=bipolar` → Method 2 (deductive support).
- `--solve --semantics=aspic` → Method 3 (structured argumentation with preferences).
- `--solve --semantics=evidential` → Method 4 (necessary support). **NEW.**
- `--semantics=<x>` where `x ∉ {dung, bipolar, aspic, evidential}` → CLI error listing the four valid values.
- `--semantics=<x>` without `--solve` → CLI error: `--semantics requires --solve`.

Implementation changes in `src/cli.ts`:
- Import `solveEvidential` from `./solver.js` (alongside the existing `solve` / `solveBipolar` import).
- Extend the whitelist check from 3 values to 4.
- Extend the nested ternary in the `--solve` dispatch branch to call `solveEvidential(result.ast)` when `semantics === 'evidential'`.

Output format: same IN/OUT/UNDEC summary table as the other three solvers. `warnings[]` go to stderr. No `defeats` is printed (the field stays `undefined`).

## 7. Mermaid integration

No change to `src/mermaid.ts`. The renderer reads `labels: Map<string, Label>` and applies classDefs to keys matching rendered node IDs. `arg:L:C` keys are silently skipped because argument nodes aren't separately declared in the Mermaid diagram.

A worked contrast example for `src/mermaid.test.ts` snapshot:

Source:
```argdown
[#A] First claim.
[#B] Second claim.
[#C] Objection.
[#A] --> [#B].
[#C] --x [#A].
```

After `solveBipolar(parse(src).ast)`:
- Bipolar reduces `-->` to `B → s → A` (aux `sup:A->B`, s attacks A). C attacks A. A's attackers are `[C, s]`. B has no attackers → `in`. C has no attackers → `in`. `s` is attacked by B (`in`) → all-in → `out`. A: attackers `[C=in, s=out]` → some-out → `in`. Final: A `in`, B `in`, C `in`, s `out` (stripped from output).

After `solveEvidential(parse(src).ast)`:
- Evidential reduces `-->` to `A → nec → B` (aux `nec:A->B`, A attacks aux, aux attacks B). C attacks A. A's attackers are `[C]` — the aux does *not* attack A in evidential. C is `in` (no attackers). A: attackers `[C=in]` → all-in → `out`. `nec` is attacked by A (now `out`) → some-out → `in`. B: attackers `[nec=in]` → all-in → `out`. Final: A `out`, B `out`, C `in`, nec `in` (stripped from output).

This is the load-bearing difference: the **same input** produces opposite labels for A and B depending on the reduction direction. Bipolar propagates B's defeat to A; evidential propagates A's defeat to B. The auxiliary's *attacker direction* is the only difference; both reductions re-use the same Dung fixpoint.

Mermaid output differs only in coloring: bipolar colors all three facts as winners; evidential colors only C as a winner, A and B as losers.

## 8. Testing strategy

`src/solver.evidential.test.ts` (new file, ~300 lines mirroring `src/solver.bipolar.test.ts`).

All expected outcomes below were verified by implementing the algorithm in isolation and running it against the test inputs before writing this spec.

| Case | Setup | Expected |
|---|---|---|
| Empty graph | no relations | `labels.size === 0`; empty `warnings` |
| Simple necessary support | `A --> B` | A `in`, B `in`, no `nec:`-prefixed key in output |
| Propagates A's defeat | `A --> B`, `C --x A` | A `out`, B `out`, C `in`. **Headline test**: C attacks A directly; A is `out`; `nec:A->B` is `in` (some-out); B is `out` (all-in). |
| Self-support | `A --> A` | A `undec` (cycle: A → `nec:A->A` → A; init pass only catches *direct* self-attack, not self-attack-via-aux) |
| Mutual necessary | `A --> B`, `B --> A` | A `undec`, B `undec` (cycle through two auxiliaries) |
| Equivalence | `A <-> B` | both `undec` (two necessary supports, four-node cycle) |
| Mixed equivalence + attack | `A <-> B`, `C --x A` | A `undec`, B `undec`, C `in` (cycle absorbs the C attack) |
| Necessary + direct attack on B | `A --> B`, `C --x B` | A `in`, B `in`, C `in`. The aux `nec:A->B` is `out` (A is `in`, all-in), so B's attackers `[C=in, nec=out]` → some-out → `in`. **Critical**: necessary support from an `in` supporter does *not* force B's defeat. |
| Undercut collapses | `A -.-> B`, all default pref | A `in`, B `out` (undercut collapses to attack, no preference mechanics) |
| Concession collapse | `A ~> B` | collapses to attack, no warning |
| Qualification collapse | `A ?> B` | collapses to attack, no warning |
| Mixed arrows | `A --> B`, `C --x B`, `D -.-> B` | A `in`, B `in`, C `in`, D `in` (nec=A->B is `out`, defeating B requires all attackers `in`) |
| Cycle through auxiliaries | `A --> B`, `B --> C`, `C --> A` | A `undec`, B `undec`, C `undec` (no source, all in cycle) |
| Direction contrast vs bipolar | `A --> B`, `C --x A` | evidential: A `out`, B `out`, C `in`. Bipolar: A `in`, B `in`, C `in`. Same input, opposite labels for A and B. |
| Dangling necessary | `A --> NONEXISTENT` | warning, no crash |
| Dangling equivalence | `A <-> NONEXISTENT` | warning, no crash |
| Dangling attack | `A --x NONEXISTENT` | warning |
| Duplicate fact id | `[#A] X. [#A] Y.` | warning |
| Output shape | aux keys filtered | `result.labels.keys()` contains no `nec:`-prefixed entry |
| `defeats` field absent | clean input | `result.defeats === undefined` |

`src/cli.test.ts` optionally gets a snapshot for `--solve --semantics=evidential` (defer to implementation time; not strictly required).

`src/solver.bench.ts` adds `solve-evidential` and `parse-solve-evidential` task types; `perf-baseline-solver.json` gets refreshed with the new entries (6 → 8 task types per fixture).

**Stryker enforces 80%+** on the new code. Mutations to catch:
- `addNecessarySupport` body: `fromKey` and `toKey` swapped in the two `attacks.set` calls (reverses the reduction direction → silently becomes bipolar behavior).
- Aux-key prefix swapped to `sup:` (collision risk if both solvers ever co-existed in one graph; correctness regression if strip-prefix is naïve).
- Strip-prefix predicate: `nec:` → `ne` (off-by-one), or `startsWith('sup:')` (would strip bipolar's prefix instead).
- Equivalence missing the second `addNecessarySupport(B, A)` call (asymmetric support).
- Default argument removed from `endpointKey` call.

## 9. Acceptance criteria

1. `solveEvidential` exported from `src/solver.ts` and re-exported from `src/index.ts`.
2. CLI accepts `--semantics=evidential`; invalid values error with the four-value whitelist.
3. `yarn lint && yarn typecheck && yarn test` green; new cases pass; existing solver tests untouched.
4. Stryker mutation score ≥ 80% on the new code.
5. `renderMermaid(document, solveEvidential(doc).labels)` works unchanged.
6. `perf-baseline-solver.json` refreshed with `solve-evidential` and `parse-solve-evidential` entries.
7. README adds `--semantics=evidential` paragraph + 4-line contrast example (bipolar vs evidential on the same input).
8. `src/solver.ts` stays under the 400-line lint cap.

## 10. Skipped (YAGNI)

- Evidential labeling (CLS 2013 §3 full framework with non-Dung fixpoint). Research-grade; deferred until a consumer names a use case.
- Multi-extension semantics (preferred, stable, complete). Different return shape; separate cycle.
- `solveEvidentialRecursive`. Recursive sub-argument expansion is an ASPIC+ variant.
- Preference mechanics. ASPIC+ owns `preference:`; evidential needs none.
- New BNF arrow kinds. Same 7 arrows; only the `-->`/`<->` reduction differs.
- New solver fixture files. Reuse the 7 existing parser fixtures.
- New CLI output formatting. Same IN/OUT/UNDEC summary as the other three.
- `solveEvidential` exposed as default anywhere. `--solve` without `--semantics=` stays Dung.
- Shared scaffolding extraction across the four solvers. Rule-of-three fires after this lands (3+ consumers of the pass-1/pass-2 pattern); not in this cycle.
- Equivalence-as-bidirectional-attack. Two auxiliaries, period.

## 11. Future cycles (explicit, not v1)

- **Shared scaffolding refactor** — at three+ consumers (`solve`, `solveBipolar`, `solveEvidential`, possibly `solveAspic` after this), the pass-1 keying and pass-2 relation-walk become worth extracting into a `buildAttackGraph(document, edgeReducer)` helper. Defer until a fourth solver consumer appears or any of the three duplicates mutates.
- **Evidential labeling (CLS 2013 §3)** — full framework with a non-Dung fixpoint. Different return shape (three-valued with `pending`). Future cycle if user demand emerges.
- **Multi-extension semantics** (`solvePreferred`, `solveStable`, `solveComplete`) on top of any of the four solvers. Different return shape (`Set<argKey>[]` or `Label[][]`).
- **`solveEvidentialRecursive`** — if a third consumer (e.g., a `--justify` flag) needs recursive sub-argument expansion.
- **CLI snapshot for `--semantics=evidential`** — add if a downstream consumer relies on stdout shape; otherwise defer.
- **`solveEvidential` variant that exposes auxiliaries** — for debugging or for downstream tooling that wants the augmented graph. Programmatic field; consumers pipe through their own code.

## 12. References

- Cayrol, C., & Lagasquie-Schiex, M.-C. (2005). *On the acceptability of arguments in bipolar argumentation frameworks.* Lecture Notes in Computer Science, vol. 3571. §3.3 (necessary support).
- Existing `docs/snowball/specs/2026-06-25-bipolar-reduction-solver-design.md` — sibling framework for §3.2 (deductive support). The two reductions differ only in the order of the two `attacks.set` calls inside the reduction helper.
- Existing `docs/snowball/specs/2026-06-26-aspic-solver-design.md` — Method 3 (structured argumentation with preferences). §11 (Future cycles) lists "Evidential support (Cayrol/Lagasquie-Schiex §3.3)" as the explicit deferral this cycle retires.
- ADR (project principles): `.codebase-memory/adr.md` — `SolveResult` shape, `YAGNI` discipline, `rule of three` for shared abstractions.