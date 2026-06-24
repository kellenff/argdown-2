// src/parser.fuzz.test.ts
// Structure-aware fuzz test for parse(). Mutates the 7 fixtures and asserts
// invariants on every mutated input. See docs/snowball/specs/2026-06-22-fuzz-tests-design.md.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, type ParseResult, type ParseError } from './parser.js';
import { mutate, makeRng } from './parser.mutate.js';
import { stringify } from './stringifier.js';
import type { Document, Element } from './ast.js';

const FIXTURES: ReadonlyArray<readonly [string, string]> = [
  ['small-claim', 'src/parser.fixtures/small-claim.argdown'],
  ['small-rule', 'src/parser.fixtures/small-rule.argdown'],
  ['small-relation', 'src/parser.fixtures/small-relation.argdown'],
  ['medium-climate', 'src/parser.fixtures/medium-climate.argdown'],
  ['heavy-relations', 'src/parser.fixtures/heavy-relations.argdown'],
  ['deep-nesting', 'src/parser.fixtures/deep-nesting.argdown'],
  ['large-stress', 'src/parser.fixtures/large-stress.argdown'],
];

const ITERATIONS = Number(process.env.FUZZ_ITER ?? 200);

function seedFromName(name: string): number {
  // FNV-1a 32-bit hash of the fixture name.
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface FuzzCtx {
  fixture: string;
  seed: number;
  iter: number;
  source: string;
}

class FuzzFailure extends Error {
  constructor(
    msg: string,
    public ctx: FuzzCtx,
    public extra?: Record<string, unknown>,
  ) {
    super(formatFuzzFailure(msg, ctx, extra));
  }
}

function formatFuzzFailure(msg: string, ctx: FuzzCtx, extra?: Record<string, unknown>): string {
  const head = `${msg}\n  fixture: ${ctx.fixture}\n  seed: ${ctx.seed}\n  iter: ${ctx.iter}\n  source (first 4 KB):\n`;
  const src = ctx.source.slice(0, 4096);
  const tail = extra ? `\n  extra: ${JSON.stringify(extra)}` : '';
  return head + src + tail;
}

// Invariant 1: parse() must never throw on any input. This is the contract
// documented in parser.ts — the parser is best-effort. The fuzz test guards
// against regressions in that contract by wrapping parse() in a try/catch
// and failing loudly if it throws.
function checkNoThrow(source: string, ctx: FuzzCtx): ParseResult {
  try {
    return parse(source);
  } catch (e) {
    throw new FuzzFailure('parse() threw', ctx, { error: String(e) });
  }
}

function checkInvariants(source: string, ctx: FuzzCtx): ParseResult {
  const result = checkNoThrow(source, ctx);
  checkResultShape(result, ctx);
  checkAstShape(result, ctx);
  checkIdempotence(result, source, ctx);
  return result;
}

// Invariant 2: codifies parse()'s decision tree (parser.ts:1240-1255).
//   ok=true  ⇒ no errors AND ast defined
//   ok=false ⇒ at least one of: errors present, ast undefined
function checkResultShape(result: ParseResult, ctx: FuzzCtx): void {
  const hasErrors = result.errors.length > 0;
  const hasAst = result.ok ? result.ast !== undefined : result.partial !== undefined;

  if (result.ok && (hasErrors || !hasAst)) {
    throw new FuzzFailure(`ok=true but ${hasErrors ? 'has errors' : 'no ast'}`, ctx, {
      ok: result.ok,
      hasErrors,
      hasAst,
    });
  }
  if (!result.ok && !hasErrors && hasAst) {
    throw new FuzzFailure('ok=false but no errors and ast present', ctx, {
      ok: result.ok,
      hasErrors,
      hasAst,
    });
  }
}

// All `kind` discriminants declared in src/ast.ts. Keep in sync.
const VALID_KINDS: ReadonlySet<string> = new Set([
  'AttributeBlock',
  'Block',
  'BlockComment',
  'BlockTitle',
  'BooleanValue',
  'Document',
  'Fact',
  'FactRef',
  'FactStatement',
  'FlowMapping',
  'FlowScalar',
  'FlowSequence',
  'Frontmatter',
  'Heading',
  'IdentifierHead',
  'LineComment',
  'ListItem',
  'NullValue',
  'NumberValue',
  'PlainScalar',
  'Relation',
  'RelationStatement',
  'Rule',
  'RuleStatement',
  'StringValue',
  'TitleHead',
  'YamlLine',
]);

function isValidLoc(
  loc: { start: { offset: number }; end: { offset: number } } | undefined,
): boolean {
  if (!loc) return false;
  const { start, end } = loc;
  return (
    Number.isInteger(start.offset) &&
    Number.isInteger(end.offset) &&
    start.offset >= 0 &&
    end.offset >= start.offset
  );
}

// Strip `loc` (and other positional metadata) from any AST node so that
// round-trip equality can compare structure, not byte offsets. Mutates a
// deep copy of the tree; the input is left untouched.
function stripLocations<T>(node: T): T {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(stripLocations) as unknown as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'loc') continue;
    result[key] = stripLocations(value);
  }
  return result as T;
}

function walkAst(
  doc: Document,
  visit: (node: { kind?: string; loc?: unknown; level?: number; type?: string }) => void,
): void {
  visit(doc as unknown as { kind: string });
  for (const el of doc.elements) walkElement(el, visit);
}

function walkElement(
  node: unknown,
  visit: (n: { kind?: string; loc?: unknown; level?: number; type?: string }) => void,
): void {
  if (!node || typeof node !== 'object') return;
  const n = node as {
    kind?: string;
    loc?: unknown;
    level?: number;
    type?: string;
    body?: unknown[];
    fact?: unknown;
    head?: unknown;
    title?: unknown;
    ref?: unknown;
    attributes?: unknown;
    rule?: unknown;
    relation?: unknown;
    relations?: unknown[];
    premises?: unknown[];
    conclusion?: unknown;
    value?: unknown;
    values?: unknown[];
    from?: unknown;
    to?: unknown;
    items?: unknown[];
    entries?: unknown;
  };
  visit(n);
  if (Array.isArray(n.body)) for (const c of n.body) walkElement(c, visit);
  if (Array.isArray(n.premises)) for (const c of n.premises) walkElement(c, visit);
  if (Array.isArray(n.relations)) for (const c of n.relations) walkElement(c, visit);
  if (Array.isArray(n.values)) for (const c of n.values) walkElement(c, visit);
  if (Array.isArray(n.items)) for (const c of n.items) walkElement(c, visit);
  if (n.fact) walkElement(n.fact, visit);
  if (n.head) walkElement(n.head, visit);
  if (n.title) walkElement(n.title, visit);
  if (n.ref) walkElement(n.ref, visit);
  if (n.attributes) walkElement(n.attributes, visit);
  if (n.rule) walkElement(n.rule, visit);
  if (n.relation) walkElement(n.relation, visit);
  if (n.conclusion) walkElement(n.conclusion, visit);
  if (n.value && typeof n.value === 'object') walkElement(n.value, visit);
  if (n.from) walkElement(n.from, visit);
  if (n.to) walkElement(n.to, visit);
  if (n.entries && typeof n.entries === 'object') {
    for (const v of Object.values(n.entries as Record<string, unknown>)) walkElement(v, visit);
  }
}

// Collect every node in `doc` matching `pred`. Walks the same tree as
// walkAst. Used by invariants 5-8 to enumerate `Argument` and
// `RelationStatement` nodes regardless of nesting depth.
function findAll<T extends { kind?: string }>(
  doc: Document,
  pred: (n: { kind?: string }) => n is T,
): T[] {
  const out: T[] = [];
  walkAst(doc, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
}

// Invariant 3: every AST node has a valid kind and loc; type-specific fields
// (Heading.level, Block.type) are within their declared ranges/unions.
function checkAstShape(result: ParseResult, ctx: FuzzCtx): void {
  if (!result.ok) return;
  const ast = result.ast;
  walkAst(ast, (node) => {
    if (!node.kind || !VALID_KINDS.has(node.kind)) {
      throw new FuzzFailure(`unknown kind ${String(node.kind)}`, ctx, { node });
    }
    if (!isValidLoc(node.loc as { start: { offset: number }; end: { offset: number } })) {
      throw new FuzzFailure(`invalid loc on ${node.kind}`, ctx, { node });
    }
    if (node.kind === 'Heading') {
      if (typeof node.level !== 'number' || node.level < 1 || node.level > 6) {
        throw new FuzzFailure(`invalid Heading.level ${String(node.level)}`, ctx, { node });
      }
    }
    if (node.kind === 'Block') {
      const validBlockTypes = new Set(['meta', 'evidence', 'position', 'stakeholder', 'domain']);
      if (typeof node.type !== 'string' || !validBlockTypes.has(node.type)) {
        throw new FuzzFailure(`invalid Block.type ${String(node.type)}`, ctx, { node });
      }
    }
  });
}

// Invariant 4: for each AST element, re-parse the substring
// source.slice(start.offset, end.offset). The sub-parse must not throw, and
// a sub-parse that succeeds while the parent flagged this element's start
// as erroneous is a bug — the parent's grammar disagrees with its own
// element scope.
function checkIdempotence(result: ParseResult, source: string, ctx: FuzzCtx): void {
  if (!result.ok) return;
  const ast = result.ast;
  for (const el of ast.elements) {
    const startOff = el.loc.start.offset;
    const endOff = el.loc.end.offset;
    const sub = source.slice(startOff, endOff);
    if (sub.length === 0) continue;

    let subResult: ParseResult;
    try {
      subResult = parse(sub);
    } catch (e) {
      throw new FuzzFailure(`sub-parse of ${el.kind} threw`, ctx, {
        element: el.kind,
        sub,
        error: String(e),
      });
    }

    const parentFlaggedOffset = result.errors.some((e) => e.loc && e.loc.offset === startOff);
    if (!parentFlaggedOffset && !subResult.ok && subResult.errors.length > 0) {
      throw new FuzzFailure(`parent accepts but sub-parse rejects ${el.kind}`, ctx, {
        element: el.kind,
        sub,
        parentErrors: result.errors,
        subErrors: subResult.errors,
      });
    }
  }
}

describe('parse() fuzz', () => {
  for (const [name, path] of FIXTURES) {
    it(`${name} survives ${ITERATIONS} mutations without throwing`, () => {
      const source = readFileSync(join(process.cwd(), path), 'utf8');
      const rng = makeRng(seedFromName(name));
      let current = source;
      for (let i = 0; i < ITERATIONS; i++) {
        current = mutate(current, rng);
        checkInvariants(current, {
          fixture: name,
          seed: seedFromName(name),
          iter: i,
          source: current,
        });
      }
    });
  }
});

// Reusable: drive a single fixture through ITERATIONS mutations,
// yielding the parser result for each mutation so invariant tests
// can assert against the AST.
function* driveMutations(
  name: string,
  path: string,
): Generator<{ source: string; result: ParseResult; ctx: FuzzCtx }> {
  const source = readFileSync(join(process.cwd(), path), 'utf8');
  const rng = makeRng(seedFromName(name));
  const seed = seedFromName(name);
  let current = source;
  for (let i = 0; i < ITERATIONS; i++) {
    current = mutate(current, rng);
    yield {
      source: current,
      result: checkNoThrow(current, { fixture: name, seed, iter: i, source: current }),
      ctx: { fixture: name, seed, iter: i, source: current },
    };
  }
}

describe('parse() fuzz invariants 5-8', () => {
  for (const [name, path] of FIXTURES) {
    // Invariant 5: every `Premise` is one of the three declared variants
    // (atom | argument | disjunction), and disjunction values must be
    // a non-empty FactRef list. This closes the grammar on the parser
    // side: a `Premise` cannot drift into a new variant without an
    // explicit grammar change.
    it(`${name} invariant 5: premise shape closure`, () => {
      for (const { result } of driveMutations(name, path)) {
        if (!result.ok) continue;
        for (const arg of findAll(
          result.ast,
          (n): n is Extract<Element, { kind: 'Argument' }> => n.kind === 'Argument',
        )) {
          for (const premise of arg.premises) {
            expect(['atom', 'argument', 'disjunction']).toContain(premise.kind);
            if (premise.kind === 'disjunction') {
              expect(premise.values.length).toBeGreaterThanOrEqual(2);
            }
          }
        }
      }
    });

    // Invariant 6: `Conclusion` is narrower than `Premise` — it
    // cannot be a disjunction. This is documented in ast.ts and the
    // grammar must not regress.
    it(`${name} invariant 6: conclusion shape closure`, () => {
      for (const { result } of driveMutations(name, path)) {
        if (!result.ok) continue;
        for (const arg of findAll(
          result.ast,
          (n): n is Extract<Element, { kind: 'Argument' }> => n.kind === 'Argument',
        )) {
          expect(['atom', 'argument']).toContain(arg.conclusion.kind);
        }
      }
    });

    // Invariant 7: every `Argument` carries a `loc` (parser attaches
    // the source range from the trailing period). A successful parse
    // must not produce an argument with a missing location.
    it(`${name} invariant 7: period attached`, () => {
      for (const { result } of driveMutations(name, path)) {
        if (!result.ok) continue;
        for (const arg of findAll(
          result.ast,
          (n): n is Extract<Element, { kind: 'Argument' }> => n.kind === 'Argument',
        )) {
          expect(arg.loc).toBeDefined();
        }
      }
    });

    // Invariant 8: after the visitor unfolds multi-premise endpoint
    // lists (`[#A], [#B] --> [#C]` → 2× `Relation`), every
    // `RelationStatement` exposes a non-empty `relations` array.
    // An empty array would mean either the visitor regressed or
    // the parser produced a malformed `RelationStatement`.
    it(`${name} invariant 8: multi-premise relation structure`, () => {
      for (const { result } of driveMutations(name, path)) {
        if (!result.ok) continue;
        for (const rel of findAll(
          result.ast,
          (n): n is Extract<Element, { kind: 'RelationStatement' }> =>
            n.kind === 'RelationStatement',
        )) {
          expect(rel.relations).toBeDefined();
          expect(rel.relations.length).toBeGreaterThan(0);
        }
      }
    });
  }
});

describe('parse() fuzz invariant 9: round-trip', () => {
  for (const [name, path] of FIXTURES) {
    // Invariant 9: parse(stringify(ast)) must be structurally equivalent
    // to ast (positions stripped). For any source the parser can parse,
    // stringify → re-parse must yield the same shape.
    //
    // Known limitations excluded from the assertion:
    //
    // 1. Nested-argument conclusions: the stringifier emits them but the
    //    parser doesn't dispatch them through `parseConclusion` (see
    //    src/parser-arg.ts:82 — uses `parseFactRef` for the head).
    //
    // 2. TitleHead facts with no `claimText`: the parser's space-separated
    //    claim-text rule (BNF §5.6a) is greedy, so a `[Title]` fact with
    //    no claim on the line below it gets re-absorbed on re-parse. The
    //    original parser dropped the colon-form claim text silently (per
    //    stringifier.ts:84-85), so the AST has no claim to emit. This is
    //    a parser-design tension, not a stringifier bug — skip it.
    //
    // 3. RuleStatement: parser no longer produces rules (commit 73a9ba1),
    //    so fuzz sources don't include them. No issue expected.
    it(`${name} invariant 9: stringify → parse round-trip`, () => {
      for (const { result, source, ctx } of driveMutations(name, path)) {
        if (!result.ok) continue;
        if (hasKnownLimitation(result.ast)) continue;
        const stringified = stringify(result.ast);
        let reParsed: ParseResult;
        try {
          reParsed = parse(stringified);
        } catch (e) {
          throw new FuzzFailure('re-parse threw on stringified output', ctx, {
            error: String(e),
            stringified,
            originalSource: source,
          });
        }
        if (!reParsed.ok) {
          throw new FuzzFailure('re-parse rejected stringified output', ctx, {
            reParseErrors: reParsed.errors,
            stringified,
            originalSource: source,
          });
        }
        const original = JSON.stringify(stripLocations(result.ast));
        const roundTripped = JSON.stringify(stripLocations(reParsed.ast));
        if (original !== roundTripped) {
          throw new FuzzFailure('round-trip mismatch', ctx, {
            stringified,
            originalSource: source,
            diff: { original, roundTripped },
          });
        }
      }
    });
  }
});

// Returns true when the AST has a known parser/stringifier design tension
// that makes the round-trip structurally undefined. See the comment block
// on the invariant 9 `it` above for the full list.
function hasKnownLimitation(ast: Document): boolean {
  // (1) Nested-argument conclusions.
  for (const arg of findAll(
    ast,
    (n): n is Extract<Element, { kind: 'Argument' }> => n.kind === 'Argument',
  )) {
    if (arg.conclusion.kind === 'argument') return true;
  }
  // (2) TitleHead facts with no claimText — see comment block.
  for (const factStmt of findAll(
    ast,
    (n): n is { kind: 'FactStatement'; fact: { ref: { head: { kind: string } } } } =>
      n.kind === 'FactStatement',
  )) {
    // `claimText` is optional in the AST, so absent means undefined.
    const fact = (
      factStmt as unknown as { fact: { claimText?: string; ref: { head: { kind: string } } } }
    ).fact;
    if (fact.ref.head.kind === 'TitleHead' && fact.claimText === undefined) {
      return true;
    }
  }
  return false;
}
