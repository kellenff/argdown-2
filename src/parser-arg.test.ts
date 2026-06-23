// src/parser-arg.test.ts
// Unit tests for the argument parser productions.
//
// Cycle 2 of the rich-arguments plan adds the `Argument` rule and its
// supporting productions (multi-premise, disjunction, nesting). This
// file grows task-by-task; this commit starts with the disjunction test.

import { describe, it, expect } from 'vitest';

import { parse } from './parser.js';

function parseOk(source: string) {
  const result = parse(source);
  if (!result.ok) throw new Error(`Expected OK, got errors: ${JSON.stringify(result.errors)}`);
  return result.ast;
}

describe('parseDisjunction', () => {
  it('parses ([#A]) -> ([#B] | [#C]).', () => {
    const ast = parseOk('([#A]) -> ([#B] | [#C]).');
    // Verify the AST has a disjunction premise
    expect(JSON.stringify(ast)).toContain('disjunction');
  });
});
