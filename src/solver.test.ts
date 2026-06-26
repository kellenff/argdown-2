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
});
