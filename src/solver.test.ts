// src/solver.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solve } from './solver.js';

describe('solve', () => {
  it('returns empty labels for an empty document', () => {
    const result = parse('');
    if (!result.ok) throw new Error('parse failed');
    const solved = solve(result.ast);
    expect(solved.labels.size).toBe(0);
    expect(solved.warnings).toEqual([]);
  });

  it('exports the public types', () => {
    const solved = solve({
      kind: 'Document',
      elements: [],
      loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
    });
    expect(solved.labels instanceof Map).toBe(true);
  });

  describe('node keying (facts)', () => {
    it('keys IdentifierHead facts by the bare identifier', () => {
      const src = '[#co2].\n[#impacts].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.labels.has('co2')).toBe(true);
      expect(solved.labels.has('impacts')).toBe(true);
      // Unattacked facts are IN (Task 6 will assert the value; this task only asserts presence).
    });

    it('keys TitleHead facts with the title: prefix', () => {
      const src = '[A Bracketed Title].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.labels.has('title:A Bracketed Title')).toBe(true);
    });

    it('emits a warning on duplicate IdentifierHead ids and overwrites', () => {
      const src = '[#co2] first.\n[#co2] second.';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.warnings.some((w) => w.includes('duplicate fact id: co2'))).toBe(true);
      expect(solved.labels.has('co2')).toBe(true);
    });
  });

  describe('node keying (arguments)', () => {
    it('keys arguments by arg:L:C using loc.start', () => {
      const src = '([#a]) -> [#b].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      // First character of `([#a]) -> [#b].` is column 1 of line 1.
      expect(solved.labels.has('arg:1:1')).toBe(true);
    });

    it('keeps two arguments with the same conclusion as distinct nodes', () => {
      const src = '([#a]) -> [#b].\n([#c]) -> [#b].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      // Both arguments appear, with distinct keys.
      const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
      expect(argKeys.length).toBe(2);
      expect(new Set(argKeys).size).toBe(2);
    });

    it('also keys the conclusions of arguments when those conclusions are atoms', () => {
      const src = '([#a]) -> [#b].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      // For `([#a]) -> [#b]`, the conclusion is `a` and the premise is `b`.
      // The conclusion atom gets keyed separately from the arg node.
      expect(solved.labels.has('a')).toBe(true);
    });
  });

  describe('edge extraction', () => {
    it('drops support edges and counts them', () => {
      const src = '[#a].\n[#b].\n[#a] --> [#b].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.warnings.some((w) => w.includes('support=1'))).toBe(true);
    });

    it('counts each non-attack arrow kind separately', () => {
      const src = [
        '[#a].',
        '[#b].',
        '[#c].',
        '[#d].',
        '[#e].',
        '[#f].',
        '[#a] --> [#b].',
        '[#a] -.-  [#c].',
        '[#a] -.-> [#d].',
        '[#a] ~>   [#e].',
        '[#a] ?>   [#f].',
      ].join('\n');
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.warnings.some((w) => w.includes('support=1'))).toBe(true);
      expect(solved.warnings.some((w) => w.includes('undermine=1'))).toBe(true);
      expect(solved.warnings.some((w) => w.includes('undercut=1'))).toBe(true);
      expect(solved.warnings.some((w) => w.includes('concession=1'))).toBe(true);
      expect(solved.warnings.some((w) => w.includes('qualification=1'))).toBe(true);
    });

    it('attaches attack edges between fact nodes without dropping', () => {
      const src = '[#a].\n[#b].\n[#a] --x [#b].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.warnings).toEqual([]);
      // Both nodes still keyed.
      expect(solved.labels.has('a')).toBe(true);
      expect(solved.labels.has('b')).toBe(true);
    });

    it('unfolds multi-endpoint attacks into one edge per pair', () => {
      const src = '[#a].\n[#b].\n[#c].\n[#a], [#b] --x [#c].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      // After labeling (Task 6), `a` and `b` are IN, `c` is OUT.
      // This task only asserts that no edge is dropped.
      expect(solved.warnings).toEqual([]);
    });
  });

  describe('attack attachment', () => {
    it('labels the target OUT for a single fact→fact attack', () => {
      const src = '[#a].\n[#b].\n[#a] --x [#b].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      // Task 6 will fix the unattacked case; here we only assert that `b` is OUT.
      expect(solved.labels.get('b')).toBe('out');
    });

    it('attaches attacks on an argument to the conclusion atom', () => {
      // The conclusion `b` of the argument is what an attack on the argument
      // effectively targets (the conclusion atom is keyed alongside the arg node).
      const src = '[#a].\n([#b]) -> [#c].\n[#a] --x [#b].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      // `a` is unattacked → IN; `b` is attacked by `a` (IN) → OUT.
      expect(solved.labels.get('b')).toBe('out');
    });

    it('emits a dangling-attack warning when the target is not a known node', () => {
      // Hand-build the AST: a fact `a` plus an attack on a non-existent `ghost`.
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
                arrow: 'attack' as const,
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
      const solved = solve(doc);
      expect(solved.warnings.some((w) => w.includes('dangling attack edge'))).toBe(true);
      expect(solved.labels.has('ghost')).toBe(false);
    });
  });

  describe('grounded labeling — initialization', () => {
    it('labels every unattacked fact IN', () => {
      const src = '[#a].\n[#b].\n[#c].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.labels.get('a')).toBe('in');
      expect(solved.labels.get('b')).toBe('in');
      expect(solved.labels.get('c')).toBe('in');
    });

    it('labels unattacked argument nodes IN', () => {
      const src = '([#a]) -> [#b].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.labels.get('arg:1:1')).toBe('in');
    });
  });

  describe('grounded labeling — cycles and diamond', () => {
    it('labels self-attacks OUT', () => {
      const src = '[#a].\n[#a] --x [#a].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.labels.get('a')).toBe('out');
    });

    it('labels mutual attacks UNDEC', () => {
      const src = '[#a].\n[#b].\n[#a] --x [#b].\n[#b] --x [#a].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.labels.get('a')).toBe('undec');
      expect(solved.labels.get('b')).toBe('undec');
    });

    it('labels three-cycle UNDEC', () => {
      const src = [
        '[#a].',
        '[#b].',
        '[#c].',
        '[#a] --x [#b].',
        '[#b] --x [#c].',
        '[#c] --x [#a].',
      ].join('\n');
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.labels.get('a')).toBe('undec');
      expect(solved.labels.get('b')).toBe('undec');
      expect(solved.labels.get('c')).toBe('undec');
    });

    it('labels the diamond topology correctly', () => {
      // a attacks b, c, and d; d attacks b and c.
      // a is unattacked → IN. d is attacked by a (IN) → OUT.
      // b and c are attacked by a (IN) and d (OUT) → IN (some attacker OUT).
      const src = [
        '[#a].',
        '[#b].',
        '[#c].',
        '[#d].',
        '[#a] --x [#b].',
        '[#a] --x [#c].',
        '[#a] --x [#d].',
        '[#d] --x [#b].',
        '[#d] --x [#c].',
      ].join('\n');
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.labels.get('a')).toBe('in');
      expect(solved.labels.get('d')).toBe('out');
      expect(solved.labels.get('b')).toBe('in');
      expect(solved.labels.get('c')).toBe('in');
    });
  });
});

import {
  solve as publicSolve,
  type SolveResult as PublicSolveResult,
  type Label as PublicLabel,
} from './index.js';

describe('public API', () => {
  it('re-exports solve from index.ts', () => {
    expect(publicSolve).toBe(solve);
  });

  it('exposes SolveResult and Label as types', () => {
    const label: PublicLabel = 'in';
    const result: PublicSolveResult = {
      labels: new Map([['x', label]]),
      warnings: [],
    };
    expect(result.labels.get('x')).toBe('in');
  });
});
