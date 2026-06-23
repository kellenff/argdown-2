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
import { parse } from './parser.js';
import type { Argument, Document } from './ast.js';

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

// Task 13: hard-break :- as a parse error. Reaches parseStatement through
// the public parse() entry point.

describe('hard-break :-', () => {
  it('emits a parse error for [A] :- [B].', () => {
    const result = parse(' [#A] :- [#B]. ');
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.message).toContain("':-'");
  });
});

// Task 15: visitArgument walks the typed AST end-to-end via the
// public parse() entry point. We walk into Argument nodes via a
// hand-rolled collector and confirm both 'Argument' and 'disjunction'
// kinds are observed (the disjunction premise is the load-bearing
// part of the test — it confirms the walk recurses into Premise
// variants).

describe('visitArgument (end-to-end via public parse)', () => {
  it('walks an argument with a disjunction premise', () => {
    const result = parse('([#A]) -> ([#B] | [#C]).');
    const ast = result.ok ? result.ast : result.partial;
    expect(ast).toBeDefined();
    if (!ast) return;
    const kinds = collectKinds(ast);
    expect(kinds.has('Argument')).toBe(true);
    expect(kinds.has('disjunction')).toBe(true);
  });
});

// Hand-rolled kind collector. Replaces the prior public visit() walker
// (Task 15 review) — narrow scope, no abstraction overhead.
function collectKinds(ast: Document): Set<string> {
  const kinds = new Set<string>();
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const node = n as { kind?: string } & Record<string, unknown>;
    if (typeof node.kind === 'string') kinds.add(node.kind);
    if (node.kind === 'Argument') {
      const a = node as unknown as Argument;
      walk(a.conclusion);
      for (const p of a.premises) walk(p);
      return;
    }
    if (node.kind === 'atom' || node.kind === 'argument') {
      walk((node as { value: unknown }).value);
      return;
    }
    if (node.kind === 'disjunction') {
      for (const v of (node as { values: unknown[] }).values) walk(v);
      return;
    }
  };
  for (const el of ast.elements) walk(el);
  return kinds;
}
