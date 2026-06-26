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
// and `undermineTarget` is the premise key used for the preference check.
type RawAttack = {
  attacker: string;
  arrow: 'attack' | 'undercut' | 'undermine';
  undermineTarget?: string;
};

type RawAttackEntry = { target: string; attack: RawAttack };

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
  // Load-bearing in Pass 3: undermine expands via this index.
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

  // Pass 3: classify relations into defeat candidates; build raw attack list.
  // Undermine expands: A -.- P → one RawAttack per argument using P as a premise.
  const rawAttacks: RawAttackEntry[] = [];
  const attackTargets = new Set<string>();
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    for (const rel of el.relations) {
      const fromKey = endpointKey(rel.from, argByNode);
      if (!labels.has(fromKey)) labels.set(fromKey, 'undec');

      switch (rel.arrow) {
        case 'attack':
        case 'undercut': {
          const toKey = endpointKey(rel.to, argByNode);
          if (!labels.has(toKey)) {
            warnings.push(`dangling ${rel.arrow} edge: ${fromKey} ${rel.arrow} ${toKey}`);
            continue;
          }
          rawAttacks.push({ target: toKey, attack: { attacker: fromKey, arrow: rel.arrow } });
          attackTargets.add(toKey);
          break;
        }
        case 'undermine': {
          const premiseKey = endpointKey(rel.to, argByNode);
          if (!labels.has(premiseKey)) {
            warnings.push(`dangling undermine edge: ${fromKey} -.- ${premiseKey}`);
            continue;
          }
          const containing = premiseIndex.get(premiseKey) ?? [];
          if (containing.length === 0) {
            warnings.push(
              `solveAspic(): undermine edge targets premise that no argument uses: ${fromKey} -.- ${premiseKey}`,
            );
            // Fallback: defeat the premise directly. Preference compares against the premise.
            rawAttacks.push({
              target: premiseKey,
              attack: { attacker: fromKey, arrow: 'undermine', undermineTarget: premiseKey },
            });
            attackTargets.add(premiseKey);
          } else {
            for (const argKeyStr of containing) {
              rawAttacks.push({
                target: argKeyStr,
                attack: { attacker: fromKey, arrow: 'undermine', undermineTarget: premiseKey },
              });
              attackTargets.add(argKeyStr);
            }
          }
          break;
        }
        // support, equivalence, concession, qualification → drop with warning
        default:
          warnings.push(
            `solveAspic(): dropped ${rel.arrow} edge: ${fromKey} -> ${endpointKey(rel.to, argByNode)}`,
          );
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
  for (const { target, attack } of rawAttacks) {
    let isDefeat = false;
    if (attack.arrow === 'undercut') {
      isDefeat = true; // undercut always wins
    } else if (attack.arrow === 'attack') {
      isDefeat = prefOf(attack.attacker) > prefOf(target);
    } else {
      // undermine: compare attacker preference against the PREMISE preference.
      isDefeat = prefOf(attack.attacker) > prefOf(attack.undermineTarget ?? target);
    }
    if (isDefeat) {
      const list = defeats.get(target) ?? [];
      list.push(attack.attacker);
      defeats.set(target, list);
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
  for (const k of labels.keys()) out.set(k, 'in');
  for (const target of attackTargets) if (!out.has(target)) out.set(target, 'in');
  for (const target of attackTargets) {
    if (!defeats.has(target)) out.set(target, 'undec');
  }
  for (const [k, v] of label(defeats)) out.set(k, v);

  return { labels: out, defeats, warnings };
}
