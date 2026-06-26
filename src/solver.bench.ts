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