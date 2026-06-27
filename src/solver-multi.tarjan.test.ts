// src/solver-multi.tarjan.test.ts
import { describe, it, expect } from 'vitest';
import { tarjanScc } from './solver-multi.js';

describe('tarjanScc', () => {
  it('returns one SCC for an empty graph', () => {
    const result = tarjanScc(new Map());
    expect(result).toEqual([]);
  });

  it('puts a single node in a single acyclic SCC', () => {
    const map = new Map<string, string[]>([['A', []]]);
    const result = tarjanScc(map);
    expect(result).toHaveLength(1);
    expect(result[0]!.cyclic).toBe(false);
    expect(result[0]!.members).toEqual(new Set(['A']));
  });

  it('marks an SCC as cyclic when a self-attack exists', () => {
    const map = new Map<string, string[]>([['A', ['A']]]);
    const result = tarjanScc(map);
    expect(result).toHaveLength(1);
    expect(result[0]!.cyclic).toBe(true);
  });

  it('marks an SCC as cyclic on a 2-cycle', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['A']],
    ]);
    const result = tarjanScc(map);
    expect(result).toHaveLength(1);
    expect(result[0]!.cyclic).toBe(true);
    expect(result[0]!.members).toEqual(new Set(['A', 'B']));
  });

  it('produces two SCCs for A→B with no back edge', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', []],
    ]);
    const result = tarjanScc(map);
    expect(result).toHaveLength(2);
    for (const scc of result) {
      expect(scc.cyclic).toBe(false);
      expect(scc.members.size).toBe(1);
    }
    const bIdx = result.findIndex((s) => s.members.has('B'));
    const aIdx = result.findIndex((s) => s.members.has('A'));
    expect(aIdx).toBeLessThan(bIdx);
  });

  it('keeps a deep linear chain acyclic and topologically ordered', () => {
    const map = new Map<string, string[]>();
    const N = 50;
    for (let i = 0; i < N; i++) {
      const attacks: string[] = [];
      if (i < N - 1) attacks.push(`n${i + 1}`);
      map.set(`n${i}`, attacks);
    }
    const result = tarjanScc(map);
    expect(result).toHaveLength(N);
    expect(result[0]!.members.has('n0')).toBe(true);
    expect(result[N - 1]!.members.has('n49')).toBe(true);
  });

  it('orders SCCs so every attacker SCC precedes its attackee SCC', () => {
    // Property: for every edge a -> b in the input, the SCC containing a
    // must come before the SCC containing b in the result array. This is
    // the spec invariant (reverse-topological -> topological post-reverse)
    // required by Task 2's Modgil labeling walk. Without it, the labeling
    // walk would see uninitialized attacker labels.
    const map = new Map<string, string[]>([
      ['A', ['B', 'C']],
      ['B', ['D']],
      ['C', ['D']],
      ['D', ['E']],
      ['E', []],
    ]);
    const result = tarjanScc(map);
    const idxOf = new Map<string, number>();
    for (let i = 0; i < result.length; i++) {
      for (const m of result[i]!.members) idxOf.set(m, i);
    }
    for (const [a, attackers] of map.entries()) {
      for (const b of attackers) {
        if (a === b) continue; // self-attack: same SCC, ordering irrelevant
        expect(idxOf.get(a)!).toBeLessThan(idxOf.get(b)!);
      }
    }
  });

  it('handles a graph with two disjoint cycles', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['A']],
      ['C', ['D']],
      ['D', ['C']],
    ]);
    const result = tarjanScc(map);
    expect(result).toHaveLength(2);
    for (const scc of result) {
      expect(scc.cyclic).toBe(true);
      expect(scc.members.size).toBe(2);
    }
  });

  it('groups a triangle cycle into one SCC', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['C']],
      ['C', ['A']],
    ]);
    const result = tarjanScc(map);
    expect(result).toHaveLength(1);
    expect(result[0]!.cyclic).toBe(true);
    expect(result[0]!.members).toEqual(new Set(['A', 'B', 'C']));
  });
});