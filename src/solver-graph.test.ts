// src/solver-graph.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { buildArgumentGraph } from './solver-graph.js';
import type { Document } from './ast.js';

describe('buildArgumentGraph (dung reduction)', () => {
  it('returns empty map for empty document', () => {
    const ast: Document = {
      kind: 'Document',
      elements: [],
      loc: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    };
    const { map, warnings } = buildArgumentGraph(ast, 'dung');
    expect(map.size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('builds attack map for simple --x edge', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] --x [#B].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { map, warnings } = buildArgumentGraph(ast, 'dung');
    expect(map.get('A')).toEqual([]);
    expect(map.get('B')).toEqual(['A']);
    expect(warnings).toEqual([]);
  });

  it('drops -->, -.->, -.-, ~>, ?> with summary warning', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#C] z.\n[#A] --> [#B].\n[#A] -.-> [#C].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { warnings } = buildArgumentGraph(ast, 'dung');
    expect(warnings.some((w) => w.includes('support=') && w.includes('undercut='))).toBe(true);
  });

  it('emits dangling-edge warning for missing target', () => {
    const result = parse('[#A] x.\n[#A] --x [#NONEXISTENT].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { warnings } = buildArgumentGraph(ast, 'dung');
    expect(warnings.some((w) => w.includes('dangling attack edge'))).toBe(true);
  });

  it('emits duplicate-id warning when same fact id is reused', () => {
    const result = parse('[#A] x.\n[#A] y.\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { warnings } = buildArgumentGraph(ast, 'dung');
    expect(warnings.some((w) => w.startsWith('duplicate fact id'))).toBe(true);
  });
});
