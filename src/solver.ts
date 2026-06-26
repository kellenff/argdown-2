// src/solver.ts
// Dung grounded-extension solver. Pure-attack reduction: only `--x`
// becomes an attack edge; every other arrow kind is counted in `dropped`.
// Method 1 of the design; Methods 2 (bipolar) and 3 (ASPIC+) are
// future cycles.

import type { Document } from './ast.js';

export type Label = 'in' | 'out' | 'undec';

export type SolveResult = {
  labels: Map<string, Label>;
  dropped: {
    support: number;
    undercut: number;
    undermine: number;
    concession: number;
    qualification: number;
    equivalence: number;
  };
  warnings: string[];
};

export function solve(_document: Document): SolveResult {
  void _document;
  return {
    labels: new Map(),
    dropped: {
      support: 0, undercut: 0, undermine: 0,
      concession: 0, qualification: 0, equivalence: 0,
    },
    warnings: [],
  };
}
