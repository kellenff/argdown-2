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

import { solveCompleteBipolar, solveCompleteEvidential } from './solver.js';

describe('solveCompleteBipolar', () => {
  it('strips sup keys from extensions', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] --> [#B].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solveCompleteBipolar(ast);
    expect(extensions.length).toBeGreaterThan(0);
    for (const ext of extensions) {
      expect([...ext].some((k) => k.startsWith('sup:'))).toBe(false);
    }
  });
});

describe('solveCompleteEvidential', () => {
  it('strips nec keys from extensions', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] --> [#B].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solveCompleteEvidential(ast);
    expect(extensions.length).toBeGreaterThan(0);
    for (const ext of extensions) {
      expect([...ext].some((k) => k.startsWith('nec:'))).toBe(false);
    }
  });
});

import { solveCompleteAspic as solveCompleteAspicFromAspic } from './solver-aspic.js';

describe('solveCompleteAspic', () => {
  it('returns 1 (∅) complete for 3-cycle of undercuts', () => {
    // 3-cycle of undercuts. Each undercut always wins. So map is fully connected.
    // ∅ is closed (no arg added to closure since every arg has attackers).
    // But {A}, {B}, {C} are NOT admissible (none self-defends in 3-cycle).
    // So complete should be [∅] only by textbook.
    const result = parse(
      '[#A] x.\n[#B] y.\n[#C] z.\n[#A] -.-> [#B].\n[#B] -.-> [#C].\n[#C] -.-> [#A].\n',
    );
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { extensions } = solveCompleteAspicFromAspic(ast);
    expect(extensions.length).toBe(1);
    expect(extensions[0]!.size).toBe(0);
  });
});