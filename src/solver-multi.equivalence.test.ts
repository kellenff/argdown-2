// src/solver-multi.equivalence.test.ts
import { describe, it, expect } from 'vitest';
import {
  findCompleteExtensions,
  findPreferredExtensions,
  findStableExtensions,
} from './solver-multi.js';

/**
 * Reference implementations: textbook Dung brute force over BigInt masks on
 * the FULL argument set. Captured here for equivalence testing against the
 * new residue-based finders.
 */
function bruteForceCompleteReference(
  map: Map<string, string[]>,
): Set<string>[] {
  const args = [...map.keys()];
  const n = args.length;
  const results: Set<string>[] = [];
  const ONE = 1n;

  function isClosedUnderDefense(s: Set<string>): boolean {
    for (const a of args) {
      if (s.has(a)) continue;
      const attackers = map.get(a) ?? [];
      const allCounterAttacked = attackers.every((b) => {
        const bAttackers = map.get(b) ?? [];
        return bAttackers.some((c) => s.has(c));
      });
      if (allCounterAttacked) return false;
    }
    return true;
  }

  // Textbook admissibility: conflict-free + defends every member.
  function isAdmissible(s: Set<string>): boolean {
    for (const a of s) {
      const attackers = map.get(a) ?? [];
      for (const b of attackers) {
        if (s.has(b)) return false; // internal attack
      }
    }
    for (const a of s) {
      const attackers = map.get(a) ?? [];
      const allDefended = attackers.every((b) => {
        const bAttackers = map.get(b) ?? [];
        return bAttackers.some((c) => s.has(c));
      });
      if (!allDefended) return false;
    }
    return true;
  }

  for (let mask = 0n; mask < (ONE << BigInt(n)); mask++) {
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    if (isClosedUnderDefense(subset) && isAdmissible(subset)) {
      results.push(subset);
    }
  }
  return results;
}

function bruteForceStableReference(
  map: Map<string, string[]>,
): Set<string>[] {
  const args = [...map.keys()];
  const n = args.length;
  const results: Set<string>[] = [];
  const ONE = 1n;

  function isStable(s: Set<string>): boolean {
    // admissible: conflict-free + defends every member
    for (const a of s) {
      const attackers = map.get(a) ?? [];
      for (const b of attackers) {
        if (s.has(b)) return false; // internal attack
      }
    }
    for (const a of s) {
      const attackers = map.get(a) ?? [];
      const allDefended = attackers.every((b) => {
        const bAttackers = map.get(b) ?? [];
        return bAttackers.some((c) => s.has(c));
      });
      if (!allDefended) return false;
    }
    // attacks every arg outside
    for (const a of args) {
      if (s.has(a)) continue;
      const aAttackers = map.get(a) ?? [];
      const hasAttackerInS = aAttackers.some((b) => s.has(b));
      if (!hasAttackerInS) return false;
    }
    return true;
  }

  for (let mask = 1n; mask < (ONE << BigInt(n)); mask++) {
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    if (isStable(subset)) {
      results.push(subset);
    }
  }
  return results;
}

function bruteForcePreferredReference(
  map: Map<string, string[]>,
): Set<string>[] {
  const args = [...map.keys()];
  const n = args.length;
  const results: Set<string>[] = [];
  const ONE = 1n;
  const skipMasks = new Set<bigint>();

  // Textbook admissibility: conflict-free + defends every member.
  function isAdmissible(s: Set<string>): boolean {
    for (const a of s) {
      const attackers = map.get(a) ?? [];
      for (const b of attackers) {
        if (s.has(b)) return false; // internal attack
      }
    }
    for (const a of s) {
      const attackers = map.get(a) ?? [];
      const allDefended = attackers.every((b) => {
        const bAttackers = map.get(b) ?? [];
        return bAttackers.some((c) => s.has(c));
      });
      if (!allDefended) return false;
    }
    return true;
  }

  for (let mask = (ONE << BigInt(n)) - 1n; mask >= 0n; mask--) {
    if (skipMasks.has(mask)) continue;
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (ONE << BigInt(i))) subset.add(args[i]!);
    }
    if (isAdmissible(subset)) {
      results.push(subset);
      let sub = mask;
      while (true) {
        skipMasks.add(sub);
        if (sub === 0n) break;
        sub = (sub - 1n) & mask;
      }
    }
  }
  return results;
}

function randomSparseGraph(n: number, density = 0.1, seed = 1): Map<string, string[]> {
  // Simple LCG for reproducibility (avoid Math.random flakiness).
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

function setEquivalence<T>(a: Set<T>[], b: Set<T>[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].map((s) => [...s].sort().join(','));
  const sortedB = [...b].map((s) => [...s].sort().join(','));
  sortedA.sort();
  sortedB.sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

describe('findCompleteExtensions (residue-based) equivalence', () => {
  it('matches brute-force reference on N=10 random sparse graphs', () => {
    for (let trial = 0; trial < 5; trial++) {
      const map = randomSparseGraph(10, 0.1, trial);
      const got = findCompleteExtensions(map);
      const want = bruteForceCompleteReference(map);
      expect(setEquivalence(got, want)).toBe(true);
    }
  });

  it('matches on a 3-cycle (no grounded)', () => {
    // A's attackers = [B], B's attackers = [C], C's attackers = [A]. 3-cycle.
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['C']],
      ['C', ['A']],
    ]);
    const got = findCompleteExtensions(map);
    const want = bruteForceCompleteReference(map);
    expect(setEquivalence(got, want)).toBe(true);
  });

  it('matches on a 5-node DAG', () => {
    // A->B->C, D->E (separate chains). All unattacked.
    // A's attackers = [], B's attackers = [A], C's attackers = [B],
    // D's attackers = [], E's attackers = [D].
    const map = new Map<string, string[]>([
      ['A', []],
      ['B', ['A']],
      ['C', ['B']],
      ['D', []],
      ['E', ['D']],
    ]);
    const got = findCompleteExtensions(map);
    const want = bruteForceCompleteReference(map);
    expect(setEquivalence(got, want)).toBe(true);
  });
});

describe('findStableExtensions (residue-based) equivalence', () => {
  it('matches brute-force reference on N=8 random sparse graphs', () => {
    for (let trial = 0; trial < 5; trial++) {
      const map = randomSparseGraph(8, 0.1, trial);
      const got = findStableExtensions(map);
      const want = bruteForceStableReference(map);
      expect(setEquivalence(got, want)).toBe(true);
    }
  });

  it('matches on a 3-cycle', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['C']],
      ['C', ['A']],
    ]);
    const got = findStableExtensions(map);
    const want = bruteForceStableReference(map);
    expect(setEquivalence(got, want)).toBe(true);
  });
});

describe('findPreferredExtensions (residue-based) equivalence', () => {
  it('matches brute-force reference on N=8 random sparse graphs', () => {
    for (let trial = 0; trial < 5; trial++) {
      const map = randomSparseGraph(8, 0.1, trial);
      const got = findPreferredExtensions(map);
      const want = bruteForcePreferredReference(map);
      expect(setEquivalence(got, want)).toBe(true);
    }
  });

  it('matches on a 3-cycle', () => {
    const map = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['C']],
      ['C', ['A']],
    ]);
    const got = findPreferredExtensions(map);
    const want = bruteForcePreferredReference(map);
    expect(setEquivalence(got, want)).toBe(true);
  });
});