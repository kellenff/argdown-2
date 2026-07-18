// Tinybench harness for the load() / solve() pipeline.
// Runner: `tsx src/pipeline.bench.ts [--baseline|--check]`

import { readFile, readFile as readFileAsync, writeFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';

import { Bench } from 'tinybench';

import { load, solve } from './index.js';
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

const percentFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

function makeTaskBody(task: TaskType, source: string, cachedDoc: GroundedDocument): () => void {
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

function parseTaskName(name: string): { taskType: TaskType; fixture: FixtureName } {
  const colon = name.indexOf(':');
  if (colon < 0) throw new Error(`invalid task name: ${name}`);
  return {
    taskType: name.slice(0, colon) as TaskType,
    fixture: name.slice(colon + 1) as FixtureName,
  };
}

function formatPercent(value: number): string {
  return `${percentFormat.format(value)}%`;
}

function diffLine(name: string, label: string, baseline: number, current: number): string {
  const delta = current - baseline;
  const pct = baseline === 0 ? 0 : (delta / baseline) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `  ${name}  ${label}: ${current.toFixed(2)} (baseline ${baseline.toFixed(2)}, ${sign}${formatPercent(pct)})`;
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
  const results: BenchTaskResult[] = (rawResults ?? []).map((r) => {
    const error = r.result && 'error' in r.result ? r.result.error : undefined;
    const metrics = error ? undefined : r.result;
    return {
      name: r.name ?? '',
      state: error ? 'errored' : metrics ? 'completed' : 'unknown',
      hz: metrics?.hz ?? 0,
      p99: (metrics?.p99 ?? 0) * 1000,
      rme: metrics?.rme ?? 0,
    };
  });

  return { results, peakHeapMB };
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
    throw new Error(
      `Cannot write baseline: task(s) errored: ${errored.map((r) => r.name).join(', ')}`,
    );
  }

  const fixtures = Object.fromEntries(
    FIXTURES.map(([name]) => [
      name,
      { sizeBytes: 0, tasks: {} as Record<TaskType, BaselineTaskEntry> },
    ]),
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
