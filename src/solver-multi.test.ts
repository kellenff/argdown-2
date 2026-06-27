// src/solver-multi.test.ts
import { describe, expect, it } from 'vitest';
import {
  attackersOf,
  isAdmissible,
  isConflictFree,
  isClosedUnderDefense,
  defenseClosure,
  findCompleteExtensions,
  findPreferredExtensions,
  findStableExtensions,
  isStable,
  stripAux,
} from './solver-multi.js';

describe('attackersOf', () => {
  it('returns attackers for a known target', () => {
    const map = new Map<string, string[]>([['B', ['A']]]);
    expect(attackersOf(map, 'B')).toEqual(['A']);
  });
  it('returns empty array for unknown target', () => {
    const map = new Map<string, string[]>();
    expect(attackersOf(map, 'X')).toEqual([]);
  });
});

describe('isConflictFree', () => {
  it('returns true for empty set', () => {
    expect(isConflictFree(new Set(), new Map())).toBe(true);
  });
  it('returns true when no internal attacks', () => {
    expect(isConflictFree(new Set(['A', 'B']), new Map([['A', []], ['B', ['C']]]))).toBe(true);
  });
  it('returns false when an internal attack exists', () => {
    expect(isConflictFree(new Set(['A', 'B']), new Map([['A', ['B']]]))).toBe(false);
  });
});

describe('isAdmissible', () => {
  it('empty set is always admissible', () => {
    expect(isAdmissible(new Set(), new Map())).toBe(true);
  });
  it('A is admissible when unattacked', () => {
    expect(isAdmissible(new Set(['A']), new Map([['A', []]]))).toBe(true);
  });
  it('A is NOT admissible when attacked by B and B is not in set', () => {
    expect(isAdmissible(new Set(['A']), new Map([['A', ['B']]]))).toBe(false);
  });
  it('A IS admissible when attacked by B and A attacks B back', () => {
    // 2-cycle: A -> B, B -> A. {A} is admissible (A defends itself against B).
    expect(isAdmissible(new Set(['A']), new Map([['A', ['B']], ['B', ['A']]]))).toBe(true);
  });
});

describe('defenseClosure', () => {
  it('returns empty set for empty input', () => {
    expect(defenseClosure(new Set(), new Map()).size).toBe(0);
  });
  it('adds unattacked args vacuously (defended trivially)', () => {
    // A is unattacked; {B} does not explicitly defend A, but A is defended
    // vacuously (no attackers → universal quantifier is trivially satisfied).
    const result = defenseClosure(new Set(['B']), new Map([['A', []], ['B', []]]));
    expect([...result].sort()).toEqual(['A', 'B']);
  });
  it('adds an arg whose attackers are all defeated by the set', () => {
    // A attacks B, B attacks C. {A} defends C (B is attacked by A).
    const map = new Map<string, string[]>([['A', []], ['B', ['A']], ['C', ['B']]]);
    const result = defenseClosure(new Set(['A']), map);
    expect([...result].sort()).toEqual(['A', 'C']);
  });
});

describe('isClosedUnderDefense', () => {
  it('returns true for empty set', () => {
    expect(isClosedUnderDefense(new Set(), new Map())).toBe(true);
  });
  it('returns true for set that contains all it defends', () => {
    // {A} in the 2-cycle above; A is defended; {A} contains A.
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['A']]]);
    expect(isClosedUnderDefense(new Set(['A']), map)).toBe(true);
  });
});

describe('isStable', () => {
  it('returns true for unattacked A', () => {
    expect(isStable(new Set(['A']), new Map([['A', []]]))).toBe(true);
  });
  it('returns false for 3-cycle (odd cycle has no stable)', () => {
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['C']], ['C', ['A']]]);
    expect(isStable(new Set(['A']), map)).toBe(false);
  });
  it('returns true for {A} in 2-cycle A<->B (textbook Dung: {A} is admissible and attacks B)', () => {
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['A']]]);
    expect(isStable(new Set(['A']), map)).toBe(true);
  });
});

describe('stripAux', () => {
  it('removes sup: and nec: prefixed keys', () => {
    const set = new Set(['A', 'sup:A->B', 'nec:B->C', 'B']);
    expect([...stripAux(set)].sort()).toEqual(['A', 'B']);
  });
  it('leaves arg:L:C keys intact', () => {
    const set = new Set(['A', 'arg:1:1:C']);
    expect([...stripAux(set)].sort()).toEqual(['A', 'arg:1:1:C']);
  });
});

describe('findPreferredExtensions', () => {
  it('returns 1 preferred (∅) for empty map', () => {
    expect(findPreferredExtensions(new Map())).toEqual([new Set()]);
  });

  it('returns [{A}] for unattacked source A', () => {
    const map = new Map<string, string[]>([['A', []]]);
    const result = findPreferredExtensions(map);
    expect(result.length).toBe(1);
    expect([...result[0]!]).toEqual(['A']);
  });

  it('returns 1 preferred for 3-cycle A->B->C->A (textbook Dung: only ∅ is admissible)', () => {
    // A → B → C → A: A attacks B (so B's attackers = [A]), B attacks C
    // (so C's attackers = [B]), C attacks A (so A's attackers = [C]).
    // {A} is NOT admissible: A is attacked by C; for A to be defended, {A}
    // needs a member attacking C, but A only attacks B. Same for {B} and
    // {C}. Only ∅ is admissible. Preferred = [∅].
    const map = new Map<string, string[]>([['A', ['C']], ['B', ['A']], ['C', ['B']]]);
    const result = findPreferredExtensions(map);
    expect(result.length).toBe(1);
    expect(result[0]!.size).toBe(0);
  });

  it('returns 2 preferred for 2-cycle A<->B', () => {
    // A <-> B means A attacks B (B's attackers = [A]) AND B attacks A (A's attackers = [B]).
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['A']]]);
    const result = findPreferredExtensions(map);
    expect(result.length).toBe(2);
  });

  it('returns 1 preferred for self-attacking A->A (only ∅ is admissible)', () => {
    // A -> A means A attacks itself, so {A} is not conflict-free.
    // Only ∅ is admissible. Preferred for self-attack is [∅] (1 result, the empty set).
    const map = new Map<string, string[]>([['A', ['A']]]);
    const result = findPreferredExtensions(map);
    expect(result.length).toBe(1);
    expect(result[0]!.size).toBe(0);
  });

  it('strips aux keys from each extension', () => {
    const map = new Map<string, string[]>([
      ['A', []],
      ['sup:A->B', ['B']],
      ['B', ['sup:A->B']],
    ]);
    const result = findPreferredExtensions(map);
    expect(result.length).toBeGreaterThan(0);
    for (const ext of result) {
      expect([...ext].some((k) => k.startsWith('sup:'))).toBe(false);
    }
  });
});

describe('findStableExtensions', () => {
  it('returns empty for empty map', () => {
    expect(findStableExtensions(new Map())).toEqual([]);
  });

  it('returns 2 stable for 2-cycle A<->B', () => {
    // {A} and {B} are both admissible and each attacks the other.
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['A']]]);
    const result = findStableExtensions(map);
    expect(result.length).toBe(2);
    const sorted = result.map((s) => [...s].sort());
    expect(sorted).toContainEqual(['A']);
    expect(sorted).toContainEqual(['B']);
  });

  it('returns 0 stable for 3-cycle (odd cycle has no stable)', () => {
    const map = new Map<string, string[]>([['A', ['C']], ['B', ['A']], ['C', ['B']]]);
    expect(findStableExtensions(map)).toEqual([]);
  });

  it('returns [{A}] for unattacked source A', () => {
    const map = new Map<string, string[]>([['A', []]]);
    const result = findStableExtensions(map);
    expect(result.length).toBe(1);
    expect([...result[0]!]).toEqual(['A']);
  });
});

describe('findCompleteExtensions', () => {
  it('returns 1 (∅) for empty map', () => {
    const result = findCompleteExtensions(new Map());
    expect(result.length).toBe(1);
    expect(result[0]!.size).toBe(0);
  });

  it('returns 1 ({A}) for unattacked source A (∅ is not closed because defenseClosure(∅) = {A})', () => {
    const map = new Map<string, string[]>([['A', []]]);
    const result = findCompleteExtensions(map);
    expect(result.length).toBe(1);
    expect([...result[0]!]).toEqual(['A']);
  });

  it('returns 1 (∅) for 3-cycle', () => {
    // {A}, {B}, {C} are admissible but defenseClosure({A}) = {A, B, C} ≠ {A}, so not closed.
    // ∅ is closed (no args added vacuously to closure since attackers are non-empty).
    const map = new Map<string, string[]>([['A', ['C']], ['B', ['A']], ['C', ['B']]]);
    const result = findCompleteExtensions(map);
    expect(result.length).toBe(1);
    expect(result[0]!.size).toBe(0);
  });

  it('returns 3 (∅, {A}, {B}) for 2-cycle', () => {
    // ∅ closed; {A} and {B} each admissible and closed (defenseClosure({A}) = {A}).
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['A']]]);
    const result = findCompleteExtensions(map);
    expect(result.length).toBe(3);
    const sorted = result.map((s) => [...s].sort());
    expect(sorted).toContainEqual([]);
    expect(sorted).toContainEqual(['A']);
    expect(sorted).toContainEqual(['B']);
  });
});
