// src/solver.bipolar.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solveBipolar } from './solver.js';
import { solveBipolar as publicSolveBipolar } from './index.js';

describe('solveBipolar', () => {
  it('returns empty labels for an empty document', () => {
    const result = parse('');
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.size).toBe(0);
    expect(solved.warnings).toEqual([]);
  });
});

describe('public API', () => {
  it('re-exports solveBipolar from index.ts', () => {
    expect(publicSolveBipolar).toBe(solveBipolar);
  });
});
