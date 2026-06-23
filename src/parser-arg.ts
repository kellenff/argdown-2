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
// This commit adds the skeleton (parseArgument + parsePremise +
// parseDisjunction + parseArgExpr). All four productions are now in
// place; subsequent tasks wire them into the public parser and the
// visitor.
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
import { parseAttributeBlock } from './parser-relation.js';

// =========================================================================
// Skeleton
// =========================================================================

// Emit a parse error referencing the current token. The caller has
// already committed to the `(...` argument shape (consumed at least the
// opening paren), so this signals a malformed argument rather than a
// silent backtrack. We do NOT restore position — the outer dispatch
// (parseStatement / parseRelationEndpoint) restores its own `before`
// marker to try alternatives.
function recordArgumentError(
  s: TokenStream,
  message: string,
  code:
    | 'parse.unclosedArgument'
    | 'parse.argumentRequiresPremise'
    | 'parse.expectedPeriod',
): void {
  const tok = s.current();
  s.errors.push({
    code,
    message,
    severity: 'error',
    loc: {
      line: tok.startLine ?? 1,
      column: tok.startColumn ?? 1,
      offset: tok.startOffset ?? 0,
    },
    found: tok.tokenType.name,
  });
}

// Parse a single-premise argument of the form `(FactRef) -> [FactRef].`.
// Multi-premise, disjunctive, and nested-argument premises are added in
// later tasks; this skeleton establishes the parse shape, the save/restore
// backtracking pattern, and the CST field names that the visitor will
// consume.
//
// When `requirePeriod` is false, the trailing period is left in the
// stream for the caller to consume. This is used by `parseArgExpr`,
// where the surrounding argument owns the trailing period.
//
// Once the opening paren is consumed, internal failures record a
// targeted parse error rather than silently backtracking — see the
// "Argument parse errors" table in the rich-arguments design spec.
export function parseArgument(
  s: TokenStream,
  requirePeriod = true,
): CstNode | undefined {
  const cst: CstChildren = {};
  const lb = s.consume('LParen');
  if (!lb) return undefined;
  cst['LParen'] = [tokenNode(lb)];

  const head = parseFactRef(s);
  if (!head) {
    recordArgumentError(s, "Unclosed argument: missing ')'", 'parse.unclosedArgument');
    return undefined;
  }
  cst['conclusion'] = [head];

  const rb = s.current();
  if (rb.tokenType.name !== 'RParen') {
    recordArgumentError(s, "Unclosed argument: missing ')'", 'parse.unclosedArgument');
    return undefined;
  }
  s.pos++;
  cst['RParen'] = [tokenNode(rb)];

  const arrow = s.consume('Arrow');
  if (!arrow) return undefined;
  cst['arrow'] = [tokenNode(arrow)];

  // Multi-premise: comma-separated list
  const premises: CstNode[] = [];
  const first = parsePremise(s);
  if (!first) {
    recordArgumentError(
      s,
      'Argument requires at least one premise',
      'parse.argumentRequiresPremise',
    );
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

  if (requirePeriod) {
    const period = s.current();
    if (period.tokenType.name !== 'Period') {
      recordArgumentError(s, "Expected '.' to end argument", 'parse.expectedPeriod');
      return undefined;
    }
    s.pos++;
    cst['period'] = [tokenNode(period)];
  }

  return cst;
}

export function parsePremise(s: TokenStream): CstNode | undefined {
  // Try alternatives in order: atom (FactRef), nested Argument,
  // Disjunction. Each failed attempt must roll back both position
  // AND errors — `parseFactRef` records mismatched-token errors on
  // its speculative `consume('LBrack')` call, which would otherwise
  // leak into the final error list.
  const errMark = s.saveErrors();
  const before = s.save();
  const fr = parseFactRef(s);
  if (fr) return fr;
  s.restore(before);
  s.restoreErrors(errMark);
  const arg = parseArgExpr(s);
  if (arg) return arg;
  s.restore(before);
  s.restoreErrors(errMark);
  const disj = parseDisjunction(s);
  if (disj) return disj;
  s.restore(before);
  s.restoreErrors(errMark);
  return undefined;
}

// An ArgExpr is an Argument used as a value (nested argument premise).
// The trailing period belongs to the surrounding argument, not the
// nested one, so we parse without requiring it.
export function parseArgExpr(s: TokenStream): CstNode | undefined {
  return parseArgument(s, false);
}

export function parseDisjunction(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const before = s.save();
  const lb = s.consume('LParen');
  if (!lb) return undefined;
  cst['LParen'] = [tokenNode(lb)];

  const refs: CstNode[] = [];
  const first = parseFactRef(s);
  if (!first) {
    s.restore(before);
    return undefined;
  }
  refs.push(first);
  let pipeCount = 0;
  while (s.check('Pipe')) {
    s.consume('Pipe');
    pipeCount++;
    const next = parseFactRef(s);
    if (!next) {
      s.restore(before);
      return undefined;
    }
    refs.push(next);
  }
  if (pipeCount === 0) {
    s.restore(before);
    return undefined;
  }
  cst['factRef'] = refs;

  const rb = s.consume('RParen');
  if (!rb) {
    s.restore(before);
    return undefined;
  }
  cst['RParen'] = [tokenNode(rb)];

  return cst;
}

// Wraps parseArgument with an optional attribute block after the period.
// This is the top-level statement entry point used by parseStatement.
export function parseArgumentStatement(s: TokenStream): CstNode | undefined {
  const arg = parseArgument(s);
  if (!arg) return undefined;
  // Optional attribute block after the period
  if (s.check('LBrace')) {
    const attr = parseAttributeBlock(s);
    if (attr) {
      (arg as unknown as { attributeBlock?: CstNode[] }).attributeBlock = [attr];
    }
  }
  return arg;
}
