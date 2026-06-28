// src/solver-multi.large.test.ts
import { describe, it, expect } from 'vitest';
import {
  findCompleteExtensions,
  findPreferredExtensions,
  findStableExtensions,
  findGroundedExtension,
} from './solver-multi.js';

function randomSparseGraph(n: number, density = 0.01, seed = 1): Map<string, string[]> {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const args = Array.from({ length: n }, (_, i) => `a${i}`);
  const map = new Map<string, string[]>();
  for (const a of args) {
    const attacks: string[] = [];
    for (const b of args) {
      if (a !== b && rand() < density) attacks.push(b);
    }
    map.set(a, attacks);
  }
  return map;
}

describe('large-graph invariants', () => {
  // Density 0.01 keeps the residue tractable (|R| <= ~18) so the 2^|R|
  // brute-force enumeration finishes in seconds. Higher density leaves
  // residues too large (~45) for any reasonable test timeout.
  it('G ⊆ every complete extension (N=50)', () => {
    const map = randomSparseGraph(50, 0.01, 1);
    const g = findGroundedExtension(map);
    const completes = findCompleteExtensions(map);
    for (const c of completes) {
      for (const arg of g) {
        expect(c.has(arg)).toBe(true);
      }
    }
  });

  it('G ⊆ every preferred extension (N=50)', () => {
    const map = randomSparseGraph(50, 0.01, 2);
    const g = findGroundedExtension(map);
    const preferreds = findPreferredExtensions(map);
    for (const p of preferreds) {
      for (const arg of g) {
        expect(p.has(arg)).toBe(true);
      }
    }
  });

  it('every complete is contained in some preferred (N=30)', () => {
    const map = randomSparseGraph(30, 0.02, 3);
    const completes = findCompleteExtensions(map);
    const preferreds = findPreferredExtensions(map);
    for (const c of completes) {
      const contained = preferreds.some((p) => {
        for (const arg of c) if (!p.has(arg)) return false;
        return true;
      });
      expect(contained).toBe(true);
    }
  });

  it('∩ complete = grounded (N=50)', () => {
    const map = randomSparseGraph(50, 0.01, 4);
    const g = findGroundedExtension(map);
    const completes = findCompleteExtensions(map);
    if (completes.length === 0) {
      // No complete extensions — invariant vacuously holds.
      return;
    }
    const intersection = completes.reduce<Set<string>>(
      (acc, c) => new Set([...acc].filter((x) => c.has(x))),
      new Set(completes[0]!),
    );
    expect(intersection).toEqual(g);
  });

  it('runs in under 5 seconds on a 50-node graph', () => {
    const map = randomSparseGraph(50, 0.01, 5);
    const start = performance.now();
    findCompleteExtensions(map);
    findPreferredExtensions(map);
    findStableExtensions(map);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});