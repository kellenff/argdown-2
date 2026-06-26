# Argdown-2 — Solver Performance Bench Design

**Date:** 2026-06-26
**Status:** Approved (pending user review of this written spec)
**Scope:** Add a Tinybench-based performance bench suite for the solver module — `solve()` and `solveBipolar()`, both on cached ASTs and as end-to-end parse+solve. Captures a committed `perf-baseline-solver.json` of current numbers, mirroring the parser bench pattern. No CI thresholding this cycle.

---

## 1. Context and goals

`argdown-2` has shipped two solvers — `solve()` (Dung grounded, pure-attack reduction) and `solveBipolar()` (bipolar reduction with `sup:*` auxiliary nodes) — without any perf baseline. Both solver specs (grounded: 2026-06-25, bipolar: 2026-06-25) explicitly deferred "Solver perf bench" to a future cycle.

That cycle is now. This spec defines a bench suite that mirrors the parser bench's pattern (`src/parser.bench.ts`) but scoped to the solver module.

**Goals:**
- Measure `solve()` and `solveBipolar()` cost on representative documents (cached AST)
- Measure end-to-end `parse() + solve()` and `parse() + solveBipolar()` cost (CLI one-shot shape)
- Capture a committed `perf-baseline-solver.json` of current numbers
- Reuse the existing 7 parser fixtures — zero new fixture files
- Bench harness structured so the **next cycle** can add CI thresholding with minimal new code
- Co-located with `src/solver.ts`, consistent with v1 layout

**Non-goals (deferred to future cycles):**
- CI integration that fails the build on regression
- Statistical significance testing beyond Tinybench's built-in margin-of-error
- Cross-platform normalization of perf numbers
- Threshold tuning, SLO definition
- Sample-distribution storage for distribution-aware diffing
- Memory regression testing beyond peak heap delta
- Solver-specific fixtures (parser fixtures cover the relevant shapes — `heavy-relations.argdown` already has 20 attack edges and a self-attack loop)
- Refactoring `parser.bench.ts` to extract a shared bench utility module

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Goal | Baseline now; regression catching in a later cycle |
| Solvers benchmarked | `solve()`, `solveBipolar()` |
| End-to-end tasks | `parse + solve`, `parse + solveBipolar` |
| Task matrix | 4 task types × 7 fixtures = 28 baseline entries |
| Tooling | Tinybench (already a devDep) |
| Metrics | ops/sec, p99 ms, peak heap delta, margin of error per task |
| Fixtures | Reuse `src/parser.fixtures/` (no new files) |
| Baseline file | `perf-baseline-solver.json` at repo root, `schemaVersion: 1` |
| File location | `src/solver.bench.ts` + `src/solver.bench.test.ts` |
| Code sharing | Standalone file; copies harness pattern from `parser.bench.ts` (no shared utility module this cycle) |
| CLI commands | `bench:solver`, `bench:solver:baseline`, `bench:solver:check` |
| Runner | `tsx src/solver.bench.ts` (mirrors parser bench) |
| CI this cycle | None — `yarn bench:solver:check` is a manual dev tool |

**Code-sharing rationale:** `parser.bench.ts` is approved and stable. Refactoring it to extract a `bench-shared.ts` utility module expands blast radius for a problem we don't have. Two consumers doesn't justify abstraction (rule of three). The duplicated harness is ~120 lines of mechanical code; not load-bearing complexity. If a third bench file appears (stringifier, mermaid renderer), extracting `bench-shared.ts` becomes the obvious next step.

---

## 3. Architecture and module structure

**File tree (new files under `src/`, `perf-baseline-solver.json` at root):**

```
argdown-2/
  src/
    solver.ts                       # existing — solve(), solveBipolar()
    solver.bench.ts                 # NEW: Tinybench harness + mode dispatch
    solver.bench.test.ts            # NEW: structural sanity checks
    parser.bench.ts                 # existing — NOT touched
  perf-baseline-solver.json         # NEW: committed baseline (recorded once)
  package.json                      # modified: bench:solver* scripts
```

**Dependency direction (one-way, no cycles):**

```
solver.bench.ts  ──▶  solver.ts  ──▶  ast.ts (types only)
        │               │
        ├──▶  parser.ts        (for end-to-end tasks)
        ├──▶  parser.fixtures/ (read at runtime via node:fs)
        └──▶  perf-baseline-solver.json (read/written at runtime)
```

`solver.bench.ts` is **not** imported by or imports `parser.bench.ts` — the two files are independent. The FIXTURES list (7 paths) is duplicated rather than shared, keeping both files self-contained.

The bench file is an **executable module**, not a test file — it runs as a standalone script via `tsx`. It does not import from Vitest, only from the solver, parser (for end-to-end tasks), and Node's stdlib.

**Co-location rationale:** Putting `solver.bench.ts` next to `solver.ts` (mirroring `parser.bench.ts` next to `parser.ts`) keeps the perf concern visually adjacent to the code it benchmarks and matches the established layout.

---

## 4. Task matrix

**4 task types, run against each of the 7 fixtures = 28 total tasks.**

| Task name pattern | Body | AST state | Why |
|---|---|---|---|
| `solve:<fixture>` | `solve(cachedAst)` | Cached (parsed once at startup) | Isolates solver algorithmic cost |
| `solve-bipolar:<fixture>` | `solveBipolar(cachedAst)` | Cached | Isolates bipolar algorithmic cost (aux-node expansion) |
| `parse-solve:<fixture>` | `parse(src) + solve(ast)` | Fresh per iteration | Mirrors CLI one-shot shape (`argdown-mermaid --solve`) |
| `parse-solve-bipolar:<fixture>` | `parse(src) + solveBipolar(ast)` | Fresh per iteration | Mirrors a hypothetical `--solve-bipolar` CLI flag |

**Cached-AST vs fresh-AST rationale:**

- **Cached-AST tasks** isolate solver cost from parser cost. They answer "how fast does the solver run on a real document?" — the editor-tooling question (an LSP server caches the AST across keystrokes; only `solve()` reruns on document change).
- **Fresh-AST tasks** mirror CLI one-shot usage. They answer "what does the user pay for `parse | solve`?" — the one-shot CLI question. A parser regression surfaces here too; that's a feature, not a bug, since it catches pipeline-level regressions.

**Why two solvers × two AST states = 4 task types:** the user picked "both solvers, plus parse+solve end-to-end" (one scope decision) and "both end-to-end tasks" (a second decision). The 4-task matrix is the conjunction of those choices; collapsing to 2 would lose information.

**Task naming convention:** `<task-type>:<fixture>` (e.g., `solve:small-claim`). Colons are valid in tinybench task names; they produce clean baseline diffs when a single task type regresses without contaminating siblings.

---

## 5. Fixture reuse

The 7 fixtures in `src/parser.fixtures/` already cover the shapes relevant to solver perf:

| Fixture | Why it matters for solver |
|---|---|
| `small-claim`, `small-rule`, `small-relation` | Smoke tests for minimal solver cost |
| `medium-climate` | Realistic mixed document — rules + relations + blocks |
| `heavy-relations` | **Solver hot path**: 20 attack edges + 1 self-attack loop + support/undercut/concession/qualification variants |
| `deep-nesting` | Many `:::evidence` blocks — exercises fact-statement keying |
| `large-stress` | 100 KB mixed — exercises algorithmic scaling of the fixpoint |

**No solver-specific fixtures this cycle.** The parser fixtures already contain the dense attack graphs, multi-node cycles, and mixed-shape documents that drive solver cost. Adding solver-specific fixtures would be speculative coverage that costs maintenance burden without payoff.

If a future cycle shows solver perf needs more stress (e.g., for very deep recursion in the bipolar aux-node expansion), that cycle adds solver fixtures.

---

## 6. The bench file (`src/solver.bench.ts`)

Mirrors `src/parser.bench.ts` structure with these adaptations:

### 6.1 Fixture + task-type constants

```ts
const FIXTURES = [
  ['small-claim', 'src/parser.fixtures/small-claim.argdown'],
  ['small-rule', 'src/parser.fixtures/small-rule.argdown'],
  // ... same 7 as parser.bench.ts
] as const;

export type FixtureName = (typeof FIXTURES)[number][0];

export const TASK_TYPES = ['solve', 'solve-bipolar', 'parse-solve', 'parse-solve-bipolar'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

const TASK_BODY = (task: TaskType, source: string) => {
  switch (task) {
    case 'solve':               return (ast: Document) => solve(ast);
    case 'solve-bipolar':       return (ast: Document) => solveBipolar(ast);
    case 'parse-solve':         return () => { const r = parse(source); if (r.ok) solve(r.ast); };
    case 'parse-solve-bipolar': return () => { const r = parse(source); if (r.ok) solveBipolar(r.ast); };
  }
};
```

`TASK_BODY` is a factory returning a thunk parameterized by AST state. Cached-AST tasks ignore `source`; end-to-end tasks ignore `ast`.

### 6.2 Fixture loading + AST caching

```ts
async function loadFixtures(): Promise<Array<readonly [FixtureName, string, Document]>> {
  return Promise.all(
    FIXTURES.map(async ([name, path]) => {
      const source = await readFile(path, 'utf8');
      const r = parse(source);
      if (!r.ok) throw new Error(`fixture ${name} failed to parse`);
      return [name, source, r.ast] as const;
    }),
  );
}
```

Each entry now carries `(name, source, cachedAst)`. End-to-end tasks use `source`; cached-AST tasks use `cachedAst`.

### 6.3 Task construction

```ts
const bench = new Bench({ iterations: 50, time: 1000, throws: false });
const peakHeapMB = new Map<string, number>(); // keyed by task name

for (const taskType of TASK_TYPES) {
  for (const [name, source, ast] of loaded) {
    const taskName = `${taskType}:${name}`;
    const body = TASK_BODY(taskType, source);
    bench.add(taskName, () => {
      const before = process.memoryUsage().heapUsed;
      if (taskType === 'solve' || taskType === 'solve-bipolar') body(ast);
      else body(); // parse-solve / parse-solve-bipolar
      const after = process.memoryUsage().heapUsed;
      const delta = (after - before) / 1024 / 1024;
      const current = peakHeapMB.get(taskName) ?? 0;
      if (delta > current) peakHeapMB.set(taskName, delta);
    });
  }
}
```

- **28 tasks total**, one per (task-type, fixture) pair
- **Peak heap delta per task** (not per fixture), keyed by full task name
- **Tinybench's `iterations: 50, time: 1000`** matches parser bench defaults — finishes in seconds, not minutes

### 6.4 Mode dispatch

```ts
async function main(): Promise<void> {
  const mode = argv[2];
  const { results, peakHeapMB } = await runSolverBench();

  if (mode === '--baseline') {
    await writeBaselineJson(results, peakHeapMB, BASELINE_DEFAULT_PATH);
    console.log(`Baseline written to ${BASELINE_DEFAULT_PATH}`);
    return;
  }

  if (mode === '--check') {
    // this cycle: no threshold enforcement — a clean diff run exits 0.
    // Errors inside loadBaseline / checkAgainstBaseline throw and propagate
    // to a non-zero exit.
    const baseline = await loadBaseline(BASELINE_DEFAULT_PATH);
    await checkAgainstBaseline(results, peakHeapMB, baseline);
    return;
  }

  // Default: print per-task summary.
  console.log('solver perf summary (peak heap per task):');
  for (const r of results) {
    const peak = peakHeapMB.get(r.name)?.toFixed(2) ?? '?';
    console.log(
      `  ${r.name.padEnd(38)} ${r.hz.toFixed(1).padStart(10)} ops/sec ±${r.rme.toFixed(2)}%  p99=${r.p99.toFixed(3)}ms  peak=${peak}MB`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => { console.error(err); exit(1); });
}
```

**Three modes** mirror parser bench:
- **(no flag)** — print per-task summary (ops/sec, margin, p99, peak heap)
- **`--baseline`** — run all tasks, write `perf-baseline-solver.json`
- **`--check`** — run all tasks, diff against baseline, print diff (clean run exits 0; error cases exit non-zero)

---

## 7. Baseline format (`perf-baseline-solver.json`)

```jsonc
{
  "schemaVersion": 1,
  "capturedAt": "2026-06-26T...",
  "environment": {
    "nodeVersion": "v24.17.0",
    "platform": "darwin",
    "arch": "arm64"
  },
  "fixtures": {
    "small-claim": {
      "sizeBytes": 181,
      "tasks": {
        "solve":               { "opsPerSec": 12345.6, "marginOfError": 0.42, "p99Ms": 0.13, "peakHeapDeltaMB": 0.21 },
        "solve-bipolar":       { ... },
        "parse-solve":         { ... },
        "parse-solve-bipolar": { ... }
      }
    },
    "medium-climate": { "sizeBytes": 1646, "tasks": { ... } },
    // ... one entry per fixture (7 total)
  }
}
```

**Differences from `perf-baseline.json`:**
- Each fixture has a nested `tasks` object instead of flat fields (4 tasks vs 1)
- `sizeBytes` lives at the fixture level, not the task level (same for all 4 tasks per fixture)
- Total entries: 7 fixtures × 4 tasks = 28 task records inside the JSON

**Per-task field set (unchanged from parser bench):** `opsPerSec`, `marginOfError`, `p99Ms`, `peakHeapDeltaMB`.

**Schema versioning:** `schemaVersion: 1` is independent of the parser bench's `schemaVersion: 1`. The two baselines are separate files; one does not need to know about the other.

**What is NOT stored (matches parser bench):** raw sample arrays, timestamps per-iteration, source content hashes.

---

## 8. Error handling

Four failure modes need explicit handling this cycle:

### 8.1 Fixture file missing

`readFile` rejects, `Promise.all` rejects, the bench never starts.

- **Surface:** `Error: ENOENT: no such file or directory, open 'src/parser.fixtures/large-stress.argdown'`
- **Detection:** `solver.bench.test.ts` asserts every fixture path resolves to an existing file.

### 8.2 `parse()` or `solve()` throws (regression introduced a bug)

- Tinybench records the failing task with `state: 'errored'`, continues to other tasks.
- **`--baseline` mode:** refuse to write the baseline if any task errored. Print the failing task name and error.
- **`--check` mode:** missing baseline entry for the errored task → fail with a clear message.

### 8.3 Baseline file missing in `--check`

- Comparator detects at startup, prints `Error: no baseline at perf-baseline-solver.json. Run 'yarn bench:solver:baseline' first.`, exits non-zero.

### 8.4 Schema version mismatch

- `schemaVersion` in baseline ≠ 1 (current expected). Comparator prints a warning, exits non-zero.

### 8.5 What is NOT handled this cycle

- Cross-platform regressions (env block is recorded but not compared)
- Threshold violation exit codes (comparator prints diff, always exits 0)
- Statistical significance (margin of error is recorded but not enforced)
- Missing-task detection in the baseline (a task could be added but not captured in the baseline — handled by `checkAgainstBaseline` throwing when the bench produces a task name absent from the baseline file)

---

## 9. Structural test (`src/solver.bench.test.ts`)

A small Vitest file asserting the bench module's structural contracts:

1. **`FIXTURES` array contains exactly the 7 expected names** in the expected order
2. **`TASK_TYPES` array contains exactly the 4 expected names** in the expected order
3. **Each fixture path resolves to an existing file**
4. **`runSolverBench()` returns 28 results** (4 task types × 7 fixtures)
5. **Result names match the expected `<task-type>:<fixture>` pattern for every combination**
6. **No fixture errors**
7. **Peak heap delta captured per task** (28 entries in the map)
8. **`writeBaselineJson` produces a valid file** with `schemaVersion: 1` and nested `tasks` shape
9. **`writeBaselineJson` throws when any task errored**
10. **`loadBaseline` throws when baseline file is missing**
11. **`loadBaseline` throws on schema version mismatch**
12. **`checkAgainstBaseline` throws when a bench result errored**
13. **`checkAgainstBaseline` throws when baseline is missing a fixture entry**
14. **`checkAgainstBaseline` prints no diff and returns when current matches baseline**
15. **`checkAgainstBaseline` reports a diff when ops/sec regresses by more than the tolerance**

Tests use `FAST_BENCH = { iterations: 5, time: 50 }` (mirrors parser bench test file) to keep total runtime reasonable.

**Where this test lives:** co-located with `solver.bench.ts`, like `solver.test.ts` next to `solver.ts`. Runs as part of the regular `yarn test` workflow.

---

## 10. Build, scripts, and CI integration

### 10.1 `package.json` changes

```jsonc
{
  "scripts": {
    // ... existing
    "bench":                "tsx src/parser.bench.ts",
    "bench:baseline":       "yarn bench --baseline",
    "bench:check":          "yarn bench --check",
    "bench:solver":         "tsx src/solver.bench.ts",
    "bench:solver:baseline":"yarn bench:solver --baseline",
    "bench:solver:check":   "yarn bench:solver --check"
  }
}
```

**No new devDependencies** — `tinybench` is already a devDep (added in the parser bench cycle).

### 10.2 CI integration this cycle

**None.** `yarn bench:solver:check` is a manual dev tool that always exits 0. Same deferral as parser bench.

### 10.3 Local workflow

1. **First time / after major changes:** `yarn bench:solver:baseline` → updates `perf-baseline-solver.json`
2. **Day-to-day:** `yarn bench:solver` → prints per-task Tinybench summary
3. **Before committing perf-sensitive changes:** `yarn bench:solver:check` → reads diff against committed baseline
4. **CI (next cycle):** `yarn bench:solver:check` with threshold enforcement

---

## 11. Risks and known limitations

- **28 baseline entries inflate the baseline JSON.** Acceptable — still readable, still git-tracked, and the nested `tasks` object groups them per fixture for readability.
- **End-to-end tasks mix parse cost with solver cost.** A parser regression will show up in `parse-solve:*` and `parse-solve-bipolar:*` tasks too. Acceptable — that's the realistic CLI experience; we want to catch it. The cached-AST tasks (`solve:*`, `solve-bipolar:*`) isolate solver cost for clean diagnosis.
- **Two baseline files double the bench workload when running both `--baseline` commands.** Acceptable — both are dev-time commands. A combined `bench:all` script could chain them in a future cycle.
- **`parser.bench.ts` is NOT refactored.** The 7-fixture list and ~120 lines of harness are duplicated. If a third bench file appears, extracting `bench-shared.ts` becomes the obvious refactor.
- **Bipolar's aux-node expansion can produce large `attacks` maps on `large-stress`.** This is the data we're capturing; the baseline will show it. A future cycle may add a `large-bipolar-stress.argdown` fixture if the existing `large-stress.argdown` doesn't exercise bipolar adequately (current call: it does — `heavy-relations.argdown` has `<->` equivalence edges that bipolar expands).
- **Absolute perf numbers are machine-dependent.** Recorded as-is; a future cycle normalizes across environments if needed.
- **Memory measurement is `heapUsed` delta, not `heapTotal`.** Same caveat as parser bench — undercounts allocations freed mid-task, but the parse+solve path runs the same allocation pattern each iteration.

---

## 12. Skipped (YAGNI list)

- A `bench-shared.ts` extraction (defer until a third bench file lands)
- CI integration that fails on regression
- Cross-platform normalization of perf numbers
- Threshold tuning, SLO definition
- Sample-distribution storage for distribution-aware diffing
- Sample-distribution diffing
- Statistical significance enforcement
- Property-based perf tests (fast-check + solve)
- Solver-specific fixtures (parser fixtures cover the shapes)
- A combined `bench:all` script (run bench:baseline && bench:solver:baseline manually)
- Multiple runs with averaging across cold/warm starts
- Flame graph / profiling integration
- Memory regression testing beyond peak heap delta
- Refactoring `parser.bench.ts`

---

## 13. Next steps

1. **User review** of this spec (current gate).
2. **`writing-plans` skill invocation** to produce a step-by-step implementation plan.
3. **Implementation** in execution order from the plan.
4. **Verification:**
   - `yarn bench:solver:baseline` produces a valid `perf-baseline-solver.json` with 28 entries
   - `yarn bench:solver:check` diffs correctly (clean on identical input, reports diff on regression)
   - `solver.bench.test.ts` passes (15+ assertions)
   - `yarn test` still passes (no regressions in existing tests)
   - `yarn typecheck` passes
   - `yarn lint` passes (file size caps respected)
   - `yarn format:check` passes