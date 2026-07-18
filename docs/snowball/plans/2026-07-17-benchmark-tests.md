# Benchmark Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tinybench-based performance bench suite for the EDN `load()` / `solve()` pipeline that captures a committed `perf-baseline.json` with 21 task entries (3 task types × 7 fixtures), with `--baseline` and `--check` modes ready for a future CI cycle.

**Architecture:** A single `src/pipeline.bench.ts` loads 7 hand-crafted `.edn` fixtures at startup, caches validated documents for `solve` tasks, runs 21 Tinybench tasks (capturing ops/sec, p99, peak heap delta), and dispatches to `--baseline` (write JSON), `--check` (diff against JSON), or default (per-task summary). Testable exports (`FIXTURES`, `TASK_TYPES`, `runBench`, `writeBaselineJson`, `loadBaseline`, `checkAgainstBaseline`) are covered by `src/pipeline.bench.test.ts` with fast bench settings. Runner uses `tsx` (Yarn 4 PnP cannot resolve `.js` → `.ts` with native strip-types).

**Tech Stack:** TypeScript 5.4 (ESM), Tinybench 2.6, tsx 4.x, Vitest 1.6, Yarn 4 PnP, Node ≥18 (bench runner needs `tsx` installed).

**Spec:** `docs/snowball/specs/2026-07-17-benchmark-tests-design.md` (source of truth for design decisions).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `package.json` | modify | adds `tinybench`, `tsx` devDeps + `bench*` scripts |
| `src/bench.fixtures/small-minimal.edn` | new | 2 statements + 1 attack |
| `src/bench.fixtures/small-relations.edn` | new | attack + contradiction + support |
| `src/bench.fixtures/small-argument.edn` | new | argument with inference |
| `src/bench.fixtures/medium-censorship.edn` | new | copy of parity example (~3 KB) |
| `src/bench.fixtures/heavy-attacks.edn` | new | dense attack/contradiction graph (~10 KB) |
| `src/bench.fixtures/deep-arguments.edn` | new | many arguments with inferences (~10 KB) |
| `src/bench.fixtures/large-stress.edn` | new | mixed shapes at scale (~50–100 KB) |
| `src/pipeline.bench.ts` | new | Tinybench harness + mode dispatch (~220 lines) |
| `src/pipeline.bench.test.ts` | new | structural + baseline I/O tests (~200 lines) |
| `perf-baseline.json` | new | committed baseline (recorded in Task 8) |

**Dependency direction (one-way):**

```
pipeline.bench.ts  ──▶  index.ts (load, solve)
        │                │
        ├──▶ bench.fixtures/ (read at runtime via node:fs)
        ├──▶ perf-baseline.json (read/written at runtime)
        └──▶ tinybench (devDep)

pipeline.bench.test.ts  ──▶  pipeline.bench.ts (imports exports)
```

---

## Task 1: Add `tinybench` + `tsx` devDeps and bench scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add devDependencies**

Run from repo root:

```bash
yarn add -D tinybench@^2.6.0 tsx@^4.0.0
```

Expected: `package.json` gains `"tinybench": "^2.6.0"` and `"tsx": "^4.0.0"` in `devDependencies`; `yarn.lock` updates.

- [ ] **Step 2: Add bench scripts to `package.json`**

Add these three lines to the `scripts` object (keep alphabetical order):

```jsonc
    "bench":          "tsx src/pipeline.bench.ts",
    "bench:baseline": "yarn bench --baseline",
    "bench:check":    "yarn bench --check",
```

After editing, the full `scripts` block:

```jsonc
  "scripts": {
    "bench":          "tsx src/pipeline.bench.ts",
    "bench:baseline": "yarn bench --baseline",
    "bench:check":    "yarn bench --check",
    "build":          "tsc",
    "format":         "oxfmt --threads=1 src",
    "format:check":   "oxfmt --check --threads=1 src",
    "lint":           "oxlint src",
    "test":           "vitest run --passWithNoTests",
    "test:watch":     "vitest",
    "typecheck":      "tsc --noEmit"
  },
```

- [ ] **Step 3: Verify install**

```bash
yarn install
yarn bench 2>&1 | head -5 || true
```

Expected: `yarn bench` fails with module-not-found (bench file does not exist yet).

- [ ] **Step 4: Commit**

```bash
git add package.json yarn.lock
git commit -m "chore: add tinybench and tsx for pipeline benches"
```

---

## Task 2: Create the 7 EDN fixture files

**Files:**
- Create: `src/bench.fixtures/small-minimal.edn`
- Create: `src/bench.fixtures/small-relations.edn`
- Create: `src/bench.fixtures/small-argument.edn`
- Create: `src/bench.fixtures/medium-censorship.edn`
- Create: `src/bench.fixtures/heavy-attacks.edn`
- Create: `src/bench.fixtures/deep-arguments.edn`
- Create: `src/bench.fixtures/large-stress.edn`

- [ ] **Step 1: Create the fixtures directory**

```bash
mkdir -p src/bench.fixtures
```

- [ ] **Step 2: Create `small-minimal.edn`**

Write to `src/bench.fixtures/small-minimal.edn`:

```edn
#casualtheorics.argdown2.solver/grounded
[
  #casualtheorics.argdown2.argdown/statement {:id :a}
  #casualtheorics.argdown2.argdown/statement {:id :b}
  #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
]
```

- [ ] **Step 3: Create `small-relations.edn`**

Write to `src/bench.fixtures/small-relations.edn`:

```edn
#casualtheorics.argdown2.solver/grounded
[
  #casualtheorics.argdown2.argdown/statement {:id :claim}
  #casualtheorics.argdown2.argdown/statement {:id :counter}
  #casualtheorics.argdown2.argdown/statement {:id :support-target}
  #casualtheorics.argdown2.argdown/argument {:id :pro-arg :description "Pro side"}
  #casualtheorics.argdown2.argdown/attack {:from :pro-arg :to :counter}
  #casualtheorics.argdown2.argdown/contradiction {:from :claim :to :counter}
  #casualtheorics.argdown2.argdown/support {:from :pro-arg :to :support-target}
]
```

- [ ] **Step 4: Create `small-argument.edn`**

Write to `src/bench.fixtures/small-argument.edn`:

```edn
#casualtheorics.argdown2.solver/grounded
[
  #casualtheorics.argdown2.argdown/statement {:id :premise-a :text "Premise A"}
  #casualtheorics.argdown2.argdown/statement {:id :premise-b :text "Premise B"}
  #casualtheorics.argdown2.argdown/statement {:id :conclusion :text "Conclusion"}
  #casualtheorics.argdown2.argdown/argument
  {:id :main-argument
   :description "A simple inference chain"
   :tags #{:pro}
   :inferences
   [#casualtheorics.argdown2.argdown/inference
    {:id :main-inference
     :premises [:premise-a :premise-b]
     :conclusion :conclusion
     :rules [:modus-ponens]}]}
]
```

- [ ] **Step 5: Create `medium-censorship.edn`**

Copy the parity example:

```bash
cp examples/argdown1-censorship.edn src/bench.fixtures/medium-censorship.edn
```

- [ ] **Step 6: Generate `heavy-attacks.edn`**

Run from repo root (one-off generator; do not commit the script):

```bash
node --input-type=module -e "
const lines = [
  '#casualtheorics.argdown2.solver/grounded',
  '[',
];
for (let i = 0; i < 30; i++) {
  lines.push('  #casualtheorics.argdown2.argdown/statement {:id :n' + i + '}');
}
for (let i = 0; i < 25; i++) {
  const from = i % 30;
  const to = (i + 7) % 30;
  lines.push('  #casualtheorics.argdown2.argdown/attack {:from :n' + from + ' :to :n' + to + '}');
}
for (let i = 0; i < 5; i++) {
  const a = (i * 3) % 30;
  const b = (i * 3 + 1) % 30;
  lines.push('  #casualtheorics.argdown2.argdown/contradiction {:from :n' + a + ' :to :n' + b + '}');
}
lines.push(']');
process.stdout.write(lines.join('\n') + '\n');
" > src/bench.fixtures/heavy-attacks.edn
```

- [ ] **Step 7: Generate `deep-arguments.edn`**

```bash
node --input-type=module -e "
const lines = [
  '#casualtheorics.argdown2.solver/grounded',
  '[',
];
for (let i = 0; i < 25; i++) {
  lines.push('  #casualtheorics.argdown2.argdown/statement {:id :p' + i + '-a}');
  lines.push('  #casualtheorics.argdown2.argdown/statement {:id :p' + i + '-b}');
  lines.push('  #casualtheorics.argdown2.argdown/statement {:id :p' + i + '-c}');
  lines.push('  #casualtheorics.argdown2.argdown/argument');
  lines.push('  {:id :arg-' + i);
  lines.push('   :description \"Argument ' + i + '\"');
  lines.push('   :inferences');
  lines.push('   [#casualtheorics.argdown2.argdown/inference');
  lines.push('    {:id :inf-' + i);
  lines.push('     :premises [:p' + i + '-a :p' + i + '-b]');
  lines.push('     :conclusion :p' + i + '-c');
  lines.push('     :rules [:rule-' + i + ']}]}');
}
lines.push(']');
process.stdout.write(lines.join('\n') + '\n');
" > src/bench.fixtures/deep-arguments.edn
```

- [ ] **Step 8: Generate `large-stress.edn`**

```bash
node --input-type=module -e "
const lines = [
  '#casualtheorics.argdown2.solver/grounded',
  '[',
];
for (let i = 0; i < 50; i++) {
  lines.push('  #casualtheorics.argdown2.argdown/statement {:id :s' + i + ' :text \"Statement ' + i + ' with some padding text to increase size.\"}');
}
for (let i = 0; i < 25; i++) {
  lines.push('  #casualtheorics.argdown2.argdown/argument');
  lines.push('  {:id :a' + i);
  lines.push('   :description \"Argument description ' + i + ' with extra text for size.\"');
  lines.push('   :tags #{:pro}');
  lines.push('   :inferences');
  lines.push('   [#casualtheorics.argdown2.argdown/inference');
  lines.push('    {:id :ai' + i);
  lines.push('     :premises [:s' + (i % 50) + ' :s' + ((i + 1) % 50) + ']');
  lines.push('     :conclusion :s' + ((i + 2) % 50) + '');
  lines.push('     :rules [:r' + i + ']}]}');
}
for (let i = 0; i < 200; i++) {
  const from = i % 50;
  const to = (i + 13) % 50;
  if (from === to) continue;
  lines.push('  #casualtheorics.argdown2.argdown/attack {:from :s' + from + ' :to :s' + to + '}');
}
for (let i = 0; i < 20; i++) {
  const from = (i * 2) % 50;
  const to = (i * 2 + 1) % 50;
  lines.push('  #casualtheorics.argdown2.argdown/support {:from :a' + (i % 25) + ' :to :s' + from + '}');
}
lines.push(']');
process.stdout.write(lines.join('\n') + '\n');
" > src/bench.fixtures/large-stress.edn
```

Verify size:

```bash
wc -c src/bench.fixtures/*.edn
```

Expected: `large-stress.edn` is at least 50 KB. If smaller, re-run Step 8 with `100` attack iterations instead of `200`, or add more statement text.

- [ ] **Step 9: Verify all fixtures load**

```bash
yarn build
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { load } from './dist/index.js';
for (const f of [
  'src/bench.fixtures/small-minimal.edn',
  'src/bench.fixtures/small-relations.edn',
  'src/bench.fixtures/small-argument.edn',
  'src/bench.fixtures/medium-censorship.edn',
  'src/bench.fixtures/heavy-attacks.edn',
  'src/bench.fixtures/deep-arguments.edn',
  'src/bench.fixtures/large-stress.edn',
]) {
  const r = load(readFileSync(f, 'utf8'));
  if (!r.ok) { console.error('FAILED', f, r.errors); process.exit(1); }
  console.log('ok', f, r.document.elements.length, 'elements');
}
"
```

Expected: every fixture prints `ok` with a positive element count.

- [ ] **Step 10: Commit**

```bash
git add src/bench.fixtures/
git commit -m "test: add EDN performance fixtures"
```

---

## Task 3: `pipeline.bench.ts` skeleton + `FIXTURES` / `TASK_TYPES` exports

**Files:**
- Create: `src/pipeline.bench.ts`
- Create: `src/pipeline.bench.test.ts`

- [ ] **Step 1: Write the failing test for `FIXTURES` and `TASK_TYPES`**

Create `src/pipeline.bench.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { load } from './index.js';
import { FIXTURES, TASK_TYPES } from './pipeline.bench.js';

describe('FIXTURES', () => {
  it('has exactly 7 entries', () => {
    expect(FIXTURES).toHaveLength(7);
  });

  it('contains the expected fixture names in order', () => {
    expect(FIXTURES.map(([name]) => name)).toEqual([
      'small-minimal',
      'small-relations',
      'small-argument',
      'medium-censorship',
      'heavy-attacks',
      'deep-arguments',
      'large-stress',
    ]);
  });

  it('resolves to existing files', () => {
    for (const [name, path] of FIXTURES) {
      expect(existsSync(path), `fixture ${name} path ${path} does not exist`).toBe(true);
    }
  });

  it('each fixture loads successfully', () => {
    for (const [name, path] of FIXTURES) {
      const result = load(readFileSync(path, 'utf8'));
      expect(result.ok, `fixture ${name} failed to load`).toBe(true);
    }
  });
});

describe('TASK_TYPES', () => {
  it('contains exactly load, solve, load-solve', () => {
    expect([...TASK_TYPES]).toEqual(['load', 'solve', 'load-solve']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test src/pipeline.bench.test.ts
```

Expected: FAIL — `Cannot find module './pipeline.bench.js'`.

- [ ] **Step 3: Create bench skeleton**

Create `src/pipeline.bench.ts`:

```ts
// Tinybench harness for the load() / solve() pipeline.
// Runner: `tsx src/pipeline.bench.ts [--baseline|--check]`

import type { GroundedDocument } from './model.js';

export const FIXTURES = [
  ['small-minimal', 'src/bench.fixtures/small-minimal.edn'],
  ['small-relations', 'src/bench.fixtures/small-relations.edn'],
  ['small-argument', 'src/bench.fixtures/small-argument.edn'],
  ['medium-censorship', 'src/bench.fixtures/medium-censorship.edn'],
  ['heavy-attacks', 'src/bench.fixtures/heavy-attacks.edn'],
  ['deep-arguments', 'src/bench.fixtures/deep-arguments.edn'],
  ['large-stress', 'src/bench.fixtures/large-stress.edn'],
] as const;

export type FixtureName = (typeof FIXTURES)[number][0];

export const TASK_TYPES = ['load', 'solve', 'load-solve'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export type LoadedFixture = readonly [FixtureName, string, GroundedDocument];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
yarn test src/pipeline.bench.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.bench.ts src/pipeline.bench.test.ts
git commit -m "test: add pipeline bench skeleton with fixture exports"
```

---

## Task 4: Implement `runBench()` with Tinybench + memory measurement

**Files:**
- Modify: `src/pipeline.bench.ts`
- Modify: `src/pipeline.bench.test.ts`

- [ ] **Step 1: Add failing tests for `runBench()`**

Append to `src/pipeline.bench.test.ts`:

```ts
import { runBench } from './pipeline.bench.js';

const FAST_BENCH = { iterations: 5, time: 50 };

describe('runBench', () => {
  it('returns 21 results (3 task types × 7 fixtures)', async () => {
    const { results } = await runBench(FAST_BENCH);
    expect(results).toHaveLength(21);
  });

  it('result names match load:<fixture>, solve:<fixture>, load-solve:<fixture>', async () => {
    const { results } = await runBench(FAST_BENCH);
    const names = results.map((r) => r.name);
    const expected: string[] = [];
    for (const taskType of TASK_TYPES) {
      for (const [fixture] of FIXTURES) {
        expected.push(`${taskType}:${fixture}`);
      }
    }
    expect(names).toEqual(expected);
  });

  it('no task errors', async () => {
    const { results } = await runBench(FAST_BENCH);
    for (const r of results) {
      expect(r.state, `task ${r.name} errored`).toBe('completed');
    }
  });

  it('captures peak heap delta per task', async () => {
    const { peakHeapMB } = await runBench(FAST_BENCH);
    expect(peakHeapMB.size).toBe(21);
    for (const taskType of TASK_TYPES) {
      for (const [fixture] of FIXTURES) {
        const key = `${taskType}:${fixture}`;
        expect(peakHeapMB.has(key), `missing peak for ${key}`).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test src/pipeline.bench.test.ts
```

Expected: FAIL — `runBench is not a function` or not exported.

- [ ] **Step 3: Implement `runBench()`**

Append to `src/pipeline.bench.ts`:

```ts
import { readFile } from 'node:fs/promises';

import { Bench } from 'tinybench';

import { load, solve } from './index.js';

export interface BenchOptions {
  iterations?: number;
  time?: number;
}

export interface BenchTaskResult {
  name: string;
  state: string;
  hz: number;
  p99: number;
  rme: number;
}

export interface RunBenchResult {
  results: BenchTaskResult[];
  peakHeapMB: Map<string, number>;
}

function makeTaskBody(
  task: TaskType,
  source: string,
  cachedDoc: GroundedDocument,
): () => void {
  switch (task) {
    case 'load':
      return () => {
        load(source);
      };
    case 'solve':
      return () => {
        solve(cachedDoc);
      };
    case 'load-solve':
      return () => {
        const result = load(source);
        if (result.ok) solve(result.document);
      };
  }
}

async function loadFixtures(): Promise<LoadedFixture[]> {
  return Promise.all(
    FIXTURES.map(async ([name, path]) => {
      const source = await readFile(path, 'utf8');
      const result = load(source);
      if (!result.ok) throw new Error(`fixture ${name} failed to load`);
      return [name, source, result.document] as const;
    }),
  );
}

export async function runBench(options: BenchOptions = {}): Promise<RunBenchResult> {
  const { iterations = 50, time = 1000 } = options;
  const loaded = await loadFixtures();
  const bench = new Bench({ iterations, time, throws: false });
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

  const rawResults = await bench.run();
  const results: BenchTaskResult[] = (rawResults ?? []).map((r) => ({
    name: r.name ?? '',
    state: r.state ?? 'unknown',
    hz: r.hz ?? 0,
    p99: r.p99 ?? 0,
    rme: r.rme ?? 0,
  }));

  return { results, peakHeapMB };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
yarn test src/pipeline.bench.test.ts
```

Expected: PASS — all 9 tests pass (may take a few seconds).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.bench.ts src/pipeline.bench.test.ts
git commit -m "feat: add runBench with Tinybench and per-task heap tracking"
```

---

## Task 5: Implement `writeBaselineJson()` and `loadBaseline()`

**Files:**
- Modify: `src/pipeline.bench.ts`
- Modify: `src/pipeline.bench.test.ts`

- [ ] **Step 1: Add failing tests for baseline write/load**

Append to `src/pipeline.bench.test.ts`:

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadBaseline,
  writeBaselineJson,
  type BaselineFile,
} from './pipeline.bench.js';

describe('writeBaselineJson', () => {
  it('writes a valid baseline file with schemaVersion 1 and nested tasks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench(FAST_BENCH);
      await writeBaselineJson(results, peakHeapMB, out);

      const parsed = JSON.parse(await readFile(out, 'utf8')) as BaselineFile;
      expect(parsed.schemaVersion).toBe(1);
      expect(typeof parsed.capturedAt).toBe('string');
      expect(parsed.environment.nodeVersion).toBeTruthy();
      expect(parsed.fixtures['small-minimal'].tasks.load.opsPerSec).toBeGreaterThan(0);
      expect(parsed.fixtures['small-minimal'].tasks.solve.opsPerSec).toBeGreaterThan(0);
      expect(parsed.fixtures['small-minimal'].tasks['load-solve'].opsPerSec).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('has one fixture entry per FIXTURES name with 3 tasks each', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench(FAST_BENCH);
      await writeBaselineJson(results, peakHeapMB, out);
      const parsed = JSON.parse(await readFile(out, 'utf8')) as BaselineFile;

      for (const [name] of FIXTURES) {
        const entry = parsed.fixtures[name];
        expect(entry, `missing fixture ${name}`).toBeDefined();
        expect(typeof entry.sizeBytes).toBe('number');
        for (const taskType of TASK_TYPES) {
          const task = entry.tasks[taskType];
          expect(task, `missing task ${taskType} for ${name}`).toBeDefined();
          expect(typeof task.opsPerSec).toBe('number');
          expect(typeof task.marginOfError).toBe('number');
          expect(typeof task.p99Ms).toBe('number');
          expect(typeof task.peakHeapDeltaMB).toBe('number');
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when any task errored', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      await expect(
        writeBaselineJson(
          [{ name: 'load:small-minimal', state: 'errored', hz: 0, p99: 0, rme: 0 }],
          new Map(),
          out,
        ),
      ).rejects.toThrow(/errored/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('loadBaseline', () => {
  it('throws when baseline file is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      await expect(loadBaseline(join(dir, 'missing.json'))).rejects.toThrow(/no baseline/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws on schema version mismatch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const path = join(dir, 'baseline.json');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path, JSON.stringify({ schemaVersion: 2, fixtures: {} }), 'utf8');
      await expect(loadBaseline(path)).rejects.toThrow(/schema/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test src/pipeline.bench.test.ts
```

Expected: FAIL — `writeBaselineJson is not a function`.

- [ ] **Step 3: Implement `writeBaselineJson()` and `loadBaseline()`**

Append to `src/pipeline.bench.ts`:

```ts
import { readFile as readFileAsync, writeFile } from 'node:fs/promises';

export interface BaselineTaskEntry {
  opsPerSec: number;
  marginOfError: number;
  p99Ms: number;
  peakHeapDeltaMB: number;
}

export interface BaselineFixtureEntry {
  sizeBytes: number;
  tasks: Record<TaskType, BaselineTaskEntry>;
}

export interface BaselineFile {
  schemaVersion: 1;
  capturedAt: string;
  environment: {
    nodeVersion: string;
    platform: NodeJS.Platform;
    arch: string;
  };
  fixtures: Record<FixtureName, BaselineFixtureEntry>;
}

export const BASELINE_SCHEMA_VERSION = 1 as const;
export const BASELINE_DEFAULT_PATH = 'perf-baseline.json';

function parseTaskName(name: string): { taskType: TaskType; fixture: FixtureName } {
  const colon = name.indexOf(':');
  if (colon < 0) throw new Error(`invalid task name: ${name}`);
  return {
    taskType: name.slice(0, colon) as TaskType,
    fixture: name.slice(colon + 1) as FixtureName,
  };
}

export async function loadBaseline(baselinePath: string): Promise<BaselineFile> {
  let raw: string;
  try {
    raw = await readFileAsync(baselinePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`no baseline at ${baselinePath}. Run 'yarn bench:baseline' first.`);
    }
    throw err;
  }

  const baseline = JSON.parse(raw) as BaselineFile;
  if (baseline.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    throw new Error(
      `baseline schemaVersion ${baseline.schemaVersion} does not match expected ${BASELINE_SCHEMA_VERSION}`,
    );
  }
  return baseline;
}

export async function writeBaselineJson(
  results: BenchTaskResult[],
  peakHeapMB: Map<string, number>,
  outPath: string,
): Promise<void> {
  const errored = results.filter((r) => r.state !== 'completed');
  if (errored.length > 0) {
    throw new Error(`Cannot write baseline: task(s) errored: ${errored.map((r) => r.name).join(', ')}`);
  }

  const fixtures = Object.fromEntries(
    FIXTURES.map(([name]) => [name, { sizeBytes: 0, tasks: {} as Record<TaskType, BaselineTaskEntry> }]),
  ) as Record<FixtureName, BaselineFixtureEntry>;

  for (const [name, path] of FIXTURES) {
    fixtures[name].sizeBytes = Buffer.byteLength(await readFile(path, 'utf8'), 'utf8');
  }

  for (const result of results) {
    const { taskType, fixture } = parseTaskName(result.name);
    fixtures[fixture].tasks[taskType] = {
      opsPerSec: result.hz,
      marginOfError: result.rme,
      p99Ms: result.p99,
      peakHeapDeltaMB: peakHeapMB.get(result.name) ?? 0,
    };
  }

  for (const [name] of FIXTURES) {
    for (const taskType of TASK_TYPES) {
      if (!fixtures[name].tasks[taskType]) {
        throw new Error(`Missing bench result for ${taskType}:${name}`);
      }
    }
  }

  const baseline: BaselineFile = {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    fixtures,
  };

  await writeFile(outPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
yarn test src/pipeline.bench.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.bench.ts src/pipeline.bench.test.ts
git commit -m "feat: add baseline write and load for pipeline bench"
```

---

## Task 6: Implement `checkAgainstBaseline()`

**Files:**
- Modify: `src/pipeline.bench.ts`
- Modify: `src/pipeline.bench.test.ts`

- [ ] **Step 1: Add failing tests for `checkAgainstBaseline()`**

Append to `src/pipeline.bench.test.ts`:

```ts
import { writeFile } from 'node:fs/promises';

import { checkAgainstBaseline } from './pipeline.bench.js';

function makeValidBaseline(): BaselineFile {
  const task = (): BaselineTaskEntry => ({
    opsPerSec: 1000,
    marginOfError: 1,
    p99Ms: 1,
    peakHeapDeltaMB: 0.1,
  });
  const fixtures = Object.fromEntries(
    FIXTURES.map(([name]) => [
      name,
      { sizeBytes: 100, tasks: { load: task(), solve: task(), 'load-solve': task() } },
    ]),
  ) as BaselineFile['fixtures'];
  return {
    schemaVersion: 1,
    capturedAt: '2026-07-17T00:00:00.000Z',
    environment: { nodeVersion: 'v22.0.0', platform: 'darwin', arch: 'arm64' },
    fixtures,
  };
}

describe('checkAgainstBaseline', () => {
  it('throws when a bench result errored', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const path = join(dir, 'baseline.json');
      await writeFile(path, JSON.stringify(makeValidBaseline()), 'utf8');
      await expect(
        checkAgainstBaseline(
          [{ name: 'solve:small-minimal', state: 'errored', hz: 0, p99: 0, rme: 0 }],
          new Map(),
          path,
        ),
      ).rejects.toThrow(/errored/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when baseline is missing a fixture entry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const path = join(dir, 'baseline.json');
      const baseline = makeValidBaseline();
      delete (baseline.fixtures as Partial<typeof baseline.fixtures>)['large-stress'];
      await writeFile(path, JSON.stringify(baseline), 'utf8');
      const { results, peakHeapMB } = await runBench(FAST_BENCH);
      await expect(checkAgainstBaseline(results, peakHeapMB, path)).rejects.toThrow(/large-stress/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prints no diff and returns when current matches baseline', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const path = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench(FAST_BENCH);
      await writeBaselineJson(results, peakHeapMB, path);
      const { results: r2, peakHeapMB: h2 } = await runBench(FAST_BENCH);
      await expect(checkAgainstBaseline(r2, h2, path)).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports a diff when ops/sec regresses beyond tolerance', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      const path = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench(FAST_BENCH);
      await writeBaselineJson(results, peakHeapMB, path);

      const regressed = results.map((r) => ({ ...r, hz: r.hz * 0.5 }));
      await checkAgainstBaseline(regressed, peakHeapMB, path);
      expect(logs.some((line) => line.includes('ops/sec'))).toBe(true);
    } finally {
      console.log = original;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

Add this import at the top of the test file with the other pipeline imports:

```ts
import type { BaselineTaskEntry } from './pipeline.bench.js';
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test src/pipeline.bench.test.ts
```

Expected: FAIL — `checkAgainstBaseline is not a function`.

- [ ] **Step 3: Implement `checkAgainstBaseline()`**

Append to `src/pipeline.bench.ts`:

```ts
const percentFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

function formatPercent(value: number): string {
  return `${percentFormat.format(value)}%`;
}

function diffLine(
  name: string,
  label: string,
  baseline: number,
  current: number,
): string {
  const delta = current - baseline;
  const pct = baseline === 0 ? 0 : (delta / baseline) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `  ${name}  ${label}: ${current.toFixed(2)} (baseline ${baseline.toFixed(2)}, ${sign}${formatPercent(pct)})`;
}

export async function checkAgainstBaseline(
  results: BenchTaskResult[],
  peakHeapMB: Map<string, number>,
  baselinePath: string,
): Promise<void> {
  const baseline = await loadBaseline(baselinePath);

  const errored = results.filter((r) => r.state !== 'completed');
  if (errored.length > 0) {
    throw new Error(`task(s) errored: ${errored.map((r) => r.name).join(', ')}`);
  }

  let printedHeader = false;
  for (const result of results) {
    const { taskType, fixture } = parseTaskName(result.name);
    const baseFixture = baseline.fixtures[fixture];
    if (!baseFixture) {
      throw new Error(`baseline missing entry for fixture '${fixture}'`);
    }
    const base = baseFixture.tasks[taskType];
    if (!base) {
      throw new Error(`baseline missing task '${taskType}' for fixture '${fixture}'`);
    }

    const peak = peakHeapMB.get(result.name) ?? 0;
    const opsPct = base.opsPerSec === 0 ? 0 : ((result.hz - base.opsPerSec) / base.opsPerSec) * 100;
    const p99Delta = result.p99 - base.p99Ms;
    const peakDelta = peak - base.peakHeapDeltaMB;

    const hasDiff =
      Math.abs(opsPct) > 0.5 || Math.abs(p99Delta) > 0.01 || Math.abs(peakDelta) > 0.01;
    if (hasDiff) {
      if (!printedHeader) {
        console.log('Performance diff vs baseline:');
        printedHeader = true;
      }
      console.log(diffLine(result.name, 'ops/sec', base.opsPerSec, result.hz));
      console.log(diffLine(result.name, 'p99 ms  ', base.p99Ms, result.p99));
      console.log(diffLine(result.name, 'peak MB ', base.peakHeapDeltaMB, peak));
    }
  }

  if (!printedHeader) {
    console.log('No performance diff vs baseline.');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
yarn test src/pipeline.bench.test.ts
```

Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.bench.ts src/pipeline.bench.test.ts
git commit -m "feat: add checkAgainstBaseline for pipeline bench"
```

---

## Task 7: Wire CLI mode dispatch in `pipeline.bench.ts`

**Files:**
- Modify: `src/pipeline.bench.ts`

- [ ] **Step 1: Add `main()` and entry-point guard**

Append to `src/pipeline.bench.ts`:

```ts
import { argv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';

async function main(): Promise<void> {
  const mode = argv[2];
  const { results, peakHeapMB } = await runBench();

  if (mode === '--baseline') {
    await writeBaselineJson(results, peakHeapMB, BASELINE_DEFAULT_PATH);
    console.log(`Baseline written to ${BASELINE_DEFAULT_PATH}`);
    return;
  }

  if (mode === '--check') {
    await checkAgainstBaseline(results, peakHeapMB, BASELINE_DEFAULT_PATH);
    return;
  }

  console.log('pipeline perf summary (peak heap per task):');
  for (const r of results) {
    const peak = peakHeapMB.get(r.name)?.toFixed(2) ?? '?';
    console.log(
      `  ${r.name.padEnd(38)} ${r.hz.toFixed(1).padStart(10)} ops/sec ±${r.rme.toFixed(2)}%  p99=${r.p99.toFixed(3)}ms  peak=${peak}MB`,
    );
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err: unknown) => {
    console.error(err);
    exit(1);
  });
}
```

- [ ] **Step 2: Verify typecheck and tests**

```bash
yarn typecheck
yarn test
```

Expected: PASS for both.

- [ ] **Step 3: Smoke-test default bench mode**

```bash
yarn bench 2>&1 | head -25
```

Expected: 21 lines of per-task summary; exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/pipeline.bench.ts
git commit -m "feat: wire CLI mode dispatch in pipeline bench"
```

---

## Task 8: Record the baseline and commit `perf-baseline.json`

**Files:**
- Create: `perf-baseline.json`

- [ ] **Step 1: Run the baseline recorder**

```bash
yarn bench:baseline
```

Expected: prints `Baseline written to perf-baseline.json`; exit 0.

- [ ] **Step 2: Inspect the baseline**

```bash
node -e "
const b = require('./perf-baseline.json');
console.log('schemaVersion', b.schemaVersion);
console.log('fixtures', Object.keys(b.fixtures).length);
const tasks = Object.values(b.fixtures).flatMap(f => Object.keys(f.tasks));
console.log('task entries', tasks.length);
"
```

Expected: `schemaVersion 1`, `fixtures 7`, `task entries 21`.

- [ ] **Step 3: Verify `--check` produces a clean diff**

```bash
yarn bench:check
```

Expected: prints `No performance diff vs baseline.`; exit 0.

- [ ] **Step 4: Commit**

```bash
git add perf-baseline.json
git commit -m "chore: record initial pipeline perf baseline"
```

---

## Task 9: Final verification

- [ ] **Step 1: Typecheck**

```bash
yarn typecheck
```

Expected: PASS.

- [ ] **Step 2: All tests**

```bash
yarn test
```

Expected: PASS — all existing tests plus `pipeline.bench.test.ts`.

- [ ] **Step 3: Lint**

```bash
yarn lint
```

Expected: PASS. Fix any issues in new files.

- [ ] **Step 4: Format check**

```bash
yarn format:check
```

Expected: PASS. If not, run `yarn format` and commit formatting fixes.

- [ ] **Step 5: Confirm file layout matches spec**

```bash
ls src/pipeline.bench.ts src/pipeline.bench.test.ts
ls src/bench.fixtures/
test -f perf-baseline.json && echo "baseline present"
```

Expected: all files present per `docs/snowball/specs/2026-07-17-benchmark-tests-design.md` §3.

- [ ] **Step 6: Final commit if cleanup needed**

If Steps 3–4 required fixes:

```bash
git add -A
git commit -m "chore: fix lint and format for pipeline bench"
```

Otherwise skip.
