# Argdown-2 — Benchmark Tests Design

**Date:** 2026-07-17
**Status:** Approved
**Scope:** Add a Tinybench-based performance bench suite for the EDN pipeline — `load()`, `solve()` on cached documents, and `load()+solve()` end-to-end. Captures a committed `perf-baseline.json` of current numbers. No CI thresholding this cycle.

---

## 1. Context and goals

`argdown-2` v0.2 is an EDN-only library with a two-stage public API:

- `load(source)` — EDN read (`edn-parser-js`) + Zod decode + semantic validation
- `solve(document)` — pure-attack Dung reduction + grounded labeling

Correctness is covered by Vitest unit tests. There is no performance instrumentation today. Historical specs under `docs/snowball/` describe a Tinybench bench pattern for the *previous* custom-parser architecture; that code was removed in the breaking reset (`c6ba4b0`). This spec adapts the proven harness pattern to the current EDN pipeline.

**Goals:**

- Measure `load()`, `solve()` (cached document), and `load()+solve()` (one-shot usage) on a hand-curated EDN corpus
- Commit `perf-baseline.json` with ops/sec, p99 ms, peak heap delta, and margin of error per task
- Structure the harness so a future cycle can add CI thresholding with minimal new code
- Co-locate bench code with the pipeline it measures

**Non-goals (deferred to future cycles):**

- CI integration that fails the build on regression
- Statistical significance testing beyond Tinybench's built-in margin-of-error
- Cross-platform normalization of perf numbers
- Threshold tuning, SLO definition
- Sample-distribution storage for distribution-aware diffing
- Synthetic input generators
- Memory regression testing beyond peak heap delta
- Benchmarking future solvers (only grounded exists today)

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Goal | Baseline now; regression catching in a later cycle |
| Pipeline stages | `load()`, `solve()` (cached), `load()+solve()` (end-to-end) |
| Task matrix | 3 task types × 7 fixtures = 21 baseline entries |
| Tooling | Tinybench + `tsx` runner (two new devDeps) |
| Metrics | ops/sec, p99 ms, peak heap delta, margin of error per task |
| Fixtures | 7 hand-curated `.edn` files in `src/bench.fixtures/` |
| Baseline file | `perf-baseline.json` at repo root, `schemaVersion: 1` |
| File location | `src/pipeline.bench.ts` + `src/pipeline.bench.test.ts` |
| Layout | Single monolith bench file (not split by stage) |
| CLI commands | `bench`, `bench:baseline`, `bench:check` |
| Runner | `tsx src/pipeline.bench.ts` |
| CI this cycle | None — `yarn bench:check` is a manual dev tool |

**Tooling rationale:** Tinybench provides ops/sec, p99, and margin-of-error out of the box and supports the `--baseline` / `--check` workflow already proven in prior specs. Vitest bench would add no new deps but lacks a mature committed-baseline story. `tsx` is required because Yarn 4 PnP does not auto-resolve `.js` imports to `.ts` source files when running bench scripts directly.

**Monolith rationale:** All three task types share fixture loading, AST caching, peak-heap tracking, and baseline I/O. A single `pipeline.bench.ts` avoids ~120 lines of duplicated harness code. Splitting by stage (`load.bench.ts` + `solve.bench.ts`) would leave end-to-end tasks orphaned in one file or duplicated across both.

---

## 3. Architecture and module structure

**File tree (new files under `src/`, `perf-baseline.json` at root):**

```
argdown-2/
  src/
    index.ts                      # existing — load(), solve()
    pipeline.bench.ts             # NEW: Tinybench harness + mode dispatch
    pipeline.bench.test.ts        # NEW: structural sanity checks
    bench.fixtures/               # NEW: hand-curated EDN source files
      small-minimal.edn
      small-relations.edn
      small-argument.edn
      medium-censorship.edn
      heavy-attacks.edn
      deep-arguments.edn
      large-stress.edn
  perf-baseline.json              # NEW: committed baseline (recorded once)
  package.json                    # modified: bench scripts + tinybench + tsx deps
```

**Dependency direction (one-way, no cycles):**

```
pipeline.bench.ts  ──▶  index.ts (load, solve)
        │
        ├──▶  bench.fixtures/ (read at runtime via node:fs)
        └──▶  perf-baseline.json (read/written at runtime)
```

The bench file is an **executable module**, not a test file — it runs as a standalone script via `tsx`. It does not import from Vitest, only from the public API and Node's stdlib.

---

## 4. Task matrix

**3 task types, run against each of the 7 fixtures = 21 total tasks.**

| Task name pattern | Body | Document state | Why |
|---|---|---|---|
| `load:<fixture>` | `load(source)` | Fresh per iteration | Isolates EDN read + decode + validate cost |
| `solve:<fixture>` | `solve(cachedDoc)` | Cached (loaded once at startup) | Isolates reduction + grounded labeling cost |
| `load-solve:<fixture>` | `load(source)` then `solve(doc)` | Fresh per iteration | Mirrors one-shot library usage |

**Cached vs fresh rationale:**

- **Cached-document tasks** isolate solver cost from load cost. They answer "how fast does the solver run on a real document?" — the question for callers that cache validated documents across invocations.
- **Fresh tasks** mirror one-shot usage. They answer "what does a caller pay for `load()` then `solve()`?" A load regression surfaces in `load:*` and `load-solve:*` tasks; a solver regression surfaces in `solve:*` and `load-solve:*` tasks.

**Task naming convention:** `<task-type>:<fixture>` (e.g., `load:small-minimal`). Colons are valid in Tinybench task names and produce clean baseline diffs when a single task type regresses.

---

## 5. Fixture design

**7 fixtures, grouped by size and shape:**

| Name | ~Size | Shape | Purpose |
|---|---|---|---|
| `small-minimal` | <1 KB | 2 statements + 1 attack | Smoke: minimal load/solve cost |
| `small-relations` | <1 KB | attack + contradiction + support | Relation decode + reduction paths |
| `small-argument` | <1 KB | argument with inference block | Argument/inference parse cost |
| `medium-censorship` | ~3 KB | Copy of `examples/argdown1-censorship.edn` | Realistic mixed document (parity example) |
| `heavy-attacks` | ~10 KB | Dense attack/contradiction graph | Solver hot path |
| `deep-arguments` | ~10 KB | Many arguments with inferences | Reduction keying stress |
| `large-stress` | ~50–100 KB | Mixed shapes at scale | Algorithmic scaling |

**Three "small" fixtures, not one:** Each covers a distinct minimal shape so a regression in any one production's cost shows up in the baseline diff. A single "small" fixture would conflate them.

**`medium-censorship` is a committed copy**, not a symlink or runtime reference to `examples/`. Keeps the bench self-contained and path-stable regardless of example layout changes.

**YAGNI:**

- Synthetic generators (rejected — real fixtures only)
- Wider shape coverage (one of each relevant shape is enough for a v1 baseline)
- An "errors" fixture (correctness tests already cover error recovery)

---

## 6. The bench file (`src/pipeline.bench.ts`)

Mirrors the structure of the prior `parser.bench.ts` spec with these adaptations for the EDN pipeline.

### 6.1 Fixture + task-type constants

```ts
const FIXTURES = [
  ['small-minimal', 'src/bench.fixtures/small-minimal.edn'],
  ['small-relations', 'src/bench.fixtures/small-relations.edn'],
  // ... 7 total
] as const;

export type FixtureName = (typeof FIXTURES)[number][0];

export const TASK_TYPES = ['load', 'solve', 'load-solve'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

function makeTaskBody(
  task: TaskType,
  source: string,
  cachedDoc: GroundedDocument,
): () => void {
  switch (task) {
    case 'load':
      return () => { load(source); };
    case 'solve':
      return () => { solve(cachedDoc); };
    case 'load-solve':
      return () => {
        const result = load(source);
        if (result.ok) solve(result.document);
      };
  }
}
```

### 6.2 Fixture loading + document caching

```ts
async function loadFixtures(): Promise<
  Array<readonly [FixtureName, string, GroundedDocument]>
> {
  return Promise.all(
    FIXTURES.map(async ([name, path]) => {
      const source = await readFile(path, 'utf8');
      const result = load(source);
      if (!result.ok) throw new Error(`fixture ${name} failed to load`);
      return [name, source, result.document] as const;
    }),
  );
}
```

Each entry carries `(name, source, cachedDoc)`. End-to-end and load tasks use `source`; solve tasks use `cachedDoc`.

### 6.3 Task construction

```ts
const bench = new Bench({ iterations: 50, time: 1000, throws: false });
const peakHeapMB = new Map<string, number>();

for (const taskType of TASK_TYPES) {
  for (const [name, source, doc] of loaded) {
    const taskName = `${taskType}:${name}`;
    const body = makeTaskBody(taskType, source, doc);
    bench.add(taskName, () => {
      const before = process.memoryUsage().heapUsed;
      body();
      const after = process.memoryUsage().heapUsed;
      const delta = (after - before) / 1024 / 1024;
      const current = peakHeapMB.get(taskName) ?? 0;
      if (delta > current) peakHeapMB.set(taskName, delta);
    });
  }
}
```

- **21 tasks total**, one per (task-type, fixture) pair
- **Peak heap delta per task**, keyed by full task name
- **Tinybench `iterations: 50, time: 1000`** matches prior specs — finishes in seconds

### 6.4 Mode dispatch

Three modes:

- **(no flag)** — print per-task summary (ops/sec, margin, p99, peak heap)
- **`--baseline`** — run all tasks, write `perf-baseline.json`
- **`--check`** — run all tasks, diff against baseline, print diff (clean run exits 0; error cases exit non-zero)

```ts
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => { console.error(err); exit(1); });
}
```

**Why `--check` does not enforce a threshold this cycle:** The comparator is functional (loads baseline, runs bench, prints diff) but regression-catching belongs to the next cycle. Wiring `--check` into CI and adding threshold exit codes is a small change for that cycle.

---

## 7. Baseline format (`perf-baseline.json`)

```jsonc
{
  "schemaVersion": 1,
  "capturedAt": "2026-07-17T...",
  "environment": {
    "nodeVersion": "v22.14.0",
    "platform": "darwin",
    "arch": "arm64"
  },
  "fixtures": {
    "small-minimal": {
      "sizeBytes": 312,
      "tasks": {
        "load":       { "opsPerSec": 12345.6, "marginOfError": 0.42, "p99Ms": 0.13, "peakHeapDeltaMB": 0.21 },
        "solve":      { ... },
        "load-solve": { ... }
      }
    },
    "medium-censorship": { "sizeBytes": 2792, "tasks": { ... } }
    // ... one entry per fixture (7 total)
  }
}
```

**Field decisions:**

- **`schemaVersion: 1`** — explicit version stamp; future comparators reject mismatches
- **`environment` block** — captured at baseline-record time; not enforced this cycle
- **Nested `tasks` object per fixture** — 3 tasks per fixture, keyed by task type
- **`sizeBytes` at fixture level** — same for all 3 tasks per fixture
- **Per-task fields:** `opsPerSec`, `marginOfError`, `p99Ms`, `peakHeapDeltaMB`
- **`peakHeapDeltaMB` is a delta** (heap used after minus before), not absolute heap

**What is NOT stored:** raw sample arrays, per-iteration timestamps, source content hashes.

---

## 8. Error handling

| Failure | Behavior |
|---|---|
| Fixture file missing | `readFile` rejects; bench never starts; structural test catches drift |
| `load()` or `solve()` throws | Tinybench marks task `errored`; continues other tasks |
| Any task errored in `--baseline` | Refuse to write baseline; print failing task name and error |
| Baseline missing in `--check` | Exit non-zero: "no baseline at perf-baseline.json. Run 'yarn bench:baseline' first." |
| Schema version mismatch | Exit non-zero with version warning |
| Task in bench but missing from baseline | `checkAgainstBaseline` throws with clear message |

**Not handled this cycle:**

- Cross-platform regressions (env block recorded but not compared)
- Threshold violation exit codes (comparator prints diff, always exits 0 on clean diff)
- Statistical significance enforcement (margin of error recorded but not enforced)

---

## 9. Structural test (`src/pipeline.bench.test.ts`)

A small Vitest file asserting the bench module's structural contracts. Runs as part of `yarn test` with fast bench settings.

1. **`FIXTURES` array contains exactly the 7 expected names** in the expected order
2. **`TASK_TYPES` array contains exactly `['load', 'solve', 'load-solve']`**
3. **Each fixture path resolves to an existing file**
4. **Each fixture loads successfully** via `load()`
5. **`runBench()` returns 21 results** (3 task types × 7 fixtures)
6. **Result names match `<task-type>:<fixture>` for every combination**
7. **No fixture errors**
8. **Peak heap delta captured per task** (21 entries)
9. **`writeBaselineJson` produces valid file** with `schemaVersion: 1` and nested `tasks` shape
10. **`writeBaselineJson` throws when any task errored**
11. **`loadBaseline` throws when baseline file is missing**
12. **`loadBaseline` throws on schema version mismatch**
13. **`checkAgainstBaseline` throws when a bench result errored**
14. **`checkAgainstBaseline` throws when baseline is missing a fixture entry**
15. **`checkAgainstBaseline` prints no diff and returns when current matches baseline**
16. **`checkAgainstBaseline` reports a diff when ops/sec regresses beyond tolerance**

Tests use `FAST_BENCH = { iterations: 5, time: 50 }` to keep total runtime reasonable.

**What this test does NOT do:**

- Assert perf numbers (those are the baseline, not a test)
- Run the full bench in the normal `yarn test` workflow (only fast structural runs)

---

## 10. Build, scripts, and CI integration

### 10.1 `package.json` changes

```jsonc
{
  "scripts": {
    // ... existing
    "bench":          "tsx src/pipeline.bench.ts",
    "bench:baseline": "yarn bench --baseline",
    "bench:check":    "yarn bench --check"
  },
  "devDependencies": {
    // ... existing
    "tinybench": "^2.6.0",
    "tsx": "^4.0.0"
  }
}
```

The library's `engines.node` stays at `>=18`. Only the bench runner needs `tsx` installed.

### 10.2 CI integration this cycle

**None.** `yarn bench:check` is a manual dev tool that always exits 0 on a clean diff. The next cycle adds:

- A CI workflow step running `yarn bench:check`
- Threshold configuration (e.g., 20% slower = fail)
- Margin-of-error awareness (don't fail on noise)

### 10.3 Local workflow

1. **First time / after major changes:** `yarn bench:baseline` → updates `perf-baseline.json`
2. **Day-to-day:** `yarn bench` → prints per-task Tinybench summary
3. **Before committing perf-sensitive changes:** `yarn bench:check` → reads diff against committed baseline
4. **CI (next cycle):** `yarn bench:check` with threshold enforcement

---

## 11. Risks and known limitations

- **21 baseline entries** in one JSON file. Acceptable — nested `tasks` object groups them per fixture for readability.
- **`load-solve` tasks mix load and solve cost.** A load regression shows up in both `load:*` and `load-solve:*` tasks. Acceptable — that's realistic usage; `solve:*` tasks isolate solver cost for diagnosis.
- **Absolute perf numbers are machine-dependent.** Recorded as-is; a future cycle normalizes across environments if needed.
- **Memory measurement is `heapUsed` delta, not `heapTotal`.** Undercounts allocations freed mid-task, but the same path runs the same allocation pattern each iteration.
- **`tsx` and `tinybench` are bench-only deps.** The library itself has no new runtime dependencies.
- **Tinybench is a moving target.** The `^2.6.0` range admits minor changes; if a future version renames fields, baseline schema or bench code may need a bump.

---

## 12. Skipped (YAGNI list)

- CI integration that fails on regression
- Cross-platform normalization of perf numbers
- Threshold tuning, SLO definition
- Sample-distribution storage or diffing
- Statistical significance enforcement
- Property-based perf tests
- Synthetic input generators
- Split bench files (`load.bench.ts` + `solve.bench.ts`)
- Shared `bench-shared.ts` extraction (defer until a third bench file lands)
- Vitest bench integration
- Multiple solvers (only grounded exists today)
- Flame graph / profiling integration
- Multiple runs with averaging across cold/warm starts
- A combined `bench:all` script

---

## 13. Next steps

1. **User review** of this spec (current gate).
2. **`writing-plans` skill invocation** to produce a step-by-step implementation plan.
3. **Implementation** in execution order from the plan.
4. **Verification:**
   - `yarn bench:baseline` produces a valid `perf-baseline.json` with 21 entries
   - `yarn bench:check` diffs correctly (clean on identical input, reports diff on regression)
   - `pipeline.bench.test.ts` passes (16 assertions)
   - `yarn test` still passes (no regressions in existing tests)
   - `yarn typecheck` passes
   - `yarn lint` passes
   - `yarn format:check` passes
