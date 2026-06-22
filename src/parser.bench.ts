// src/parser.bench.ts
// Tinybench harness for the parse() pipeline.
// Runner: `node --experimental-strip-types src/parser.bench.ts [--baseline|--check]`
// Requires Node 22+ for native TypeScript stripping.

import { Bench } from 'tinybench';
import { readFile, writeFile } from 'node:fs/promises';
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

async function loadFixtures(): Promise<Array<readonly [FixtureName, string]>> {
  return Promise.all(
    FIXTURES.map(async ([name, path]) => [name, await readFile(path, 'utf8')] as const),
  );
}

export interface RunBenchOptions {
  iterations?: number;
  time?: number;
}

export interface RunBenchResult {
  results: Array<{
    name: string;
    ok: boolean;
    error?: Error | undefined;
    hz: number;
    p99: number;
    rme: number;
  }>;
  peakHeapMB: Map<FixtureName, number>;
}

const DEFAULT_ITERATIONS = 50;
const DEFAULT_TIME_MS = 1000;

export async function runBench(options: RunBenchOptions = {}): Promise<RunBenchResult> {
  const loaded = await loadFixtures();
  const bench = new Bench({
    iterations: options.iterations ?? DEFAULT_ITERATIONS,
    time: options.time ?? DEFAULT_TIME_MS,
    throws: false,
  });
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

  const rawResults = await bench.run();
  const results: RunBenchResult['results'] = rawResults.map((r) => {
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
  const errored = results.filter((r) => !r.ok);
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

export async function loadBaseline(baselinePath: string): Promise<BaselineFile> {
  let raw: string;
  try {
    raw = await readFile(baselinePath, 'utf8');
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

export async function checkAgainstBaseline(
  results: RunBenchResult['results'],
  peakHeapMB: Map<FixtureName, number>,
  baseline: BaselineFile,
): Promise<void> {
  const errored = results.filter((r) => !r.ok);
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
    const baseline = await loadBaseline(BASELINE_DEFAULT_PATH);
    await checkAgainstBaseline(results, peakHeapMB, baseline);
    return;
  }

  // Default: print a tabular summary using the peak-heap data we already have.
  const heapSummary = [...peakHeapMB.entries()]
    .map(([name, mb]) => `${name}=${mb.toFixed(2)}MB`)
    .join(' ');
  console.log(`parse() perf summary (peak heap: ${heapSummary})`);
  for (const r of results) {
    console.log(
      `  ${r.name.padEnd(20)} ${r.hz.toFixed(1).padStart(10)} ops/sec ±${r.rme.toFixed(2)}%  p99=${r.p99.toFixed(3)}ms`,
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
