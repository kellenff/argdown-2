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
// This commit adds the skeleton (parseArgument + parsePremise) only.
// Disjunction and nesting productions are added in subsequent tasks.
//
// Dependencies:
//   - parseArgument and parsePremise call parseFactRef from
//     ./parser-fact.js (the conclusion and each premise are fact refs
//     for now; richer premise types arrive in later tasks).
//   - Cycle 2 introduces an `Arrow` token in ./tokens.js for the `->`
//     operator.

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

  // Multi-premise: comma-separated list
  const premises: CstNode[] = [];
  const first = parsePremise(s);
  if (!first) {
    s.restore(before);
    return undefined;
  }
  premises.push(first);
  while (s.check('Comma')) {
    s.consume('Comma');
    const next = parsePremise(s);
    if (!next) break;
    premises.push(next);
  }
  cst['premise'] = premises;

  const period = s.consume('Period');
  if (!period) return undefined;
  cst['period'] = [tokenNode(period)];

  return cst;
}

export function parsePremise(s: TokenStream): CstNode | undefined {
  // Tries FactRef first; ArgExpr and Disjunction added in later tasks.
  return parseFactRef(s);
}
