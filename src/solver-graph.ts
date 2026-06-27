// src/solver-graph.ts
// Shared attack-graph builder for the multi-extension solver. Walks a Document
// and produces a { map, warnings } pair suitable for any of the multi-extension
// algorithms (preferred/stable/complete). The `reduction` parameter selects
// which arrows become attack/defeat edges; the algorithms are reduction-agnostic.
//
// Reductions:
//   - dung:       only `attack` (--x) is an attack edge; every other arrow
//                 kind is counted and reported in a summary warning.
//   - bipolar:    support + equivalence reduce via `sup:` auxiliaries
//                 (wired in Task 3).
//   - evidential: support + equivalence reduce via `nec:` auxiliaries
//                 (wired in Task 3).
//   - aspic:      delegates to buildAspicDefeatMap (wired in Task 4).

import type { Argument, Document, RelationStatement } from './ast.js';
import { argKey, conclusionRefKey, endpointKey, factKey } from './solver.js';

export type Reduction = 'dung' | 'bipolar' | 'aspic' | 'evidential';

export type ArgumentGraph = {
  map: Map<string, string[]>;
  warnings: string[];
};

export function buildArgumentGraph(document: Document, reduction: Reduction): ArgumentGraph {
  if (reduction === 'aspic') {
    // Delegate to ASPIC+ helper (Task 4 will wire this).
    return buildAspicReduction(document);
  }
  const labels = new Map<string, 'in' | 'out' | 'undec'>();
  const argByNode = new Map<Argument, string>();
  const attacks = new Map<string, string[]>();
  const warnings: string[] = [];
  const dropped = {
    support: 0,
    undercut: 0,
    undermine: 0,
    concession: 0,
    qualification: 0,
    equivalence: 0,
  };

  // Pass 1: key addressable nodes.
  for (const el of document.elements) {
    if (el.kind === 'FactStatement') {
      const key = factKey(el);
      if (labels.has(key)) warnings.push('duplicate fact id: ' + key);
      labels.set(key, 'undec');
      if (!attacks.has(key)) attacks.set(key, []);
    } else if (el.kind === 'Argument') {
      const key = argKey(el);
      if (labels.has(key)) warnings.push('duplicate argument location: ' + key);
      labels.set(key, 'undec');
      argByNode.set(el, key);
      if (!attacks.has(key)) attacks.set(key, []);
      const conclKey = conclusionRefKey(el.conclusion);
      if (conclKey !== undefined && !labels.has(conclKey)) {
        labels.set(conclKey, 'undec');
        if (!attacks.has(conclKey)) attacks.set(conclKey, []);
      }
    }
  }

  // Pass 2: walk relations, apply per-reduction arrow handling.
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    const rs = el as RelationStatement;
    for (const rel of rs.relations) {
      applyReduction(rel, reduction, labels, attacks, argByNode, warnings, dropped);
    }
  }

  if (reduction === 'dung') {
    const totalDropped =
      dropped.support +
      dropped.undercut +
      dropped.undermine +
      dropped.concession +
      dropped.qualification +
      dropped.equivalence;
    if (totalDropped > 0) {
      warnings.push(
        `buildArgumentGraph(): dropped ${totalDropped} non-attack edge(s): ` +
          `support=${dropped.support}, undercut=${dropped.undercut}, ` +
          `undermine=${dropped.undermine}, concession=${dropped.concession}, ` +
          `qualification=${dropped.qualification}, equivalence=${dropped.equivalence}`,
      );
    }
  }

  return { map: attacks, warnings };
}

function applyReduction(
  rel: { arrow: string; from: unknown; to: unknown },
  reduction: Reduction,
  labels: Map<string, 'in' | 'out' | 'undec'>,
  attacks: Map<string, string[]>,
  argByNode: Map<Argument, string>,
  warnings: string[],
  dropped: {
    support: number;
    undercut: number;
    undermine: number;
    concession: number;
    qualification: number;
    equivalence: number;
  },
): void {
  const fromKey = endpointKey(rel.from as never, argByNode);
  const toKey = endpointKey(rel.to as never, argByNode);

  switch (reduction) {
    case 'dung': {
      if (rel.arrow === 'attack') {
        attachAttack(fromKey, toKey, 'attack', labels, attacks, warnings);
        return;
      }
      // Other arrows are dropped with a summary warning emitted by the caller.
      switch (rel.arrow) {
        case 'support':
          dropped.support++;
          return;
        case 'undercut':
          dropped.undercut++;
          return;
        case 'undermine':
          dropped.undermine++;
          return;
        case 'concession':
          dropped.concession++;
          return;
        case 'qualification':
          dropped.qualification++;
          return;
        case 'equivalence':
          dropped.equivalence++;
          return;
      }
      return;
    }
    case 'bipolar':
    case 'evidential':
    case 'aspic':
      // Implemented in Tasks 3 and 4.
      return;
  }
}

function attachAttack(
  fromKey: string,
  toKey: string,
  kind: string,
  labels: Map<string, 'in' | 'out' | 'undec'>,
  attacks: Map<string, string[]>,
  warnings: string[],
): void {
  if (!labels.has(toKey)) {
    warnings.push(`dangling ${kind} edge: ${fromKey} ${kind} ${toKey}`);
    return;
  }
  if (!labels.has(fromKey)) {
    labels.set(fromKey, 'undec');
    if (!attacks.has(fromKey)) attacks.set(fromKey, []);
  }
  const list = attacks.get(toKey) ?? [];
  list.push(fromKey);
  attacks.set(toKey, list);
}

function buildAspicReduction(document: Document): ArgumentGraph {
  // Placeholder for Task 4. Will be replaced with an ESM import.
  throw new Error('aspic reduction not yet wired (Task 4)');
}
