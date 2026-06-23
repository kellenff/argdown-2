// src/mermaid.ts
// Pure AST → Mermaid flowchart renderer. Single function, no I/O.

import type {
  Arrow,
  Argument,
  Conclusion,
  Document,
  Element,
  FactHead,
  Premise,
  RelationEndpoint,
} from './ast.js';

const ARROW_GLYPH: Record<Arrow, string> = {
  support: '-->',
  attack: '-.->',
  undercut: '==>',
  undermine: '-.->',
  concession: '-.->',
  qualification: '-.->',
  equivalence: '<-->',
};

// Mermaid node IDs: alphanumerics + underscore. Hyphens and dots are also
// accepted but quoting the label keeps things readable.
function slugify(s: string): string {
  const lower = s.toLowerCase();
  const slug = lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug.length > 0 ? slug : 'node';
}

function headLabel(head: FactHead): string {
  return head.kind === 'IdentifierHead' ? head.identifier : head.title;
}

// Content-keyed dedupe: each parse produces a fresh FactHead object, so
// reference-equality on the AST node would treat two `[#co2]` as different.
function headKey(head: FactHead): string {
  return head.kind === 'IdentifierHead' ? `id:${head.identifier}` : `title:${head.title}`;
}

function escapeLabel(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Pick the leaf FactHead of a Conclusion, recursing through nested
// argument conclusions. Mirrors the traversal in `endpointHead`.
function conclusionHead(c: Conclusion): FactHead {
  if (c.kind === 'atom') return c.value.head;
  let cur: Conclusion = c;
  while (cur.kind === 'argument') cur = cur.value.conclusion;
  return cur.value.head;
}

// Stable synthetic key for a disjunction premise. Two parses of
// `([#B] | [#C])` produce different FactRef objects but the same
// identifier set, so key on the sorted joined identifiers.
function disjunctionKey(values: ReadonlyArray<{ head: FactHead }>): string {
  const ids = values
    .map((v) => headKey(v.head))
    .slice()
    .sort();
  return `disj:${ids.join('|')}`;
}

function endpointHead(ep: RelationEndpoint): FactHead {
  if (ep.kind === 'FactRef') return ep.head;
  // Argument endpoint: take the head of the conclusion's atom (nested
  // argument conclusions recurse; for now we only need the leaf head).
  return conclusionHead(ep.conclusion);
}

export function renderMermaid(doc: Document): string {
  const headToId = new Map<string, string>();
  const disjToId = new Map<string, string>();
  const usedIds = new Set<string>();
  const nodes: string[] = [];
  const edges: string[] = [];

  function freshId(base: string): string {
    let id = base;
    let n = 1;
    while (usedIds.has(id)) {
      id = `${base}_${n++}`;
    }
    usedIds.add(id);
    return id;
  }

  // ponytail: dedupe by content; same FactHead always renders to the same id.
  function declare(head: FactHead, labelOverride?: string): string {
    const key = headKey(head);
    const cached = headToId.get(key);
    if (cached !== undefined) return cached;

    const base = head.kind === 'IdentifierHead' ? head.identifier : slugify(head.title);
    const id = freshId(base);
    headToId.set(key, id);
    const label = labelOverride ?? headLabel(head);
    nodes.push(`    ${id}["${escapeLabel(label)}"]`);
    return id;
  }

  // Synthetic node for a disjunction premise. Two disjunctions with the
  // same set of alternative FactHeads collapse into one node.
  function declareDisjunction(values: ReadonlyArray<{ head: FactHead }>): string {
    const key = disjunctionKey(values);
    const cached = disjToId.get(key);
    if (cached !== undefined) return cached;

    const base = values
      .map((v) => (v.head.kind === 'IdentifierHead' ? v.head.identifier : slugify(v.head.title)))
      .join('_or_');
    const id = freshId(base);
    disjToId.set(key, id);
    const label = values
      .map((v) => escapeLabel(headLabel(v.head)))
      .join(' or ');
    nodes.push(`    ${id}["${label}"]`);
    return id;
  }

  function premiseNode(p: Premise): string {
    switch (p.kind) {
      case 'atom':
        return declare(p.value.head);
      case 'argument':
        // Render nested arguments as a single node keyed on the
        // (recursed) conclusion head. This keeps the edges in the
        // outer argument readable; the nested premises are not
        // re-expanded — that would require a subgraph.
        return declare(conclusionHead(p.value.conclusion));
      case 'disjunction':
        return declareDisjunction(p.values);
    }
  }

  for (const el of doc.elements as Element[]) {
    switch (el.kind) {
      case 'FactStatement': {
        declare(el.fact.ref.head, el.fact.claimText);
        break;
      }
      case 'RuleStatement': {
        const headId = declare(el.rule.ref.head);
        for (const premise of el.rule.premises) {
          const premiseId = declare(premise.head);
          edges.push(`    ${headId} ==>|rule| ${premiseId}`);
        }
        break;
      }
      case 'RelationStatement': {
        for (const relation of el.relations) {
          const fromId = declare(endpointHead(relation.from));
          const toId = declare(endpointHead(relation.to));
          const glyph = ARROW_GLYPH[relation.arrow];
          edges.push(`    ${fromId} ${glyph}|${relation.arrow}| ${toId}`);
        }
        break;
      }
      case 'Argument': {
        const arg = el as Argument;
        const conclHead = conclusionHead(arg.conclusion);
        const conclId = declare(conclHead);
        for (const p of arg.premises) {
          const fromId = premiseNode(p);
          edges.push(`    ${fromId} -->|support| ${conclId}`);
        }
        break;
      }
    }
  }

  if (nodes.length === 0) {
    return 'flowchart TD\n    empty["(no statements)"]\n';
  }

  return ['flowchart TD', ...nodes, ...edges, ''].join('\n');
}