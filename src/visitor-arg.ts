// src/visitor-arg.ts
// CST → AST for the argument productions of Cycle 2: Argument,
// Conclusion, Premise (atom | argument | disjunction).
//
// Kept in its own module so the main visitor stays under the file-size
// limit. The argument productions are the largest new subtree this
// cycle adds.

import type {
  Argument,
  Conclusion,
  Premise,
  RelationEndpoint,
} from './ast.js';
import type { CstChildren, CstNode } from './ast.js';

import {
  collectAllTokens,
  locFromTokens,
  pickFirst,
  visitAttributeBlock,
  visitFactRef,
} from './visitor.js';

export function visitArgument(cst: CstChildren): Argument {
  const conclSub = pickFirst(cst['conclusion'] as CstNode[]) as CstChildren;
  const premiseSubs = (cst['premise'] as CstNode[]) ?? [];
  const attrSub = pickFirst(cst['attributeBlock'] as CstNode[]);
  return {
    kind: 'Argument',
    conclusion: visitConclusion(conclSub),
    premises: premiseSubs.map((p) => visitPremise(p as CstChildren)),
    ...(attrSub ? { attributes: visitAttributeBlock(attrSub as CstChildren) } : {}),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

export function visitConclusion(cst: CstChildren): Conclusion {
  // A conclusion CST IS a FactRef or Argument CST (parseArgument stores
  // the parsed result directly in `conclusion`). Disambiguate by the
  // presence of `LBrack` (atom) vs `LParen` (nested argument).
  if ((cst['LBrack'] as CstNode[] | undefined)?.length) {
    const ref = visitFactRef(cst);
    return { kind: 'atom', value: ref, loc: ref.loc };
  }
  if ((cst['LParen'] as CstNode[] | undefined)?.length) {
    const value = visitArgument(cst);
    return { kind: 'argument', value };
  }
  throw new Error('conclusion matched no alternative');
}

export function visitPremise(cst: CstChildren): Premise {
  // Disambiguation: the premise CST is one of
  //   - a FactRef CST   (atom)        — has LBrack
  //   - an Argument CST (nested arg)  — has LParen + a factRef child
  //   - a Disjunction CST              — has LParen wrapping many factRef children
  // We detect disjunction by the array form of `factRef`. Nested-argument
  // CSTs are detected by an `argument` child carrying the head factRef.
  const disjRefs = cst['factRef'];
  if (Array.isArray(disjRefs) && disjRefs.length > 0) {
    const values = disjRefs.map((r) => visitFactRef(r as CstChildren));
    const loc = locFromTokens(collectAllTokens(cst));
    return { kind: 'disjunction', values, loc };
  }
  const arg = pickFirst(cst['argument'] as CstNode[]);
  if (arg) {
    const value = visitArgument(arg as CstChildren);
    return { kind: 'argument', value };
  }
  // Bare factRef — must be a single one, produced by parseFactRef.
  if ((cst['LBrack'] as CstNode[] | undefined)?.length) {
    const ref = visitFactRef(cst);
    return { kind: 'atom', value: ref, loc: ref.loc };
  }
  throw new Error('premise matched no alternative');
}

export function visitRelationEndpoint(cst: CstChildren): RelationEndpoint {
  const fr = pickFirst(cst['factRef'] as CstNode[]);
  if (fr) return visitFactRef(fr as CstChildren);
  const ae = pickFirst(cst['argExpr'] as CstNode[]);
  if (ae) return visitArgument(ae as CstChildren);
  throw new Error('relationEndpoint matched no alternative');
}
