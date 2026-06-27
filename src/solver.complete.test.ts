// src/solver.complete.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solveComplete } from './solver.js';
import type { Document } from './ast.js';

describe('solveComplete (dung reduction)', () => {
  it('returns 1 (∅) for 3-cycle', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#C] z.\n[#A] --x [#B].\n[#B] --x [#C].\n[#C] --x [#A].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solveComplete(ast);
    expect(extensions.length).toBe(1);
    expect(extensions[0]!.size).toBe(0);
  });

  it('returns 1 ({A}) for unattacked source', () => {
    const result = parse('[#A] x.\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solveComplete(ast);
    expect(extensions.length).toBe(1);
    expect([...extensions[0]!]).toEqual(['A']);
  });

  it('returns 3 (∅, {A}, {B}) for 2-cycle', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] --x [#B].\n[#B] --x [#A].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solveComplete(ast);
    expect(extensions.length).toBe(3);
  });
});