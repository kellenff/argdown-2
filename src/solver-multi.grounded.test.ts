// src/solver-multi.grounded.test.ts
import { describe, it, expect } from 'vitest';
import { findGroundedExtension, defenseClosure } from './solver-multi.js';

describe('findGroundedExtension', () => {
  it('returns empty set for an empty graph', () => {
    expect(findGroundedExtension(new Map())).toEqual(new Set());
  });

  it('returns the only node when unattacked (DAG sink)', () => {
    const map = new Map<string, string[]>([['A', []]]);
    expect(findGroundedExtension(map)).toEqual(new Set(['A']));
  });

  it('returns the unattacked source of a 2-node graph', () => {
    // Map convention: map.get(arg) = list of args that ATTACK arg (incoming edges).
    // For [[A, [B]], [B, []]]: B attacks A; A attacks no one.
    // A's attackers = [B]; B's attackers = ∅. B is unattacked → in. A is
    // attacked by B (in) → out. Result: {B}.
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', []],
    ]);
    expect(findGroundedExtension(map)).toEqual(new Set(['B']));
  });

  it('returns nothing for a 2-cycle (no defended members)', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['A']],
    ]);
    expect(findGroundedExtension(map)).toEqual(new Set());
  });

  it('returns nothing for a self-attack', () => {
    const map = new Map<string, string[]>([['A', ['A']]]);
    expect(findGroundedExtension(map)).toEqual(new Set());
  });

  it('matches defenseClosure(∅) on tractable random graphs', () => {
    // Property-based: for N=20 random sparse graphs, results must match.
    const N = 20;
    for (let trial = 0; trial < 10; trial++) {
      const args = Array.from({ length: N }, (_, i) => `a${i}`);
      const map = new Map<string, string[]>();
      for (const a of args) {
        const attacks: string[] = [];
        for (const b of args) {
          if (a !== b && Math.random() < 0.1) attacks.push(b);
        }
        map.set(a, attacks);
      }
      const scc = findGroundedExtension(map);
      const dc = defenseClosure(new Set(), map);
      expect(scc).toEqual(dc);
    }
  });

  it('handles a graph with defended node outside a 3-cycle', () => {
    // Map convention: map.get(arg) = list of args that ATTACK arg.
    // Attack graph: B→A, C→B, A→C, no attacks on D.
    // D is unattacked → in. {A,B,C} is cyclic → undec. Result: {D}.
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['C']],
      ['C', ['A']],
      ['D', []],
    ]);
    expect(findGroundedExtension(map)).toEqual(new Set(['D']));
  });

  it('returns full set on a pure DAG', () => {
    const map = new Map<string, string[]>([
      ['A', []],
      ['B', []],
      ['C', []],
    ]);
    expect(findGroundedExtension(map)).toEqual(new Set(['A', 'B', 'C']));
  });
});
