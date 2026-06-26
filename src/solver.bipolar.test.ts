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

describe('solveBipolar — attack edges', () => {
  it('labels A=in, B=out for a single attack A --x B', () => {
    const src = '[#a].\n[#b].\n[#a] --x [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('a')).toBe('in');
    expect(solved.labels.get('b')).toBe('out');
  });

  it('labels mutual attack A --x B, B --x A as undec', () => {
    const src = '[#a].\n[#b].\n[#a] --x [#b].\n[#b] --x [#a].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('a')).toBe('undec');
    expect(solved.labels.get('b')).toBe('undec');
  });

  it('collapses non-`-->` attack variants to attack', () => {
    const src = [
      '[#a].',
      '[#b].',
      '[#c].',
      '[#d].',
      '[#e].',
      '[#a] -.-> [#b].',
      '[#a] -.-  [#c].',
      '[#a] ~>   [#d].',
      '[#a] ?>   [#e].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    // Each variant hits a different fact, so a is IN and the rest are OUT.
    expect(solved.labels.get('a')).toBe('in');
    expect(solved.labels.get('b')).toBe('out');
    expect(solved.labels.get('c')).toBe('out');
    expect(solved.labels.get('d')).toBe('out');
    expect(solved.labels.get('e')).toBe('out');
    // No summary warning — bipolar has nothing to drop.
    expect(solved.warnings).toEqual([]);
  });
});

describe('public API', () => {
  it('re-exports solveBipolar from index.ts', () => {
    expect(publicSolveBipolar).toBe(solveBipolar);
  });
});
