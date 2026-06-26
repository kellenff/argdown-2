# ASPIC+ Solver Design

**Date:** 2026-06-26
**Status:** Approved
**Scope:** Add `solveAspic()` to `argdown-2` — Dung's grounded extension on a standard Modgil & Prakken 2014 dispute derivation. Sibling to `solve()` (Method 1) and `solveBipolar()` (Method 2); completes the Method 1/2/3 ladder. Argdown option-comparison at `docs/snowball/specs/2026-06-26-aspic-solver.argdown`.

---

## 1. Context and goals

`argdown-2` ships two Dung-based solvers: `solve()` (pure-attack) and `solveBipolar()` (Cayrol/Lagasquie-Schiex deductive support). Both flatten `-.-` (undermine) and `-.->` (undercut) to plain attack — losing the structural distinction that ASPIC+ exists to express. This cycle adds Method 3 of the Method 1/2/3 ladder: a full ASPIC+ solver that distinguishes three defeat types and resolves which attacks become defeats via a new `preference:` grammar attribute.

**Goals**
- One new public function `solveAspic(document) → SolveResult` next to `solve()` / `solveBipolar()` in `src/solver.ts`. Pure, synchronous, no I/O, no mutation of input.
- Three defeat types distinguished:
  - `--x` (rebut) — attacks the conclusion of an argument. Becomes a defeat iff attacker is strictly preferred.
  - `-.->` (undercut) — attacks the inference rule of an argument. Always wins (standard dispute derivation).
  - `-.-` (undermine) — attacks a premise of an argument. Becomes a defeat iff attacker is strictly preferred over the attacked premise.
  - `-->` (support), `<->` (equivalence), `~>` (concession), `?>` (qualification) — counted as dropped, summary warning emitted. Same posture as Method 1.
- New `preference: <number>` attribute on `FactStatement` and `Argument` AST nodes. Default `0`. Strictly-higher preference = defeat succeeds.
- Standard dispute derivation: undercut always wins; rebut/undermine require strict preference. Ties do not defeat.
- `SolveResult` extended with optional `defeats?: Map<argKey, argKey[]>` (target → list of defeaters). Populated only by `solveAspic()`. Existing two solvers return `undefined`.
- CLI flag `--semantics=aspic`. Whitelist extended from `{dung, bipolar}` to `{dung, bipolar, aspic}`.
- `renderMermaid(document, labels)` works unchanged (silent skip of `arg:L:C` keys, as today).
- 80%+ Stryker mutation score on the new code.

**Non-goals (deferred)**
- Recursive sub-argument construction (Approach B in the option-comparison argdown). Future cycle: `solveAspicRecursive()`.
- Extended ASPIC+ dispute derivation (Approach C). Future cycle: `--semantics=aspic-extended`.
- Evidential support. Different algorithm, separate cycle.
- Multi-extension semantics (preferred, stable, complete). Different return shape, separate cycle.
- Strict vs defeasible inference-rule distinction. argdown rules default to defeasible in v1; if a user wants strict rules, that is a follow-up cycle.
- New ASPIC+-specific parser fixtures. Reuse the existing 7 parser fixtures per the solver-bench spec's precedent.
- Inference-rule preferences (preferences on rules as separate first-class entities). Only premise and conclusion preferences exist in v1.

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Reduction | Standard Modgil & Prakken 2014 dispute derivation |
| Construction | One `Argument` AST node = one constructed argument (no recursive sub-argument expansion) |
| Defeat type — rebut (`--x`) | Becomes a defeat iff `attacker.preference > target.preference` (strict) |
| Defeat type — undercut (`-.->`) | Always a defeat (regardless of preferences) |
| Defeat type — undermine (`-.-`) | Becomes a defeat iff `attacker.preference > premise.preference` (strict). `premise` is the targeted premise node's own preference. |
| `preference` storage | Read from existing `AttributeBlock.entries.preference` if it's a `NumberValue`; default `0` when absent |
| `preference` grammar | Already grammatical via `NumberValue` in `AttributeBlock` (`ast.ts:212-214`, `ast.ts:249-250`). Zero BNF lines added. |
| `preference` AST surface | New `preference?: number` top-level field on `FactStatement` and `Argument`, populated by the visitor from `entries.preference` when present |
| API | Sibling `solveAspic(document)` next to `solve()` / `solveBipolar()` in `src/solver.ts` |
| Return type | Unified: `{ labels, warnings, defeats? }`. `defeats` populated only by `solveAspic`. |
| `defeats` keying | `argKey: string` (the `arg:L:C` synthetic key) — programmatic consumers only; Mermaid silently skips |
| Sub-arguments | Reachable in A's graph (they have their own `loc` and appear in `document.elements`); their *premises* are not recursively expanded |
| Premise variants | `atom | argument | disjunction` all treated as opaque premise references (no special handling) |
| Other arrows | `-->` / `<->` / `~>` / `?>` → all dropped with per-type warning summary (same as Method 1) |
| Untuned-documents warning | Emit `warnings[]` entry when non-attack arrows exist but no `preference:` is declared anywhere |
| CLI | `--semantics=aspic` flag. Whitelist `{dung, bipolar, aspic}`. Any other value errors. |
| Labeling | Reuse existing `label()` fixpoint. It is arrow-kind-agnostic — feeding a defeat map works without modification. |
| Mermaid | Unchanged. `labels` flows through the same renderer. `defeats` is not visualizable. |
| Inference rule | Defeasible by default (matches existing argdown-2 behavior). Strict rules deferred. |
| Tests | Unit over each defeat type, preference comparison, undercut-always-wins, ties-don't-defeat, untuned warning, sub-arg visibility, dangling edges |
| Mutation threshold | 80%+ (project standard) |

## 3. Public API change

`src/solver.ts` exports three functions and one unified type:

```ts
export type Label = 'in' | 'out' | 'undec';

export type SolveResult = {
  labels: Map<string, Label>;
  defeats?: Map<string, string[]>;  // NEW: target → [defeaters]; only solveAspic populates this
  warnings: string[];
};

export function solve(document: Document): SolveResult;
export function solveBipolar(document: Document): SolveResult;
export function solveAspic(document: Document): SolveResult;  // NEW
```

**Backward compatibility:** `defeats?` is optional. The existing two solvers do not return this field (TypeScript treats `undefined` and "field not present" equivalently for read access). The `renderMermaid(document, labels)` signature is unchanged.

**`defeats` consumers:** programmatic. CLI does not print it by default. Consumers who want to inspect the defeat graph can read `solveAspic(doc).defeats` directly.

## 4. AST change

`src/ast.ts` adds an optional `preference` field to the two addressable node types:

```ts
export type FactStatement = {
  kind: 'FactStatement';
  fact: Fact;
  // ... existing fields ...
  preference?: number;  // NEW: extracted from entries.preference when NumberValue
  loc: SourceLocation;
};

export type Argument = {
  kind: 'Argument';
  conclusion: Conclusion;
  premises: Premise[];
  // ... existing fields ...
  preference?: number;  // NEW: extracted from entries.preference when NumberValue
  loc: SourceLocation;
};
```

The parser already produces `NumberValue` for `preference: 0.7` in an attribute block. The visitor reads `entries.preference` and, if present and a `NumberValue`, sets `preference` to its numeric value. The `AttributeBlock` shape is unchanged — the new field is a derived view.

**No BNF changes.** Confirmed by both committee agents reading `docs/GRAMMAR.bnf`. The grammar already accepts `key: number_value` in attribute blocks.

## 5. Algorithm (`solveAspic`)

Six passes:

1. **Node keying** — same as existing solvers. `arg:L:C` for `Argument`; `FactRef`-based key for `FactStatement`. Read `preference` from each node's `entries.preference` (default `0` if absent or not a `NumberValue`).
2. **Premise index** — for undermine, build a `Map<premiseKey, argKey[]>` (premise → arguments using it as a premise) by walking each `Argument`'s `premises` list. An undermine on premise `p` translates to "every argument `X` with `p` in its premise list is undermined."
3. **Edge classification** — walk `RelationStatement`s. For each `Relation`:
   - `--x` from `A` (fact or arg) to `B` (arg) → candidate rebut attack `A → rebuts B`
   - `-.->` from `A` to `B` (arg) → undercut attack `A → undercuts B` (always a defeat)
   - `-.-` from `A` to `B` (fact or arg) → undermine attack `A → undermines premise-of X` for each `X` whose premise list contains `B`
   - `-->` / `<->` / `~>` / `?>` → dropped with per-type count, summary warning
4. **Defeat derivation** (standard dispute derivation):
   - Undercut: `defeats.get(target).push(attacker)` unconditionally.
   - Rebut: `defeats.get(target).push(attacker)` iff `attacker.preference > target.preference` (strict).
   - Undermine: `defeats.get(target).push(attacker)` iff `attacker.preference > premise.preference` (strict), where `premise.preference` is the targeted premise's own preference (not the containing argument's).
5. **Untuned-documents warning** — if any non-attack arrow (`-->`, `<->`, `~>`, `?>`) was dropped AND no `preference:` was declared anywhere in the document, push a `warnings[]` entry:
   ```
   solveAspic(): N non-attack edge(s) dropped and 0 of M nodes set preference;
   defeats will not derive from rebut/undermine until preference is set.
   ```
6. **Labeling** — run the existing `label()` fixpoint on `defeats`. Self-defeats force `OUT`. Source-only nodes are `IN`. Cycles report `UNDEC`.

The `label()` function (`solver.ts:49-84`) operates on `Map<string, string[]>` regardless of whether the map represents attacks, support-derived defeats, or ASPIC+ defeats. It runs unchanged on the defeat map produced by pass 4.

**Sub-argument handling:** A premise of kind `argument` (e.g., `([#A]) -> [#B]` inside another argument) is treated as an opaque reference. The containing argument's defeat derivation uses the *nested* `Argument` node's `arg:L:C` key (which is reachable because nested `Argument` AST nodes appear in `document.elements` via the top-level visitor walk). The nested argument's own premises are not recursively expanded. This is A's intentional limit; recursive expansion is a future cycle (`solveAspicRecursive`).

**Strict vs defeasible:** argdown rules are defeasible in v1. An undercut attacker always defeats the targeted argument. If a user wants strict rules (where undercut does not defeat), they need a future feature; document this in the README.

## 6. CLI integration

`src/cli.ts` extends the `--semantics` whitelist:

```
npx argdown-mermaid --solve --semantics=aspic example.argdown
```

- `--solve` alone (default) → Method 1.
- `--solve --semantics=bipolar` → Method 2.
- `--solve --semantics=aspic` → Method 3.
- `--semantics=<x>` where `x ∉ {dung, bipolar, aspic}` → CLI error listing the three valid values.
- `--semantics=<x>` without `--solve` → CLI error: `--semantics requires --solve`.

Output format: same IN/OUT/UNDEC summary table as the other two solvers. `defeats` is not printed. `warnings[]` go to stderr. Update `src/cli.test.ts` snapshot to add a `--semantics=aspic` case.

## 7. Mermaid integration

No change to `src/mermaid.ts`. The renderer reads `labels: Map<string, Label>` and applies classDefs to keys matching rendered node IDs. `defeats` is *not* consumed by the renderer — it is a programmatic-only field.

`arg:L:C` keys in `labels` (from existing solvers) are already silently skipped by the renderer because argument nodes aren't separately declared in the Mermaid diagram. Same behavior for ASPIC+.

A worked example for `src/mermaid.test.ts` snapshot:

Source:
```argdown
[#A] The sky is blue. { preference: 0.8 }
[#B] Therefore it is daytime. { preference: 0.4 }
([#thesis]) -> [#A], [#B] { preference: 0.6 }
[#X] Sky-color is irrelevant. { preference: 0.7 }
[#X] --x [#thesis].
```

After `solveAspic(parse(src).ast)`:
- `X.preference (0.7) > thesis.preference (0.6)` → `X` rebuts `thesis` → `thesis` is `OUT`.
- `thesis` is `OUT` → no support propagates to `A` or `B` (support is dropped, not propagated in ASPIC+ standard).
- All `IN` unless something else attacks them. `A` and `B` have no attackers → `IN`.
- `X` has no attackers → `IN`.
- Mermaid shows `A`, `B`, `X` colored as winners; `thesis` (an argument) is silently skipped by the renderer.

## 8. Testing strategy

`src/solver.aspic.test.ts` (new file) covers:

| Case | Setup | Expected |
|---|---|---|
| Empty graph | no relations | all `in`; no `defeats` entries |
| Rebut without preference | `A --x ([#B]) -> [#C]`, all `pref 0` | rebut tied → not a defeat; args `undec` (no defeats) |
| Rebut with strict preference | `A --x B`, `A.preference=1`, `B.preference=0.5` | `A` defeats `B`; `B` `out` |
| Rebut with equal preference | `A --x B`, both `pref 0` | rebut tied → not a defeat |
| Undercut always wins | `A -.-> B`, both `pref 0` | `A` undercuts `B`; `B` `out` regardless of preferences |
| Undercut overrides higher-pref target | `A -.-> B`, `B.preference=1`, `A.preference=0` | undercut still defeats; `B` `out` |
| Undermine with strict preference | `A -.- [#p]`, `A.preference=1`, `arg X` has `p` in premises, `X.preference=0.5` | `A` undermines `X`; `X` `out` |
| Undermine equal preference | same, both `pref 0` | undermine tied → not a defeat |
| Undermine targets premise preference | `A -.- [#p]`, `A.preference=1`, `p.preference=0.5` (premise's own pref, not containing arg's) | undermine succeeds; defeat propagates to containing args |
| Support dropped | `A --> B` | warning in `warnings[]`; ASPIC+ ignores support edges |
| Equivalence dropped | `A <-> B` | warning; not two support edges |
| Concession/qualification dropped | `A ~> B`, `A ?> B` | warnings |
| Method 2 vs 3 sanity | same doc through `solveBipolar` and `solveAspic` | bipolar labels A, B as `in`; ASPIC+ labels them `undec` (support dropped) |
| Three-cycle | `A --x B, B --x C, C --x A`, all `pref 0` | all `undec` (no defeats) |
| Defeats map exposed | `result.defeats` populated correctly for undercut-always-wins case | verifies the new field shape |
| Self-defeat preserved | `A --x A`, `A.preference=0` | A tied; but `A` is in `defeats.get(A)` → labeler forces `out` (self-attack semantics) |
| Dangling edges | `A --x NONEXISTENT` | warning, no crash |
| Untuned-documents warning | non-attack arrow + zero `preference:` declared anywhere | `warnings[]` contains the untuned message |
| Tuned-documents no warning | non-attack arrow + at least one `preference:` declared | `warnings[]` does NOT contain the untuned message |
| Sub-arg visibility | `[#X] : [#Y]. ([#thesis]) -> [#X].` | both `X` and `thesis` keyed; `X` is reachable as a top-level element |
| Premise disjunction opaque | `([#A]) -> ([#B] | [#C]).` | disjunction treated as opaque; no special handling |
| Defeats keys are `arg:L:C` | `result.defeats!.keys()` are all `arg:`-prefixed | verifies keying |
| Preference not a number | `[#A] B { preference: "high" }` | `preference` field is undefined; `warning` may be emitted; solver treats as default `0` |

`src/parser.test.ts` gets one round-trip test for `preference: 0.5` confirming the visitor extracts it correctly. `src/cli.test.ts` gets a snapshot for `--solve --semantics=aspic`. `src/solver.bench.ts` adds `solve-aspic` and `parse-solve-aspic` task types; `perf-baseline-solver.json` gets refreshed with the new task entries (28 → 42).

Stryker enforces 80% on the new code. Mutations like: `>` swapped to `>=` (tie-defeats), undercut conditional removed (undercut becomes preference-gated), `defeats?` field name changed, default-`0` swapped to default-`undefined`, premise index build skipped, untuned-warning predicate inverted, and `-->` accidentally routed to defeat derivation must fail.

## 9. Acceptance criteria

1. `solveAspic` exported from `src/index.ts`.
2. `SolveResult` extended with optional `defeats?: Map<string, string[]>` field.
3. `preference?: number` field added to `FactStatement` and `Argument` in `src/ast.ts`.
4. Visitor reads `entries.preference` (when `NumberValue`) into the new `preference` field.
5. CLI accepts `--semantics=aspic`; invalid values error clearly with the three-value whitelist.
6. `yarn lint && yarn typecheck && yarn test` green; new cases pass.
7. Stryker mutation score ≥ 80% on the new code.
8. `renderMermaid(document, solveAspic(doc).labels)` works unchanged.
9. `perf-baseline-solver.json` refreshed with `solve-aspic` and `parse-solve-aspic` entries.
10. README updated: new `--semantics=aspic` example, `preference:` attribute documented, defeats/arg:L:C silent-skip behavior documented, untuned-documents caveat documented, strict-vs-defeasible default noted.

## 10. Skipped (YAGNI)

- Recursive sub-argument expansion (Approach B). Defer to `solveAspicRecursive()`.
- Extended dispute derivation (Approach C). Defer to `--semantics=aspic-extended`.
- Multi-extension semantics. Different return shape; separate cycle.
- Strict inference rules. Defer.
- `defeats` exposed in CLI output. Programmatic field; consumers pipe it through their own code.
- New ASPIC+-specific fixtures. Reuse the 7 existing parser fixtures; ASPIC+ runs on them.
- Evidential support. Different algorithm, separate cycle.
- Inference-rule preferences. Only premise and conclusion preferences exist in v1.
- Custom dispute-derivation function (user-supplied). Defer.
- Argument-construction layer (a separate `buildAspicTree()`). If needed, can be added later as a sibling function operating on the same defeat map.
- Validation of `preference` range (e.g., `[0, 1]`). Any number is accepted; out-of-range values are a user error, not a solver error.

## 11. Future cycles (explicit, not v1)

- **`--semantics=aspic-extended`** (Approach C) — algorithm-only change in the defeat-derivation step. Rebut/undermine always count when attacker is strictly preferred (undercut still always wins). One boolean flip in the dispute-derivation function. Future cycle if user demand emerges.
- **`solveAspicRecursive(document)`** (Approach B) — recursive sub-argument expansion. Argument count can explode on deeply nested inputs; needs a recursive visitor over `Argument.premises` when `premises[i].kind === 'argument'`. Future cycle if a third consumer (e.g., a `--justify` flag or proof-tree rendering) demands it.
- **Strict inference rules** — add a way to mark an inference rule as strict (not defeated by undercut). Currently all rules are defeasible.
- **Evidential support** — different reduction algorithm (Cayrol/Lagasquie-Schiex §3.3). `A --> B` propagates "B `IN` requires A `IN`" instead of ASPIC+'s support-drop. Separate cycle.
- **Multi-extension semantics** (preferred, stable, complete) on top of any of the three solvers. Different return shape.
- **Preference ranges / validation** — constrain `preference` to `[0, 1]` or similar. Currently any number accepted.
- **`buildAspicTree(document)`** — separate function returning the constructed-argument tree. Operates on the same defeat map; doesn't couple to the solver return.

## 12. References

- Modgil, S., & Prakken, H. (2014). *The ASPIC+ framework for structured argumentation: a tutorial.* Argument & Computation, 5(1), 31-62. §4 (standard dispute derivation), §4.4 (preference principles).
- Existing `docs/snowball/specs/2026-06-25-grounded-dung-solver-design.md` — Method 1 baseline.
- Existing `docs/snowball/specs/2026-06-25-bipolar-reduction-solver-design.md` — Method 2 baseline.
- Option-comparison argdown: `docs/snowball/specs/2026-06-26-aspic-solver.argdown`.
- ADR (project principles): `.codebase-memory/adr.md`.
