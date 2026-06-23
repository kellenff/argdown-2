// src/parser-arg.test.ts
// Unit tests for the argument parser productions.
//
// Cycle 2 of the rich-arguments plan adds the `Argument` rule and its
// supporting productions (multi-premise, disjunction, nesting). This
// file grows task-by-task; this commit starts with the disjunction test.

import { describe, it, expect } from 'vitest';
import { ArgdownLexer } from './tokens.js';
import { TokenStream } from './parser-util.js';
import { parseDisjunction } from './parser-arg.js';

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
