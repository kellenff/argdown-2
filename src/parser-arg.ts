// src/parser-arg.ts
// Argument parsing productions for Argdown Extended.
//
// This file owns the `Argument` rule: a single-line inference statement
// shaped `(Conclusion) -> PremiseList.`. Cycle 2 of the rich-arguments
// plan introduces this rule to subsume the existing `Rule` syntax.
//
// Scope of this file (grows across the cycle):
//   - parseArgument       — the top-level production
//   - parseConclusion     — the `(FactRef | ArgExpr)` after `(`
//   - parsePremiseList    — comma-separated `Premise` items
//   - parsePremise        — one of `FactRef | ArgExpr | Disjunction`
//   - parseDisjunction    — `([#A] | [#B])`
//   - parseArgExpr        — an `Argument` used as a value (nested)
//
// This commit adds the skeleton (parseArgument) only. Multi-premise,
// disjunction, and nesting productions are added in subsequent tasks.
//
// Dependencies:
//   - parseArgument calls parseFactRef from ./parser-fact.js (the
//     conclusion and the single premise are both fact refs in the
//     skeleton; richer premise types arrive in later tasks).
//   - Cycle 2 will introduce an `Arrow` token in ./tokens.js for the
//     `->` operator. The skeleton references it by its planned name.

import type { CstChildren, CstNode } from './ast.js';

import { TokenStream, tokenNode } from './parser-util.js';
import { parseFactRef } from './parser-fact.js';

// =========================================================================
// Skeleton
// =========================================================================

// Parse a single-premise argument of the form `(FactRef) -> [FactRef].`.
// Multi-premise, disjunctive, and nested-argument premises are added in
// later tasks; this skeleton establishes the parse shape, the save/restore
// backtracking pattern, and the CST field names that the visitor will
// consume.
export function parseArgument(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const before = s.save();
  const lb = s.consume('LParen');
  if (!lb) return undefined;
  cst['LParen'] = [tokenNode(lb)];

  const head = parseFactRef(s);
  if (!head) {
    s.restore(before);
    return undefined;
  }
  cst['conclusion'] = [head];

  const rb = s.consume('RParen');
  if (!rb) return undefined;
  cst['RParen'] = [tokenNode(rb)];

  const arrow = s.consume('Arrow');
  if (!arrow) return undefined;
  cst['arrow'] = [tokenNode(arrow)];

  const premise = parseFactRef(s);
  if (!premise) return undefined;
  cst['premise'] = [premise];

  const period = s.consume('Period');
  if (!period) return undefined;
  cst['period'] = [tokenNode(period)];

  return cst;
}
