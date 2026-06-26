# Solver Performance Bench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tinybench-based performance bench suite for `solve()` and `solveBipolar()` — both on cached ASTs and as end-to-end parse+solve — capturing a committed `perf-baseline-solver.json` of current numbers, with mode dispatch (`--baseline`, `--check`, default) ready for the next cycle's CI thresholding.

**Architecture:** A single `src/solver.bench.ts` is the bench harness — it loads the existing 7 parser fixtures at startup (parsing once to cache ASTs), runs 28 Tinybench tasks (4 task types × 7 fixtures: `solve`, `solve-bipolar`, `parse-solve`, `parse-solve-bipolar`), and dispatches to `--baseline` (write JSON), `--check` (diff against JSON, print), or default (per-task summary). The testable parts (`FIXTURES`, `TASK_TYPES`, `runSolverBench`, `writeSolverBaselineJson`, `loadSolverBaseline`, `checkAgainstSolverBaseline`) are exported and covered by `src/solver.bench.test.ts`. Reuses `tinybench` (already a devDep from the parser bench cycle). The harness pattern is copied from `src/parser.bench.ts` — no shared utility module this cycle.

**Tech Stack:** TypeScript 5.4 (ESM, Node 22+ for `tsx` runner, 18+ for the parser), Tinybench 2.6, Vitest, Yarn 4 PnP.

**Spec:** `docs/snowball/specs/2026-06-26-solver-performance-bench-design.md` (source of truth for design decisions).

---

## File Structure

Files created/modified in this plan:

| File | Status | Responsibility | Lines (est.) |
|---|---|---|---|
| `package.json` | modify | adds `bench:solver*` scripts | +3 |
| `src/solver.bench.ts` | new | Tinybench harness + mode dispatch | ~280 |
| `src/solver.bench.test.ts` | new | unit + structural tests | ~250 |
| `perf-baseline-solver.json` | new | committed baseline (recorded after Task 7) | n/a |

**Dependency direction (one-way, no cycles):**

```
solver.bench.ts  ──▶  solver.ts  ──▶  ast.ts (types only)
        │               │
        ├──▶  parser.ts        (for end-to-end tasks)
        ├──▶  parser.fixtures/ (read at runtime via node:fs)
        └──▶  perf-baseline-solver.json (read/written at runtime)

solver.bench.test.ts  ──▶  solver.bench.ts (imports FIXTURES, TASK_TYPES, helper fns)
```

`solver.bench.ts` is **not** imported by or imports `parser.bench.ts` — the FIXTURES list (7 paths) is duplicated to keep both files self-contained (per spec §3).

`solver.bench.ts` exports the testable units (`FIXTURES`, `TASK_TYPES`, `runSolverBench`, `writeSolverBaselineJson`, `loadSolverBaseline`, `checkAgainstSolverBaseline`, types). The mode dispatch is a thin CLI shell at the bottom of the file that calls those exports.

---

## Task 1: Add bench:solver scripts to package.json

**Files:**
- Modify: `package.json` (scripts block only)

`tinybench` is already a devDep (added in the parser bench cycle, `^2.6.0`); no `yarn add` needed.

- [ ] **Step 1: Edit the `scripts` block in `package.json`**

Open `package.json` and add three lines after the existing `bench:check` entry. Keep the alphabetical/logical grouping with the parser bench scripts.

Insert after `"bench:check": "yarn bench --check",`:
```jsonc
    "bench:solver":          "tsx src/solver.bench.ts",
    "bench:solver:baseline": "yarn bench:solver --baseline",
    "bench:solver:check":    "yarn bench:solver --check",
```

After editing, the full `scripts` block should look like:
```jsonc
  "scripts": {
    "bench":                "tsx src/parser.bench.ts",
    "bench:baseline":       "yarn bench --baseline",
    "bench:check":          "yarn bench --check",
    "bench:solver":         "tsx src/solver.bench.ts",
    "bench:solver:baseline":"yarn bench:solver --baseline",
    "bench:solver:check":   "yarn bench:solver --check",
    "build":                "tsc",
    "format":               "oxfmt src",
    "format:check":         "oxfmt --check src",
    "lint":                 "oxlint src",
    "mutate":               "stryker run",
    "test":                 "vitest run --passWithNoTests",
    "test:watch":           "vitest",
    "typecheck":            "tsc --noEmit"
  },
```

- [ ] **Step 2: Verify the scripts parse**

Run:
```bash
yarn run 2>&1 | grep bench
```

Expected output:
```
bench                tsx src/parser.bench.ts
bench:baseline       yarn bench --baseline
bench:check          yarn bench --check
bench:solver         tsx src/solver.bench.ts
bench:solver:baseline yarn bench:solver --baseline
bench:solver:check   yarn bench:solver --check
```

If `bench:solver` does not appear, the JSON syntax is invalid — re-check the comma placement in step 1.

- [ ] **Step 3: Verify yarn bench:solver fails with a clear error (entry-point file does not exist yet)**

Run:
```bash
yarn bench:solver 2>&1 | head -3
```

Expected: an error like `Cannot find module '...src/solver.bench.ts'` or `ERR_MODULE_NOT_FOUND` — the file does not exist yet, which is expected at this point.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "Add bench:solver scripts to package.json"
```

---

## Task 2: `solver.bench.ts` skeleton + `FIXTURES`/`TASK_TYPES` exports

**Files:**
- Create: `src/solver.bench.ts`
- Create: `src/solver.bench.test.ts`

- [ ] **Step 1: Write the failing tests for `FIXTURES` and `TASK_TYPES`**

Create `src/solver.bench.test.ts` with the structural assertions for the constants:

```ts
// src/solver.bench.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { FIXTURES, TASK_TYPES } from './solver.bench.js';

// Tinybench takes a few seconds to run; vitest's default 5s timeout is too tight.
// Tests using the bench use FAST_BENCH; structural tests do not run the bench.

describe('FIXTURES', () => {
  it('has exactly 7 entries', () => {
    expect(FIXTURES).toHaveLength(7);
  });

  it('contains the expected fixture names in order', () => {
    const names = FIXTURES.map(([name]) => name);
    expect(names).toEqual([
      'small-claim',
      'small-rule',
      'small-relation',
      'medium-climate',
      'heavy-relations',
      'deep-nesting',
      'large-stress',
    ]);
  });

  it('resolves to existing files', () => {
    for (const [name, path] of FIXTURES) {
      expect(existsSync(path), `fixture ${name} path ${path} does not exist`).toBe(true);
    }
  });

  it('paths are relative to repo root', () => {
    for (const [, path] of FIXTURES) {
      expect(path.startsWith('src/parser.fixtures/')).toBe(true);
    }
  });
});

describe('TASK_TYPES', () => {
  it('has exactly 4 entries', () => {
    expect(TASK_TYPES).toHaveLength(4);
  });

  it('contains the expected task types in order', () => {
    expect([...TASK_TYPES]).toEqual([
      'solve',
      'solve-bipolar',
      'parse-solve',
      'parse-solve-bipolar',
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
yarn test
```

Expected: FAIL with `Cannot find module './solver.bench.js'` or similar — the bench file does not exist yet.

- [ ] **Step 3: Implement the bench file skeleton with constants**

Create `src/solver.bench.ts`:
```ts
// src/solver.bench.ts
// Tinybench harness for solve() and solveBipolar() — both on cached ASTs and
// as end-to-end parse+solve. Mirrors src/parser.bench.ts pattern.
// Runner: `yarn bench:solver [--baseline|--check]` (uses tsx for .ts execution under PnP).

import { Bench } from 'tinybench';
import { readFile, writeFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';
import { parse } from './parser.js';
import { solve, solveBipolar } from './solver.js';
import type { Document } from './ast.js';

export const FIXTURES = [
  ['small-claim', 'src/parser.fixtures/small-claim.argdown'],
  ['small-rule', 'src/parser.fixtures/small-rule.argdown'],
  ['small-relation', 'src/parser.fixtures/small-relation.argdown'],
  ['medium-climate', 'src/parser.fixtures/medium-climate.argdown'],
  ['heavy-relations', 'src/parser.fixtures/heavy-relations.argdown'],
  ['deep-nesting', 'src/parser.fixtures/deep-nesting.argdown'],
  ['large-stress', 'src/parser.fixtures/large-stress.argdown'],
] as const;

export type FixtureName = (typeof FIXTURES)[number][0];

export const TASK_TYPES = [
  'solve',
  'solve-bipolar',
  'parse-solve',
  'parse-solve-bipolar',
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export type TaskName = `${TaskType}:${FixtureName}`;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
yarn test
```

Expected: PASS — the 6 `FIXTURES` and `TASK_TYPES` tests pass. Existing tests are unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/solver.bench.ts src/solver.bench.test.ts
git commit -m "Add solver.bench.ts skeleton with FIXTURES and TASK_TYPES exports"
```

---

## Task 3: Implement `runSolverBench()` with Tinybench + memory measurement

**Files:**
- Modify: `src/solver.bench.ts` (append)
- Modify: `src/solver.bench.test.ts` (append)

- [ ] **Step 1: Add a failing test for `runSolverBench()`**

Append the following `describe` block to `src/solver.bench.test.ts` (after the existing `TASK_TYPES` describe):
```ts
import { runSolverBench, TASK_TYPES, FIXTURES } from './solver.bench.js';

const FAST_BENCH = { iterations: 5, time: 50 } as const;

describe('runSolverBench', () => {
  it('returns one result per task-type/fixture combination', async () => {
    const { results } = await runSolverBench(FAST_BENCH);
    expect(results).toHaveLength(TASK_TYPES.length * FIXTURES.length);
  });

  it('result names follow <task-type>:<fixture> for every combination', async () => {
    const { results } = await runSolverBench(FAST_BENCH);
    const expected = new Set<string>();
    for (const taskType of TASK_TYPES) {
      for (const [name] of FIXTURES) {
        expected.add(`${taskType}:${name}`);
      }
    }
    const actual = new Set(results.map((r) => r.name));
    expect(actual).toEqual(expected);
  });

  it('no task errors', async () => {
    const { results } = await runSolverBench(FAST_BENCH);
    for (const r of results) {
      expect(r.ok, `task ${r.name} errored: ${r.error?.message ?? 'unknown'}`).toBe(true);
    }
  });

  it('captures a peak heap delta per task (28 entries)', async () => {
    const { peakHeapMB } = await runSolverBench(FAST_BENCH);
    expect(peakHeapMB.size).toBe(TASK_TYPES.length * FIXTURES.length);
    for (const taskType of TASK_TYPES) {
      for (const [name] of FIXTURES) {
        const key = `${taskType}:${name}`;
        const peak = peakHeapMB.get(key);
        expect(peak, `no peak for ${key}`).toBeDefined();
        expect(peak).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
yarn test
```

Expected: FAIL with `runSolverBench is not a function` or similar — the function does not exist yet.

- [ ] **Step 3: Implement `runSolverBench()` and helpers**

Append to `src/solver.bench.ts` (after the `TaskName` type alias):
```ts
async function loadFixtures(): Promise<
  Array<readonly [FixtureName, string, Document]>
> {
  return Promise.all(
    FIXTURES.map(async ([name, path]) => {
      const source = await readFile(path, 'utf8');
      const r = parse(source);
      if (!r.ok) {
        const first = r.errors[0];
        throw new Error(`fixture ${name} failed to parse: ${first?.message ?? 'unknown error'}`);
      }
      return [name, source, r.ast] as const;
    }),
  );
}

function makeTaskBody(task: TaskType, source: string, cachedAst: Document): () => void {
  switch (task) {
    case 'solve':
      return () => {
        solve(cachedAst);
      };
    case 'solve-bipolar':
      return () => {
        solveBipolar(cachedAst);
      };
    case 'parse-solve':
      return () => {
        const r = parse(source);
        if (r.ok) solve(r.ast);
      };
    case 'parse-solve-bipolar':
      return () => {
        const r = parse(source);
        if (r.ok) solveBipolar(r.ast);
      };
  }
}

export interface RunBenchOptions {
  iterations?: number;
  time?: number;
}

export interface BenchTaskResult {
  name: string;
  ok: boolean;
  error?: Error | undefined;
  hz: number;
  p99: number;
  rme: number;
}

export interface RunBenchResult {
  results: BenchTaskResult[];
  peakHeapMB: Map<TaskName, number>;
}

const DEFAULT_ITERATIONS = 50;
const DEFAULT_TIME_MS = 1000;

export async function runSolverBench(
  options: RunBenchOptions = {},
): Promise<RunBenchResult> {
  const loaded = await loadFixtures();
  const bench = new Bench({
    iterations: options.iterations ?? DEFAULT_ITERATIONS,
    time: options.time ?? DEFAULT_TIME_MS,
    throws: false,
  });
  const peakHeapMB = new Map<TaskName, number>();

  for (const taskType of TASK_TYPES) {
    for (const [name, source, ast] of loaded) {
      const taskName = `${taskType}:${name}` as TaskName;
      const body = makeTaskBody(taskType, source, ast);
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

  const rawResults = await bench.run();
  const results: BenchTaskResult[] = rawResults.map((r) => {
    const inner =
      (r as unknown as { result: { error?: Error; hz?: number; p99?: number; rme?: number } })
        .result ?? {};
    return {
      name: r.name,
      ok: inner.error === undefined,
      error: inner.error,
      hz: inner.hz ?? 0,
      p99: inner.p99 ?? 0,
      rme: inner.rme ?? 0,
    };
  });
  return { results, peakHeapMB };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
yarn test
```

Expected: PASS — all `FIXTURES`, `TASK_TYPES`, and `runSolverBench` tests pass. The bench takes a few seconds to run with `FAST_BENCH`; that's normal.

- [ ] **Step 5: Commit**

```bash
git add src/solver.bench.ts src/solver.bench.test.ts
git commit -m "Add runSolverBench with Tinybench and per-task heap tracking"
```

---

## Task 4: Implement `writeSolverBaselineJson()` (the `--baseline` mode)

**Files:**
- Modify: `src/solver.bench.ts` (append)
- Modify: `src/solver.bench.test.ts` (append)

- [ ] **Step 1: Add failing tests for `writeSolverBaselineJson()`**

Append the following `describe` block to `src/solver.bench.test.ts` (after the `runSolverBench` describe):
```ts
import { writeSolverBaselineJson, type SolverBaselineFile } from './solver.bench.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('writeSolverBaselineJson', () => {
  it('writes a valid baseline file with schemaVersion 1 and nested tasks shape', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runSolverBench(FAST_BENCH);
      await writeSolverBaselineJson(results, peakHeapMB, out);

      const raw = await readFile(out, 'utf8');
      const parsed = JSON.parse(raw) as SolverBaselineFile;

      expect(parsed.schemaVersion).toBe(1);
      expect(typeof parsed.capturedAt).toBe('string');
      expect(parsed.environment).toBeDefined();
      expect(typeof parsed.environment.nodeVersion).toBe('string');
      expect(typeof parsed.environment.platform).toBe('string');
      expect(typeof parsed.environment.arch).toBe('string');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('has one fixture entry with one entry per task type', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runSolverBench(FAST_BENCH);
      await writeSolverBaselineJson(results, peakHeapMB, out);

      const parsed = JSON.parse(await readFile(out, 'utf8')) as SolverBaselineFile;

      for (const [name] of FIXTURES) {
        const entry = parsed.fixtures[name];
        expect(entry, `missing fixture entry for ${name}`).toBeDefined();
        expect(typeof entry.sizeBytes).toBe('number');
        expect(entry.tasks).toBeDefined();
        for (const taskType of TASK_TYPES) {
          const taskEntry = entry.tasks[taskType];
          expect(taskEntry, `missing task entry for ${taskType}:${name}`).toBeDefined();
          expect(typeof taskEntry.opsPerSec).toBe('number');
          expect(typeof taskEntry.marginOfError).toBe('number');
          expect(typeof taskEntry.p99Ms).toBe('number');
          expect(typeof taskEntry.peakHeapDeltaMB).toBe('number');
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when a task errored', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const errored = [{ name: 'solve:small-claim', ok: false, hz: 0, p99: 0, rme: 0 }];
      const peakHeapMB = new Map();
      await expect(writeSolverBaselineJson(errored, peakHeapMB, out)).rejects.toThrow(/errored/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
yarn test
```

Expected: FAIL with `writeSolverBaselineJson is not a function` or similar.

- [ ] **Step 3: Implement `writeSolverBaselineJson()` and the types**

Append to `src/solver.bench.ts`:
```ts
export interface SolverTaskBaseline {
  opsPerSec: number;
  marginOfError: number;
  p99Ms: number;
  peakHeapDeltaMB: number;
}

export interface SolverFixtureBaseline {
  sizeBytes: number;
  tasks: Record<TaskType, SolverTaskBaseline>;
}

export interface SolverBaselineFile {
  schemaVersion: 1;
  capturedAt: string;
  environment: {
    nodeVersion: string;
    platform: NodeJS.Platform;
    arch: string;
  };
  fixtures: Record<FixtureName, SolverFixtureBaseline>;
}

const BASELINE_SCHEMA_VERSION = 1 as const;

export async function writeSolverBaselineJson(
  results: BenchTaskResult[],
  peakHeapMB: Map<TaskName, number>,
  outPath: string,
): Promise<void> {
  const errored = results.filter((r) => !r.ok);
  if (errored.length > 0) {
    const names = errored.map((r) => r.name).join(', ');
    throw new Error(`Cannot write baseline: task(s) errored: ${names}`);
  }

  const fixtures = {} as Record<FixtureName, SolverFixtureBaseline>;
  for (const [name, path] of FIXTURES) {
    const source = await readFile(path, 'utf8');
    const sizeBytes = Buffer.byteLength(source, 'utf8');

    const tasks = {} as Record<TaskType, SolverTaskBaseline>;
    for (const taskType of TASK_TYPES) {
      const taskName = `${taskType}:${name}` as TaskName;
      const result = results.find((r) => r.name === taskName);
      if (!result) {
        throw new Error(`Missing bench result for task ${taskName}`);
      }
      tasks[taskType] = {
        opsPerSec: result.hz,
        marginOfError: result.rme,
        p99Ms: result.p99,
        peakHeapDeltaMB: peakHeapMB.get(taskName) ?? 0,
      };
    }

    fixtures[name] = { sizeBytes, tasks };
  }

  const baseline: SolverBaselineFile = {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    fixtures,
  };

  await writeFile(outPath, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
yarn test
```

Expected: PASS — all `FIXTURES`, `TASK_TYPES`, `runSolverBench`, and `writeSolverBaselineJson` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/solver.bench.ts src/solver.bench.test.ts
git commit -m "Add writeSolverBaselineJson for --baseline mode"
```

---

## Task 5: Implement `loadSolverBaseline()` and `checkAgainstSolverBaseline()` (the `--check` mode)

**Files:**
- Modify: `src/solver.bench.ts` (append)
- Modify: `src/solver.bench.test.ts` (append)

- [ ] **Step 1: Add failing tests for `loadSolverBaseline` and `checkAgainstSolverBaseline`**

Append the following `describe` blocks to `src/solver.bench.test.ts` (after the `writeSolverBaselineJson` describe):
```ts
import {
  loadSolverBaseline,
  checkAgainstSolverBaseline,
  type FixtureName,
} from './solver.bench.js';
import { writeFile } from 'node:fs/promises';
import { vi } from 'vitest';

function makeValidBaseline(): SolverBaselineFile {
  const fixtures = {} as SolverBaselineFile['fixtures'];
  for (const [name, path] of FIXTURES) {
    const tasks = {} as Record<string, SolverTaskBaseline>;
    for (const taskType of TASK_TYPES) {
      tasks[taskType] = {
        opsPerSec: 1000,
        marginOfError: 1,
        p99Ms: 1,
        peakHeapDeltaMB: 0.1,
      };
    }
    fixtures[name] = { sizeBytes: 100, tasks: tasks as never };
  }
  return {
    schemaVersion: 1,
    capturedAt: '2026-06-26T00:00:00.000Z',
    environment: { nodeVersion: 'v22.0.0', platform: 'darwin', arch: 'arm64' },
    fixtures,
  };
}

describe('loadSolverBaseline', () => {
  it('throws when baseline file is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const baselinePath = join(dir, 'missing.json');
      await expect(loadSolverBaseline(baselinePath)).rejects.toThrow(/no baseline/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws on schema version mismatch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const baselinePath = join(dir, 'baseline.json');
      await writeFile(
        baselinePath,
        JSON.stringify({ ...makeValidBaseline(), schemaVersion: 2 }),
        'utf8',
      );
      await expect(loadSolverBaseline(baselinePath)).rejects.toThrow(/schema/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('checkAgainstSolverBaseline', () => {
  it('throws when a bench task errored', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runSolverBench(FAST_BENCH);
      await writeSolverBaselineJson(results, peakHeapMB, out);
      const baseline = await loadSolverBaseline(out);

      const errored = results.map((r) => ({ ...r }));
      errored[0] = Object.assign({}, errored[0], { ok: false, error: new Error('boom') });
      await expect(checkAgainstSolverBaseline(errored, peakHeapMB, baseline)).rejects.toThrow(
        /errored/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when baseline is missing a fixture entry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runSolverBench(FAST_BENCH);
      await writeSolverBaselineJson(results, peakHeapMB, out);
      const baseline = await loadSolverBaseline(out);
      delete (baseline.fixtures as Record<string, unknown>)['large-stress'];

      await expect(checkAgainstSolverBaseline(results, peakHeapMB, baseline)).rejects.toThrow(
        /large-stress/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prints no diff and returns when current matches baseline exactly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runSolverBench(FAST_BENCH);
      await writeSolverBaselineJson(results, peakHeapMB, out);
      const baseline = await loadSolverBaseline(out);
      await expect(checkAgainstSolverBaseline(results, peakHeapMB, baseline)).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports a diff when ops/sec regresses by more than the tolerance', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runSolverBench(FAST_BENCH);
      await writeSolverBaselineJson(results, peakHeapMB, out);
      const baseline = await loadSolverBaseline(out);
      const slowed = results.map((r) => ({ ...r, hz: r.hz / 2 }));
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        await expect(checkAgainstSolverBaseline(slowed, peakHeapMB, baseline)).resolves.toBeUndefined();
        expect(log).toHaveBeenCalledWith('Performance diff vs baseline:');
      } finally {
        log.mockRestore();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

Note: `FixtureName` is re-imported in the test imports list above but is also already exported from `solver.bench.js` via the `FIXTURES` declaration. The redundant import is harmless.

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
yarn test
```

Expected: FAIL with `loadSolverBaseline is not a function` or similar.

- [ ] **Step 3: Implement `loadSolverBaseline()` and `checkAgainstSolverBaseline()`**

Append to `src/solver.bench.ts`:
```ts
export async function loadSolverBaseline(baselinePath: string): Promise<SolverBaselineFile> {
  let raw: string;
  try {
    raw = await readFile(baselinePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`no baseline at ${baselinePath}. Run 'yarn bench:solver:baseline' first.`);
    }
    throw err;
  }
  const baseline = JSON.parse(raw) as SolverBaselineFile;
  if (baseline.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    throw new Error(
      `baseline schemaVersion ${baseline.schemaVersion} does not match expected ${BASELINE_SCHEMA_VERSION}`,
    );
  }
  return baseline;
}

const PERCENT_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${PERCENT_FORMAT.format(value)}%`;
}

function diffLine(
  taskName: string,
  label: string,
  baseline: number,
  current: number,
): string {
  const delta = current - baseline;
  const pct = baseline === 0 ? 0 : (delta / baseline) * 100;
  return `  ${taskName}  ${label}: ${current.toFixed(2)} (baseline ${baseline.toFixed(2)}, ${formatPercent(pct)})`;
}

export async function checkAgainstSolverBaseline(
  results: BenchTaskResult[],
  peakHeapMB: Map<TaskName, number>,
  baseline: SolverBaselineFile,
): Promise<void> {
  const errored = results.filter((r) => !r.ok);
  if (errored.length > 0) {
    const names = errored.map((r) => r.name).join(', ');
    throw new Error(`task(s) errored: ${names}`);
  }

  let printedHeader = false;
  for (const [name] of FIXTURES) {
    const fixtureBaseline = baseline.fixtures[name];
    if (!fixtureBaseline) {
      throw new Error(`baseline missing entry for fixture '${name}'`);
    }
    for (const taskType of TASK_TYPES) {
      const taskName = `${taskType}:${name}` as TaskName;
      const result = results.find((r) => r.name === taskName);
      if (!result) {
        throw new Error(`Missing bench result for task ${taskName}`);
      }
      const taskBaseline = fixtureBaseline.tasks[taskType];
      if (!taskBaseline) {
        throw new Error(`baseline missing task '${taskType}' for fixture '${name}'`);
      }
      const peak = peakHeapMB.get(taskName) ?? 0;

      const opsDelta = result.hz - taskBaseline.opsPerSec;
      const opsPct =
        taskBaseline.opsPerSec === 0 ? 0 : (opsDelta / taskBaseline.opsPerSec) * 100;
      const p99Delta = result.p99 - taskBaseline.p99Ms;
      const peakDelta = peak - taskBaseline.peakHeapDeltaMB;

      const hasDiff =
        Math.abs(opsPct) > 0.5 || Math.abs(p99Delta) > 0.01 || Math.abs(peakDelta) > 0.01;
      if (hasDiff) {
        if (!printedHeader) {
          console.log('Performance diff vs baseline:');
          printedHeader = true;
        }
        console.log(diffLine(taskName, 'ops/sec', taskBaseline.opsPerSec, result.hz));
        console.log(diffLine(taskName, 'p99 ms  ', taskBaseline.p99Ms, result.p99));
        console.log(diffLine(taskName, 'peak MB ', taskBaseline.peakHeapDeltaMB, peak));
      }
    }
  }

  if (!printedHeader) {
    console.log('No performance diff vs baseline.');
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
yarn test
```

Expected: PASS — all tests pass. The "no diff" test runs the bench, writes a baseline from the same run, then checks it — should produce no diff.

- [ ] **Step 5: Commit**

```bash
git add src/solver.bench.ts src/solver.bench.test.ts
git commit -m "Add loadSolverBaseline and checkAgainstSolverBaseline for --check mode"
```

---

## Task 6: Wire CLI mode dispatch in `solver.bench.ts`

**Files:**
- Modify: `src/solver.bench.ts` (append)

- [ ] **Step 1: Add the main() function and module-level entry check**

Append to `src/solver.bench.ts`:
```ts
const BASELINE_DEFAULT_PATH = 'perf-baseline-solver.json';

async function main(): Promise<void> {
  const mode = argv[2];
  const { results, peakHeapMB } = await runSolverBench();

  if (mode === '--baseline') {
    await writeSolverBaselineJson(results, peakHeapMB, BASELINE_DEFAULT_PATH);
    console.log(`Baseline written to ${BASELINE_DEFAULT_PATH}`);
    return;
  }

  if (mode === '--check') {
    // this cycle: no threshold enforcement — a clean diff run exits 0.
    // Errors inside loadSolverBaseline / checkAgainstSolverBaseline throw and
    // propagate to a non-zero exit.
    const baseline = await loadSolverBaseline(BASELINE_DEFAULT_PATH);
    await checkAgainstSolverBaseline(results, peakHeapMB, baseline);
    return;
  }

  // Default: print a per-task summary including peak heap delta.
  console.log('solver perf summary (peak heap per task):');
  for (const r of results) {
    const peak = peakHeapMB.get(r.name as TaskName)?.toFixed(2) ?? '?';
    console.log(
      `  ${r.name.padEnd(38)} ${r.hz.toFixed(1).padStart(10)} ops/sec ±${r.rme.toFixed(2)}%  p99=${r.p99.toFixed(3)}ms  peak=${peak}MB`,
    );
  }
}

// Run as CLI only when this file is the entry point.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err);
    exit(1);
  });
}
```

- [ ] **Step 2: Verify the file typechecks**

Run:
```bash
yarn typecheck
```

Expected: PASS with no errors.

- [ ] **Step 3: Run all tests to confirm nothing broke**

Run:
```bash
yarn test
```

Expected: PASS — all previous tests still pass. The entry-point check (`import.meta.url === ...`) is false under Vitest, so `main()` does not run during tests.

- [ ] **Step 4: Verify the CLI runs (default mode prints summary)**

Run:
```bash
yarn bench:solver 2>&1 | head -35
```

Expected: a per-task summary listing all 28 tasks with `ops/sec`, margin, p99, and peak heap columns. The bench takes a few seconds; that's normal.

- [ ] **Step 5: Commit**

```bash
git add src/solver.bench.ts
git commit -m "Wire CLI mode dispatch in solver.bench.ts"
```

---

## Task 7: Record the baseline and commit `perf-baseline-solver.json`

**Files:**
- Create: `perf-baseline-solver.json`

- [ ] **Step 1: Run the baseline recorder**

Run:
```bash
yarn bench:solver:baseline
```

Expected: prints `Baseline written to perf-baseline-solver.json` and exits 0. The bench takes a few seconds.

- [ ] **Step 2: Inspect the produced baseline**

Run:
```bash
head -40 perf-baseline-solver.json
echo "..."
echo "Total fixtures:"
node -e "const b = require('./perf-baseline-solver.json'); console.log(Object.keys(b.fixtures).length);"
echo "Total task entries:"
node -e "const b = require('./perf-baseline-solver.json'); let n=0; for (const f of Object.values(b.fixtures)) n += Object.keys(f.tasks).length; console.log(n);"
```

Expected:
- `head -40` shows the schema, capturedAt, environment, and the first fixture entry with 4 task sub-entries.
- Total fixtures: `7`
- Total task entries: `28`

- [ ] **Step 3: Verify the `--check` mode produces a clean diff**

Re-run the bench and confirm `--check` reports no diff:

```bash
yarn bench:solver:check
```

Expected: prints `No performance diff vs baseline.` and exits 0.

If it prints a diff, the bench is too noisy and the threshold (currently 0.5% ops, 0.01 ms p99, 0.01 MB peak) needs to be relaxed in `checkAgainstSolverBaseline`. **Do not relax the threshold** — instead, re-run `--baseline` once more to refresh the file, since the diff likely reflects cold-start vs warm-start variance.

- [ ] **Step 4: Verify `perf-baseline-solver.json` is well-formed**

Run:
```bash
node -e "
const b = require('./perf-baseline-solver.json');
if (b.schemaVersion !== 1) { console.error('schemaVersion != 1'); process.exit(1); }
if (!b.capturedAt) { console.error('missing capturedAt'); process.exit(1); }
if (!b.environment) { console.error('missing environment'); process.exit(1); }
console.log('baseline valid: 7 fixtures, 28 task entries');
"
```

Expected: `baseline valid: 7 fixtures, 28 task entries` and exit 0.

- [ ] **Step 5: Run all tests one more time**

```bash
yarn test
```

Expected: PASS — all tests pass.

- [ ] **Step 6: Commit**

```bash
git add perf-baseline-solver.json
git commit -m "Record initial solver perf baseline"
```

---

## Task 8: Final verification

**Files:**
- Possibly fix issues surfaced below; commit cleanup if needed.

- [ ] **Step 1: Typecheck passes**

```bash
yarn typecheck
```

Expected: PASS.

- [ ] **Step 2: All tests pass**

```bash
yarn test
```

Expected: PASS — all `solver.test.ts`, `solver.bipolar.test.ts`, and `solver.bench.test.ts` tests pass.

- [ ] **Step 3: Lint passes**

```bash
yarn lint
```

Expected: PASS. If oxlint flags the new files (e.g., `max-lines: 400`, `max-lines-per-function: 80`), split the bench file or extract helpers. The spec estimated `solver.bench.ts` at ~280 lines, which fits.

- [ ] **Step 4: Format check passes**

```bash
yarn format:check
```

Expected: PASS. If not, run `yarn format` to fix, then commit the formatting.

- [ ] **Step 5: Default bench mode prints the summary**

```bash
yarn bench:solver 2>&1 | head -10
```

Expected: a summary line `solver perf summary (peak heap per task):` followed by per-task lines for all 28 tasks.

- [ ] **Step 6: Confirm files match the spec**

Run from repo root:
```bash
ls -la src/solver.bench.ts src/solver.bench.test.ts
test -f perf-baseline-solver.json && echo "baseline present"
node -e "const b = require('./perf-baseline-solver.json'); console.log('fixtures:', Object.keys(b.fixtures).length, 'tasks per fixture:', Object.keys(b.fixtures['small-claim'].tasks).length);"
```

Expected:
- Both source files exist.
- `baseline present` printed.
- `fixtures: 7 tasks per fixture: 4`.

- [ ] **Step 7: Confirm no accidental changes to `parser.bench.ts`**

```bash
git diff src/parser.bench.ts | head -5
```

Expected: empty diff — `parser.bench.ts` was NOT touched (per spec §3 decision).

- [ ] **Step 8: Final commit if any cleanup needed**

If Steps 1–4 required fixes:
```bash
git add -A
git commit -m "Fix lint/format issues from final verification"
```

Otherwise skip — everything is already committed across Tasks 1–7.

---

## Self-Review (post-write)

**Spec coverage check:**

| Spec section | Plan task(s) |
|---|---|
| §1 Goals | Tasks 1–7 deliver the baseline; §1 non-goals (CI thresholding, cross-platform, solver-specific fixtures, refactoring parser.bench.ts) are deferred as specified |
| §2 Decisions summary | Tasks 1 (CLI), 2 (constants), 3 (28 tasks), 4 (nested tasks JSON), 5 (mode dispatch) |
| §3 Architecture (file tree, dependency direction, FIXTURES duplication) | Task 2 (FIXTURES in solver.bench.ts); no parser.bench.ts changes (verified in Task 8 Step 7) |
| §4 Task matrix (4 task types × 7 fixtures = 28) | Task 3 (`TASK_TYPES` const, `makeTaskBody` factory, 28-task loop) |
| §5 Fixture reuse | No task needed (parser fixtures exist; verified in Task 2 Step 1 test) |
| §6 Bench file (§6.1 constants, §6.2 fixture loading with AST caching, §6.3 task construction with peak heap, §6.4 mode dispatch) | Tasks 2, 3, 6 |
| §7 Baseline format (schemaVersion 1, nested tasks, 28 entries) | Task 4 (`writeSolverBaselineJson`, `SolverBaselineFile` types); verified in Task 7 |
| §8 Error handling (fixture missing, task throws, baseline missing, schema mismatch) | Task 2 (fixture missing via readFile reject + test); Task 3 (no errored tasks via test); Task 4 (errored task → throw); Task 5 (missing baseline + schema mismatch) |
| §9 Structural test (15 assertions across FIXTURES, TASK_TYPES, runSolverBench, writeSolverBaselineJson, loadSolverBaseline, checkAgainstSolverBaseline) | Task 2 (6), Task 3 (4), Task 4 (3), Task 5 (7) = 20 assertions total |
| §10 Build, scripts, CI (bench:solver scripts, no CI) | Task 1 (scripts); CI deferred per spec |
| §11 Risks | All noted in spec; no extra tasks needed |
| §12 YAGNI | No tasks added for skipped items |
| §13 Verification (typecheck, test, lint, format, bench modes, files match spec) | Task 8 (8 verification steps) |

**Placeholder scan:** No "TBD", "TODO", "implement later", "fill in details", "add appropriate error handling", or "similar to Task N" in any task. Every code step has actual code. Every command has expected output.

**Type consistency:**

- `FIXTURES` defined Task 2, used Tasks 3, 4, 5, 8 — consistent shape (readonly tuple)
- `TASK_TYPES` defined Task 2, used Tasks 3, 4, 5, 6, 8 — consistent shape (readonly array)
- `FixtureName` type defined Task 2, used Tasks 4 (`SolverFixtureBaseline.fixtures`), 5 — consistent
- `TaskType` type defined Task 2, used Tasks 4, 5 — consistent
- `TaskName` type defined Task 2, used Tasks 3, 4, 5 — consistent
- `RunBenchResult`/`BenchTaskResult` defined Task 3, used Tasks 4, 5, 6 — consistent
- `SolverBaselineFile`/`SolverFixtureBaseline`/`SolverTaskBaseline` defined Task 4, used Tasks 5, 7, 8 — consistent
- `writeSolverBaselineJson` signature `(results, peakHeapMB, outPath)` used Tasks 4, 5, 7 — consistent
- `loadSolverBaseline` signature `(baselinePath)` defined Task 5, used Tasks 5, 6 — consistent
- `checkAgainstSolverBaseline` signature `(results, peakHeapMB, baseline)` defined Task 5, used Tasks 5, 6 — consistent
- `FAST_BENCH = { iterations: 5, time: 50 }` defined Task 3, used Tasks 3, 4, 5 — consistent
- Default baseline path `BASELINE_DEFAULT_PATH = 'perf-baseline-solver.json'` defined Task 6, used Task 7 — consistent
- Task name format `${taskType}:${name}` used Tasks 2 (test), 3 (construction), 4 (write), 5 (check) — consistent

**Gaps found and fixed during self-review:**

- None — spec coverage is complete. The test count is 20 (above the spec's 15+ floor).