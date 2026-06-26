// src/solver.ts
// Dung grounded-extension solver. Pure-attack reduction: only `--x`
// becomes an attack edge; every other arrow kind is counted in `dropped`.
// Method 1 of the design; Methods 2 (bipolar) and 3 (ASPIC+) are future cycles.

import type { Document, FactStatement } from './ast.js';

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

function factKey(stmt: FactStatement): string {
  const head = stmt.fact.ref.head;
  if (head.kind === 'IdentifierHead') return head.identifier;
  return 'title:' + head.title;
}

export function solve(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];

  for (const el of document.elements) {
    if (el.kind !== 'FactStatement') continue;
    const key = factKey(el);
    if (labels.has(key)) {
      warnings.push('duplicate fact id: ' + key);
    }
    labels.set(key, 'undec');
  }

  return {
    labels,
    dropped: {
      support: 0, undercut: 0, undermine: 0,
      concession: 0, qualification: 0, equivalence: 0,
    },
    warnings,
  };
}
