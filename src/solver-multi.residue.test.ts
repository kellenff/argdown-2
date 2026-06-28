// src/solver-multi.residue.test.ts
import { describe, it, expect } from 'vitest';
import { residueOf, lift } from './solver-multi.js';

describe('residueOf', () => {
  it('returns empty args and subMap for empty input', () => {
    const result = residueOf(new Map(), new Set());
    expect(result.args).toEqual([]);
    expect(result.subMap.size).toBe(0);
  });

  it('returns all args when grounded is empty', () => {
    const map = new Map<string, string[]>([
      ['A', []],
      ['B', []],
    ]);
    const result = residueOf(map, new Set());
    expect(result.args.sort()).toEqual(['A', 'B']);
    expect(result.subMap.get('A')).toEqual([]);
    expect(result.subMap.get('B')).toEqual([]);
  });

  it('excludes grounded args from residue', () => {
    const map = new Map<string, string[]>([
      ['A', []],
      ['B', []],
    ]);
    const result = residueOf(map, new Set(['A']));
    expect(result.args).toEqual(['B']);
    expect(result.subMap.has('A')).toBe(false);
    expect(result.subMap.has('B')).toBe(true);
  });

  it('filters attackers to residue members only', () => {
    // Map convention: map.get(arg) = [args that ATTACK arg].
    // A attacks B; A is grounded. Residue only contains B, with no attackers.
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', []],
    ]);
    const result = residueOf(map, new Set(['A']));
    expect(result.subMap.get('B')).toEqual([]);
  });

  it('preserves attackers within the residue', () => {
    // A is grounded. B and C are residue. B attacks C.
    // Map convention: map.get(arg) = [args that ATTACK arg].
    // So C's attackers are [B].
    const map = new Map<string, string[]>([
      ['A', []],
      ['B', []],
      ['C', ['B']],
    ]);
    const result = residueOf(map, new Set(['A']));
    expect(result.subMap.get('B')).toEqual([]);
    expect(result.subMap.get('C')).toEqual(['B']);
  });
});

describe('lift', () => {
  it('returns G when T is empty', () => {
    expect(lift(new Set(), new Set(['A', 'B']))).toEqual(new Set(['A', 'B']));
  });

  it('returns T when G is empty', () => {
    expect(lift(new Set(['A']), new Set())).toEqual(new Set(['A']));
  });

  it('returns the union of T and G', () => {
    expect(lift(new Set(['B']), new Set(['A']))).toEqual(new Set(['A', 'B']));
  });

  it('does not duplicate when T and G overlap', () => {
    const result = lift(new Set(['A', 'B']), new Set(['A']));
    expect(result).toEqual(new Set(['A', 'B']));
  });
});