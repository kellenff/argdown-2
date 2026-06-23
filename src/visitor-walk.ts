// src/visitor-walk.ts
// Post-build AST walker for consumers that need to traverse the typed
// AST after parsing. The CST-to-AST visitor in visitor.ts constructs
// the AST; this module provides the recursive traversal.
//
// Dispatch is driven by the node's `kind` discriminant — keeps the
// walker open to new kinds without central switch churn.

import type {
  Argument,
  Conclusion,
  Document,
  Element,
  Fact,
  FactRef,
  Premise,
  Relation,
} from './ast.js';

// Visitor callback shape: `enter` receives every node the walker
// visits. `leave` (optional) fires after children. Callbacks are
// invoked on every AST node — Document, Element, Argument, Conclusion/
// Premise variants, leaves — so callers can collect kinds, locate
// sub-trees, or filter nodes without knowing the full AST shape up
// front.
export type Visitor = {
  enter?: (node: { kind: string } & Record<string, unknown>) => void;
  leave?: (node: { kind: string } & Record<string, unknown>) => void;
};

// Walk a typed AST, invoking the visitor at every node.
export function visit(root: Document, visitor: Visitor): void {
  visitor.enter?.(root as unknown as { kind: string } & Record<string, unknown>);
  for (const el of root.elements) walkElement(el, visitor);
  visitor.leave?.(root as unknown as { kind: string } & Record<string, unknown>);
}

function walkElement(el: Element, v: Visitor): void {
  v.enter?.(el as unknown as { kind: string } & Record<string, unknown>);
  switch (el.kind) {
    case 'FactStatement':
      walkFact(el.fact, v);
      break;
    case 'Argument':
      walkArgument(el, v);
      break;
    case 'RelationStatement':
      walkRelation(el.relation, v);
      break;
    // Headings, blocks, comments — leaves for the walker. Consumers
    // that need their internals can add cases here.
    default:
      break;
  }
  v.leave?.(el as unknown as { kind: string } & Record<string, unknown>);
}

function walkFact(f: Fact, v: Visitor): void {
  v.enter?.(f as unknown as { kind: string } & Record<string, unknown>);
  walkFactRef(f.ref, v);
  v.leave?.(f as unknown as { kind: string } & Record<string, unknown>);
}

function walkFactRef(r: FactRef, v: Visitor): void {
  v.enter?.(r as unknown as { kind: string } & Record<string, unknown>);
  v.leave?.(r as unknown as { kind: string } & Record<string, unknown>);
}

function walkArgument(a: Argument, v: Visitor): void {
  v.enter?.(a as unknown as { kind: string } & Record<string, unknown>);
  walkConclusion(a.conclusion, v);
  for (const p of a.premises) walkPremise(p, v);
  v.leave?.(a as unknown as { kind: string } & Record<string, unknown>);
}

function walkConclusion(c: Conclusion, v: Visitor): void {
  v.enter?.(c as unknown as { kind: string } & Record<string, unknown>);
  if (c.kind === 'atom') {
    walkFactRef(c.value, v);
  } else {
    walkArgument(c.value, v);
  }
  v.leave?.(c as unknown as { kind: string } & Record<string, unknown>);
}

function walkPremise(p: Premise, v: Visitor): void {
  v.enter?.(p as unknown as { kind: string } & Record<string, unknown>);
  if (p.kind === 'atom') {
    walkFactRef(p.value, v);
  } else if (p.kind === 'argument') {
    walkArgument(p.value, v);
  } else {
    for (const ref of p.values) walkFactRef(ref, v);
  }
  v.leave?.(p as unknown as { kind: string } & Record<string, unknown>);
}

function walkRelation(_r: Relation, _v: Visitor): void {
  // Endpoint recursion lands in Task 16 (EndpointList unfold). For now
  // visiting just fires the relation node itself.
}
