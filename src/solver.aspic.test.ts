// src/solver.aspic.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solveAspic } from './solver.js';
import { solveAspic as publicSolveAspic } from './index.js';

describe('solveAspic', () => {
  it('is re-exported from index.ts', () => {
    expect(publicSolveAspic).toBe(solveAspic);
  });

  it('returns empty labels and warnings for an empty document', () => {
    const result = parse('');
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels).toBeInstanceOf(Map);
    expect(solved.labels.size).toBe(0);
    expect(solved.warnings).toEqual([]);
    expect(solved.defeats).toBeUndefined();
  });
});
