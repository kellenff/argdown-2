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

// ponytail: rebut/undercut target the conclusion ref (the `arg:L:C` argument
// node is only ever defeated by undermine, which expands via the premise index).
// Asserting on `argKeys[0]` would always read `in` for these cases — the
// defeat lives on the conclusion ref. This matches Method 1 (`solve()`) where
// the same conclusion-keyed targeting is documented in solver.test.ts.
describe('solveAspic — rebut (--x)', () => {
  it('rebut with strict preference: attacker defeats target (conclusion ref OUT)', () => {
    const src = [
      '[#a] A fact { preference: 1 }',
      '[#b] B fact { preference: 0.5 }',
      '([#thesis]) -> [#a], [#b]. { preference: 0.5 }',
      '[#a] --x [#thesis].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.get('thesis')).toBe('out');
  });

  it('rebut with equal preference (both 0): not a defeat (conclusion ref UNDEC)', () => {
    const src = '([#thesis]) -> [#a].\n[#a] --x [#thesis].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.get('thesis')).toBe('undec');
  });

  it('rebut with attacker preferred: defeats map contains the attacker under the conclusion ref', () => {
    const src = [
      '[#a] A fact { preference: 1 }',
      '[#b] B fact { preference: 0.5 }',
      '([#thesis]) -> [#a], [#b]. { preference: 0.5 }',
      '[#a] --x [#thesis].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.defeats).toBeDefined();
    expect(solved.defeats!.get('thesis')).toContain('a');
  });
});

describe('solveAspic — undercut (-.->)', () => {
  it('undercut always wins regardless of preferences (conclusion ref OUT)', () => {
    const src = [
      '[#a] A fact { preference: 0 }',
      '([#thesis]) -> [#a]. { preference: 1 }', // higher preference than attacker
      '[#a] -.-> [#thesis].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.get('thesis')).toBe('out');
  });

  it('undercut with attacker having 0 preference still defeats (conclusion ref OUT)', () => {
    const src = '([#thesis]) -> [#a].\n[#a] -.-> [#thesis].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.get('thesis')).toBe('out');
  });
});

describe('solveAspic — undermine (-.-)', () => {
  it('undermine with strict preference on the targeted premise: defeat propagates to containing arg', () => {
    const src = [
      '[#p] A premise { preference: 0.5 }',
      '[#a] An attacker { preference: 1 }',
      '([#thesis]) -> [#p].',
      '[#a] -.- [#p].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
    expect(solved.labels.get(argKeys[0]!)).toBe('out');
  });

  it('undermine with equal preference on premise: not a defeat', () => {
    const src = [
      '[#p] A premise { preference: 0 }',
      '[#a] An attacker { preference: 0 }',
      '([#thesis]) -> [#p].',
      '[#a] -.- [#p].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
    expect(solved.labels.get(argKeys[0]!)).toBe('undec');
  });

  it('undermine uses the premise preference, not the containing argument preference', () => {
    // premise has low preference, attacker has high, but the containing
    // argument has higher than attacker. The undermine should still succeed
    // because the *premise* is what is attacked.
    const src = [
      '[#p] A premise { preference: 0.1 }',
      '[#a] An attacker { preference: 0.5 }',
      '([#thesis]) -> [#p]. { preference: 1 }', // containing arg pref > attacker pref
      '[#a] -.- [#p].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
    expect(solved.labels.get(argKeys[0]!)).toBe('out');
  });
});
