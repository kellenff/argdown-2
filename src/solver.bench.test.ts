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
  isTaskSkippedOnFixture,
  type SolverBaselineFile,
  type SolverTaskBaseline,
  type TaskName,
} from './solver.bench.js';

const FAST_BENCH = { iterations: 1, time: 1 } as const;
const VERY_FAST_FIXTURES = [FIXTURES[0]]; // Just small-claim

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
  it('has exactly 32 entries', () => {
    expect(TASK_TYPES).toHaveLength(32);
  });

  it('contains the expected task types in order', () => {
    expect([...TASK_TYPES]).toEqual([
      'solve',
      'solve-bipolar',
      'solve-aspic',
      'solve-evidential',
      'solve-preferred',
      'solve-preferred-bipolar',
      'solve-preferred-aspic',
      'solve-preferred-evidential',
      'solve-stable',
      'solve-stable-bipolar',
      'solve-stable-aspic',
      'solve-stable-evidential',
      'solve-complete',
      'solve-complete-bipolar',
      'solve-complete-aspic',
      'solve-complete-evidential',
      'parse-solve',
      'parse-solve-bipolar',
      'parse-solve-aspic',
      'parse-solve-evidential',
      'parse-solve-preferred',
      'parse-solve-preferred-bipolar',
      'parse-solve-preferred-aspic',
      'parse-solve-preferred-evidential',
      'parse-solve-stable',
      'parse-solve-stable-bipolar',
      'parse-solve-stable-aspic',
      'parse-solve-stable-evidential',
      'parse-solve-complete',
      'parse-solve-complete-bipolar',
      'parse-solve-complete-aspic',
      'parse-solve-complete-evidential',
    ]);
  });

  it('includes the aspic task types', () => {
    expect(TASK_TYPES).toContain('solve-aspic');
    expect(TASK_TYPES).toContain('parse-solve-aspic');
  });

  it('includes the evidential task types', () => {
    expect(TASK_TYPES).toContain('solve-evidential');
    expect(TASK_TYPES).toContain('parse-solve-evidential');
  });
});

describe('runSolverBench', () => {
  it('returns one result per task-type/fixture combination (excluding skipped)', async () => {
    const { results } = await runSolverBench({ ...FAST_BENCH, fixtures: VERY_FAST_FIXTURES });
    let expectedCount = 0;
    for (const taskType of TASK_TYPES) {
      for (const [name] of VERY_FAST_FIXTURES) {
        if (!isTaskSkippedOnFixture(taskType, name)) {
          expectedCount++;
        }
      }
    }
    expect(results).toHaveLength(expectedCount);
  }, 30000);

  it('result names follow <task-type>:<fixture> for every combination', async () => {
    const { results } = await runSolverBench({ ...FAST_BENCH, fixtures: VERY_FAST_FIXTURES });
    const expected = new Set<string>();
    for (const taskType of TASK_TYPES) {
      for (const [name] of VERY_FAST_FIXTURES) {
        if (!isTaskSkippedOnFixture(taskType, name)) {
          expected.add(`${taskType}:${name}`);
        }
      }
    }
    const actual = new Set(results.map((r) => r.name));
    expect(actual).toEqual(expected);
  }, 30000);

  it('no task errors', async () => {
    const { results } = await runSolverBench({ ...FAST_BENCH, fixtures: VERY_FAST_FIXTURES });
    for (const r of results) {
      expect(r.ok, `task ${r.name} errored: ${r.error?.message ?? 'unknown'}`).toBe(true);
    }
  }, 30000);

  it('captures a peak heap delta per active task', async () => {
    const { peakHeapMB } = await runSolverBench({ ...FAST_BENCH, fixtures: VERY_FAST_FIXTURES });
    let expectedCount = 0;
    for (const taskType of TASK_TYPES) {
      for (const [name] of VERY_FAST_FIXTURES) {
        if (!isTaskSkippedOnFixture(taskType, name)) {
          expectedCount++;
        }
      }
    }
    expect(peakHeapMB.size).toBe(expectedCount);
    for (const taskType of TASK_TYPES) {
      for (const [name] of VERY_FAST_FIXTURES) {
        const key = `${taskType}:${name}` as TaskName;
        const peak = peakHeapMB.get(key);
        if (isTaskSkippedOnFixture(taskType, name)) {
          expect(peak, `peak found for skipped ${key}`).toBeUndefined();
        } else {
          expect(peak, `no peak for ${key}`).toBeDefined();
          expect(peak).toBeGreaterThan(0);
        }
      }
    }
  }, 30000);
});

describe('writeSolverBaselineJson', () => {
  it('writes a valid baseline file with schemaVersion 1 and nested tasks shape', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runSolverBench({ ...FAST_BENCH, fixtures: VERY_FAST_FIXTURES });
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
  }, 30000);

  it('has one fixture entry with one entry per task type', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runSolverBench({ ...FAST_BENCH, fixtures: VERY_FAST_FIXTURES });
      await writeSolverBaselineJson(results, peakHeapMB, out);

      const parsed = JSON.parse(await readFile(out, 'utf8')) as SolverBaselineFile;

      for (const [name] of VERY_FAST_FIXTURES) {
        const entry = parsed.fixtures[name];
        expect(entry, `missing fixture entry for ${name}`).toBeDefined();
        expect(typeof entry.sizeBytes).toBe('number');
        expect(entry.tasks).toBeDefined();
        for (const taskType of TASK_TYPES) {
          if (isTaskSkippedOnFixture(taskType, name)) {
            continue;
          }
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
  }, 30000);

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
      const { results, peakHeapMB } = await runSolverBench({ ...FAST_BENCH, fixtures: VERY_FAST_FIXTURES });
      await writeSolverBaselineJson(results, peakHeapMB, out);
      const baseline = await loadSolverBaseline(out);
      // VERY_FAST_FIXTURES is just small-claim.
      // If we don't have small-claim in results, it should throw.
      const emptyResults: any[] = [];
      await expect(checkAgainstSolverBaseline(emptyResults, peakHeapMB, baseline)).rejects.toThrow(
        /small-claim/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prints no diff and returns when current matches baseline exactly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runSolverBench({ ...FAST_BENCH, fixtures: VERY_FAST_FIXTURES });
      await writeSolverBaselineJson(results, peakHeapMB, out);
      const baseline = await loadSolverBaseline(out);
      await expect(
        checkAgainstSolverBaseline(results, peakHeapMB, baseline),
      ).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  it('reports a diff when ops/sec regresses by more than the tolerance', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-solver-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runSolverBench({ ...FAST_BENCH, fixtures: VERY_FAST_FIXTURES });
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
  }, 30000);
});
