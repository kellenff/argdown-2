# Grounded Dung Solver Design

**Date:** 2026-06-25
**Status:** Approved (pending user review of this written spec)
**Scope:** Add a single-semantics argument solver to `argdown-2` — Dung's grounded extension on a pure-attack reduction. Ships `solve()`, a `--solve` CLI flag, and Mermaid color rendering of labels. Method 1 of the brainstormed candidates; Methods 2 (bipolar) and 3 (ASPIC+) are explicit future cycles.

---

## 1. Context and goals

`argdown-2` parses documents into a typed AST and renders them to Mermaid, but cannot answer "which claims survive after the attacks are resolved." This cycle adds a solver that computes Dung's **grounded extension** — the unique, always-defined, polynomial-time semantics — and reports labels (`in` / `out` / `undec`) for every addressable claim in the document.

**Goals:**
- One public function `solve(document) → SolveResult`. Pure, synchronous, no I/O, no mutation of input.
- Reduce the argdown-2 arrow taxonomy to plain Dung attack: `--x` becomes an attack edge; every other arrow (`-->`, `-.->`, `-.-`, `~>`, `?>`, `<->`) is dropped silently with a per-type count surfaced in the result.
- Run the standard grounded-labeling fixpoint (Modgil/Caminada). Returns `{ in, out, undec }` per addressable claim.
- Add `--solve` to the existing CLI: prints a summary table.
- Extend `renderMermaid` with an optional `labels` argument: when provided, append classDef blocks so the diagram visually shows winners/losers. When absent, output is byte-identical to the current renderer.
- Reach 80%+ Stryker mutation score on the new code.

**Non-goals (deferred to separate cycles):**
- Bipolar reduction (support as a first-class positive edge).
- ASPIC+ / structured argumentation with undercut/undermine distinctions.
- Argument construction from premises — arguments are atomic nodes in the attack graph.
- Preference orderings, burden-of-proof, defeat derivation.
- Multi-extension semantics (preferred, stable, complete) — grounded is the v1 semantics.
- Solver perf bench — add when the algorithm measurably regresses parse throughput.

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Method | Grounded Dung, pure-attack reduction |
| Reduction | `--x` = attack; all other arrow kinds counted as dropped |
| Node space | Facts (by `FactRef`) + Arguments (by location-stable synthetic key) |
| Argument key | `arg:L:C` from `Argument.loc.start.line:column` |
| Endpoint resolution | `FactRef` → key directly; `Argument` → look up the argument's `arg:L:C` key |
| Algorithm | Modgil/Caminada grounded-labeling fixpoint |
| Output type | `SolveResult = { labels, dropped, warnings }` |
| `dropped` shape | Per-arrow-kind integer counts (6 kinds beyond attack) |
| `warnings` shape | Human-readable strings; silent by default at the caller |
| CLI flag | `--solve`, prints summary to stdout, warnings to stderr |
| Mermaid integration | Optional second arg to `renderMermaid`; absent = byte-identical output |
| Module layout | New `src/solver.ts` + `src/solver.test.ts`; modify `src/mermaid.ts`, `src/cli.ts`, `src/index.ts` |
| Dependency cost | Zero new runtime deps; types-only imports from `ast.ts` |
| Tests | Unit (graph → labels), CLI snapshot, Stryker |

---

## 3. Architecture and module structure

**File layout:**
```
src/
  solver.ts              # new — solve(), SolveResult, Label, internals
  solver.test.ts         # new — unit tests over inline documents
  mermaid.ts             # modified — optional labels arg
  cli.ts                 # modified — --solve flag
  index.ts               # modified — re-export solve / SolveResult / Label
  ast.ts                 # unchanged (no AST modifications)
  parser.ts              # unchanged
```

`src/solver.ts` imports **types only** from `ast.ts`. No runtime imports. Mirrors the dep shape of `mermaid.ts` (renderer) and the type-only pattern of `stringifier.ts`.

```
index.ts ──▶ solver.ts ──▶ ast.ts (types only)
   │           │
   │           ├──▶ mermaid.ts (consumes labels via the new arg)
   │           └──▶ cli.ts (calls solve and prints summary)
```

`solver.ts` is a single file. If it grows past the 400-line lint cap, split by phase: `solver-graph.ts` (node keying + edge extraction), `solver-label.ts` (labeling fixpoint), `solver.ts` (orchestration). Same pattern the parser and stringifier used when they outgrew one file.

---

## 4. Public API

Added to `src/index.ts`:
```ts
export { solve } from './solver.js';
export type { SolveResult, Label } from './solver.js';
```

`src/solver.ts`:
```ts
export type Label = 'in' | 'out' | 'undec';

export type SolveResult = {
  labels: Map<string, Label>;
  dropped: {
    support: number;
    undercut: number;
    undermine: number;
    concession: number;
    qualification: number;
    equivalence: number;
  };
  warnings: string[];
};

export function solve(document: Document): SolveResult;
```

**Synchronous. Pure.** Reads `document.elements`, returns a new `SolveResult` each call. Does not mutate the input AST or any shared state.

**No error channel.** The contract applies to parser-produced `Document` values. A malformed programmatic AST (missing `kind`, missing `loc`) is out of contract and may throw `TypeError`; this matches the stringifier's posture (Section 4 of the stringifier design).

**Map keying — strings, not objects:** callers may need to look up labels by id; using string keys (`'co2'`, `'arg:4:12'`) keeps the public type JSON-serializable when spread through `Object.fromEntries` for tooling. `Map` is chosen over `Record` because the label set is computed, not declared.

---

## 5. Attack graph construction

Two passes over `document.elements`.

### 5.1 Node keying

Walk `document.elements` once, build `nodes: Map<string, SourceLocation>`:

- `FactStatement` whose `fact.ref.head.kind === 'IdentifierHead'`:
  - key = `IdentifierHead.identifier` (e.g. `[#co2]` → `'co2'`)
- `FactStatement` whose `fact.ref.head.kind === 'TitleHead'`:
  - key = `'title:' + TitleHead.text` (titles are unique by content; the parser enforces this for ref-equality, so the same rule applies to node keys)
- `Argument`:
  - key = `` `arg:${loc.start.line}:${loc.start.column}` ``

The set of addressable nodes is **the union of these**. A `FactStatement` and an `Argument` whose conclusion references the same `FactRef` are **distinct nodes** (correct: the argument is a separate construct that happens to conclude the same claim).

**Disambiguation rule:** if two `FactStatement`s carry the same `IdentifierHead.identifier`, the second encountered overwrites the first in the `nodes` map. Emit a warning (`warnings.push('duplicate fact id: <id>')`) so the caller can audit. Same for two `TitleHead` facts with the same text. This is defensive — the parser is structural-only and does not enforce uniqueness; surfacing the duplicate is the solver's job.

If two `Argument`s share the same `loc.start`, the implementation keeps the first and logs a warning (defensive — the parser should never produce this, since nested arguments have distinct opening parens at distinct offsets).

### 5.2 Edge extraction

Walk `document.elements` again, this time collecting `RelationStatement`s:

For each `RelationStatement.relations[i]`:

1. Compute `fromKey`:
   - If `from` is a `FactRef` → the same key as in §5.1
   - If `from` is an `Argument` → its `arg:L:C` key
2. Compute `toKey` analogously.
3. Switch on `arrow`:
   - `'attack'` → `attacks.get(toKey).push(fromKey)` (i.e. `fromKey` attacks `toKey`)
   - `'support'` → `dropped.support++`
   - `'undercut'` → `dropped.undercut++`
   - `'undermine'` → `dropped.undermine++`
   - `'concession'` → `dropped.concession++`
   - `'qualification'` → `dropped.qualification++`
   - `'equivalence'` → `dropped.equivalence++`

Multi-endpoint relations (`[#A], [#B] --x [#C]`) are already unfolded by the parser into one `Relation` per pair (per `ast.ts` §Relation doc-comment), so each `Relation` is exactly one edge.

**Warning emission:** when any `dropped[*] > 0`, push one summary string: `` `Method 1 (grounded Dung) dropped N non-attack edge(s): ${counts}` ``. Not per-edge — keeps `warnings` short.

**Self-attacks are allowed** (`[#A] --x [#A]`). The labeling fixpoint handles them correctly: an attacker set containing only `A` cannot be `IN` if `A` is `IN`, so `A` is forced `OUT`.

**Cycles are allowed.** The fixpoint terminates regardless.

**Endpoints that don't resolve to a known node:** surface as a warning (`` `dangling attack edge: <fromKey> --x <toKey>` ``). Do not silently drop — this is almost certainly a parser bug or a user typo, and the label set should not silently omit the target.

---

## 6. Grounded labeling algorithm

Standard Modgil/Caminada fixpoint on a finite attack graph `AF = (Args, →)`:

```ts
function label(attacks: Map<string, string[]>): Map<string, Label> {
  // Initialize: every targeted node starts UNDEC.
  const labels = new Map<string, Label>();
  for (const b of attacks.keys()) {
    labels.set(b, attacks.get(b)!.length === 0 ? 'in' : 'undec');
  }
  // Nodes that appear only as attack sources (never as targets) are unattacked
  // and start IN. They cannot be demoted: nothing attacks them.
  const allSources = new Set<string>();
  for (const sources of attacks.values()) for (const s of sources) allSources.add(s);
  for (const s of allSources) if (!labels.has(s)) labels.set(s, 'in');

  // Fixpoint: promote UNDEC nodes to IN or OUT based on attacker labels.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [b, attackers] of attacks) {
      if (labels.get(b) !== 'undec') continue;
      const allIn    = attackers.every(a => labels.get(a) === 'in');
      const someOut  = attackers.some(a => labels.get(a) === 'out');
      if (allIn)        { labels.set(b, 'out'); changed = true; }
      else if (someOut) { labels.set(b, 'in');  changed = true; }
    }
  }
  return labels;
}
```

**Why this is correct for grounded.** A node is `OUT` iff every attacker is `IN`; a node is `IN` iff it has at least one attacker `OUT` (or it is unattacked). The initialization rule (`unattacked → IN`) is the load-bearing detail — without it, an unattacked node starts `UNDEC` and a vacuous `every('in')` predicate would (incorrectly) demote it to `OUT`. The test suite pins this with a single-attacked-and-one-unattacked case.

**Termination.** Monotone on the lattice `{in, out, undec}^N` under the order `undec < in, undec < out, in/out incomparable`. Each iteration promotes at least one node from `undec`. ≤ N promotions. Polynomial.

**Result.** `labels` carries one entry per addressable claim — every targeted node, plus every source node (which is in the graph even if nothing attacks it). All such nodes end in `in`, `out`, or `undec` (the latter for odd cycles that the fixpoint cannot resolve).

---

## 7. CLI integration

`src/cli.ts` adds a `--solve` flag. When set:

1. Parse as today (existing flow).
2. If parse succeeded: call `solve(ast)`; print to stdout:
   ```
   IN (3):    co2, mitigation, evidence
   OUT (1):   impacts
   UNDEC (1): coord
   Dropped:   0 support, 0 undercut, 0 undermine, 0 concession, 0 qualification, 0 equivalence
   ```
3. If parse failed but `result.partial` is non-null: call `solve(result.partial)` and print labels with a leading `(partial document — labels may be incomplete)` line.
4. Print `warnings[]` to stderr, one per line, prefixed with `warning:`.

Sort keys within each label group alphabetically (deterministic output for snapshot tests).

No flags conflict with existing CLI options. No new positional args.

---

## 8. Mermaid color integration

`src/mermaid.ts` modifies the existing function signature:

```ts
export function renderMermaid(
  document: Document,
  labels?: Map<string, Label>
): string;
```

When `labels` is `undefined` or empty → output is **byte-identical** to the current renderer. Verified by snapshot test in `src/mermaid.test.ts`.

When non-empty → after the existing diagram body, append:

```
classDef in    fill:#d4f4dd,stroke:#1a7f37,color:#1a7f37
classDef out   fill:#ffe0e0,stroke:#cf222e,color:#cf222e
classDef undec fill:#f0f0f0,stroke:#999,color:#666
class <id1>,<id2> in
class <id3> out
class <id4> undec
```

Key → Mermaid id mapping:

- Fact keys (`IdentifierHead.identifier`, `'title:' + TitleHead.text`) are used directly. They match the keys `renderMermaid` produces internally (`headToId` in `src/mermaid.ts`).
- Argument keys (`arg:L:C`) are **computed but not rendered** in v1. The existing Mermaid renderer does not declare a per-argument node — arguments are inlined as edges to the conclusion head (`src/mermaid.ts` lines around the `case 'Argument':` branch). Adding per-argument nodes would change the visual output of every argument-bearing diagram and break existing snapshots; that's a separate cycle. The labels map's `arg:L:C` entries are silently skipped by the Mermaid renderer (consistent with the unknown-key rule below).
- Keys not present in `document.elements` or not matching a rendered node id (defensive) → silently skipped. The renderer is pure string output and does not warn; callers that want to audit label coverage do so via `solve()`'s `warnings[]`.

Sort class assignments by id within each label group (deterministic output).

**Unknown keys:** if `labels` contains a key that does not correspond to a node in the rendered diagram (e.g., a stray `arg:99:99` from a future AST shape), the renderer **silently skips** that `class` line. The renderer is pure string output and does not warn; callers that want to audit label coverage do so via `solve()`'s `warnings[]` (which captures dangling attacks but not label-map mismatches — a separate concern).

---

## 9. Testing strategy

### 9.1 Solver unit tests (`src/solver.test.ts`)

Each test builds a `Document` inline (or via a tiny builder helper local to the file) and asserts `solve(document).labels` + `.dropped`.

**Required cases (each a separate `it`):**

| Case | Setup | Expected |
|---|---|---|
| Empty graph | No `RelationStatement`s | All `FactStatement` keys + `Argument` keys = `'in'` |
| Linear attack | `A --x B` | A=`in`, B=`out` |
| Self-attack | `A --x A` | A=`out` |
| Mutual attack | `A --x B, B --x A` | A=`undec`, B=`undec` |
| Three-cycle | `A --x B, B --x C, C --x A` | all `undec` |
| Diamond | `A --x B, A --x C, D --x B, D --x C` | A=`in`, D=`out`, B=`out`, C=`out` |
| Mixed arrows | `A --> B, A --x C` | C=`out`, B=`in` (unattacked), `dropped.support === 1` |
| All dropped | `A --> B, C -.-> D` | All `in`, every `dropped[*]` matches input |
| Argument node | `A --x ([#B]) -> [#C]` | `arg:L:C` key for the argument = `out`, A = `in` |
| Two arguments, same conclusion | `([#X]) -> [#Y].  ([#Z]) -> [#Y].` | Both `arg:L1:C1` and `arg:L2:C2` keys labeled, distinct |
| Dangling attack | `A --x NONEXISTENT` | Warning emitted, target not silently dropped |

Stryker enforces the 80% threshold; mutations like `every → some`, swapped `in`/`out`, off-by-one iteration, and wrong key format must fail.

### 9.2 CLI test (`src/cli.test.ts` — new file or extend existing)

`yarn test` runs the CLI in a subprocess. Test fixture: `src/cli.test.fixtures/climate.argdown` (small doc with known labels). Assert:

- `--solve` exits 0.
- Stdout matches a snapshot containing `IN`, `OUT`, `UNDEC`, and `Dropped:`.
- Warnings route to stderr (separate stream assertion).

### 9.3 Mermaid backward-compat (`src/mermaid.test.ts`)

Extend the existing snapshot suite:

- Existing snapshots: regenerated, must be byte-identical (the function with no `labels` arg produces the same output).
- New snapshot: `renderMermaid(parse(src).ast, solve(parse(src).ast).labels)` on a fixture; committed as a new snapshot.

### 9.4 Out of scope for v1 tests

- Solver perf bench — add when the algorithm measurably regresses parse throughput.
- Property-based testing (e.g. fast-check) on the solver — unit tests + Stryker cover the v1 surface.
- Snapshot of every fixture with `--solve` — one representative fixture is enough.

---

## 10. Acceptance criteria

The cycle is complete when:

1. `src/solver.ts` exists, under 400 lines, passes `yarn lint`, `yarn format:check`, `yarn typecheck`.
2. `solve()`, `SolveResult`, and `Label` are exported from `src/index.ts`.
3. `--solve` flag works on `argdown-mermaid` and prints the documented summary format.
4. `renderMermaid(document, labels)` produces byte-identical output when `labels` is undefined.
5. `renderMermaid(document, labels)` produces a classDef-augmented diagram when `labels` is provided.
6. `yarn test` is green, including the new solver unit tests and CLI snapshot.
7. Stryker mutation score is ≥ 80% on the new code (the repo's existing threshold).
8. All existing snapshots in `src/__snapshots__/` remain committed and unchanged.

No README changes. No new runtime dependencies.

---

## 11. Future cycles (explicit, not v1)

- **Method 2 (bipolar):** add `--semantics=bipolar` flag; collapse `-->` = support, all of `--x`/`-.->`/`-.-`/`~>`/`?>` = attack, run a Cayrol/Lagasquie-Schiex-style fixpoint.
- **Method 3 (ASPIC+):** full structured argumentation with undercut/undermine distinctions; argument construction from premises; defeat derivation.
- **Argument-construction layer:** build logical arguments from `Argument` nodes whose premises are facts; expose justification trees per accepted claim.
- **Multi-extension semantics:** add `--semantics=preferred|stable|complete` once we have reason to ship them.
- **Solver perf bench:** extend `src/parser.bench.ts` with a solve step on the heavy-relations fixture; gate on `yarn bench:check`.

---

## 12. Skipped (YAGNI list)

- Solver config object / options bag — v1 takes no options. Add `SolveOptions` later if needed.
- CLI flag for output format (json / table / graphviz) — stdout text is enough.
- Mermaid palette customization — palette is hardcoded in v1.
- Exporting the attack graph (separate public type) — internal-only in v1.
- Label-only Mermaid render (no diagram, just labels) — distinct feature, separate cycle.
- Caching `solve()` results keyed by AST identity — YAGNI until profiling shows repeat calls.
- Custom node-id resolution (e.g. user-provided id mappings) — defer.
- Pluggable reduction strategies (user-supplied mapping from arrow kinds to attack/support/ignore) — defer.
