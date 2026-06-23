// src/parser-arg.test.ts
// Unit tests for the argument parser productions.
//
// Cycle 2 of the rich-arguments plan adds the `Argument` rule and its
// supporting productions (multi-premise, disjunction, nesting). This
// file grows task-by-task; this commit starts with the disjunction test.

import { describe, it, expect } from 'vitest';
import { ArgdownLexer } from './tokens.js';
import { TokenStream } from './parser-util.js';
import { parseArgument, parseDisjunction } from './parser-arg.js';

// Task 11 unit test — tests parseDisjunction directly. Integration via
// public parse() is verified in Task 14 (dispatch wiring) and
// Task 15 (visitArgument).

function parseDisjunctionOk(source: string) {
  const lexResult = ArgdownLexer.tokenize(source);
  const stream = new TokenStream(lexResult.tokens);
  const result = parseDisjunction(stream);
  if (!result) throw new Error(`Expected a disjunction CST, got undefined`);
  return result;
}

describe('parseDisjunction', () => {
  it('parses ([#B] | [#C]) as a disjunction', () => {
    const cst = parseDisjunctionOk('([#B] | [#C])');
    expect(cst).toBeDefined();
    // CST should have factRef children
    expect(cst.factRef).toBeDefined();
  });
});

// Task 12 unit test — tests parseArgument directly for the nested-
// argument premise case. parseArgExpr is a thin wrapper around
// parseArgument; full visitor dispatch lands in Tasks 14-15.

function parseArgumentOk(source: string) {
  const lexResult = ArgdownLexer.tokenize(source);
  const stream = new TokenStream(lexResult.tokens);
  const result = parseArgument(stream);
  if (!result) throw new Error(`Expected an argument CST, got undefined`);
  return result;
}

describe('parseArgument — nesting', () => {
  it('parses (A) -> (B) -> [C] with a nested argument as premise', () => {
    const cst = parseArgumentOk('([#A]) -> ([#B]) -> [#C].');
    expect(cst).toBeDefined();
    // The premises should have a single nested argument
    expect(cst.premise).toBeDefined();
  });
});
