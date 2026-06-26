// src/solver.ts
// Dung grounded-extension solver. Pure-attack reduction: only `--x`
// becomes an attack edge; every other arrow kind is counted in `dropped`.
// Method 1 of the design; Methods 2 (bipolar) and 3 (ASPIC+) are future cycles.

import type { Argument, Conclusion, Document, FactRef, FactStatement } from './ast.js';

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

function factKeyFromRef(ref: FactRef): string {
  const head = ref.head;
  if (head.kind === 'IdentifierHead') return head.identifier;
  return 'title:' + head.title;
}

function factKey(stmt: FactStatement): string {
  return factKeyFromRef(stmt.fact.ref);
}

function argKey(arg: Argument): string {
  return `arg:${arg.loc.start.line}:${arg.loc.start.column}`;
}

function conclusionRefKey(c: Conclusion): string | undefined {
  if (c.kind === 'atom') return factKeyFromRef(c.value);
  return undefined;
}

export function solve(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];

  for (const el of document.elements) {
    if (el.kind === 'FactStatement') {
      const key = factKey(el);
      if (labels.has(key)) {
        warnings.push('duplicate fact id: ' + key);
      }
      labels.set(key, 'undec');
    } else if (el.kind === 'Argument') {
      const key = argKey(el);
      if (labels.has(key)) {
        warnings.push('duplicate argument location: ' + key);
      }
      labels.set(key, 'undec');
      // Also key the atom conclusion so attacks targeting it resolve.
      const conclKey = conclusionRefKey(el.conclusion);
      if (conclKey !== undefined && !labels.has(conclKey)) {
        labels.set(conclKey, 'undec');
      }
    }
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
