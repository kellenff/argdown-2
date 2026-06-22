// src/parser.fuzz.test.ts
// Structure-aware fuzz test for parse(). Mutates the 7 fixtures and asserts
// invariants on every mutated input. See docs/snowball/specs/2026-06-22-fuzz-tests-design.md.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, type ParseResult, type ParseError } from './parser.js';
import { mutate, makeRng } from './parser.mutate.js';
import type { Document, Element } from './ast.js';

const FIXTURES: ReadonlyArray<readonly [string, string]> = [
  ['small-claim',     'src/parser.fixtures/small-claim.argdown'],
  ['small-rule',      'src/parser.fixtures/small-rule.argdown'],
  ['small-relation',  'src/parser.fixtures/small-relation.argdown'],
  ['medium-climate',  'src/parser.fixtures/medium-climate.argdown'],
  ['heavy-relations', 'src/parser.fixtures/heavy-relations.argdown'],
  ['deep-nesting',    'src/parser.fixtures/deep-nesting.argdown'],
  ['large-stress',    'src/parser.fixtures/large-stress.argdown'],
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
  constructor(msg: string, public ctx: FuzzCtx, public extra?: Record<string, unknown>) {
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
// against regressions in that contract.
function checkNoThrow(result: ParseResult, ctx: FuzzCtx): void {
  // Nothing to check here — the absence of a throw is enforced by the call site
  // wrapping `parse(source)` in a try/catch (see checkInvariants below).
  // This function exists so the invariant set is explicit; it can grow.
  void result;
  void ctx;
}

function checkInvariants(source: string, ctx: FuzzCtx): ParseResult {
  let result: ParseResult;
  try {
    result = parse(source);
  } catch (e) {
    throw new FuzzFailure('parse() threw', ctx, { error: String(e) });
  }
  checkNoThrow(result, ctx);
  checkResultShape(result, ctx);
  return result;
}

// Invariant 2: codifies parse()'s decision tree (parser.ts:1240-1255).
//   ok=true  ⇒ no errors AND ast defined
//   ok=false ⇒ at least one of: errors present, ast undefined
function checkResultShape(result: ParseResult, ctx: FuzzCtx): void {
  const hasErrors = result.errors.length > 0;
  const hasAst = result.ast !== undefined;

  if (result.ok && (hasErrors || !hasAst)) {
    throw new FuzzFailure(
      `ok=true but ${hasErrors ? 'has errors' : 'no ast'}`,
      ctx,
      { result },
    );
  }
  if (!result.ok && !hasErrors && hasAst) {
    throw new FuzzFailure(
      'ok=false but no errors and ast present',
      ctx,
      { result },
    );
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
        checkInvariants(current, { fixture: name, seed: seedFromName(name), iter: i, source: current });
      }
    });
  }
});