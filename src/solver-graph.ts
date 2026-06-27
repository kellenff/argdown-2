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

import type { Argument, Document, Relation, RelationEndpoint } from './ast.js';
import { argKey, conclusionRefKey, endpointKey, factKey } from './solver.js';

export type Reduction = 'dung' | 'bipolar' | 'aspic' | 'evidential';

export type ArgumentGraph = {
  map: Map<string, string[]>;
  warnings: string[];
};

interface PassState {
  labels: Map<string, 'in' | 'out' | 'undec'>;
  attacks: Map<string, string[]>;
  argByNode: Map<Argument, string>;
  warnings: string[];
  dropped: {
    support: number;
    undercut: number;
    undermine: number;
    concession: number;
    qualification: number;
    equivalence: number;
  };
}

export function buildArgumentGraph(document: Document, reduction: Reduction): ArgumentGraph {
  if (reduction === 'aspic') {
    // Delegate to ASPIC+ helper (Task 4 will wire this).
    return buildAspicReduction(document);
  }
  const state: PassState = {
    labels: new Map(),
    attacks: new Map(),
    argByNode: new Map(),
    warnings: [],
    dropped: {
      support: 0,
      undercut: 0,
      undermine: 0,
      concession: 0,
      qualification: 0,
      equivalence: 0,
    },
  };
  const { labels, attacks, argByNode, warnings } = state;

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
    for (const rel of el.relations) {
      applyReduction(rel, reduction, state);
    }
  }

  if (reduction === 'dung') {
    const { dropped } = state;
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

function applyReduction(rel: Relation, reduction: Reduction, state: PassState): void {
  const { labels, attacks, argByNode, warnings, dropped } = state;
  const fromKey = endpointKey(rel.from as RelationEndpoint, argByNode);
  const toKey = endpointKey(rel.to as RelationEndpoint, argByNode);

  switch (reduction) {
    case 'dung': {
      if (rel.arrow === 'attack') {
        attachAttack(fromKey, toKey, 'attack', state);
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

function attachAttack(fromKey: string, toKey: string, kind: string, state: PassState): void {
  const { labels, attacks, warnings } = state;
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
