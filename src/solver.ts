// src/solver.ts
// Dung grounded-extension solver. Pure-attack reduction: only `--x`
// becomes an attack edge; every other arrow kind is counted in `dropped`.
// Method 1 of the design; Methods 2 (bipolar) and 3 (ASPIC+) are future cycles.

import type {
  Argument, Conclusion, Document, FactRef, FactStatement, RelationEndpoint, RelationStatement,
} from './ast.js';

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

function endpointKey(ep: RelationEndpoint, argByNode: Map<Argument, string>): string {
  if (ep.kind === 'FactRef') return factKeyFromRef(ep);
  const known = argByNode.get(ep);
  if (known !== undefined) return known;
  return argKey(ep as Argument);
}

export function solve(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];
  const dropped = {
    support: 0, undercut: 0, undermine: 0,
    concession: 0, qualification: 0, equivalence: 0,
  };

  // Pass 1: key addressable nodes.
  const argByNode = new Map<Argument, string>();
  for (const el of document.elements) {
    if (el.kind === 'FactStatement') {
      const key = factKey(el);
      if (labels.has(key)) warnings.push('duplicate fact id: ' + key);
      labels.set(key, 'undec');
    } else if (el.kind === 'Argument') {
      const key = argKey(el);
      if (labels.has(key)) warnings.push('duplicate argument location: ' + key);
      labels.set(key, 'undec');
      argByNode.set(el, key);
      const conclKey = conclusionRefKey(el.conclusion);
      if (conclKey !== undefined && !labels.has(conclKey)) {
        labels.set(conclKey, 'undec');
      }
    }
  }

  // Pass 2: walk relations, count drops, attach attacks (labeling in Task 6).
  const attacks = new Map<string, string[]>();
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    const rs = el as RelationStatement;
    for (const rel of rs.relations) {
      switch (rel.arrow) {
        case 'attack': {
          const fromKey = endpointKey(rel.from, argByNode);
          const toKey = endpointKey(rel.to, argByNode);
          if (!labels.has(toKey)) {
            warnings.push(`dangling attack edge: ${fromKey} --x ${toKey}`);
            continue;
          }
          if (!labels.has(fromKey)) {
            labels.set(fromKey, 'undec');
          }
          const list = attacks.get(toKey) ?? [];
          list.push(fromKey);
          attacks.set(toKey, list);
          break;
        }
        case 'support': dropped.support++; break;
        case 'undercut': dropped.undercut++; break;
        case 'undermine': dropped.undermine++; break;
        case 'concession': dropped.concession++; break;
        case 'qualification': dropped.qualification++; break;
        case 'equivalence': dropped.equivalence++; break;
      }
    }
  }

  // Tasks 6+ will replace this stub with the grounded fixpoint.
  void attacks;

  const totalDropped =
    dropped.support + dropped.undercut + dropped.undermine +
    dropped.concession + dropped.qualification + dropped.equivalence;
  if (totalDropped > 0) {
    warnings.push(
      `Method 1 (grounded Dung) dropped ${totalDropped} non-attack edge(s): ` +
      `support=${dropped.support}, undercut=${dropped.undercut}, ` +
      `undermine=${dropped.undermine}, concession=${dropped.concession}, ` +
      `qualification=${dropped.qualification}, equivalence=${dropped.equivalence}`,
    );
  }

  return { labels, dropped, warnings };
}
