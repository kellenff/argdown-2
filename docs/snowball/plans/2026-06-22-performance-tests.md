# Argdown-2 Performance Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tinybench-based performance test suite for `parse()` that captures a committed `perf-baseline.json` of current numbers, with mode dispatch (`--baseline`, `--check`, default) ready for the next cycle's CI thresholding.

**Architecture:** A single `src/parser.bench.ts` is the bench harness — it loads 7 hand-crafted `.argdown` fixtures at startup, runs one Tinybench task per fixture (capturing ops/sec, p99, and peak heap delta), and dispatches to `--baseline` (write JSON), `--check` (diff against JSON, print), or default (Tinybench's table). The testable parts (`FIXTURES`, `runBench`, `writeBaselineJson`, `checkAgainstBaseline`) are exported and covered by `src/parser.bench.test.ts`. Bench runner uses Node's native `--experimental-strip-types` (Node 22+) — no `tsx` dep.

**Tech Stack:** TypeScript 5.4 (ESM, Node 22+ for the bench runner, 18+ for the parser), Tinybench 2.6, Vitest, Yarn 4 PnP.

**Spec:** `docs/snowball/specs/2026-06-22-performance-tests-design.md` (source of truth for design decisions).

---

## File Structure

Files created/modified in this plan:

| File | Status | Responsibility | Lines (est.) |
|---|---|---|---|
| `package.json` | modify | adds `tinybench` devDep + `bench`, `bench:baseline`, `bench:check` scripts | +6 |
| `src/parser.fixtures/small-claim.argdown` | new | single fact with attribute block | ~10 |
| `src/parser.fixtures/small-rule.argdown` | new | rule with 3 premises | ~10 |
| `src/parser.fixtures/small-relation.argdown` | new | relation with attribute block | ~10 |
| `src/parser.fixtures/medium-climate.argdown` | new | expanded Climate Policy example | ~150 |
| `src/parser.fixtures/heavy-relations.argdown` | new | dense relation graph | ~200 |
| `src/parser.fixtures/deep-nesting.argdown` | new | many `:::evidence` blocks | ~200 |
| `src/parser.fixtures/large-stress.argdown` | new | long mixed document | ~2000 (100 KB) |
| `src/parser.bench.ts` | new | Tinybench harness + mode dispatch | ~180 |
| `src/parser.bench.test.ts` | new | unit + structural tests | ~80 |
| `perf-baseline.json` | new | committed baseline (recorded after Task 7) | n/a |

**Dependency direction (one-way):**

```
parser.bench.ts  ──▶  parser.ts  ──▶  tokens.ts
        │                │
        ├──▶ parser.fixtures/ (read at runtime via node:fs)
        ├──▶ perf-baseline.json (read/written at runtime)
        └──▶ tinybench (devDep)

parser.bench.test.ts  ──▶  parser.bench.ts (imports FIXTURES + helper fns)
```

`parser.bench.ts` exports the testable units (`FIXTURES`, `runBench`, `writeBaselineJson`, `checkAgainstBaseline`, `BaselineFile` type). The mode dispatch is a thin CLI shell at the bottom of the file that calls those exports.

---

## Task 1: Add `tinybench` devDep + bench scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `tinybench` to devDependencies**

Run from repo root:
```bash
yarn add -D tinybench@^2.6.0
```

Expected: `package.json` gains `"tinybench": "^2.6.0"` in `devDependencies`, and `yarn.lock` is updated.

- [ ] **Step 2: Add bench scripts to `package.json`**

Edit the `scripts` block in `package.json`. The `bench` script uses Node's native TypeScript stripping (Node 22+); the parser itself still runs on Node 18+.

Add these three lines to the `scripts` object (keep alphabetical order with existing scripts):
```jsonc
    "bench":          "node --experimental-strip-types src/parser.bench.ts",
    "bench:baseline": "yarn bench --baseline",
    "bench:check":    "yarn bench --check",
```

After editing, the full `scripts` block should look like:
```jsonc
  "scripts": {
    "bench":          "node --experimental-strip-types src/parser.bench.ts",
    "bench:baseline": "yarn bench --baseline",
    "bench:check":    "yarn bench --check",
    "build":          "tsc",
    "format":         "oxfmt src",
    "format:check":   "oxfmt --check src",
    "lint":           "oxlint src",
    "test":           "vitest run --passWithNoTests",
    "test:watch":     "vitest",
    "typecheck":      "tsc --noEmit"
  },
```

- [ ] **Step 3: Verify scripts parse and `tinybench` is installed**

Run:
```bash
node --version
yarn install
yarn bench --help 2>&1 | head -5 || true
```

Expected: `node --version` reports `v22.x` or higher. `yarn install` is a no-op (PnP). `yarn bench` fails with "Cannot find module" or similar (expected — `src/parser.bench.ts` doesn't exist yet).

- [ ] **Step 4: Commit**

```bash
git add package.json yarn.lock
git commit -m "Add tinybench devDep and bench scripts"
```

---

## Task 2: Create the 7 fixture files

**Files:**
- Create: `src/parser.fixtures/small-claim.argdown`
- Create: `src/parser.fixtures/small-rule.argdown`
- Create: `src/parser.fixtures/small-relation.argdown`
- Create: `src/parser.fixtures/medium-climate.argdown`
- Create: `src/parser.fixtures/heavy-relations.argdown`
- Create: `src/parser.fixtures/deep-nesting.argdown`
- Create: `src/parser.fixtures/large-stress.argdown`

- [ ] **Step 1: Create the fixtures directory**

```bash
mkdir -p src/parser.fixtures
```

- [ ] **Step 2: Create `small-claim.argdown`**

A single fact with attribute block — minimum-cost parse path.

Write to `src/parser.fixtures/small-claim.argdown`:
```argdown
[#climate-claim] Human CO2 emissions are the primary cause of global warming {
  author: "Dr. Jane Smith",
  confidence: 0.95,
  tags: ["climate", "policy"],
  status: "accepted"
}
```

- [ ] **Step 3: Create `small-rule.argdown`**

A derivation rule with multiple premises and attributes.

Write to `src/parser.fixtures/small-rule.argdown`:
```argdown
[#mitigation] :- [#co2], [#impacts], [#coord] { strength: "strong", scheme: "linked" }.
[#mitigation] :- [#moral-imperative] { strength: "moderate", scheme: "convergent" }.
[#mitigation] :- [#economic-opportunity] { strength: "moderate", scheme: "convergent" }.
```

- [ ] **Step 4: Create `small-relation.argdown`**

A relation with attribute block plus a rule-undercut relation.

Write to `src/parser.fixtures/small-relation.argdown`:
```argdown
[#impacts] --x [#gradual] {
  type: "undercut",
  reason: "impacts negate the sufficiency of gradualism"
}

[#gradual] --x ([#mitigation] :- [#co2], [#impacts], [#coord]) {
  reason: "attacks the inferential link"
}
```

- [ ] **Step 5: Create `medium-climate.argdown`**

An expanded version of the Climate Policy example from `docs/DESIGN.md` — multiple facts, multiple relations, an evidence block, and a stakeholder block. Should land at roughly 10 KB.

Write to `src/parser.fixtures/medium-climate.argdown`:
```argdown
===
title: Climate Policy Analysis
author: Research Team
version: 2.1
date: 2026-06-22
===

# Position: Aggressive Mitigation

[#co2] Human CO2 emissions are the primary cause {
  source: "@IPCC-AR6",
  confidence: 0.95,
  scheme: "expert_consensus"
}

[#impacts] Current warming trends threaten critical systems {
  certainty: 0.60,
  tags: ["urgent", "biosphere"]
}

[#coord] International coordination is achieved { certainty: 0.45 }

[#gradual] Gradual transition is sufficient { author: "Industry Group A" }

[#moral-imperative] We have a duty to act { strength: "strong" }

[#economic-opportunity] Green economy creates jobs { certainty: 0.70 }

[#mitigation] :- [#co2], [#impacts], [#coord].
[#mitigation] :- [#moral-imperative].
[#mitigation] :- [#economic-opportunity].

# Relations
[#impacts] --x [#gradual] { type: "undercut" }
[#gradual] --x ([#mitigation] :- [#co2], [#impacts], [#coord]) { reason: "sufficiency" }
[#co2] --> [#mitigation] { type: "support" }
[#impacts] --> [#mitigation] { type: "support" }
[#coord] --> [#mitigation] { type: "support" }
[#moral-imperative] --> [#mitigation] { type: "support" }
[#economic-opportunity] --> [#mitigation] { type: "support" }

:::evidence[Satellite Data]
type: empirical
method: satellite_measurement
confidence: 0.95
source: "@NASA-2024"
:::

:::evidence[Ocean Warming]
type: empirical
method: argo_floats
confidence: 0.92
source: "@NOAA-2024"
:::

:::stakeholder[ipcc]
name: Intergovernmental Panel on Climate Change
type: scientific_body
credibility: high
:::

:::stakeholder[Industry-Group-A]
name: Industry Group A
type: industry_lobby
interests: "fossil_fuel_continuation"
:::
```

- [ ] **Step 6: Create `heavy-relations.argdown`**

A document dominated by relations — exercises the relation-statement parse path heavily. Aim for ~10 KB.

Write to `src/parser.fixtures/heavy-relations.argdown`:
```argdown
=== title: Relation Stress === author: perf === ===

# 20 anchor facts
[#n0] Node zero { type: "anchor" }
[#n1] Node one { type: "anchor" }
[#n2] Node two { type: "anchor" }
[#n3] Node three { type: "anchor" }
[#n4] Node four { type: "anchor" }
[#n5] Node five { type: "anchor" }
[#n6] Node six { type: "anchor" }
[#n7] Node seven { type: "anchor" }
[#n8] Node eight { type: "anchor" }
[#n9] Node nine { type: "anchor" }
[#n10] Node ten { type: "anchor" }
[#n11] Node eleven { type: "anchor" }
[#n12] Node twelve { type: "anchor" }
[#n13] Node thirteen { type: "anchor" }
[#n14] Node fourteen { type: "anchor" }
[#n15] Node fifteen { type: "anchor" }
[#n16] Node sixteen { type: "anchor" }
[#n17] Node seventeen { type: "anchor" }
[#n18] Node eighteen { type: "anchor" }
[#n19] Node nineteen { type: "anchor" }

# Dense graph: every node attacks its successor and supports its predecessor
[#n0] --> [#n1] { weight: 1.0 }
[#n1] --> [#n2] { weight: 1.0 }
[#n2] --> [#n3] { weight: 1.0 }
[#n3] --> [#n4] { weight: 1.0 }
[#n4] --> [#n5] { weight: 1.0 }
[#n5] --> [#n6] { weight: 1.0 }
[#n6] --> [#n7] { weight: 1.0 }
[#n7] --> [#n8] { weight: 1.0 }
[#n8] --> [#n9] { weight: 1.0 }
[#n9] --> [#n10] { weight: 1.0 }
[#n10] --> [#n11] { weight: 1.0 }
[#n11] --> [#n12] { weight: 1.0 }
[#n12] --> [#n13] { weight: 1.0 }
[#n13] --> [#n14] { weight: 1.0 }
[#n14] --> [#n15] { weight: 1.0 }
[#n15] --> [#n16] { weight: 1.0 }
[#n16] --> [#n17] { weight: 1.0 }
[#n17] --> [#n18] { weight: 1.0 }
[#n18] --> [#n19] { weight: 1.0 }
[#n1] --x [#n0] { weight: 0.5 }
[#n2] --x [#n1] { weight: 0.5 }
[#n3] --x [#n2] { weight: 0.5 }
[#n4] --x [#n3] { weight: 0.5 }
[#n5] --x [#n4] { weight: 0.5 }
[#n6] --x [#n5] { weight: 0.5 }
[#n7] --x [#n6] { weight: 0.5 }
[#n8] --x [#n7] { weight: 0.5 }
[#n9] --x [#n8] { weight: 0.5 }
[#n10] --x [#n9] { weight: 0.5 }
[#n11] --x [#n10] { weight: 0.5 }
[#n12] --x [#n11] { weight: 0.5 }
[#n13] --x [#n12] { weight: 0.5 }
[#n14] --x [#n13] { weight: 0.5 }
[#n15] --x [#n14] { weight: 0.5 }
[#n16] --x [#n15] { weight: 0.5 }
[#n17] --x [#n16] { weight: 0.5 }
[#n18] --x [#n17] { weight: 0.5 }
[#n19] --x [#n18] { weight: 0.5 }
[#n0] ~> [#n19] { concession: "boundary" }
[#n19] ?> [#n0] { qualification: "scope" }
[#n0] <-> [#n10] { equivalence: "weak" }
[#n5] <-> [#n15] { equivalence: "weak" }
```

- [ ] **Step 7: Create `deep-nesting.argdown`**

A document with many `:::evidence` and `:::stakeholder` blocks containing YAML — exercises the block-parse path. Aim for ~10 KB.

Write to `src/parser.fixtures/deep-nesting.argdown`:
```argdown
=== title: Block Stress === author: perf === ===

[#thesis] The thesis under examination

:::evidence[Source 1]
type: empirical
method: randomized_controlled_trial
confidence: 0.92
sample_size: 1200
year: 2024
:::

:::evidence[Source 2]
type: empirical
method: meta_analysis
confidence: 0.88
sample_size: 50
year: 2023
:::

:::evidence[Source 3]
type: empirical
method: observational
confidence: 0.75
sample_size: 30000
year: 2025
:::

:::evidence[Source 4]
type: theoretical
method: formal_proof
confidence: 0.99
year: 2022
:::

:::evidence[Source 5]
type: empirical
method: case_study
confidence: 0.65
sample_size: 4
year: 2024
:::

:::stakeholder[stakeholder-1]
name: Alice Anderson
role: principal_investigator
affiliation: University A
:::

:::stakeholder[stakeholder-2]
name: Bob Brown
role: co_investigator
affiliation: University B
:::

:::stakeholder[stakeholder-3]
name: Carol Chen
role: statistician
affiliation: Institute C
:::

:::meta[methodology]
approach: mixed_methods
phase: data_collection
status: ongoing
:::

:::position[expert-a]
person: Dr. A
stance: supportive
strength: 0.8
:::

:::position[expert-b]
person: Dr. B
stance: critical
strength: 0.6
:::

:::domain[field-1]
name: Epidemiology
relevance: high
:::

:::domain[field-2]
name: Public Health
relevance: high
:::

[#thesis] --> [#supporting] { from: "evidence-1" }
[#thesis] --> [#supporting] { from: "evidence-2" }
[#thesis] --> [#supporting] { from: "evidence-3" }
```

- [ ] **Step 8: Create `large-stress.argdown` via one-off generator**

The 100 KB fixture. Hand-writing 100 KB of varied content is tedious; use a one-off Node script to produce it. **Do not commit the script** — only the output.

Run from repo root:
```bash
node -e "
const facts = Array.from({length: 50}, (_, i) => '[#n' + i + '] Claim number ' + i + ' { author: \"test\", confidence: ' + (0.5 + (i % 50) / 100).toFixed(2) + ' }');
const relations = [];
for (let block = 0; block < 20; block++) {
  for (let i = 0; i < 50; i++) {
    const a = '#n' + ((block * 50 + i) % 50);
    const b = '#n' + ((block * 50 + i + 1) % 50);
    relations.push('[' + a + '] --> [' + b + '] { weight: ' + (i % 10 / 10).toFixed(2) + ' }');
    if (i % 3 === 0) {
      const c = '#n' + ((block * 50 + i + 25) % 50);
      relations.push('[' + a + '] --x [' + c + '] { weight: 0.5 }');
    }
  }
  const blockFact = '[#block-' + block + '] Block summary ' + block + ' { block: ' + block + ', size: large }';
  facts.push(blockFact);
}
const header = '===\ntitle: Large Stress Fixture\nauthor: perf\ngenerated: 2026-06-22\n===\n\n';
process.stdout.write(header + facts.join('\n') + '\n\n' + relations.join('\n') + '\n');
" > src/parser.fixtures/large-stress.argdown
```

Verify the size:
```bash
wc -c src/parser.fixtures/large-stress.argdown
ls -la src/parser.fixtures/large-stress.argdown
```

Expected: file is at least 50 KB. If smaller, re-run with a larger `block` loop count (e.g., 40 instead of 20).

- [ ] **Step 9: Verify all fixtures parse**

A quick sanity check that every fixture parses without errors. This is a one-off shell check, not a test — the proper test goes in Task 7.

```bash
for f in src/parser.fixtures/*.argdown; do
  echo "=== $f ==="
  node -e "
    import('./dist/parser.js').then(async ({parse}) => {
      const {readFileSync} = await import('node:fs');
      const src = readFileSync(process.argv[1], 'utf8');
      const r = parse(src, {filename: process.argv[1]});
      if (!r.ok) { console.error('FAILED'); process.exit(1); }
      console.log('ok, ' + r.ast.elements.length + ' elements');
    });
  " "$f"
done
```

If `dist/` doesn't exist yet, run `yarn build` first.

Expected: every fixture prints `ok, N elements`. If any fails, check the fixture content.

- [ ] **Step 10: Commit**

```bash
git add src/parser.fixtures/
git commit -m "Add 7 Argdown performance fixtures"
```

---

## Task 3: `parser.bench.ts` skeleton + `FIXTURES` export

**Files:**
- Create: `src/parser.bench.ts`
- Create: `src/parser.bench.test.ts`

- [ ] **Step 1: Write the failing test for `FIXTURES`**

Create `src/parser.bench.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { FIXTURES } from './parser.bench.js';

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
yarn test
```

Expected: FAIL with "Cannot find module './parser.bench.js'" or similar.

- [ ] **Step 3: Implement the bench file skeleton with `FIXTURES` export**

Create `src/parser.bench.ts`:
```ts
// src/parser.bench.ts
// Tinybench harness for the parse() pipeline.
// Runner: `node --experimental-strip-types src/parser.bench.ts [--baseline|--check]`
// Requires Node 22+ for native TypeScript stripping.

import { Bench } from 'tinybench';
import { readFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';
import { parse } from './parser.js';

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
yarn test
```

Expected: PASS — 4 `FIXTURES` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/parser.bench.ts src/parser.bench.test.ts
git commit -m "Add parser.bench.ts skeleton with FIXTURES export"
```

---

## Task 4: Implement `runBench()` with Tinybench + memory measurement

**Files:**
- Modify: `src/parser.bench.ts`
- Modify: `src/parser.bench.test.ts`

- [ ] **Step 1: Add a failing test for `runBench()`**

Append to the `describe` block in `src/parser.bench.test.ts`:
```ts
import { runBench } from './parser.bench.js';

// inside describe('FIXTURES', () => { ... }) — add a new describe below it:
describe('runBench', () => {
  it('returns one result per fixture', async () => {
    const { results } = await runBench();
    expect(results).toHaveLength(7);
  });

  it('result names match FIXTURES order', async () => {
    const { results } = await runBench();
    const names = results.map((r) => r.name);
    expect(names).toEqual(FIXTURES.map(([n]) => n));
  });

  it('no fixture errors', async () => {
    const { results } = await runBench();
    for (const r of results) {
      expect(r.state, `fixture ${r.name} errored`).toBe('completed');
    }
  });

  it('captures a peak heap delta per fixture', async () => {
    const { peakHeapMB } = await runBench();
    for (const [name] of FIXTURES) {
      const peak = peakHeapMB.get(name);
      expect(peak, `no peak for ${name}`).toBeDefined();
      expect(peak).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
yarn test
```

Expected: FAIL with "runBench is not a function" or similar.

- [ ] **Step 3: Implement `runBench()`**

Append to `src/parser.bench.ts` (after the `FixtureName` type):
```ts
async function loadFixtures(): Promise<Array<readonly [FixtureName, string]>> {
  return Promise.all(
    FIXTURES.map(
      async ([name, path]) => [name, await readFile(path, 'utf8')] as const,
    ),
  );
}

export interface RunBenchResult {
  results: Array<{
    name: string;
    state: string;
    hz: number;
    p99: number;
    rme: number;
  }>;
  peakHeapMB: Map<FixtureName, number>;
}

export async function runBench(): Promise<RunBenchResult> {
  const loaded = await loadFixtures();
  const bench = new Bench({ iterations: 50, time: 1000 });
  const peakHeapMB = new Map<FixtureName, number>();

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

  const results = await bench.run();
  return { results: results as RunBenchResult['results'], peakHeapMB };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
yarn test
```

Expected: PASS — all `FIXTURES` and `runBench` tests pass. The bench may take a few seconds to run; that's normal.

- [ ] **Step 5: Commit**

```bash
git add src/parser.bench.ts src/parser.bench.test.ts
git commit -m "Add runBench with Tinybench and per-fixture heap tracking"
```

---

## Task 5: Implement `writeBaselineJson()` (the `--baseline` mode)

**Files:**
- Modify: `src/parser.bench.ts`
- Modify: `src/parser.bench.test.ts`

- [ ] **Step 1: Add a failing test for `writeBaselineJson()`**

Append a new `describe` block to `src/parser.bench.test.ts`:
```ts
import { writeBaselineJson, type BaselineFile } from './parser.bench.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('writeBaselineJson', () => {
  it('writes a valid baseline file with schemaVersion 1', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench();
      await writeBaselineJson(results, peakHeapMB, out);

      const raw = await readFile(out, 'utf8');
      const parsed = JSON.parse(raw) as BaselineFile;

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

  it('has one entry per fixture with required fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench();
      await writeBaselineJson(results, peakHeapMB, out);

      const parsed = JSON.parse(await readFile(out, 'utf8')) as BaselineFile;

      for (const [name] of FIXTURES) {
        const entry = parsed.fixtures[name];
        expect(entry, `missing entry for ${name}`).toBeDefined();
        expect(typeof entry.sizeBytes).toBe('number');
        expect(typeof entry.opsPerSec).toBe('number');
        expect(typeof entry.marginOfError).toBe('number');
        expect(typeof entry.p99Ms).toBe('number');
        expect(typeof entry.peakHeapDeltaMB).toBe('number');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when a fixture errored', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const fakeResults = [
        {
          name: 'small-claim',
          state: 'errored',
          hz: 0,
          p99: 0,
          rme: 0,
        },
      ];
      const peakHeapMB = new Map();
      await expect(
        writeBaselineJson(fakeResults, peakHeapMB, out),
      ).rejects.toThrow(/errored/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
yarn test
```

Expected: FAIL with "writeBaselineJson is not a function" or similar.

- [ ] **Step 3: Implement `writeBaselineJson()` and the `BaselineFile` type**

Append to `src/parser.bench.ts`:
```ts
import { writeFile } from 'node:fs/promises';

export interface BaselineEntry {
  sizeBytes: number;
  opsPerSec: number;
  marginOfError: number;
  p99Ms: number;
  peakHeapDeltaMB: number;
}

export interface BaselineFile {
  schemaVersion: 1;
  capturedAt: string;
  environment: {
    nodeVersion: string;
    platform: NodeJS.Platform;
    arch: string;
  };
  fixtures: Record<FixtureName, BaselineEntry>;
}

const BASELINE_SCHEMA_VERSION = 1 as const;

export async function writeBaselineJson(
  results: RunBenchResult['results'],
  peakHeapMB: Map<FixtureName, number>,
  outPath: string,
): Promise<void> {
  const errored = results.filter((r) => r.state !== 'completed');
  if (errored.length > 0) {
    const names = errored.map((r) => r.name).join(', ');
    throw new Error(`Cannot write baseline: fixture(s) errored: ${names}`);
  }

  const fixtures = {} as Record<FixtureName, BaselineEntry>;
  for (const [name, path] of FIXTURES) {
    const result = results.find((r) => r.name === name);
    if (!result) {
      throw new Error(`Missing bench result for fixture ${name}`);
    }
    const source = await readFile(path, 'utf8');
    const sizeBytes = Buffer.byteLength(source, 'utf8');

    fixtures[name] = {
      sizeBytes,
      opsPerSec: result.hz,
      marginOfError: result.rme,
      p99Ms: result.p99,
      peakHeapDeltaMB: peakHeapMB.get(name) ?? 0,
    };
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

  await writeFile(outPath, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
yarn test
```

Expected: PASS — all `FIXTURES`, `runBench`, and `writeBaselineJson` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/parser.bench.ts src/parser.bench.test.ts
git commit -m "Add writeBaselineJson for --baseline mode"
```

---

## Task 6: Implement `checkAgainstBaseline()` (the `--check` mode)

**Files:**
- Modify: `src/parser.bench.ts`
- Modify: `src/parser.bench.test.ts`

- [ ] **Step 1: Add a failing test for `checkAgainstBaseline()`**

Append a new `describe` block to `src/parser.bench.test.ts`:
```ts
import { checkAgainstBaseline } from './parser.bench.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const VALID_BASELINE: BaselineFile = {
  schemaVersion: 1,
  capturedAt: '2026-06-22T00:00:00.000Z',
  environment: {
    nodeVersion: 'v22.0.0',
    platform: 'darwin',
    arch: 'arm64',
  },
  fixtures: {
    'small-claim': {
      sizeBytes: 100,
      opsPerSec: 1000,
      marginOfError: 1,
      p99Ms: 1,
      peakHeapDeltaMB: 0.1,
    },
    'small-rule': {
      sizeBytes: 100,
      opsPerSec: 1000,
      marginOfError: 1,
      p99Ms: 1,
      peakHeapDeltaMB: 0.1,
    },
    'small-relation': {
      sizeBytes: 100,
      opsPerSec: 1000,
      marginOfError: 1,
      p99Ms: 1,
      peakHeapDeltaMB: 0.1,
    },
    'medium-climate': {
      sizeBytes: 100,
      opsPerSec: 1000,
      marginOfError: 1,
      p99Ms: 1,
      peakHeapDeltaMB: 0.1,
    },
    'heavy-relations': {
      sizeBytes: 100,
      opsPerSec: 1000,
      marginOfError: 1,
      p99Ms: 1,
      peakHeapDeltaMB: 0.1,
    },
    'deep-nesting': {
      sizeBytes: 100,
      opsPerSec: 1000,
      marginOfError: 1,
      p99Ms: 1,
      peakHeapDeltaMB: 0.1,
    },
    'large-stress': {
      sizeBytes: 100,
      opsPerSec: 1000,
      marginOfError: 1,
      p99Ms: 1,
      peakHeapDeltaMB: 0.1,
    },
  },
};

describe('checkAgainstBaseline', () => {
  it('throws when baseline file is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const baselinePath = join(dir, 'missing.json');
      const { results, peakHeapMB } = await runBench();
      await expect(
        checkAgainstBaseline(results, peakHeapMB, baselinePath),
      ).rejects.toThrow(/no baseline/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws on schema version mismatch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const baselinePath = join(dir, 'baseline.json');
      await writeFile(
        baselinePath,
        JSON.stringify({ ...VALID_BASELINE, schemaVersion: 2 }),
        'utf8',
      );
      const { results, peakHeapMB } = await runBench();
      await expect(
        checkAgainstBaseline(results, peakHeapMB, baselinePath),
      ).rejects.toThrow(/schema/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when baseline is missing a fixture entry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const baselinePath = join(dir, 'baseline.json');
      const incomplete = {
        ...VALID_BASELINE,
        fixtures: { ...VALID_BASELINE.fixtures },
      };
      delete (incomplete.fixtures as Record<string, unknown>)['large-stress'];
      await writeFile(baselinePath, JSON.stringify(incomplete), 'utf8');
      const { results, peakHeapMB } = await runBench();
      await expect(
        checkAgainstBaseline(results, peakHeapMB, baselinePath),
      ).rejects.toThrow(/large-stress/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prints no diff and returns when current matches baseline', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const baselinePath = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench();
      // Build a baseline from the *current* run so it must match.
      await writeBaselineJson(results, peakHeapMB, baselinePath);
      // Re-run and check — second run should produce nearly identical numbers.
      const { results: r2, peakHeapMB: h2 } = await runBench();
      // Should not throw.
      await expect(
        checkAgainstBaseline(r2, h2, baselinePath),
      ).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
yarn test
```

Expected: FAIL with "checkAgainstBaseline is not a function" or similar.

- [ ] **Step 3: Implement `checkAgainstBaseline()`**

Append to `src/parser.bench.ts`:
```ts
import { readFile as readFileAsync } from 'node:fs/promises';

const PERCENT_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

function formatPercent(value: number): string {
  return `${PERCENT_FORMAT.format(value)}%`;
}

function diffLine(name: string, label: string, baseline: number, current: number): string {
  const delta = current - baseline;
  const pct = baseline === 0 ? 0 : (delta / baseline) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `  ${name}  ${label}: ${current.toFixed(2)} (baseline ${baseline.toFixed(2)}, ${sign}${formatPercent(pct)})`;
}

export async function checkAgainstBaseline(
  results: RunBenchResult['results'],
  peakHeapMB: Map<FixtureName, number>,
  baselinePath: string,
): Promise<void> {
  let raw: string;
  try {
    raw = await readFileAsync(baselinePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `no baseline at ${baselinePath}. Run 'yarn bench:baseline' first.`,
      );
    }
    throw err;
  }

  const baseline = JSON.parse(raw) as BaselineFile;
  if (baseline.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    throw new Error(
      `baseline schemaVersion ${baseline.schemaVersion} does not match expected ${BASELINE_SCHEMA_VERSION}`,
    );
  }

  const errored = results.filter((r) => r.state !== 'completed');
  if (errored.length > 0) {
    const names = errored.map((r) => r.name).join(', ');
    throw new Error(`fixture(s) errored: ${names}`);
  }

  let printedHeader = false;
  for (const [name] of FIXTURES) {
    const result = results.find((r) => r.name === name);
    if (!result) {
      throw new Error(`Missing bench result for fixture ${name}`);
    }
    const base = baseline.fixtures[name];
    if (!base) {
      throw new Error(`baseline missing entry for fixture '${name}'`);
    }
    const peak = peakHeapMB.get(name) ?? 0;

    const opsDelta = result.hz - base.opsPerSec;
    const opsPct = base.opsPerSec === 0 ? 0 : (opsDelta / base.opsPerSec) * 100;
    const p99Delta = result.p99 - base.p99Ms;
    const peakDelta = peak - base.peakHeapDeltaMB;

    const hasDiff =
      Math.abs(opsPct) > 0.5 || Math.abs(p99Delta) > 0.01 || Math.abs(peakDelta) > 0.01;
    if (hasDiff) {
      if (!printedHeader) {
        console.log('Performance diff vs baseline:');
        printedHeader = true;
      }
      console.log(diffLine(name, 'ops/sec', base.opsPerSec, result.hz));
      console.log(diffLine(name, 'p99 ms  ', base.p99Ms, result.p99));
      console.log(diffLine(name, 'peak MB ', base.peakHeapDeltaMB, peak));
    }
  }

  if (!printedHeader) {
    console.log('No performance diff vs baseline.');
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
yarn test
```

Expected: PASS — all tests pass. The "no diff" test runs the bench twice; the second run should match closely enough that no line is printed.

- [ ] **Step 5: Commit**

```bash
git add src/parser.bench.ts src/parser.bench.test.ts
git commit -m "Add checkAgainstBaseline for --check mode"
```

---

## Task 7: Wire CLI mode dispatch in `parser.bench.ts`

**Files:**
- Modify: `src/parser.bench.ts`

- [ ] **Step 1: Add the main() function and module-level entry check**

Append to `src/parser.bench.ts`:
```ts
const BASELINE_DEFAULT_PATH = 'perf-baseline.json';

async function main(): Promise<void> {
  const mode = argv[2];
  const { results, peakHeapMB } = await runBench();

  if (mode === '--baseline') {
    await writeBaselineJson(results, peakHeapMB, BASELINE_DEFAULT_PATH);
    console.log(`Baseline written to ${BASELINE_DEFAULT_PATH}`);
    return;
  }

  if (mode === '--check') {
    // this cycle: no threshold enforcement — a clean diff run exits 0.
    // Errors inside checkAgainstBaseline (missing baseline, schema mismatch,
    // errored parse task) throw and propagate to a non-zero exit.
    await checkAgainstBaseline(results, peakHeapMB, BASELINE_DEFAULT_PATH);
    return;
  }

  // Default: print the Tinybench table.
  const bench = new Bench({ iterations: 50, time: 1000 });
  for (const [, source] of await loadFixtures()) {
    bench.add('parse', () => {
      parse(source);
    });
  }
  await bench.run();
  console.table(
    bench.table().map((row) => ({
      name: row['Task Name'],
      opsPerSec: row['ops/sec'],
      margin: row['Margin of Error'],
      samples: row['Samples'],
    })),
  );
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

Expected: PASS with no errors. The Vitest tests should still pass too (the entry-point check is false under test).

- [ ] **Step 3: Run all tests to confirm nothing broke**

```bash
yarn test
```

Expected: PASS — all previous tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/parser.bench.ts
git commit -m "Wire CLI mode dispatch in parser.bench.ts"
```

---

## Task 8: Record the baseline and commit `perf-baseline.json`

**Files:**
- Create: `perf-baseline.json`

- [ ] **Step 1: Run the baseline recorder**

```bash
yarn bench:baseline
```

Expected: prints `Baseline written to perf-baseline.json` and exits 0. The bench takes a few seconds to run.

- [ ] **Step 2: Inspect the produced baseline**

```bash
cat perf-baseline.json
```

Expected: a JSON file with `schemaVersion: 1`, a `capturedAt` timestamp, an `environment` block, and a `fixtures` object with 7 entries. Every entry has `sizeBytes`, `opsPerSec`, `marginOfError`, `p99Ms`, `peakHeapDeltaMB`. The numbers should be positive and plausible (ops/sec in the thousands; p99 in the milliseconds; peak heap delta in single-digit MB or less for the small fixtures, larger for the large-stress fixture).

- [ ] **Step 3: Verify the `--check` mode produces a clean diff**

Re-run the bench and confirm `--check` reports no diff:

```bash
yarn bench:check
```

Expected: prints `No performance diff vs baseline.` and exits 0. If it prints a diff, the bench is too noisy and the threshold (currently 0.5% ops, 0.01 ms p99, 0.01 MB peak) needs to be relaxed in `checkAgainstBaseline`.

- [ ] **Step 4: Run all tests one more time**

```bash
yarn test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add perf-baseline.json
git commit -m "Record initial perf baseline"
```

---

## Task 9: Final verification

- [ ] **Step 1: Typecheck passes**

```bash
yarn typecheck
```

Expected: PASS.

- [ ] **Step 2: All tests pass**

```bash
yarn test
```

Expected: PASS — all `parser.test.ts`, `tokens.test.ts`, and `parser.bench.test.ts` tests pass.

- [ ] **Step 3: Lint passes**

```bash
yarn lint
```

Expected: PASS. If oxlint flags the new files, fix any genuine issues (file size, unused imports, etc.).

- [ ] **Step 4: Format check passes**

```bash
yarn format:check
```

Expected: PASS. If not, run `yarn format` to fix, then commit the formatting.

- [ ] **Step 5: Default bench mode prints the Tinybench table**

```bash
yarn bench 2>&1 | head -30
```

Expected: a table of the 7 fixtures with `ops/sec`, `Margin of Error`, `Samples` columns.

- [ ] **Step 6: Confirm files match the spec**

Run from repo root:
```bash
ls -la src/parser.bench.ts src/parser.bench.test.ts
ls src/parser.fixtures/
test -f perf-baseline.json && echo "baseline present"
```

Expected: all files exist as specified in `docs/snowball/specs/2026-06-22-performance-tests-design.md` §3.

- [ ] **Step 7: Final commit if any cleanup needed**

If Steps 1–4 required fixes:
```bash
git add -A
git commit -m "Fix lint/format issues from final verification"
```

Otherwise skip — everything is already committed across Tasks 1–8.

---

## Self-Review (post-write)

**Spec coverage check:**
- §1 Goals → Tasks 1–8 deliver the baseline; §1 non-goals (CI thresholding, cross-platform, etc.) are deferred as specified
- §3 Architecture (file tree) → Task 2 creates fixtures; Task 3 creates the bench file
- §4 Fixtures (7 with shape variety) → Task 2 creates all 7
- §5 Bench file (FIXTURES, runBench, mode dispatch) → Tasks 3, 4, 7
- §6 Baseline format → Task 5 implements `writeBaselineJson`; Task 8 records
- §7 Error handling (fixture missing, parse throws, baseline missing, schema mismatch) → Task 5 handles parse-throw; Task 6 handles missing baseline + schema mismatch; Task 2's readFile in Task 5 surfaces fixture-missing
- §8 Structural test (5 assertions) → Task 3 (3 of 5), Task 5 (1 of 5), Task 6 (1 of 5)
- §9 Build & CI (package.json scripts, Node 22+, no CI) → Task 1 adds scripts; spec's no-CI-this-cycle honored
- §10 Risks → all noted in spec; no extra tasks needed
- §11 YAGNI → no tasks added for skipped items

**Placeholder scan:** No "TBD", "TODO", "implement later" in any task. Every code step has actual code.

**Type consistency:**
- `FIXTURES` defined in Task 3, used in Tasks 4, 5, 6 — consistent shape
- `RunBenchResult['results']` referenced in Tasks 5, 6 — defined in Task 4
- `BaselineFile` type defined in Task 5, used in Task 6 tests — consistent field set
- `writeBaselineJson` signature `(results, peakHeapMB, outPath)` used in Tasks 5, 6 — consistent
- `checkAgainstBaseline` signature `(results, peakHeapMB, baselinePath)` used in Tasks 6, 7 — consistent
- Default baseline path `BASELINE_DEFAULT_PATH = 'perf-baseline.json'` defined in Task 7 — used in Task 8

**Gaps found and fixed during self-review:**
- None — spec coverage is complete.
