# Argdown-2 — Performance Test Suite Design

**Date:** 2026-06-22
**Status:** Approved
**Scope:** Establish a performance test suite for the `parse()` pipeline. Capture a baseline this cycle; defer CI thresholding and enforcement to a follow-up cycle.

---

## 1. Context and goals

`argdown-2` shipped v1 with explicit deferral of "Performance benchmarks" (see `2026-06-21-argdown-typescript-parser-design.md` §11). The parser is now feature-complete against the BNF and has correctness coverage via Vitest snapshots. This cycle revives the perf dimension with the **narrow goal of capturing a baseline** — recording what the current parser costs on a representative set of inputs, in a form that future cycles can diff against.

**Goals:**
- A repeatable, automated way to measure `parse()` cost on a representative input corpus
- A committed `perf-baseline.json` capturing today's numbers (ops/sec, p99, peak heap delta)
- A bench harness structured so the **next cycle** can add CI thresholding with minimal new code
- Hand-curated, real Argdown source files as fixtures (no synthetic generator)
- Co-located with the parser, consistent with v1 layout

**Non-goals (deferred to a future cycle):**
- CI integration that fails the build on regression
- Statistical significance testing beyond Tinybench's built-in margin-of-error
- Cross-platform normalization of perf numbers
- Threshold tuning, SLO definition
- Sample-distribution storage for distribution-aware diffing
- Memory regression testing beyond peak heap delta

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Goal | Baseline now, regression catching in a later cycle |
| Corpus | 7 hand-crafted Argdown source files, committed |
| Tooling | Tinybench (one new devDep) |
| Metrics | ops/sec, p99 ms, peak heap delta per fixture |
| Baseline storage | `perf-baseline.json` at repo root, schema-versioned |
| Bench file | `src/parser.bench.ts` with `--baseline` and `--check` modes |
| Runner | `tsx src/parser.bench.ts` — see note below |
| CI this cycle | None — `yarn bench:check` is a manual dev tool |
| Structural test | `src/parser.bench.test.ts` — sanity checks only |

**Runner note (deviation from plan):** The plan originally specified `node --experimental-strip-types`. Yarn 4 PnP's resolver does not auto-resolve `.js` imports to `.ts` source files, so the bench script could not find `./parser.js` when invoked that way. The user approved adding `tsx` (one small devDep, mature) as a more focused tool. `tsx` handles `.js` → `.ts` mapping and PnP transparently. Engine stays `>=18` for the parser; only the bench runner needs `tsx` installed.

---

## 3. Architecture and module structure

**File tree (new files under `src/`, `perf-baseline.json` at root):**

```
argdown-2/
  src/
    parser.ts                       # existing
    parser.test.ts                  # existing
    parser.bench.ts                 # NEW: Tinybench harness + mode dispatch
    parser.bench.test.ts            # NEW: structural sanity checks
    parser.fixtures/                # NEW: hand-crafted Argdown source files
      small-claim.argdown           # ~1 KB
      small-rule.argdown            # ~1 KB
      small-relation.argdown        # ~1 KB
      medium-climate.argdown        # ~10 KB
      heavy-relations.argdown       # ~10 KB
      deep-nesting.argdown          # ~10 KB
      large-stress.argdown          # ~100 KB
    index.ts                        # existing
  perf-baseline.json                # NEW: committed baseline (recorded once)
  package.json                      # modified: tinybench dep + bench scripts
```

**Dependency direction (one-way, no cycles):**

```
parser.bench.ts  ──▶  parser.ts  ──▶  tokens.ts
        │                │
        └──▶  parser.fixtures/ (read at runtime via node:fs)
        └──▶  perf-baseline.json (read/written at runtime)
```

The bench file is an **executable module**, not a test file — it runs as a standalone script via `node --experimental-strip-types`. It does not import from Vitest, only from the parser and Node's stdlib.

**Co-location rationale:** Putting fixtures under `src/parser.fixtures/` keeps relative paths valid for both the bench file and any future tooling, and keeps the perf concern visually adjacent to the parser it benchmarks.

---

## 4. Fixture design

**7 fixtures, grouped by size and shape:**

| Name | Size | Shape | Purpose |
|---|---|---|---|
| `small-claim` | ~1 KB | Single fact with attribute block | Smoke test: minimal parse cost |
| `small-rule` | ~1 KB | Rule with 3 premises + attributes | Rule-statement parse cost |
| `small-relation` | ~1 KB | Relation with attribute block | Arrow + endpoint parse cost |
| `medium-climate` | ~10 KB | Expanded DESIGN.md Climate example | Realistic document, mixed shapes |
| `heavy-relations` | ~10 KB | Dense graph of --> / --x edges | Stress: relationship-heavy input |
| `deep-nesting` | ~10 KB | Many ::: evidence blocks with bodies | Stress: block-heavy input |
| `large-stress` | ~100 KB | Long document, mixes all shapes | Stress: scale |

**Three "small" fixtures, not one:** The three minimal-shape fixtures are intentionally separate so a regression in any one production's cost shows up in the baseline diff. A single "small" fixture would conflate them.

**YAGNI:**
- A synthetic generator (rejected in clarifying questions — real fixtures only)
- Wider shape coverage (one of each shape is enough for a v1 baseline)
- A separate "errors" fixture (correctness tests already cover error recovery)

---

## 5. The bench file (`src/parser.bench.ts`)

**Three responsibilities, separated by mode:**

### 5.1 Fixture loading

```ts
const FIXTURES = [
  ['small-claim',     'src/parser.fixtures/small-claim.argdown'],
  ['small-rule',      'src/parser.fixtures/small-rule.argdown'],
  // ...
] as const;

const loaded = await Promise.all(
  FIXTURES.map(async ([name, path]) => [name, await readFile(path, 'utf8')] as const),
);
```

Loading happens **once** at startup, outside the timed loop. The `Bench` task bodies reference the in-memory strings.

### 5.2 Task construction

```ts
const bench = new Bench({ iterations: 50, time: 1000 /* ms */ });
const peakHeapMB = new Map<string, number>();

for (const [name, source] of loaded) {
  bench.add(name, () => {
    const before = process.memoryUsage().heapUsed;
    parse(source);
    const after = process.memoryUsage().heapUsed;
    const delta = (after - before) / 1024 / 1024;
    const current = peakHeapMB.get(name) ?? 0;
    if (delta > current) peakHeapMB.set(name, delta);
  });
}
```

- **One task per fixture**, named after the fixture
- **Peak heap delta is captured per-fixture** via a `Map<string, number>` updated inside the task body
- **Tinybench's `iterations: 50, time: 1000`** balances coverage with runtime — the bench finishes in seconds, not minutes

### 5.3 Mode dispatch

```ts
const mode = process.argv[2];
const { results, peakHeapMB } = await runBench();

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

// Default: per-fixture summary including peak heap delta.
const heapSummary = [...peakHeapMB.entries()]
  .map(([name, mb]) => `${name}=${mb.toFixed(2)}MB`)
  .join(' ');
console.log(`parse() perf summary (peak heap: ${heapSummary})`);
for (const r of results) {
  console.log(
    `  ${r.name.padEnd(20)} ${r.hz.toFixed(1).padStart(10)} ops/sec ±${r.rme.toFixed(2)}%  p99=${r.p99.toFixed(3)}ms`,
  );
}
```

Implementation note: `runBench()` (defined in §5.2) returns both the per-fixture Tinybench results and the per-fixture peak-heap-delta map. The mode dispatch uses that single result set — no separate bench run for the default summary. This avoids a double-bench that the earlier draft had.

**Three modes:**
- **(no flag)** — print a per-fixture summary (ops/sec, margin, p99) plus peak heap deltas. For ad-hoc local runs. The summary is a hand-rolled table (not Tinybench's `bench.table()`) so it can include the peak heap column, which `bench.table()` does not surface.
- **`--baseline`** — run all tasks, write `perf-baseline.json`. Invoked once per environment.
- **`--check`** — run all tasks, diff against `perf-baseline.json`, print a human-readable diff. **Clean run exits 0 this cycle**; error cases (missing baseline, schema mismatch, errored parse task) throw and produce a non-zero exit.

**Why `--check` does not enforce a threshold this cycle:** The comparator is functional (it loads the baseline, runs the bench, prints the diff) but the regression-catching decision belongs to the next cycle. Wiring `--check` into CI and turning it into a real exit code on threshold violation is a one-line change for that cycle.

---

## 6. Baseline format (`perf-baseline.json`)

```jsonc
{
  "schemaVersion": 1,
  "capturedAt": "2026-06-22T10:30:00.000Z",
  "environment": {
    "nodeVersion": "v20.12.0",
    "platform": "darwin",
    "arch": "arm64"
  },
  "fixtures": {
    "small-claim": {
      "sizeBytes": 1024,
      "opsPerSec": 18432.5,
      "marginOfError": 0.42,
      "p99Ms": 0.13,
      "peakHeapDeltaMB": 0.12
    },
    "medium-climate": {
      "sizeBytes": 10240,
      "opsPerSec": 1240.8,
      "marginOfError": 1.1,
      "p99Ms": 4.2,
      "peakHeapDeltaMB": 1.85
    }
    // ... one entry per fixture
  }
}
```

**Field decisions:**

- **`schemaVersion: 1`** — explicit version stamp. Future comparators reject mismatches.
- **`environment` block** — captured at baseline-record time. The next cycle's comparator can warn or skip when env differs; not enforced this cycle.
- **Per-fixture object, keyed by fixture name** — same name as the bench task, so the comparator does a 1:1 join.
- **Raw numbers, no derived stats** — `opsPerSec` and `p99Ms` both stored. The next cycle picks which to threshold on without rerunning.
- **`peakHeapDeltaMB` is a delta** (heap used after minus before), not absolute heap. Robust across machines with different baseline RSS.
- **`marginOfError`** is Tinybench's relative margin (in %), recorded verbatim. The next cycle decides what to do with it.

**What is NOT stored:**
- Raw sample arrays (Tinybench can export them but they're large; the next cycle adds them if needed for distribution-aware diffing)
- Timestamps per-iteration
- Source content hashes (the fixtures are committed and the path identifies them)

---

## 7. Error handling

Three failure modes need explicit handling this cycle:

### 7.1 Fixture file missing

`readFile` rejects, `Promise.all` rejects, the bench never starts.

- **Surface:** `Error: ENOENT: no such file or directory, open 'src/parser.fixtures/large-stress.argdown'`
- **Cause:** A fixture was added to `FIXTURES` without being committed, or vice versa
- **Detection:** `parser.bench.test.ts` asserts every fixture path resolves to an existing file

### 7.2 `parse()` throws (regression introduced a parser bug)

- Tinybench records the failing task with `state: 'errored'`, continues to the next task
- **`--baseline` mode:** refuse to write the baseline if any task errored. Print the failing fixture name and the error.
- **`--check` mode:** missing baseline entry for the errored fixture → fail with a clear message.

### 7.3 Baseline file missing in `--check`

- Comparator detects at startup, prints `Error: no baseline at perf-baseline.json. Run 'yarn bench:baseline' first.`, exits non-zero.
- This is dormant this cycle (no CI wires `--check`), but the error path is correct.

### 7.4 Schema version mismatch

- `schemaVersion` in baseline ≠ 1 (current expected). Comparator prints a warning, exits non-zero.
- Future migrations bump the schema and add a converter; not a concern this cycle.

### 7.5 What is NOT handled this cycle

- Cross-platform regressions (env block is recorded but not compared)
- Threshold violation exit codes (comparator prints diff, always exits 0)
- Statistical significance (margin of error is recorded but not enforced)

---

## 8. Structural test (`src/parser.bench.test.ts`)

A small Vitest file asserting the bench module's structural contracts:

1. **`FIXTURES` array contains exactly the 7 expected names** in the expected order
2. **Each fixture path resolves to an existing file** (catches missing fixtures before bench runs)
3. **Each fixture parses successfully** (sanity check — catches corrupted fixtures)
4. **`perf-baseline.json`, if present, has `schemaVersion: 1`** (catches schema drift)
5. **`perf-baseline.json` has an entry for every fixture name** (catches fixture-list/baseline-list drift)

**What this test does NOT do:**
- Assert perf numbers (those are the baseline, not a test)
- Run the bench (the bench is too slow for the normal `yarn test` workflow)
- Test `--baseline` or `--check` modes (those are CLI behaviors; the structural test is enough)

**Where this test lives:** Co-located with `parser.bench.ts`, like `parser.test.ts` next to `parser.ts`. Runs as part of the regular `yarn test` workflow.

---

## 9. Build, scripts, and CI integration

### 9.1 `package.json` changes

```jsonc
{
  "scripts": {
    // ... existing
    "bench":          "node --experimental-strip-types src/parser.bench.ts",
    "bench:baseline": "yarn bench --baseline",
    "bench:check":    "yarn bench --check"
  },
  "devDependencies": {
    // ... existing
    "tinybench": "^2.6.0"
  }
}
```

**Node 22+ requirement for `yarn bench`:** The bench runner uses `node --experimental-strip-types`, which became stable in Node 22. The package's `engines.node` stays at `>=18` (parser still builds and runs on 18); we document Node 22+ as a soft requirement for the bench runner in a code comment at the top of `parser.bench.ts`.

**Why not `tsx`:** Adds a dep. Native strip-types is sufficient for our use — the bench file has no enum or type-only-import gymnastics that would trip up the stripper. Sticking with stdlib + node.

### 9.2 CI integration this cycle

**None.** `yarn bench:check` is a manual dev tool that always exits 0. The next cycle adds:
- A CI workflow step running `yarn bench:check`
- Threshold configuration (e.g., 20% slower = fail)
- Margin-of-error awareness (don't fail on noise)

This is the explicit scope decision — chasing perf noise in CI before we have a baseline would be premature.

### 9.3 Local workflow

1. **First time / after major changes:** `yarn bench:baseline` → updates `perf-baseline.json`
2. **Day-to-day:** `yarn bench` → prints Tinybench's table
3. **Before committing perf-sensitive changes:** `yarn bench:check` → reads diff against committed baseline
4. **CI (next cycle):** `yarn bench:check` with threshold enforcement

---

## 10. Risks and known limitations

- **Bench runner requires `tsx`.** Parser's `engines.node` stays at 18; the bench script needs `tsx` installed (one devDep). The plan originally specified `node --experimental-strip-types`, but Yarn 4 PnP's resolver does not auto-resolve `.js` imports to `.ts` source files, so that approach was not viable. `tsx` handles the mapping and PnP transparently.
- **Absolute perf numbers are machine-dependent.** Recorded as-is; the next cycle normalizes across environments if needed.
- **Tinybench is itself a moving target.** The `^2.6.0` range admits minor changes; if a future Tinybench version renames fields, the baseline schema or bench code may need a bump.
- **`--check` is functional but does not enforce this cycle.** A user could run it and assume the diff is authoritative. Documented in §5.3 and §9.2.
- **Memory measurement is `heapUsed` delta, not `heapTotal`.** This undercounts allocations that get freed mid-task. Acceptable for "peak during parse" — the same parse path runs the same allocation pattern.
- **Rule attribute blocks are not supported (deliberate, per BNF).** The BNF in `docs/DESIGN.md` defines `Rule ::= FactRef ":-" FactRef ("," FactRef)* "."` with no attribute block. Rules end with `.` only. If we want rules with attributes later, that's a grammar change, not a bug fix.
- **2 parser bugs fixed in commit `a5442e4` (immediately after this baseline was captured):**
  1. Block titles with digits (e.g. `:::evidence[Source 1]`) — `parseTitleText` now accepts `Number` tokens. Affects `deep-nesting.argdown` only.
  2. Multi-word YAML values (e.g. `title: Climate Policy Analysis`) — `parseYamlValue` now consumes a run of consecutive scalar tokens, stopping at `Identifier Colon` (the next yaml line's start). The recovery paths in `parseFrontmatter` / `parseBlockBody` use save/restore so a partial-parse advances pos by exactly one token, not two. The Climate Policy snapshot was updated to show the correctly-joined multi-word values. The perf baseline was re-recorded against the fixed parser.

---

## 11. Skipped (YAGNI list)

- Synthetic input generator
- Wider shape coverage (one of each shape is enough)
- "Errors" fixture (correctness tests already cover this)
- `--check` exit code on regression
- CI threshold configuration
- Cross-platform normalization
- Sample-distribution storage
- Sample-distribution diffing
- Statistical significance enforcement
- Property-based perf tests (fast-check + parse)
- Comparison against a third-party Argdown parser
- Multiple runs with averaging across cold/warm starts
- Flame graph / profiling integration

---

## 12. Next steps

1. **User review** of this spec (current gate).
2. **`writing-plans` skill invocation** to produce a step-by-step implementation plan.
3. **Implementation** in execution order from the plan.
4. **Verification:** `yarn bench:baseline` produces a valid `perf-baseline.json`; `yarn bench:check` diffs correctly; `parser.bench.test.ts` passes; `yarn test` still passes; `yarn typecheck` still passes.
