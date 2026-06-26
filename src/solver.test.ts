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
});
