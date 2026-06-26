// src/solver.bench.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import {
  FIXTURES,
  TASK_TYPES,
  runSolverBench,
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