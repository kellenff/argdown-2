// src/solver.preferred.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solvePreferred } from './solver.js';
import type { Document } from './ast.js';

describe('solvePreferred (dung reduction)', () => {
  it('returns 3 preferred for 3-cycle (textbook: A, B, C are not admissible — ∅ is the only preferred)', () => {
    // Note: by textbook Dung, {A} is NOT admissible in a 3-cycle (A is attacked
    // by C, but A doesn't attack C). So the only preferred is ∅.
    const result = parse('[#A] x.\n[#B] y.\n[#C] z.\n[#A] --x [#B].\n[#B] --x [#C].\n[#C] --x [#A].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solvePreferred(ast);
    expect(extensions.length).toBe(1);
    expect(extensions[0]!.size).toBe(0);
  });

  it('returns 2 preferred for 2-cycle', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] --x [#B].\n[#B] --x [#A].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solvePreferred(ast);
    expect(extensions.length).toBe(2);
    const sorted = extensions.map((s) => [...s].sort());
    expect(sorted).toContainEqual(['A']);
    expect(sorted).toContainEqual(['B']);
  });

  it('returns 1 preferred ({A}) for unattacked source', () => {
    const result = parse('[#A] x.\n[#A] --x [#B].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solvePreferred(ast);
    expect(extensions.length).toBe(1);
    expect([...extensions[0]!]).toEqual(['A']);
  });

  it('drops --> with warning in Dung reduction', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] --> [#B].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { warnings } = solvePreferred(ast);
    expect(warnings.some((w) => w.includes('support='))).toBe(true);
  });
});