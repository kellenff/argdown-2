// src/solver.bench.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { FIXTURES, TASK_TYPES } from './solver.bench.js';

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