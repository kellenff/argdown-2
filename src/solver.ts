// src/solver.ts
// Dung grounded-extension solver. Pure-attack reduction: only `--x`
// becomes an attack edge; every other arrow kind is counted in `dropped`.
// Method 1 of the design; Methods 2 (bipolar) and 3 (ASPIC+) are future cycles.

import type {
  Argument,
  Conclusion,
  Document,
  FactRef,
  FactStatement,
  RelationEndpoint,
  RelationStatement,
} from './ast.js';

export type Label = 'in' | 'out' | 'undec';

export type SolveResult = {
  labels: Map<string, Label>;
  defeats?: Map<string, string[]>; // only solveAspic populates
  warnings: string[];
};

export function factKeyFromRef(ref: FactRef): string {
  const head = ref.head;
  if (head.kind === 'IdentifierHead') return head.identifier;
  return 'title:' + head.title;
}

export function factKey(stmt: FactStatement): string {
  return factKeyFromRef(stmt.fact.ref);
}

export function argKey(arg: Argument): string {
  return `arg:${arg.loc.start.line}:${arg.loc.start.column}`;
}

export function conclusionRefKey(c: Conclusion): string | undefined {
  if (c.kind === 'atom') return factKeyFromRef(c.value);
  return undefined;
}

export function endpointKey(ep: RelationEndpoint, argByNode: Map<Argument, string>): string {
  if (ep.kind === 'FactRef') return factKeyFromRef(ep);
  const known = argByNode.get(ep);
  if (known !== undefined) return known;
  return argKey(ep as Argument);
}

export function label(attacks: Map<string, string[]>): Map<string, Label> {
  const labels = new Map<string, Label>();

  // Initialize: every targeted node starts UNDEC unless it has no attackers
  // (then it's trivially IN). Self-attackers are forced OUT (a node cannot
  // be IN if it attacks itself). Sources that never appear as targets are IN.
  for (const [target, sources] of attacks) {
    if (sources.includes(target)) {
      labels.set(target, 'out');
    } else {
      labels.set(target, sources.length === 0 ? 'in' : 'undec');
    }
  }
  const allSources = new Set<string>();
  for (const sources of attacks.values()) for (const s of sources) allSources.add(s);
  for (const s of allSources) if (!labels.has(s)) labels.set(s, 'in');

  // Fixpoint: promote UNDEC nodes to IN or OUT based on attacker labels.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [target, sources] of attacks) {
      if (labels.get(target) !== 'undec') continue;
      const allIn = sources.every((s) => labels.get(s) === 'in');
      const someOut = sources.some((s) => labels.get(s) === 'out');
      if (allIn) {
        labels.set(target, 'out');
        changed = true;
      } else if (someOut) {
        labels.set(target, 'in');
        changed = true;
      }
    }
  }
  return labels;
}

export function solve(document: Document): SolveResult {
  const labels = new Map<string, Label>();
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
  const argByNode = new Map<Argument, string>();
  const attacks = new Map<string, string[]>();
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

  // Pass 2: walk relations, count drops, attach attacks.
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
        case 'support':
          dropped.support++;
          break;
        case 'undercut':
          dropped.undercut++;
          break;
        case 'undermine':
          dropped.undermine++;
          break;
        case 'concession':
          dropped.concession++;
          break;
        case 'qualification':
          dropped.qualification++;
          break;
        case 'equivalence':
          dropped.equivalence++;
          break;
      }
    }
  }

  const totalDropped =
    dropped.support +
    dropped.undercut +
    dropped.undermine +
    dropped.concession +
    dropped.qualification +
    dropped.equivalence;
  if (totalDropped > 0) {
    warnings.push(
      `solve(): dropped ${totalDropped} non-attack edge(s): ` +
        `support=${dropped.support}, undercut=${dropped.undercut}, ` +
        `undermine=${dropped.undermine}, concession=${dropped.concession}, ` +
        `qualification=${dropped.qualification}, equivalence=${dropped.equivalence}`,
    );
  }

  return { labels: label(attacks), warnings };
}

export function solveBipolar(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];

  // Pass 1: key addressable nodes.
  const argByNode = new Map<Argument, string>();
  const attacks = new Map<string, string[]>();
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

  // Helper for support-edge reduction (B → s → A).
  function addSupport(fromKey: string, toKey: string): void {
    const auxKey = `sup:${fromKey}->${toKey}`;
    // B → s
    const sAttackers = attacks.get(auxKey) ?? [];
    sAttackers.push(toKey);
    attacks.set(auxKey, sAttackers);
    // s → A
    const aAttackers = attacks.get(fromKey) ?? [];
    aAttackers.push(auxKey);
    attacks.set(fromKey, aAttackers);
  }

  // Pass 2: walk relations, attach attacks and supports.
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    const rs = el as RelationStatement;
    for (const rel of rs.relations) {
      if (rel.arrow === 'support') {
        const fromKey = endpointKey(rel.from, argByNode);
        const toKey = endpointKey(rel.to, argByNode);
        if (!labels.has(toKey)) {
          warnings.push(`dangling support edge: ${fromKey} --> ${toKey}`);
          continue;
        }
        if (!labels.has(fromKey)) {
          labels.set(fromKey, 'undec');
        }
        addSupport(fromKey, toKey);
        continue;
      }
      if (rel.arrow === 'equivalence') {
        const fromKey = endpointKey(rel.from, argByNode);
        const toKey = endpointKey(rel.to, argByNode);
        if (!labels.has(toKey)) {
          warnings.push(`dangling equivalence edge: ${fromKey} <-> ${toKey}`);
          continue;
        }
        if (!labels.has(fromKey)) {
          labels.set(fromKey, 'undec');
        }
        addSupport(fromKey, toKey);
        addSupport(toKey, fromKey);
        continue;
      }
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
    }
  }

  // Run fixpoint on the augmented graph, then strip auxiliaries from the output.
  const fullLabels = label(attacks);
  const out = new Map<string, Label>();
  for (const [key, value] of fullLabels) {
    if (!key.startsWith('sup:')) out.set(key, value);
  }
  return { labels: out, warnings };
}

export function solveEvidential(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];

  // Pass 1: key addressable nodes.
  const argByNode = new Map<Argument, string>();
  const attacks = new Map<string, string[]>();
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

  // Necessary-support reduction: A --> B adds auxiliary `nec:A->B` with
  // attacks `A → nec` and `nec → B`. A's defeat propagates to B.
  function addNecessarySupport(fromKey: string, toKey: string): void {
    const auxKey = `nec:${fromKey}->${toKey}`;
    // A → aux
    const auxAttackers = attacks.get(auxKey) ?? [];
    auxAttackers.push(fromKey);
    attacks.set(auxKey, auxAttackers);
    // aux → B
    const bAttackers = attacks.get(toKey) ?? [];
    bAttackers.push(auxKey);
    attacks.set(toKey, bAttackers);
  }

  // Pass 2: walk relations, classify.
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    const rs = el as RelationStatement;
    for (const rel of rs.relations) {
      if (rel.arrow === 'support') {
        const fromKey = endpointKey(rel.from, argByNode);
        const toKey = endpointKey(rel.to, argByNode);
        if (!labels.has(toKey)) {
          warnings.push(`dangling support edge: ${fromKey} --> ${toKey}`);
          continue;
        }
        if (!labels.has(fromKey)) {
          labels.set(fromKey, 'undec');
        }
        addNecessarySupport(fromKey, toKey);
        continue;
      }
      if (rel.arrow === 'equivalence') {
        const fromKey = endpointKey(rel.from, argByNode);
        const toKey = endpointKey(rel.to, argByNode);
        if (!labels.has(toKey)) {
          warnings.push(`dangling equivalence edge: ${fromKey} <-> ${toKey}`);
          continue;
        }
        if (!labels.has(fromKey)) {
          labels.set(fromKey, 'undec');
        }
        addNecessarySupport(fromKey, toKey);
        addNecessarySupport(toKey, fromKey);
        continue;
      }
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
    }
  }

  // Pass 3: label, then strip `nec:`-prefixed auxiliaries from the output.
  const fullLabels = label(attacks);
  const out = new Map<string, Label>();
  for (const [key, value] of fullLabels) {
    if (!key.startsWith('nec:')) out.set(key, value);
  }
  return { labels: out, warnings };
}
