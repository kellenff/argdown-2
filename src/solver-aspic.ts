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

// One raw attack edge. For attack/undercut, `target` is `rel.to`.
// For undermine, `target` is the containing argument (premiseIndex expansion)
// and `attack.undermineTarget` is the premise key used for the preference check.
type RawAttack =
  | { arrow: 'attack'; attacker: string }
  | { arrow: 'undercut'; attacker: string }
  | { arrow: 'undermine'; attacker: string; undermineTarget: string };

type RawAttackEntry = { target: string; attack: RawAttack };

export function solveAspic(document: Document): SolveResult {
  const { map: defeats, warnings, labels, rawAttacks } = buildAspicDefeatMap(document);
  const finalLabels = labelWithWeakAttacks(labels, rawAttacks, defeats);

  return { labels: finalLabels, defeats, warnings };
}

// Compose the ASPIC+ defeat-derivation passes into one helper that returns
// the defeat map plus collected warnings. Exposed so downstream multi-extension
// solvers can build a defeat map without going through the grounded
// labelWithWeakAttacks step. Also returns `labels` and `rawAttacks` so callers
// (e.g. `solveAspic`) can run `labelWithWeakAttacks` without re-walking the
// pipeline.
export function buildAspicDefeatMap(document: Document): {
  map: Map<string, string[]>;
  warnings: string[];
  labels: Map<string, Label>;
  rawAttacks: RawAttackEntry[];
} {
  const labels = new Map<string, Label>();
  const argByNode = new Map<Argument, string>();
  const preferences = new Map<string, number>();
  const warnings: string[] = [];

  keyNodes(document, labels, argByNode, preferences, warnings);
  const premiseIndex = buildPremiseIndex(document, argByNode);
  const rawAttacks: RawAttackEntry[] = [];
  classifyRelations(document, labels, argByNode, premiseIndex, rawAttacks, warnings);
  const map = deriveDefeats(rawAttacks, preferences);
  emitUntunedWarning(
    warnings,
    preferences,
    warnings.some((w) => w.startsWith('solveAspic(): dropped ')),
  );

  return { map, warnings, labels, rawAttacks };
}

// Pass 1 + 1b: key all addressable nodes and read per-node preference in one walk.
function keyNodes(
  document: Document,
  labels: Map<string, Label>,
  argByNode: Map<Argument, string>,
  preferences: Map<string, number>,
  warnings: string[],
): void {
  for (const el of document.elements) {
    if (el.kind === 'FactStatement') {
      const key = factKey(el);
      if (labels.has(key)) warnings.push('duplicate fact id: ' + key);
      labels.set(key, 'undec');
      if (el.preference !== undefined) preferences.set(key, el.preference);
    } else if (el.kind === 'Argument') {
      const key = argKey(el);
      if (labels.has(key)) warnings.push('duplicate argument location: ' + key);
      labels.set(key, 'undec');
      argByNode.set(el, key);
      if (el.preference !== undefined) preferences.set(key, el.preference);
      const conclKey = conclusionRefKey(el.conclusion);
      if (conclKey !== undefined && !labels.has(conclKey)) {
        labels.set(conclKey, 'undec');
      }
    }
  }
}

// Pass 2: build a premise index (premise key → arg keys that use it as a premise).
// Load-bearing in Pass 3: undermine expands via this index.
function buildPremiseIndex(
  document: Document,
  argByNode: Map<Argument, string>,
): Map<string, string[]> {
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
  return premiseIndex;
}

// Pass 3: classify relations into defeat candidates; build raw attack list.
// Undermine expands: A -.- P → one RawAttack per argument using P as a premise.
function classifyRelations(
  document: Document,
  labels: Map<string, Label>,
  argByNode: Map<Argument, string>,
  premiseIndex: Map<string, string[]>,
  rawAttacks: RawAttackEntry[],
  warnings: string[],
): void {
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    for (const rel of el.relations) {
      const fromKey = endpointKey(rel.from, argByNode);
      if (!labels.has(fromKey)) labels.set(fromKey, 'undec');

      switch (rel.arrow) {
        case 'attack':
        case 'undercut':
          classifyAttack(rel.arrow, fromKey, rel.to, argByNode, labels, rawAttacks, warnings);
          break;
        case 'undermine':
          classifyUndermine(fromKey, rel.to, argByNode, labels, premiseIndex, rawAttacks, warnings);
          break;
        // support, equivalence, concession, qualification → drop with warning
        default:
          warnings.push(
            `solveAspic(): dropped ${rel.arrow} edge: ${fromKey} -> ${endpointKey(rel.to, argByNode)}`,
          );
          break;
      }
    }
  }
}

function classifyAttack(
  arrow: 'attack' | 'undercut',
  fromKey: string,
  to: import('./ast.js').RelationEndpoint,
  argByNode: Map<Argument, string>,
  labels: Map<string, Label>,
  rawAttacks: RawAttackEntry[],
  warnings: string[],
): void {
  const toKey = endpointKey(to, argByNode);
  if (!labels.has(toKey)) {
    warnings.push(`dangling ${arrow} edge: ${fromKey} ${arrow} ${toKey}`);
    return;
  }
  rawAttacks.push({ target: toKey, attack: { arrow, attacker: fromKey } });
}

function classifyUndermine(
  fromKey: string,
  to: import('./ast.js').RelationEndpoint,
  argByNode: Map<Argument, string>,
  labels: Map<string, Label>,
  premiseIndex: Map<string, string[]>,
  rawAttacks: RawAttackEntry[],
  warnings: string[],
): void {
  const premiseKey = endpointKey(to, argByNode);
  if (!labels.has(premiseKey)) {
    warnings.push(`dangling undermine edge: ${fromKey} -.- ${premiseKey}`);
    return;
  }
  const containing = premiseIndex.get(premiseKey) ?? [];
  if (containing.length === 0) {
    warnings.push(
      `solveAspic(): undermine edge targets premise that no argument uses: ${fromKey} -.- ${premiseKey}`,
    );
    // Fallback: defeat the premise directly. Preference compares against the premise.
    rawAttacks.push({
      target: premiseKey,
      attack: { arrow: 'undermine', attacker: fromKey, undermineTarget: premiseKey },
    });
    return;
  }
  for (const argKeyStr of containing) {
    rawAttacks.push({
      target: argKeyStr,
      attack: { arrow: 'undermine', attacker: fromKey, undermineTarget: premiseKey },
    });
  }
}

// Pass 4: derive defeats (standard Modgil & Prakken 2014 dispute derivation).
function deriveDefeats(
  rawAttacks: RawAttackEntry[],
  preferences: Map<string, number>,
): Map<string, string[]> {
  const prefOf = (k: string): number => preferences.get(k) ?? 0;
  const defeats = new Map<string, string[]>();
  for (const { target, attack } of rawAttacks) {
    let isDefeat = false;
    if (attack.arrow === 'undercut') {
      isDefeat = true; // undercut always wins
    } else if (attack.arrow === 'attack') {
      isDefeat = prefOf(attack.attacker) > prefOf(target);
    } else {
      // undermine: compare attacker preference against the PREMISE preference.
      isDefeat = prefOf(attack.attacker) > prefOf(attack.undermineTarget);
    }
    if (isDefeat) {
      const list = defeats.get(target) ?? [];
      list.push(attack.attacker);
      defeats.set(target, list);
    }
  }
  return defeats;
}

// Pass 5: untuned-documents warning.
function emitUntunedWarning(
  warnings: string[],
  preferences: Map<string, number>,
  hasNonAttackDrops: boolean,
): void {
  if (hasNonAttackDrops && preferences.size === 0) {
    warnings.push(
      'solveAspic(): non-attack edge(s) dropped and 0 preference values declared; ' +
        'rebut/undermine will not produce defeats until preference is set.',
    );
  }
}

// Pass 6: ASPIC+-specific labeling.
//   - unattacked nodes → IN
//   - nodes attacked only by weak attacks (attack not strong enough to defeat) → UNDEC
//   - nodes with at least one actual defeat → standard Dung fixpoint on `defeats`
function labelWithWeakAttacks(
  labels: Map<string, Label>,
  rawAttacks: RawAttackEntry[],
  defeats: Map<string, string[]>,
): Map<string, Label> {
  // Run label() on the defeat map: gives Dung fixpoint for defeated targets,
  // 'in' for sources of defeats that aren't themselves defeated.
  const out = label(defeats);
  // Default: every keyed node not yet labeled → IN (unattacked).
  for (const k of labels.keys()) {
    if (!out.has(k)) out.set(k, 'in');
  }
  // Weak attacks (attacked but not defeated) → UNDEC.
  for (const { target } of rawAttacks) {
    if (!defeats.has(target)) out.set(target, 'undec');
  }
  return out;
}
