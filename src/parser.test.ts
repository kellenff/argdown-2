// src/parser.test.ts
// Production tests: one happy-path test per BNF production, plus error, recovery, position, and example tests.

import { describe, it, expect } from 'vitest';

import { parse, formatError } from './parser.js';
import type { Document, Fact, Relation, Heading, Block, Value } from './ast.js';

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

  it('parses a frontmatter with multi-word yaml values', () => {
    const ast = parseOk('===\ntitle: Climate Policy Analysis\nauthor: Research Team\n===\n');
    expect(ast.frontmatter?.entries['title']).toMatchObject({
      kind: 'PlainScalar',
      text: 'Climate Policy Analysis',
    });
    expect(ast.frontmatter?.entries['author']).toMatchObject({
      kind: 'PlainScalar',
      text: 'Research Team',
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

  it('parses a block title containing digits and a space', () => {
    const ast = parseOk(':::evidence[Source 1]\ntype: empirical\n:::');
    const block = ast.elements[0] as Block;
    expect(block.title?.text).toBe('Source 1');
  });

  it('parses block-body yaml lines with multi-word values', () => {
    const ast = parseOk(':::evidence[X]\nname: Alice Anderson\nrole: principal investigator\n:::');
    const block = ast.elements[0] as Block;
    const yamlLines = block.body.filter((l) => l.kind === 'YamlLine') as Array<{
      kind: 'YamlLine';
      key: string;
      value: unknown;
    }>;
    expect(yamlLines).toHaveLength(2);
    expect(yamlLines[0]?.key).toBe('name');
    expect(yamlLines[0]?.value).toMatchObject({
      kind: 'PlainScalar',
      text: 'Alice Anderson',
    });
    expect(yamlLines[1]?.key).toBe('role');
    expect(yamlLines[1]?.value).toMatchObject({
      kind: 'PlainScalar',
      text: 'principal investigator',
    });
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

// (Task 13: the previous Climate Policy example used `:-` syntax, which
// is now a hard-break parse error. The migration codemod (Task 21) and the
// cycle-2 DESIGN.md update (Task 23) will re-introduce this example using
// the new `->` argument syntax.)

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
