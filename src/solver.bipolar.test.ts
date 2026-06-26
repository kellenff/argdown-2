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

describe('solveBipolar — support edges', () => {
  it('labels A=in, B=in for a single support A --> B', () => {
    const src = '[#a].\n[#b].\n[#a] --> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('a')).toBe('in');
    expect(solved.labels.get('b')).toBe('in');
  });

  it('labels A=in, B=in for A --> B with X --x A (aux promotes A)', () => {
    // The auxiliary `sup:a->b` is OUT (because B is IN and s is attacked only by B).
    // A's attackers are [sup:a->b=OUT, x=IN]; the fixpoint's `someOut → IN` rule
    // promotes A. Net: X=in, A=in, B=in. (Diverges from Method 1 where A=out.)
    const src = '[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#a].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('x')).toBe('in');
    expect(solved.labels.get('a')).toBe('in');
    expect(solved.labels.get('b')).toBe('in');
  });

  it('labels A=out, B=out for A --> B with X --x B', () => {
    // B's defeat propagates to its supporter A via the auxiliary chain.
    const src = '[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('x')).toBe('in');
    expect(solved.labels.get('a')).toBe('out');
    expect(solved.labels.get('b')).toBe('out');
  });
});

describe('solveBipolar — equivalence', () => {
  it('labels A=undec, B=undec for mutual equivalence A <-> B', () => {
    const src = '[#a].\n[#b].\n[#a] <-> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('a')).toBe('undec');
    expect(solved.labels.get('b')).toBe('undec');
  });

  it('emits no warnings about dropped edges for equivalence', () => {
    const src = '[#a].\n[#b].\n[#a] <-> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.warnings).toEqual([]);
  });
});

describe('public API', () => {
  it('re-exports solveBipolar from index.ts', () => {
    expect(publicSolveBipolar).toBe(solveBipolar);
  });
});

describe('solveBipolar — auxiliary stripping', () => {
  it('does not surface auxiliary nodes in the labels map', () => {
    const src = '[#a].\n[#b].\n[#a] --> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    for (const key of solved.labels.keys()) {
      expect(key.startsWith('sup:')).toBe(false);
    }
  });
});

describe('solveBipolar — dangling edges', () => {
  it('emits a warning for a dangling support edge', () => {
    // Hand-build: a fact `a` plus a support edge to a non-existent `ghost`.
    const doc = {
      kind: 'Document' as const,
      elements: [
        {
          kind: 'FactStatement' as const,
          fact: {
            kind: 'Fact' as const,
            ref: {
              kind: 'FactRef' as const,
              head: {
                kind: 'IdentifierHead' as const,
                identifier: 'a',
                loc: {
                  start: { line: 1, column: 2, offset: 1 },
                  end: { line: 1, column: 4, offset: 3 },
                },
              },
              loc: {
                start: { line: 1, column: 1, offset: 0 },
                end: { line: 1, column: 5, offset: 4 },
              },
            },
            loc: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 5, offset: 4 },
            },
          },
          loc: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 5, offset: 4 },
          },
        },
        {
          kind: 'RelationStatement' as const,
          relations: [
            {
              kind: 'Relation' as const,
              from: {
                kind: 'FactRef' as const,
                head: {
                  kind: 'IdentifierHead' as const,
                  identifier: 'a',
                  loc: {
                    start: { line: 2, column: 2, offset: 7 },
                    end: { line: 2, column: 4, offset: 9 },
                  },
                },
                loc: {
                  start: { line: 2, column: 1, offset: 6 },
                  end: { line: 2, column: 5, offset: 10 },
                },
              },
              arrow: 'support' as const,
              to: {
                kind: 'FactRef' as const,
                head: {
                  kind: 'IdentifierHead' as const,
                  identifier: 'ghost',
                  loc: {
                    start: { line: 2, column: 11, offset: 16 },
                    end: { line: 2, column: 17, offset: 22 },
                  },
                },
                loc: {
                  start: { line: 2, column: 10, offset: 15 },
                  end: { line: 2, column: 18, offset: 23 },
                },
              },
              loc: {
                start: { line: 2, column: 1, offset: 6 },
                end: { line: 2, column: 18, offset: 23 },
              },
            },
          ],
          loc: {
            start: { line: 2, column: 1, offset: 6 },
            end: { line: 2, column: 18, offset: 23 },
          },
        },
      ],
      loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 2, column: 18, offset: 23 } },
    };
    const solved = solveBipolar(doc);
    expect(solved.warnings.some((w) => w.includes('dangling support edge'))).toBe(true);
    expect(solved.labels.has('ghost')).toBe(false);
  });
});
