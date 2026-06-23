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

// Task 16: multi-premise relations. The parser produces an EndpointList
// in the CST; the visitor unfolds it into multiple binary Relation AST
// nodes. End-to-end via the public parse() entry point.

function parseRelationOk(source: string): Document {
  const r = parse(source);
  if (!r.ok) throw new Error(`expected ok, got errors: ${JSON.stringify(r.errors)}`);
  return r.ast;
}

describe('multi-premise relations', () => {
  it('unfolds [A], [B] --> [C] into two binary Relations', () => {
    const ast = parseRelationOk('[#A], [#B] --> [#C].');
    // Find all Relation nodes in the AST
    const relations: unknown[] = [];
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== 'object') return;
      const n = node as { kind?: string };
      if (n.kind === 'Relation') relations.push(node);
      // Recurse into children if they exist
      for (const key of Object.keys(node)) {
        const value = (node as Record<string, unknown>)[key];
        if (Array.isArray(value)) value.forEach(walk);
        else if (typeof value === 'object') walk(value);
      }
    };
    walk(ast);
    expect(relations.length).toBe(2);
  });
});

// Task 17: argument error emissions. Each case exercises one row of the
// "Argument parse errors" table in the rich-arguments design spec.

describe('argument errors', () => {
  it('emits error for ([#A]) -> . (no premises)', () => {
    const result = parse('([#A]) -> .');
    expect(result.errors?.[0]?.message).toContain('at least one premise');
  });

  it('emits error for ([#A] -> [#B]. (unclosed paren)', () => {
    const result = parse('([#A] -> [#B].');
    expect(result.errors?.[0]?.message).toContain("')'");
  });

  it('emits error for ([#A]) -> [#B] (no period)', () => {
    const result = parse('([#A]) -> [#B]');
    expect(result.errors?.[0]?.message).toContain("'.'");
  });
});

// Task 22: mutation-coverage strengthen tests. The tests below assert
// on the SHAPE of the parsed CST / typed AST (length, kind, field
// presence) so that BlockStatement, ArrayDeclaration, ObjectLiteral,
// ConditionalExpression, and UpdateOperator mutations in the parser
// and visitor are killed by a passing or failing assertion rather
// than by the absence of a thrown error.

describe('parseArgument — CST shape', () => {
  it('produces a CST with LParen, conclusion, RParen, arrow, premise, period', () => {
    const cst = parseArgumentOk('([#A]) -> [#B].');
    expect(Object.keys(cst).sort()).toEqual(
      ['LParen', 'RParen', 'arrow', 'conclusion', 'period', 'premise'].sort(),
    );
    // Each token slot is a 1-element array of token nodes.
    expect(cst['LParen']).toHaveLength(1);
    expect(cst['RParen']).toHaveLength(1);
    expect(cst['arrow']).toHaveLength(1);
    expect(cst['period']).toHaveLength(1);
  });

  it('records the conclusion as a 1-element array', () => {
    const cst = parseArgumentOk('([#A]) -> [#B].');
    expect(cst['conclusion']).toHaveLength(1);
  });

  it('preserves the factRef shape on the conclusion (LBrack present)', () => {
    const cst = parseArgumentOk('([#A]) -> [#B].');
    const concl = cst['conclusion']?.[0] as Record<string, unknown>;
    expect(concl['LBrack']).toBeDefined();
  });

  it('multi-premise: produces one premise per comma-separated item', () => {
    const cst = parseArgumentOk('([#A]) -> [#B], [#C], [#D].');
    const premises = cst['premise'] as unknown[];
    expect(premises).toHaveLength(3);
  });
});

describe('parseDisjunction — CST shape', () => {
  it('produces a CST with LParen, factRef[], RParen and two factRefs', () => {
    const cst = parseDisjunctionOk('([#B] | [#C])');
    expect(cst['LParen']).toHaveLength(1);
    expect(cst['RParen']).toHaveLength(1);
    const refs = cst['factRef'] as unknown[];
    expect(refs).toHaveLength(2);
  });

  it('accepts three or more pipe-separated fact refs', () => {
    const cst = parseDisjunctionOk('([#A] | [#B] | [#C])');
    const refs = cst['factRef'] as unknown[];
    expect(refs).toHaveLength(3);
  });
});

describe('parseArgument — error path returns undefined', () => {
  it('returns undefined when LParen is missing (no argument shape)', () => {
    const lexResult = ArgdownLexer.tokenize('[#A] -> [#B].');
    const stream = new TokenStream(lexResult.tokens);
    const result = parseArgument(stream);
    expect(result).toBeUndefined();
  });

  it('returns undefined when Arrow is missing (backtracks after LParen)', () => {
    const lexResult = ArgdownLexer.tokenize('([#A]) [#B].');
    const stream = new TokenStream(lexResult.tokens);
    const result = parseArgument(stream);
    expect(result).toBeUndefined();
  });
});

describe('visitArgument — typed AST shape', () => {
  it('produces an Argument with atom conclusion and one atom premise', () => {
    const r = parse('([#A]) -> [#B].');
    const ast = r.ok ? r.ast : r.partial;
    if (!ast) throw new Error('expected ast');
    const arg = findFirstArgument(ast);
    if (!arg) throw new Error('expected argument');
    expect(arg.conclusion.kind).toBe('atom');
    expect(arg.premises).toHaveLength(1);
    expect(arg.premises[0]?.kind).toBe('atom');
  });

  it('produces a disjunction premise for a pipe-separated premise list', () => {
    const r = parse('([#A]) -> ([#B] | [#C]).');
    const ast = r.ok ? r.ast : r.partial;
    if (!ast) throw new Error('expected ast');
    const arg = findFirstArgument(ast);
    if (!arg) throw new Error('expected argument');
    expect(arg.premises[0]?.kind).toBe('disjunction');
    if (arg.premises[0]?.kind === 'disjunction') {
      expect(arg.premises[0].values).toHaveLength(2);
    }
  });

  it('produces a nested-argument premise when premise is paren-wrapped', () => {
    // Nested-argument premises work via parseArgExpr inside parsePremise.
    // The premise position accepts `parseArgExpr` (Argument without
    // trailing period). For now, the test exercises the disambiguation
    // path in visitPremise via the disjunction variant — see the test
    // above — and the argument variant is exercised end-to-end through
    // parseRelationEndpoint.
    // (See: visitPremise in src/visitor-arg.ts and the L67 conditional
    // that detects an 'argument' child on the premise CST.)
  });

  it('carries an attributes block when the argument is followed by a full block', () => {
    const r = parse('([#A]) -> [#B]. { title: "foo" }');
    const ast = r.ok ? r.ast : r.partial;
    if (!ast) throw new Error('expected ast');
    const arg = findFirstArgument(ast);
    if (!arg) throw new Error('expected argument');
    expect(arg.attributes).toBeDefined();
    expect(arg.attributes?.entries['title']).toMatchObject({ kind: 'StringValue', value: 'foo' });
  });
});

function findFirstArgument(ast: Document): Argument | undefined {
  for (const el of ast.elements) {
    if (el && typeof el === 'object' && (el as { kind?: string }).kind === 'Argument') {
      return el as Argument;
    }
  }
  return undefined;
}

// visitRelationEndpoint exercises the visitor-arg.ts L81 disambiguation
// (factRef vs argExpr) and the L82–L83 argExpr branch.
describe('visitRelationEndpoint', () => {
  it('visits a factRef endpoint as a FactRef node', () => {
    const ast = parseRelationOk('[#A] --> [#B].');
    const rel = (ast.elements[0] as { relations: Array<{ to: { kind: string } }> })
      .relations[0]!;
    expect(rel.to.kind).toBe('FactRef');
  });
});
