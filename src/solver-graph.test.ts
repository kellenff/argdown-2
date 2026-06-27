// src/solver-graph.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { buildArgumentGraph } from './solver-graph.js';
import { buildAspicDefeatMap } from './solver-aspic.js';
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

  it('drops undercut/undermine/concession/qualification as plain attacks (not attached)', () => {
    const result = parse(
      '[#A] x.\n[#B] y.\n[#C] z.\n[#D] q.\n[#E] r.\n[#F] s.\n' +
        '[#A] -.-> [#B].\n' + // undercut
        '[#A] -.- [#C].\n' + // undermine
        '[#A] ~> [#D].\n' + // concession
        '[#A] ?> [#E].\n' + // qualification
        '[#A] --x [#F].\n', // attack
    );
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { map, warnings } = buildArgumentGraph(ast, 'dung');
    // Only --x produces an attack edge. Undercut/undermine/concession/qualification
    // are dropped — B/C/D/E have empty attacker lists (not 'A').
    expect(map.get('B')).toEqual([]);
    expect(map.get('C')).toEqual([]);
    expect(map.get('D')).toEqual([]);
    expect(map.get('E')).toEqual([]);
    // F is attacked by A.
    expect(map.get('F')).toEqual(['A']);
    // Summary warning mentions all four dropped kinds.
    const summary = warnings.find((w) => w.includes('dropped'));
    expect(summary).toBeDefined();
    expect(summary).toMatch(/undercut=1/);
    expect(summary).toMatch(/undermine=1/);
    expect(summary).toMatch(/concession=1/);
    expect(summary).toMatch(/qualification=1/);
  });
});

describe('buildArgumentGraph (bipolar reduction)', () => {
  it('reduces --> to sup:auxiliary with B->sup, sup->A', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] --> [#B].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { map } = buildArgumentGraph(ast, 'bipolar');
    // The sup:A->B auxiliary is attacked by B; A is attacked by the auxiliary.
    const auxKey = 'sup:A->B';
    expect(map.get(auxKey)).toEqual(['B']);
    expect(map.get('A')).toEqual([auxKey]);
  });

  it('reduces <-> to two deductive supports', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] <-> [#B].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { map } = buildArgumentGraph(ast, 'bipolar');
    expect(map.get('sup:A->B')).toEqual(['B']);
    expect(map.get('sup:B->A')).toEqual(['A']);
  });

  it('collapses --x, -.->, ~>, ?> to plain attack', () => {
    const result = parse(
      '[#A] x.\n[#B] y.\n[#A] --x [#B].\n[#A] -.-> [#B].\n[#A] ~> [#B].\n[#A] ?> [#B].\n',
    );
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { map, warnings } = buildArgumentGraph(ast, 'bipolar');
    // B is attacked by A multiple times.
    expect(map.get('B')?.filter((x) => x === 'A').length).toBeGreaterThanOrEqual(2);
    expect(warnings.some((w) => w.includes('dangling'))).toBe(false);
  });
});

describe('buildArgumentGraph (evidential reduction)', () => {
  it('reduces --> to nec:auxiliary with A->nec, nec->B', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] --> [#B].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { map } = buildArgumentGraph(ast, 'evidential');
    const auxKey = 'nec:A->B';
    expect(map.get(auxKey)).toEqual(['A']);
    expect(map.get('B')).toEqual([auxKey]);
  });

  it('reduces <-> to two necessary supports', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] <-> [#B].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { map } = buildArgumentGraph(ast, 'evidential');
    expect(map.get('nec:A->B')).toEqual(['A']);
    expect(map.get('nec:B->A')).toEqual(['B']);
  });

  it('collapses --x, -.->, ~>, ?> to plain attack (same posture as bipolar)', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] --x [#B].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { map } = buildArgumentGraph(ast, 'evidential');
    expect(map.get('B')).toEqual(['A']);
  });
});

describe('buildArgumentGraph (aspic reduction)', () => {
  it('delegates to buildAspicDefeatMap and produces identical map', () => {
    const src = '[#A] x.\n[#B] y.\n[#A] --x [#B].\n';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const direct = buildAspicDefeatMap(ast);
    const via = buildArgumentGraph(ast, 'aspic');
    expect([...via.map.entries()]).toEqual([...direct.map.entries()]);
    expect(via.warnings).toEqual(direct.warnings);
  });

  it('undercut always wins regardless of preference', () => {
    const result = parse('[#A] x.\n[#B] y.\n[#A] -.-> [#B].\n');
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { map } = buildArgumentGraph(ast, 'aspic');
    expect(map.get('B')).toEqual(['A']);
  });

  it('rebut requires strict preference to be a defeat', () => {
    const result = parse(
      '[#A] x { preference: 1 }\n[#B] y { preference: 0.5 }\n[#A] --x [#B].\n',
    );
    if (!result.ok) throw new Error('parse failed');
    const ast = result.ast;
    const { map } = buildArgumentGraph(ast, 'aspic');
    expect(map.get('B')).toEqual(['A']);
  });
});
