// src/solver.aspic.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solveAspic } from './solver-aspic.js';
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
    expect(solved.defeats).toBeDefined();
    expect(solved.defeats!.size).toBe(0);
  });

  it('keys FactStatement nodes by their fact ref', () => {
    const src = '[#alpha] First fact.\n[#beta] Second fact.';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.has('alpha')).toBe(true);
    expect(solved.labels.has('beta')).toBe(true);
  });

  it('keys Argument nodes by arg:L:C', () => {
    const src = '([#thesis]) -> [#a].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
    expect(argKeys.length).toBeGreaterThan(0);
  });

  it('returns empty labels for a document with facts and no relations', () => {
    const src = '[#a] A fact.\n[#b] B fact.';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.get('a')).toBe('in');
    expect(solved.labels.get('b')).toBe('in');
  });
});
