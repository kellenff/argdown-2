// src/parser.test.ts
// Production tests: one happy-path test per BNF production, plus error, recovery, position, and example tests.

import { describe, it, expect } from 'vitest';

import { parse, formatError } from './parser.js';
import type { Document, Fact, Rule, Relation, Heading, Block, Value } from './ast.js';

function parseOk(source: string): Document {
  const r = parse(source);
  if (!r.ok) throw new Error(`expected ok, got errors: ${JSON.stringify(r.errors)}`);
  return r.ast;
}

describe('production: document', () => {
  it('parses an empty document', () => {
    const ast = parseOk('');
    expect(ast.kind).toBe('Document');
    expect(ast.elements).toEqual([]);
  });

  it('parses a frontmatter', () => {
    const ast = parseOk('===\ntitle: Hello\n===\n');
    expect(ast.frontmatter?.entries['title']).toEqual({
      kind: 'PlainScalar',
      text: 'Hello',
      loc: expect.any(Object),
    });
  });
});

describe('production: facts', () => {
  it('parses a fact with identifier head', () => {
    const ast = parseOk('[#co2] emissions cause warming');
    const fact = (ast.elements[0] as { fact: Fact }).fact;
    expect(fact.ref.head).toEqual({
      kind: 'IdentifierHead',
      identifier: 'co2',
      loc: expect.any(Object),
    });
    expect(fact.claimText).toBe('emissions cause warming');
  });

  it('parses a fact with title head', () => {
    const ast = parseOk('[Sea levels are rising]');
    const fact = (ast.elements[0] as { fact: Fact }).fact;
    expect(fact.ref.head).toMatchObject({ kind: 'TitleHead', title: 'Sea levels are rising' });
  });

  it('parses a fact with attributes', () => {
    const ast = parseOk('[#x] text { author: "alice", confidence: 0.95 }');
    const fact = (ast.elements[0] as { fact: Fact }).fact;
    expect(fact.attributes?.entries['author']).toMatchObject({
      kind: 'StringValue',
      value: 'alice',
    });
    expect(fact.attributes?.entries['confidence']).toMatchObject({
      kind: 'NumberValue',
      value: 0.95,
    });
  });

  it('parses a fact with only attributes (no claim text)', () => {
    const ast = parseOk('[#x] { tags: ["a", "b"] }');
    const fact = (ast.elements[0] as { fact: Fact }).fact;
    expect(fact.claimText).toBeUndefined();
    expect(fact.attributes?.entries['tags']).toMatchObject({ kind: 'FlowSequence' });
  });
});

describe('production: rules', () => {
  it('parses a rule with two premises', () => {
    const ast = parseOk('[#mitigation] :- [#co2], [#impacts].');
    const rule = (ast.elements[0] as { rule: Rule }).rule;
    expect(rule.ref).toMatchObject({ head: { kind: 'IdentifierHead', identifier: 'mitigation' } });
    expect(rule.premises).toHaveLength(2);
  });
});

describe('production: relations', () => {
  it('parses a support relation', () => {
    const ast = parseOk('[#A] --> [#B]');
    const rel = (ast.elements[0] as { relation: Relation }).relation;
    expect(rel.arrow).toBe('support');
  });

  it('parses each arrow type', () => {
    const arrows: Array<[string, string]> = [
      ['[A] --> [B]', 'support'],
      ['[A] --x [B]', 'attack'],
      ['[A] -.-> [B]', 'undercut'],
      ['[A] -.- [B]', 'undermine'],
      ['[A] ~> [B]', 'concession'],
      ['[A] ?> [B]', 'qualification'],
      ['[A] <-> [B]', 'equivalence'],
    ];
    for (const [src, expected] of arrows) {
      const ast = parseOk(src);
      const rel = (ast.elements[0] as { relation: Relation }).relation;
      expect(rel.arrow).toBe(expected);
    }
  });

  it('parses a relation with attributes', () => {
    const ast = parseOk('[#A] --> [#B] { strength: "strong" }');
    const rel = (ast.elements[0] as { relation: Relation }).relation;
    expect(rel.attributes?.entries['strength']).toMatchObject({
      kind: 'StringValue',
      value: 'strong',
    });
  });
});

describe('production: headings', () => {
  it.each(['#', '##', '###', '####', '#####', '######'])('parses heading level %s', (marker) => {
    const ast = parseOk(`${marker} Title`);
    const h = ast.elements[0] as Heading;
    expect(h.level).toBe(marker.length);
    expect(h.text).toBe('Title');
  });
});

describe('production: comments', () => {
  it('parses a line comment', () => {
    const ast = parseOk('// a comment');
    expect(ast.elements[0]).toMatchObject({ kind: 'LineComment' });
  });

  it('parses a block comment', () => {
    const ast = parseOk('/* a block comment */');
    expect(ast.elements[0]).toMatchObject({ kind: 'BlockComment' });
  });
});

describe('production: blocks', () => {
  it('parses a block with type and body', () => {
    const ast = parseOk(':::evidence\ntype: empirical\nmethod: satellite\n:::');
    const block = ast.elements[0] as Block;
    expect(block.type).toBe('evidence');
    expect(block.body.length).toBeGreaterThan(0);
  });

  it('parses a block with title', () => {
    const ast = parseOk(':::evidence[Satellite Data]\nmethod: satellite\n:::');
    const block = ast.elements[0] as Block;
    expect(block.title?.text).toBe('Satellite Data');
  });
});

describe('production: values', () => {
  it('parses string value', () => {
    const ast = parseOk('[#x] { a: "hello" }');
    const v = (ast.elements[0] as { fact: Fact }).fact.attributes?.entries['a'] as Value;
    expect(v).toMatchObject({ kind: 'StringValue', value: 'hello' });
  });

  it('parses number value', () => {
    const ast = parseOk('[#x] { a: 42 }');
    const v = (ast.elements[0] as { fact: Fact }).fact.attributes?.entries['a'] as Value;
    expect(v).toMatchObject({ kind: 'NumberValue', value: 42 });
  });

  it('parses boolean value', () => {
    const ast = parseOk('[#x] { a: true }');
    const v = (ast.elements[0] as { fact: Fact }).fact.attributes?.entries['a'] as Value;
    expect(v).toMatchObject({ kind: 'BooleanValue', value: true });
  });

  it('parses null value', () => {
    const ast = parseOk('[#x] { a: null }');
    const v = (ast.elements[0] as { fact: Fact }).fact.attributes?.entries['a'] as Value;
    expect(v).toMatchObject({ kind: 'NullValue' });
  });

  it('parses flow sequence', () => {
    const ast = parseOk('[#x] { a: [1, 2, 3] }');
    const v = (ast.elements[0] as { fact: Fact }).fact.attributes?.entries['a'] as Value;
    expect(v).toMatchObject({ kind: 'FlowSequence' });
  });

  it('parses flow mapping (nested)', () => {
    const ast = parseOk('[#x] { a: { b: 1 } }');
    const v = (ast.elements[0] as { fact: Fact }).fact.attributes?.entries['a'] as Value;
    expect(v).toMatchObject({ kind: 'FlowMapping' });
  });
});

// ============================================================================
// Task 21: Error-case and recovery tests
// ============================================================================

describe('error cases', () => {
  it('reports mismatched token on missing closing bracket', () => {
    const r = parse('[#unclosed');
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe('parse.mismatchedToken');
  });

  it('reports mismatched token on unterminated string', () => {
    const r = parse('[#x] { a: "unterminated }');
    expect(
      r.errors.some(
        (e) => e.code === 'parse.unterminatedString' || e.code === 'parse.mismatchedToken',
      ),
    ).toBe(true);
  });

  it('reports error on missing period after rule', () => {
    const r = parse('[#mitigation] :- [#co2]');
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('recovery', () => {
  it('recovers from a missing period in a rule and parses a following fact', () => {
    const r = parse('[#a] :- [#b]\n[#c] claim');
    expect(r.errors.length).toBeGreaterThan(0);
    const elements = r.ok ? r.ast.elements : (r.partial?.elements ?? []);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('reports multiple errors in one pass', () => {
    const r = parse('[#a] :- [#b]\n[#c] claim { broken: }\n[unclosed');
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Task 22: Position-accuracy tests
// ============================================================================

describe('source positions', () => {
  it('reports 1-indexed line numbers', () => {
    const source = '\n\n[#x] claim';
    const r = parse(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fact = (r.ast.elements[0] as { fact: Fact }).fact;
    expect(fact.loc.start.line).toBe(3);
    expect(fact.loc.start.column).toBe(1);
  });

  it('reports 0-indexed offsets', () => {
    const source = 'abc[#x]';
    const r = parse(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fact = (r.ast.elements[0] as { fact: Fact }).fact;
    expect(fact.loc.start.offset).toBe(3);
  });

  it('reports column numbers', () => {
    const source = '   [#x] claim';
    const r = parse(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fact = (r.ast.elements[0] as { fact: Fact }).fact;
    expect(fact.loc.start.column).toBe(4);
  });

  it('includes error loc pointing at the offending token', () => {
    const r = parse('[#x'); // missing ]
    expect(r.ok).toBe(false);
    const err = r.errors[0];
    expect(err).toBeDefined();
    expect(err!.loc.line).toBe(1);
  });
});

// ============================================================================
// Task 23: DESIGN.md example tests with snapshots
// ============================================================================

describe('DESIGN.md example: Climate Policy', () => {
  const climatePolicy = `===
title: Climate Policy Analysis
author: Research Team
version: 2.1
===

# Position: Aggressive Mitigation

[#co2] Human CO2 emissions are the primary cause {
  source: "@IPCC-AR6",
  confidence: 0.95,
  scheme: "expert_consensus"
}

[#impacts] Current warming trends threaten critical systems {
  certainty: 0.60,
  tags: ["urgent", "biosphere"]
}

[#coord] International coordination is achieved

# Derivation of the main position
[#mitigation] :- [#co2], [#impacts], [#coord].

# Counter-positions
[#gradual] Gradual transition is sufficient { author: "Industry Group A" }

# Relations
[#impacts] --x [#gradual] { type: "undercut" }
[#gradual] --x ([#mitigation] :- [#co2], [#impacts], [#coord])

:::stakeholder[ipcc]
name: Intergovernmental Panel on Climate Change
type: scientific_body
credibility: high
:::
`;

  it('parses with ok: true and no errors', () => {
    const r = parse(climatePolicy);
    expect(r.ok).toBe(true);
    if (!r.ok) {
      console.error(JSON.stringify(r.errors, null, 2));
    }
    expect(r.errors).toEqual([]);
  });

  it('produces a stable AST (snapshot)', () => {
    const r = parse(climatePolicy);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast).toMatchSnapshot();
  });
});

// ============================================================================
// Task 24: Smoke test
// ============================================================================

describe('smoke', () => {
  it('parse() is callable and returns a ParseResult', () => {
    const r = parse('hello');
    expect(r).toHaveProperty('ok');
    if (r.ok) {
      expect(r.ast.kind).toBe('Document');
    } else {
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });

  it('formatError produces a one-liner', () => {
    const r = parse('[#x', { filename: 'test.argdown' });
    expect(r.ok).toBe(false);
    const msg = formatError(r.errors[0]!, 'test.argdown');
    expect(msg).toMatch(/^test\.argdown:1:\d+: /);
  });
});
