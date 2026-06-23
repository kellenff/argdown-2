// src/mermaid.ts
// Pure AST → Mermaid flowchart renderer. Single function, no I/O.

import type { Arrow, Document, Element, FactHead, RelationEndpoint } from './ast.js';

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

function endpointHead(ep: RelationEndpoint): FactHead {
  return ep.kind === 'FactRef' ? ep.head : ep.rule.ref.head;
}

export function renderMermaid(doc: Document): string {
  const headToId = new Map<string, string>();
  const usedIds = new Set<string>();
  const nodes: string[] = [];
  const edges: string[] = [];

  // ponytail: dedupe by content; same FactHead always renders to the same id.
  function declare(head: FactHead, labelOverride?: string): string {
    const key = headKey(head);
    const cached = headToId.get(key);
    if (cached !== undefined) return cached;

    const base = head.kind === 'IdentifierHead' ? head.identifier : slugify(head.title);
    let id = base;
    let n = 1;
    while (usedIds.has(id)) {
      id = `${base}_${n++}`;
    }
    usedIds.add(id);
    headToId.set(key, id);
    const label = labelOverride ?? headLabel(head);
    nodes.push(`    ${id}["${escapeLabel(label)}"]`);
    return id;
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
        const fromId = declare(endpointHead(el.relation.from));
        const toId = declare(endpointHead(el.relation.to));
        const glyph = ARROW_GLYPH[el.relation.arrow];
        edges.push(`    ${fromId} ${glyph}|${el.relation.arrow}| ${toId}`);
        break;
      }
    }
  }

  if (nodes.length === 0) {
    return 'flowchart TD\n    empty["(no statements)"]\n';
  }

  return ['flowchart TD', ...nodes, ...edges, ''].join('\n');
}
