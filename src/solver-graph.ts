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
import { buildAspicDefeatMap } from './solver-aspic.js';

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
  const fromKey = endpointKey(rel.from as RelationEndpoint, state.argByNode);
  const toKey = endpointKey(rel.to as RelationEndpoint, state.argByNode);

  if (reduction === 'aspic') return; // handled by buildAspicReduction (Task 4)

  if (reduction === 'dung') {
    // Only --x is an attack edge in the Dung reduction; every other arrow is
    // dropped with per-type counts surfaced in the summary warning (matches
    // solve() in src/solver.ts).
    if (rel.arrow === 'attack') {
      attachAttack(fromKey, toKey, 'attack', state);
      return;
    }
    switch (rel.arrow) {
      case 'support':
        state.dropped.support++;
        return;
      case 'undercut':
        state.dropped.undercut++;
        return;
      case 'undermine':
        state.dropped.undermine++;
        return;
      case 'concession':
        state.dropped.concession++;
        return;
      case 'qualification':
        state.dropped.qualification++;
        return;
      case 'equivalence':
        state.dropped.equivalence++;
        return;
    }
    return;
  }

  // Bipolar and evidential reductions: support/equivalence use auxiliaries;
  // every other arrow (attack, undercut, undermine, concession, qualification)
  // collapses to plain attack (matches solveBipolar/solveEvidential in src/solver.ts).
  if (rel.arrow === 'support') {
    if (reduction === 'bipolar') {
      addSupport(fromKey, toKey, state);
      return;
    }
    addNecessarySupport(fromKey, toKey, state);
    return;
  }
  if (rel.arrow === 'equivalence') {
    if (reduction === 'bipolar') {
      addSupport(fromKey, toKey, state);
      addSupport(toKey, fromKey, state);
      return;
    }
    addNecessarySupport(fromKey, toKey, state);
    addNecessarySupport(toKey, fromKey, state);
    return;
  }

  attachAttack(fromKey, toKey, rel.arrow, state);
}

function addSupport(fromKey: string, toKey: string, state: PassState): void {
  const auxKey = `sup:${fromKey}->${toKey}`;
  const sAttackers = state.attacks.get(auxKey) ?? [];
  sAttackers.push(toKey);
  state.attacks.set(auxKey, sAttackers);
  const aAttackers = state.attacks.get(fromKey) ?? [];
  aAttackers.push(auxKey);
  state.attacks.set(fromKey, aAttackers);
}

function addNecessarySupport(fromKey: string, toKey: string, state: PassState): void {
  const auxKey = `nec:${fromKey}->${toKey}`;
  const auxAttackers = state.attacks.get(auxKey) ?? [];
  auxAttackers.push(fromKey);
  state.attacks.set(auxKey, auxAttackers);
  const bAttackers = state.attacks.get(toKey) ?? [];
  bAttackers.push(auxKey);
  state.attacks.set(toKey, bAttackers);
}

function attachAttack(fromKey: string, toKey: string, kind: string, state: PassState): void {
  if (!state.labels.has(toKey)) {
    state.warnings.push(`dangling ${kind} edge: ${fromKey} ${arrowSymbol(kind)} ${toKey}`);
    return;
  }
  if (!state.labels.has(fromKey)) {
    state.labels.set(fromKey, 'undec');
    if (!state.attacks.has(fromKey)) state.attacks.set(fromKey, []);
  }
  const list = state.attacks.get(toKey) ?? [];
  list.push(fromKey);
  state.attacks.set(toKey, list);
}

function arrowSymbol(kind: string): string {
  switch (kind) {
    case 'attack':
      return '--x';
    case 'undercut':
      return '-.->';
    case 'undermine':
      return '-.-';
    case 'concession':
      return '~>';
    case 'qualification':
      return '?>';
    default:
      return kind;
  }
}

function buildAspicReduction(document: Document): ArgumentGraph {
  return buildAspicDefeatMap(document);
}
