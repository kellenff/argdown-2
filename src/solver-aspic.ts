// src/solver-aspic.ts
// ASPIC+ solver (Method 3 of the Method 1/2/3 ladder). Standard
// Modgil & Prakken 2014 dispute derivation: undercut always wins;
// rebut/undermine become defeats iff attacker is strictly preferred.
// See docs/snowball/specs/2026-06-26-aspic-solver-design.md §5.

import type { Argument, Document } from './ast.js';
import {
  argKey,
  conclusionRefKey,
  endpointKey,
  factKey,
  factKeyFromRef,
  label,
  type Label,
  type SolveResult,
} from './solver.js';

export function solveAspic(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];

  // Pass 1: key all addressable nodes; read preference per node.
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

  // Pass 2: build a premise index (premise key → arg keys that use it as a premise).
  const premiseIndex = new Map<string, string[]>();
  for (const el of document.elements) {
    if (el.kind !== 'Argument') continue;
    const aKey = argKey(el);
    for (const p of el.premises) {
      let pKey: string | undefined;
      if (p.kind === 'atom') pKey = factKeyFromRef(p.value);
      else if (p.kind === 'argument') pKey = argByNode.get(p.value) ?? argKey(p.value as Argument);
      else if (p.kind === 'disjunction') {
        // Treat the disjunction as a single opaque premise — use the first
        // atom's key. Defeat derivation does not expand disjunctions in v1.
        const first = p.values[0];
        if (first) pKey = factKeyFromRef(first);
      }
      if (pKey === undefined) continue;
      const list = premiseIndex.get(pKey) ?? [];
      list.push(aKey);
      premiseIndex.set(pKey, list);
    }
  }

  // Pass 3: classify relations into defeat candidates; build raw attack map.
  const attacks = new Map<string, string[]>();
  const ensureTarget = (k: string): void => {
    if (!labels.has(k)) labels.set(k, 'undec');
    if (!attacks.has(k)) attacks.set(k, []);
  };
  const ensureSource = (k: string): void => {
    if (!labels.has(k)) labels.set(k, 'undec');
  };
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    for (const rel of el.relations) {
      const fromKey = endpointKey(rel.from, argByNode);
      const toKey = endpointKey(rel.to, argByNode);
      if (!labels.has(toKey)) {
        warnings.push(`dangling ${rel.arrow} edge: ${fromKey} ${rel.arrow} ${toKey}`);
        continue;
      }
      ensureSource(fromKey);
      ensureTarget(toKey);

      switch (rel.arrow) {
        case 'attack':
        case 'undercut':
        case 'undermine': {
          const list = attacks.get(toKey) ?? [];
          list.push(fromKey);
          attacks.set(toKey, list);
          break;
        }
        // support, equivalence, concession, qualification → drop with warning
        default:
          warnings.push(`solveAspic(): dropped ${rel.arrow} edge: ${fromKey} -> ${toKey}`);
          break;
      }
    }
  }

  // Pass 4: derive defeats (standard Modgil & Prakken 2014 dispute derivation).
  // Read preference from the AST nodes via a side-channel map.
  const preference = new Map<string, number>();
  for (const el of document.elements) {
    if (el.kind === 'FactStatement') {
      if (el.preference !== undefined) preference.set(factKey(el), el.preference);
    } else if (el.kind === 'Argument') {
      if (el.preference !== undefined) preference.set(argKey(el), el.preference);
    }
  }
  const prefOf = (k: string): number => preference.get(k) ?? 0;
  const hasPreferenceDeclared = preference.size > 0;

  const defeats = new Map<string, string[]>();
  for (const [target, attackers] of attacks) {
    if (attackers.length === 0) continue; // unattacked nodes aren't in defeats
    for (const a of attackers) {
      const edgeArrow = edgeArrowKind(document, a, target, argByNode);
      let isDefeat = false;
      if (edgeArrow === 'undercut') {
        isDefeat = true; // undercut always wins
      } else if (edgeArrow === 'attack') {
        isDefeat = prefOf(a) > prefOf(target);
      } else if (edgeArrow === 'undermine') {
        isDefeat = prefOf(a) > prefOf(target);
      }
      if (isDefeat) {
        const list = defeats.get(target) ?? [];
        list.push(a);
        defeats.set(target, list);
      }
    }
  }

  // Pass 5: untuned-documents warning.
  const nonAttackDropped = warnings.some((w) => w.startsWith('solveAspic(): dropped '));
  if (nonAttackDropped && !hasPreferenceDeclared) {
    warnings.push(
      'solveAspic(): non-attack edge(s) dropped and 0 preference values declared; ' +
        'rebut/undermine will not produce defeats until preference is set.',
    );
  }

  // Pass 6: ASPIC+-specific labeling.
  //   - unattacked nodes → IN
  //   - nodes attacked only by weak attacks (attack not strong enough to defeat) → UNDEC
  //   - nodes with at least one actual defeat → standard Dung fixpoint on `defeats`
  const out = new Map<string, Label>();
  // Initialize every keyed node (from Pass 1) to IN.
  for (const k of labels.keys()) out.set(k, 'in');
  const allSources = new Set<string>();
  for (const sources of attacks.values()) for (const s of sources) allSources.add(s);
  for (const s of allSources) if (!out.has(s)) out.set(s, 'in');
  // Downgrade: attacked but not defeated → UNDEC.
  for (const [target, attackers] of attacks) {
    if (attackers.length > 0 && !defeats.has(target)) {
      out.set(target, 'undec');
    }
  }
  // Run the standard fixpoint on the defeat map; it may override to IN/OUT/UNDEC.
  for (const [k, v] of label(defeats)) out.set(k, v);

  return { labels: out, defeats, warnings };
}

// ponytail: edgeArrowKind re-walks the document; if profiling shows it's
// hot, memoize by (fromKey, toKey) — punted to a later cycle.
function edgeArrowKind(
  document: Document,
  fromKey: string,
  toKey: string,
  argByNode: Map<Argument, string>,
): 'attack' | 'undercut' | 'undermine' {
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    for (const rel of el.relations) {
      const f = endpointKey(rel.from, argByNode);
      const t = endpointKey(rel.to, argByNode);
      if (f !== fromKey || t !== toKey) continue;
      if (rel.arrow === 'attack' || rel.arrow === 'undercut' || rel.arrow === 'undermine') {
        return rel.arrow;
      }
    }
  }
  return 'attack';
}
