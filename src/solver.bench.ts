// src/solver.bench.ts
// Tinybench harness for solve() and solveBipolar() — both on cached ASTs and
// as end-to-end parse+solve. Mirrors src/parser.bench.ts pattern.
// Runner: `yarn bench:solver [--baseline|--check]` (uses tsx for .ts execution under PnP).

import { Bench } from 'tinybench';
import { readFile, writeFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';
import { parse } from './parser.js';
import { solve, solveBipolar } from './solver.js';
import { solveAspic } from './solver-aspic.js';
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
  'solve-aspic',
  'parse-solve',
  'parse-solve-bipolar',
  'parse-solve-aspic',
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export type TaskName = `${TaskType}:${FixtureName}`;

async function loadFixtures(): Promise<Array<readonly [FixtureName, string, Document]>> {
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
    case 'solve-aspic':
      return () => {
        solveAspic(cachedAst);
      };
    case 'parse-solve-aspic':
      return () => {
        const r = parse(source);
        if (r.ok) solveAspic(r.ast);
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

export async function runSolverBench(options: RunBenchOptions = {}): Promise<RunBenchResult> {
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

function diffLine(taskName: string, label: string, baseline: number, current: number): string {
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
      const opsPct = taskBaseline.opsPerSec === 0 ? 0 : (opsDelta / taskBaseline.opsPerSec) * 100;
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
