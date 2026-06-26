// src/solver.bench.test.ts
import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FIXTURES,
  TASK_TYPES,
  runSolverBench,
  writeSolverBaselineJson,
  loadSolverBaseline,
  checkAgainstSolverBaseline,
  type SolverBaselineFile,
  type SolverTaskBaseline,
  type TaskName,
} from './solver.bench.js';

const FAST_BENCH = { iterations: 5, time: 50 } as const;

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
        const key = `${taskType}:${name}` as TaskName;
        const peak = peakHeapMB.get(key);
        expect(peak, `no peak for ${key}`).toBeDefined();
        expect(peak).toBeGreaterThan(0);
      }
    }
  });
});

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

function makeValidBaseline(): SolverBaselineFile {
  const fixtures = {} as SolverBaselineFile['fixtures'];
  for (const [name] of FIXTURES) {
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
      await expect(
        checkAgainstSolverBaseline(results, peakHeapMB, baseline),
      ).resolves.toBeUndefined();
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
        await expect(
          checkAgainstSolverBaseline(slowed, peakHeapMB, baseline),
        ).resolves.toBeUndefined();
        expect(log).toHaveBeenCalledWith('Performance diff vs baseline:');
      } finally {
        log.mockRestore();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
