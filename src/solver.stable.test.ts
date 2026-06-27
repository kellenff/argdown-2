// src/solver.stable.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solveStable } from './solver.js';
import type { Document } from './ast.js';

describe('solveStable (dung reduction)', () => {
  it('returns 0 stable for 3-cycle', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#C] z.\n[#A] --x [#B].\n[#B] --x [#C].\n[#C] --x [#A].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    expect(solveStable(ast).extensions).toEqual([]);
  });

  it('returns 2 stable for 2-cycle', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] --x [#B].\n[#B] --x [#A].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solveStable(ast);
    expect(extensions.length).toBe(2);
    const sorted = extensions.map((s) => [...s].sort());
    expect(sorted).toContainEqual(['A']);
    expect(sorted).toContainEqual(['B']);
  });

  it('returns 1 stable for unattacked source', () => {
    const result = parse('[#A] x.\n[#A] --x [#B].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solveStable(ast);
    expect(extensions.length).toBe(1);
    expect([...extensions[0]!]).toEqual(['A']);
  });
});

import { solveStableBipolar, solveStableEvidential } from './solver.js';

describe('solveStableBipolar', () => {
  it('returns 1 stable with sup keys stripped', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#C] z.\n[#A] --> [#B].\n[#C] --x [#A].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solveStableBipolar(ast);
    expect(extensions.length).toBeGreaterThan(0);
    expect([...extensions[0]!].some((k) => k.startsWith('sup:'))).toBe(false);
  });
});

describe('solveStableEvidential', () => {
  it('returns 1 stable with nec keys stripped', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#C] z.\n[#A] --> [#B].\n[#C] --x [#A].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solveStableEvidential(ast);
    expect(extensions.length).toBeGreaterThan(0);
    expect([...extensions[0]!].some((k) => k.startsWith('nec:'))).toBe(false);
  });
});

import { solveStableAspic as solveStableAspicFromAspic } from './solver-aspic.js';

describe('solveStableAspic', () => {
  it('returns 0 stable for undercut 3-cycle (still no stable)', () => {
    const result = parse(
      '[#A] x.\n[#B] y.\n[#C] z.\n[#A] -.-> [#B].\n[#B] -.-> [#C].\n[#C] -.-> [#A].\n',
    );
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    expect(solveStableAspicFromAspic(ast).extensions).toEqual([]);
  });
});