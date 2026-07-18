import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { load } from './index.js';
import {
  checkAgainstBaseline,
  FIXTURES,
  loadBaseline,
  runBench,
  TASK_TYPES,
  writeBaselineJson,
  type BaselineFile,
  type BaselineTaskEntry,
} from './pipeline.bench.js';

const FAST_BENCH = { iterations: 5, time: 50 };

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
      await writeFile(path, JSON.stringify({ schemaVersion: 2, fixtures: {} }), 'utf8');
      await expect(loadBaseline(path)).rejects.toThrow(/schema/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

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
