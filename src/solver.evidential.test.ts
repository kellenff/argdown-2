// src/solver.evidential.test.ts
// Cayrol & Lagasquie-Schiex 2005 §3.3 necessary-support reduction.
// Each `A --> B` introduces auxiliary `nec:A->B` with attacks
// `A → nec` and `nec → B`; A's defeat propagates to B.

import { describe, expect, it } from 'vitest';

import { parse } from './parser.js';
import type { Label } from './solver.js';
import { solveEvidential } from './solver.js';

function solveSrc(src: string): { labels: Map<string, Label>; warnings: string[] } {
  const r = parse(src);
  if (!r.ok) throw new Error('parse failed: ' + r.errors.map((e) => e.message).join('; '));
  const result = solveEvidential(r.ast);
  return { labels: result.labels, warnings: result.warnings };
}

describe('solveEvidential', () => {
  it('empty graph: no labels, no warnings', () => {
    const { labels, warnings } = solveSrc('');
    expect(labels.size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('simple necessary support: A in, B in', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#A] --> [#B].');
    expect(labels.get('A')).toBe('in');
    expect(labels.get('B')).toBe('in');
  });

  it('headline: propagates A\'s defeat to B', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#C]\n[#A] --> [#B].\n[#C] --x [#A].');
    expect(labels.get('A')).toBe('out');
    expect(labels.get('B')).toBe('out');
    expect(labels.get('C')).toBe('in');
  });

  it('self-support: A undec (no direct self-attack)', () => {
    const { labels } = solveSrc('[#A]\n[#A] --> [#A].');
    expect(labels.get('A')).toBe('undec');
  });

  it('mutual necessary support: cycle through two auxiliaries', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#A] --> [#B].\n[#B] --> [#A].');
    expect(labels.get('A')).toBe('undec');
    expect(labels.get('B')).toBe('undec');
  });

  it('equivalence: two necessary supports, four-node cycle', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#A] <-> [#B].');
    expect(labels.get('A')).toBe('undec');
    expect(labels.get('B')).toBe('undec');
  });

  it('mixed equivalence + attack: cycle absorbs C', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#C]\n[#A] <-> [#B].\n[#C] --x [#A].');
    expect(labels.get('A')).toBe('undec');
    expect(labels.get('B')).toBe('undec');
    expect(labels.get('C')).toBe('in');
  });

  it('necessary support from in-supporter does NOT force B\'s defeat', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#C]\n[#A] --> [#B].\n[#C] --x [#B].');
    expect(labels.get('A')).toBe('in');
    expect(labels.get('B')).toBe('in');
    expect(labels.get('C')).toBe('in');
  });

  it('undercut collapses to attack (no preference mechanics)', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#A] -.-> [#B].');
    expect(labels.get('A')).toBe('in');
    expect(labels.get('B')).toBe('out');
  });

  it('concession collapses to attack, no warning', () => {
    const { warnings } = solveSrc('[#A]\n[#B]\n[#A] ~> [#B].');
    expect(warnings.find((w) => w.includes('concession'))).toBeUndefined();
  });

  it('qualification collapses to attack, no warning', () => {
    const { warnings } = solveSrc('[#A]\n[#B]\n[#A] ?> [#B].');
    expect(warnings.find((w) => w.includes('qualification'))).toBeUndefined();
  });

  it('mixed arrows: multiple attackers, but aux out → all in', () => {
    const { labels } = solveSrc(
      '[#A]\n[#B]\n[#C]\n[#D]\n[#A] --> [#B].\n[#C] --x [#B].\n[#D] -.-> [#B].',
    );
    expect(labels.get('A')).toBe('in');
    expect(labels.get('B')).toBe('in');
    expect(labels.get('C')).toBe('in');
    expect(labels.get('D')).toBe('in');
  });

  it('cycle through auxiliaries: no source, all undec', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#C]\n[#A] --> [#B].\n[#B] --> [#C].\n[#C] --> [#A].');
    expect(labels.get('A')).toBe('undec');
    expect(labels.get('B')).toBe('undec');
    expect(labels.get('C')).toBe('undec');
  });

  it('auxiliaries are stripped from output labels', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#A] --> [#B].');
    for (const k of labels.keys()) {
      expect(k.startsWith('nec:')).toBe(false);
    }
  });

  it('dangling necessary support: warning, no crash', () => {
    const { warnings } = solveSrc('[#A]\n[#A] --> [#NONEXISTENT].');
    expect(warnings.some((w) => w.includes('NONEXISTENT'))).toBe(true);
  });

  it('dangling equivalence: warning, no crash', () => {
    const { warnings } = solveSrc('[#A]\n[#A] <-> [#NONEXISTENT].');
    expect(warnings.some((w) => w.includes('NONEXISTENT'))).toBe(true);
  });

  it('dangling attack: warning', () => {
    const { warnings } = solveSrc('[#A]\n[#A] --x [#NONEXISTENT].');
    expect(warnings.some((w) => w.includes('NONEXISTENT'))).toBe(true);
  });

  it('duplicate fact id: warning', () => {
    const { warnings } = solveSrc('[#A] X.\n[#A] Y.');
    expect(warnings.some((w) => w.includes('duplicate'))).toBe(true);
  });

  it('defeats field absent (evidential is a reduction, not ASPIC+)', () => {
    const r = parse('[#A]\n[#A] --> [#A].');
    if (!r.ok) throw new Error('parse failed');
    const result = solveEvidential(r.ast);
    expect(result.defeats).toBeUndefined();
  });
});
