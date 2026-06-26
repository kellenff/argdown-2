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
    expect(solved.dropped.support).toBe(0);
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
      expect(solved.warnings.some(w => w.includes('duplicate fact id: co2'))).toBe(true);
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
      const argKeys = [...solved.labels.keys()].filter(k => k.startsWith('arg:'));
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
      expect(solved.dropped.support).toBe(1);
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
      expect(solved.dropped.support).toBe(1);
      expect(solved.dropped.undermine).toBe(1);
      expect(solved.dropped.undercut).toBe(1);
      expect(solved.dropped.concession).toBe(1);
      expect(solved.dropped.qualification).toBe(1);
    });

    it('attaches attack edges between fact nodes without dropping', () => {
      const src = '[#a].\n[#b].\n[#a] --x [#b].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      expect(solved.dropped.support).toBe(0);
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
      expect(solved.dropped.support).toBe(0);
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

    it('attaches attacks from fact to argument node', () => {
      const src = '[#a].\n([#b]) -> [#c].\n[#a] --x ([#b]) -> [#c].';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const solved = solve(result.ast);
      // The argument node on line 2 is targeted by `a`. After Task 6,
      // unattacked `a` is IN, so the argument becomes OUT.
      expect(solved.labels.get('arg:2:1')).toBe('out');
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
                  loc: { start: { line: 1, column: 2, offset: 1 }, end: { line: 1, column: 4, offset: 3 } },
                },
                loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 5, offset: 4 } },
              },
              loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 5, offset: 4 } },
            },
            loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 5, offset: 4 } },
          },
          {
            kind: 'RelationStatement' as const,
            relations: [{
              kind: 'Relation' as const,
              from: {
                kind: 'FactRef' as const,
                head: {
                  kind: 'IdentifierHead' as const,
                  identifier: 'a',
                  loc: { start: { line: 2, column: 2, offset: 7 }, end: { line: 2, column: 4, offset: 9 } },
                },
                loc: { start: { line: 2, column: 1, offset: 6 }, end: { line: 2, column: 5, offset: 10 } },
              },
              arrow: 'attack' as const,
              to: {
                kind: 'FactRef' as const,
                head: {
                  kind: 'IdentifierHead' as const,
                  identifier: 'ghost',
                  loc: { start: { line: 2, column: 11, offset: 16 }, end: { line: 2, column: 17, offset: 22 } },
                },
                loc: { start: { line: 2, column: 10, offset: 15 }, end: { line: 2, column: 18, offset: 23 } },
              },
              loc: { start: { line: 2, column: 1, offset: 6 }, end: { line: 2, column: 18, offset: 23 } },
            }],
            loc: { start: { line: 2, column: 1, offset: 6 }, end: { line: 2, column: 18, offset: 23 } },
          },
        ],
        loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 2, column: 18, offset: 23 } },
      };
      const solved = solve(doc);
      expect(solved.warnings.some(w => w.includes('dangling attack edge'))).toBe(true);
      expect(solved.labels.has('ghost')).toBe(false);
    });
  });
});
