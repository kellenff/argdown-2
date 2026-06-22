# Fuzz Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structure-aware fuzz test suite that mutates the 7 existing fixtures and asserts four parser invariants on every mutation.

**Architecture:** A pure mutator module (`src/parser.mutate.ts`) provides a seeded RNG and 6 line-aware mutation operations. A Vitest suite (`src/parser.fuzz.test.ts`) reads the 7 fixtures, runs N mutations on each, and asserts (1) no-throw, (2) result-shape consistency, (3) AST shape sanity, (4) sub-parse idempotence.

**Tech Stack:** Vitest (existing), TypeScript, Node `node:fs` for fixture loading, no new dependencies.

**Spec:** `docs/snowball/specs/2026-06-22-fuzz-tests-design.md`

---

## File Structure

**New files:**
- `src/parser.mutate.ts` — pure mutator, exports `mutate(source, rng)` and `makeRng(seed)`
- `src/parser.mutate.test.ts` — unit tests for `makeRng` and each mutation op
- `src/parser.fuzz.test.ts` — Vitest suite with 4 invariants over 7 fixtures

**Modified files:** None.

**Dependency direction:**
```
parser.fuzz.test.ts  ──▶  parser.mutate.ts   (pure, no imports)
              │           │
              └──▶  parser.ts  ──▶  tokens.ts
              └──▶  ast.ts
```

The mutator has zero imports — it's pure functions over strings and an RNG. This keeps it cheap to test in isolation.

---

## Task 1: Seeded RNG with deterministic tests

**Files:**
- Create: `src/parser.mutate.ts`
- Create: `src/parser.mutate.test.ts`

- [ ] **Step 1: Write the failing test in `src/parser.mutate.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { makeRng } from './parser.mutate.js';

describe('makeRng', () => {
  it('produces numbers in [0, 1)', () => {
    const rng = makeRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic — same seed produces same sequence', () => {
    const a = makeRng(123);
    const b = makeRng(123);
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/parser.mutate.test.ts`
Expected: FAIL — `Cannot find module './parser.mutate.js'`

- [ ] **Step 3: Implement `makeRng` in `src/parser.mutate.ts`**

```ts
/**
 * Seeded pseudo-random number generator (mulberry-style 32-bit LCG).
 * Quality matters only for test reproducibility — not cryptographic.
 */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/parser.mutate.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/parser.mutate.ts src/parser.mutate.test.ts
git commit -m "Add seeded RNG for fuzz tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Six mutation operations + unit tests

**Files:**
- Modify: `src/parser.mutate.ts` (add ops + helpers, do not yet add `mutate()` wrapper)
- Modify: `src/parser.mutate.test.ts` (add op tests)

- [ ] **Step 1: Add helpers and op functions to `src/parser.mutate.ts`**

Append below `makeRng`:

```ts
// ----- Helpers -----

const RANDOM_BYTES = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \t-+*/[]{}<>=#@!?,.;:\'"';
function randomBytes(rng: () => number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += RANDOM_BYTES[Math.floor(rng() * RANDOM_BYTES.length)];
  return s;
}

const RANDOM_LINES = [
  '',
  '# Heading',
  '## Subheading',
  '<Some Claim>',
  'Some claim text.',
  '[Some Reason]: Some text.',
  '[A]: w. [B]: x.',
  '<A> -> <B>',
  '<A> -- <B>',
  '<A> +- <B>',
  '<A> ++ <B>',
  '::: evidence',
  '::: position',
  '::: meta',
  '  - bullet',
  '  * star bullet',
  '  key: value',
  '// comment',
];
const ID_POOL = ['A', 'B', 'C', 'Some Claim', 'My Fact', 'Reason', 'Counter'];
function randomLine(rng: () => number): string {
  const tpl = RANDOM_LINES[Math.floor(rng() * RANDOM_LINES.length)];
  return tpl
    .replace(/<X>/g, () => ID_POOL[Math.floor(rng() * ID_POOL.length)])
    .replace(/\[X\]/g, () => ID_POOL[Math.floor(rng() * ID_POOL.length)]);
}

function splitLines(s: string): string[] {
  // Preserve the trailing empty line that `\n` produces when source ends with `\n`,
  // so rejoin is a true inverse.
  return s.split('\n');
}
function joinLines(lines: string[]): string {
  return lines.join('\n');
}

// ----- Ops -----
// Each op takes (source, rng) and returns a new string. If the op cannot
// apply (e.g. deleteLine on a single-line source), it returns source unchanged.

export function insertLine(source: string, rng: () => number): string {
  const lines = splitLines(source);
  const idx = Math.floor(rng() * (lines.length + 1));
  const out = [...lines];
  out.splice(idx, 0, randomLine(rng));
  return joinLines(out);
}

export function deleteLine(source: string, rng: () => number): string {
  const lines = splitLines(source);
  if (lines.length <= 1) return source;
  const idx = Math.floor(rng() * lines.length);
  const out = [...lines];
  out.splice(idx, 1);
  return joinLines(out);
}

export function swapLines(source: string, rng: () => number): string {
  const lines = splitLines(source);
  if (lines.length < 2) return source;
  const idx = Math.floor(rng() * (lines.length - 1));
  const out = [...lines];
  [out[idx], out[idx + 1]] = [out[idx + 1], out[idx]];
  return joinLines(out);
}

export function duplicateRange(source: string, rng: () => number): string {
  const lines = splitLines(source);
  if (lines.length < 1) return source;
  const start = Math.floor(rng() * lines.length);
  const end = Math.min(lines.length, start + 1 + Math.floor(rng() * 3));
  const slice = lines.slice(start, end);
  const out = [...lines];
  out.splice(end, 0, ...slice);
  return joinLines(out);
}

export function spliceGarbage(source: string, rng: () => number): string {
  const lines = splitLines(source);
  if (lines.length === 0) return randomBytes(rng, 8);
  const lineIdx = Math.floor(rng() * lines.length);
  const line = lines[lineIdx];
  const col = Math.floor(rng() * (line.length + 1));
  const n = 1 + Math.floor(rng() * 16);
  lines[lineIdx] = line.slice(0, col) + randomBytes(rng, n) + line.slice(col);
  return joinLines(lines);
}

export function replaceLine(source: string, rng: () => number): string {
  const lines = splitLines(source);
  if (lines.length === 0) {
    return randomLine(rng);
  }
  const idx = Math.floor(rng() * lines.length);
  const out = [...lines];
  out[idx] = randomLine(rng);
  return joinLines(out);
}
```

- [ ] **Step 2: Add op tests to `src/parser.mutate.test.ts`**

Append to the existing test file:

```ts
import {
  insertLine, deleteLine, swapLines, duplicateRange, spliceGarbage, replaceLine,
} from './parser.mutate.js';

const SRC = 'line1\nline2\nline3\nline4';
const SINGLE = 'only';

describe('mutator ops', () => {
  it('insertLine adds one line and preserves total newline structure', () => {
    const rng = makeRng(1);
    const out = insertLine(SRC, rng);
    expect(out.split('\n').length).toBe(SRC.split('\n').length + 1);
  });

  it('deleteLine removes one line when there are at least 2', () => {
    const rng = makeRng(2);
    const out = deleteLine(SRC, rng);
    expect(out.split('\n').length).toBe(SRC.split('\n').length - 1);
  });

  it('deleteLine returns input unchanged for single-line source', () => {
    const rng = makeRng(3);
    expect(deleteLine(SINGLE, rng)).toBe(SINGLE);
  });

  it('swapLines rearranges but preserves length', () => {
    const rng = makeRng(4);
    const out = swapLines(SRC, rng);
    expect(out.split('\n').length).toBe(SRC.split('\n').length);
    // For a 4-line source, adjacent swaps produce one of a small set of permutations.
    expect(out).not.toBe(SRC);
  });

  it('swapLines is a no-op for single-line source', () => {
    const rng = makeRng(5);
    expect(swapLines(SINGLE, rng)).toBe(SINGLE);
  });

  it('duplicateRange grows by 1–3 lines', () => {
    const rng = makeRng(6);
    const out = duplicateRange(SRC, rng);
    const before = SRC.split('\n').length;
    const after = out.split('\n').length;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(before + 3);
  });

  it('spliceGarbage changes the source', () => {
    const rng = makeRng(7);
    const out = spliceGarbage(SRC, rng);
    expect(out).not.toBe(SRC);
  });

  it('replaceLine overwrites one line', () => {
    const rng = makeRng(8);
    const out = replaceLine(SRC, rng);
    expect(out.split('\n').length).toBe(SRC.split('\n').length);
    // The seed produces a known replacement; sanity-check by line count.
    const outLines = out.split('\n');
    const srcLines = SRC.split('\n');
    const same = outLines.filter((l, i) => l === srcLines[i]).length;
    expect(same).toBeLessThan(srcLines.length);
  });

  it('replaceLine on empty source returns a random line', () => {
    const rng = makeRng(9);
    const out = replaceLine('', rng);
    expect(out.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `yarn test src/parser.mutate.test.ts`
Expected: PASS — 12 tests pass (3 RNG + 9 ops).

- [ ] **Step 4: Commit**

```bash
git add src/parser.mutate.ts src/parser.mutate.test.ts
git commit -m "Add six mutation ops for fuzz tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Weighted `mutate()` wrapper

**Files:**
- Modify: `src/parser.mutate.ts` (add `OPS` table and `mutate()`)
- Modify: `src/parser.mutate.test.ts` (add `mutate()` tests)

- [ ] **Step 1: Append the wrapper to `src/parser.mutate.ts`**

```ts
// ----- Weighted entry point -----

type Op = (source: string, rng: () => number) => string;

// [weight, op] pairs. Weights sum to 100.
const OPS: ReadonlyArray<readonly [number, Op]> = [
  [30, insertLine],
  [15, deleteLine],
  [10, swapLines],
  [10, duplicateRange],
  [15, spliceGarbage],
  [20, replaceLine],
];

/**
 * Apply one weighted-random mutation to `source`. The op is picked via
 * cumulative-weight sampling so the OPS table is the single source of truth
 * for op probabilities.
 */
export function mutate(source: string, rng: () => number): string {
  const total = OPS.reduce((s, [w]) => s + w, 0);
  let pick = rng() * total;
  for (const [w, op] of OPS) {
    pick -= w;
    if (pick <= 0) return op(source, rng);
  }
  return OPS[OPS.length - 1][1](source, rng);
}
```

- [ ] **Step 2: Add wrapper tests to `src/parser.mutate.test.ts`**

```ts
import { mutate } from './parser.mutate.js';

describe('mutate', () => {
  const SRC = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10';

  it('changes the source with overwhelming probability (50 trials)', () => {
    const rng = makeRng(100);
    let changed = 0;
    for (let i = 0; i < 50; i++) {
      if (mutate(SRC, rng) !== SRC) changed++;
    }
    expect(changed).toBeGreaterThan(40);
  });

  it('is deterministic given a seed', () => {
    const a = makeRng(200);
    const b = makeRng(200);
    for (let i = 0; i < 20; i++) {
      expect(mutate(SRC, a)).toBe(mutate(SRC, b));
    }
  });

  it('never throws on arbitrary input (including empty)', () => {
    const rng = makeRng(300);
    expect(() => mutate('', rng)).not.toThrow();
    expect(() => mutate('just one line', rng)).not.toThrow();
    expect(() => mutate('\n\n\n', rng)).not.toThrow();
  });

  it('eventually exercises every op type over 1000 trials (smoke test)', () => {
    // We can't directly observe which op was picked, but we can observe that
    // multiple distinct output forms appear — different op families produce
    // different structural shapes (length grows, shrinks, stays same).
    const rng = makeRng(400);
    const shapes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const out = mutate(SRC, rng);
      shapes.add(`${out.length === SRC.length ? 'same' : out.length > SRC.length ? 'longer' : 'shorter'}`);
    }
    expect(shapes.size).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `yarn test src/parser.mutate.test.ts`
Expected: PASS — 16 tests pass (3 RNG + 9 ops + 4 wrapper).

- [ ] **Step 4: Commit**

```bash
git add src/parser.mutate.ts src/parser.mutate.test.ts
git commit -m "Add weighted mutate() wrapper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Fuzz test skeleton + invariant 1 (no-throw)

**Files:**
- Create: `src/parser.fuzz.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
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
}

function checkInvariants(source: string, ctx: FuzzCtx): ParseResult {
  let result: ParseResult;
  try {
    result = parse(source);
  } catch (e) {
    throw new FuzzFailure('parse() threw', ctx, { error: String(e) });
  }
  checkNoThrow(result, ctx);
  return result;
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
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `yarn test src/parser.fuzz.test.ts`
Expected: PASS — 7 tests pass (one per fixture), each running 200 mutations.

If a test fails with "fixture not found", verify `process.cwd()` resolves to the repo root (`yarn test` runs from there).

- [ ] **Step 3: Confirm the runtime is under 30 seconds**

Run: `time yarn test src/parser.fuzz.test.ts`
Expected: total under 30 s on a developer laptop.

- [ ] **Step 4: Commit**

```bash
git add src/parser.fuzz.test.ts
git commit -m "Add fuzz test skeleton with no-throw invariant

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Invariant 2 (result-shape consistency)

**Files:**
- Modify: `src/parser.fuzz.test.ts`

- [ ] **Step 1: Add invariant 2 to `checkInvariants`**

Replace the `checkInvariants` function in `src/parser.fuzz.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the test to verify it still passes**

Run: `yarn test src/parser.fuzz.test.ts`
Expected: PASS — invariant 2 holds for all mutations on all fixtures (parse()'s decision tree is internally consistent).

- [ ] **Step 3: Commit**

```bash
git add src/parser.fuzz.test.ts
git commit -m "Add result-shape consistency invariant

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Invariant 3 (AST shape sanity)

**Files:**
- Modify: `src/parser.fuzz.test.ts`

- [ ] **Step 1: Add `VALID_KINDS` and the walker**

Append below `checkResultShape` (and update `checkInvariants` to call it):

```ts
// All `kind` discriminants declared in src/ast.ts. Keep in sync.
const VALID_KINDS: ReadonlySet<string> = new Set([
  'AttributeBlock', 'Block', 'BlockComment', 'BlockTitle',
  'BooleanValue', 'Document', 'Fact', 'FactRef', 'FactStatement',
  'FlowMapping', 'FlowScalar', 'FlowSequence', 'Frontmatter',
  'Heading', 'IdentifierHead', 'LineComment', 'ListItem',
  'NullValue', 'NumberValue', 'PlainScalar', 'Relation',
  'RelationStatement', 'Rule', 'RuleExpr', 'RuleStatement',
  'StringValue', 'TitleHead', 'YamlLine',
]);

function isValidLoc(loc: { start: { offset: number }; end: { offset: number } } | undefined): boolean {
  if (!loc) return false;
  const { start, end } = loc;
  return Number.isInteger(start.offset) && Number.isInteger(end.offset) && start.offset >= 0 && end.offset >= start.offset;
}

function walkAst(doc: Document, visit: (node: { kind: string; loc?: unknown; level?: number; type?: string }) => void): void {
  visit(doc as unknown as { kind: string });
  for (const el of doc.elements) walkElement(el, visit);
}

function walkElement(node: unknown, visit: (n: { kind: string; loc?: unknown; level?: number; type?: string }) => void): void {
  if (!node || typeof node !== 'object') return;
  const n = node as { kind?: string; loc?: unknown; level?: number; type?: string; body?: unknown[]; fact?: unknown; head?: unknown; title?: unknown; entries?: unknown };
  visit(n);
  // Recurse into the union members that contain nested nodes.
  if (Array.isArray(n.body)) for (const child of n.body) walkElement(child, visit);
  if (n.fact) walkElement(n.fact, visit);
  if (n.head) walkElement(n.head, visit);
  if (n.title) walkElement(n.title, visit);
  if (n.entries && typeof n.entries === 'object') {
    for (const v of Object.values(n.entries as Record<string, unknown>)) walkElement(v, visit);
  }
}

// Invariant 3: every AST node has a valid kind and loc; type-specific fields
// (Heading.level, Block.type) are within their declared ranges/unions.
function checkAstShape(result: ParseResult, ctx: FuzzCtx): void {
  if (!result.ast) return;
  walkAst(result.ast, (node) => {
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
```

Then update `checkInvariants` to call `checkAstShape` after `checkResultShape`:

```ts
function checkInvariants(source: string, ctx: FuzzCtx): ParseResult {
  let result: ParseResult;
  try {
    result = parse(source);
  } catch (e) {
    throw new FuzzFailure('parse() threw', ctx, { error: String(e) });
  }
  checkNoThrow(result, ctx);
  checkResultShape(result, ctx);
  checkAstShape(result, ctx);
  return result;
}
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `yarn test src/parser.fuzz.test.ts`
Expected: PASS — invariant 3 holds.

- [ ] **Step 3: Commit**

```bash
git add src/parser.fuzz.test.ts
git commit -m "Add AST shape sanity invariant

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Invariant 4 (sub-parse idempotence)

**Files:**
- Modify: `src/parser.fuzz.test.ts`

- [ ] **Step 1: Add the idempotence check**

Append below `checkAstShape`:

```ts
// Invariant 4: for each AST element, re-parse the substring
// source.slice(start.offset, end.offset). The sub-parse must not throw, and
// a sub-parse that succeeds while the parent flagged this element's start
// as erroneous is a bug — the parent's grammar disagrees with its own
// element scope.
function checkIdempotence(result: ParseResult, source: string, ctx: FuzzCtx): void {
  if (!result.ast) return;
  for (const el of result.ast.elements) {
    const startOff = el.loc.start.offset;
    const endOff = el.loc.end.offset;
    const sub = source.slice(startOff, endOff);
    if (sub.length === 0) continue;

    let subResult: ParseResult;
    try {
      subResult = parse(sub);
    } catch (e) {
      throw new FuzzFailure(
        `sub-parse of ${el.kind} threw`,
        ctx,
        { element: el.kind, sub, error: String(e) },
      );
    }

    const parentFlaggedOffset = result.errors.some(e => e.loc && e.loc.offset === startOff);
    if (!parentFlaggedOffset && !subResult.ok && subResult.errors.length > 0) {
      throw new FuzzFailure(
        `parent accepts but sub-parse rejects ${el.kind}`,
        ctx,
        { element: el.kind, sub, parentErrors: result.errors, subErrors: subResult.errors },
      );
    }
  }
}
```

Then update `checkInvariants` to take `source` and call `checkIdempotence`:

```ts
function checkInvariants(source: string, ctx: FuzzCtx): ParseResult {
  let result: ParseResult;
  try {
    result = parse(source);
  } catch (e) {
    throw new FuzzFailure('parse() threw', ctx, { error: String(e) });
  }
  checkNoThrow(result, ctx);
  checkResultShape(result, ctx);
  checkAstShape(result, ctx);
  checkIdempotence(result, source, ctx);
  return result;
}
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `yarn test src/parser.fuzz.test.ts`
Expected: PASS — all four invariants hold across all 200 mutations on all 7 fixtures.

- [ ] **Step 3: Commit**

```bash
git add src/parser.fuzz.test.ts
git commit -m "Add sub-parse idempotence invariant

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Verify failure reporting with a deliberate break

**Files:**
- Modify: `src/parser.ts` (temporary)
- Modify: `src/parser.fuzz.test.ts` (temporary, then reverted)

This task verifies the error-reporting format end-to-end. After it passes, revert all temporary changes and commit a verification note.

- [ ] **Step 1: Inject a deliberate throw in `parse()`**

Open `src/parser.ts` and find the line at `parser.ts:1217`:
```ts
const lexResult: ILexingResult = ArgdownLexer.tokenize(source);
```

Insert immediately below it:
```ts
  if (source.includes('TRIGGER_FUZZ_FAILURE')) throw new Error('deliberate fuzz-test trigger');
```

- [ ] **Step 2: Inject a matching mutate-source marker**

Open `src/parser.fuzz.test.ts` and add a temporary test BEFORE the `describe('parse() fuzz')` block:

```ts
it('reports failure with seed/iter/source when invariant violated (manual repro)', () => {
  const source = 'TRIGGER_FUZZ_FAILURE\n';
  const ctx: FuzzCtx = { fixture: 'manual', seed: 0, iter: 0, source };
  expect(() => checkInvariants(source, ctx)).toThrow(/deliberate fuzz-test trigger/);
});
```

- [ ] **Step 3: Run the test to verify it fails with the expected message**

Run: `yarn test src/parser.fuzz.test.ts -t 'reports failure'`
Expected: FAIL with a message containing `deliberate fuzz-test trigger`, `fixture: manual`, `seed: 0`, `iter: 0`, and the source text.

- [ ] **Step 4: Revert both temporary edits**

Remove the throw from `src/parser.ts` (restore the original 2 lines).

Remove the temporary `it('reports failure with seed/iter/source...')` block from `src/parser.fuzz.test.ts`.

- [ ] **Step 5: Run the full fuzz test to confirm clean pass**

Run: `yarn test src/parser.fuzz.test.ts`
Expected: PASS — all 7 fixture tests pass, no deliberate failure remains.

- [ ] **Step 6: Commit a verification note (no code changes)**

```bash
git commit --allow-empty -m "Verify fuzz failure reporting path works end-to-end

Manually injected and reverted a parser throw + matching test; confirmed
FuzzFailure format surfaces seed/iter/source as designed.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Final verification — typecheck and full test suite

**Files:** none modified.

- [ ] **Step 1: Run the full test suite**

Run: `yarn test`
Expected: PASS — `parser.test.ts`, `parser.bench.test.ts`, `parser.mutate.test.ts`, `parser.fuzz.test.ts` all pass.

- [ ] **Step 2: Run typecheck**

Run: `yarn typecheck`
Expected: exit 0, no type errors.

- [ ] **Step 3: Time the fuzz suite under stress**

Run: `FUZZ_ITER=500 yarn test src/parser.fuzz.test.ts`
Expected: completes in under 60 s on a developer laptop.

- [ ] **Step 4: Final commit if any cleanup needed**

If steps 1–3 produced no diffs, no commit needed. Otherwise:
```bash
git add -u
git commit -m "Fuzz test suite: final cleanup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §4 mutator (`makeRng`, 6 ops, weighted `mutate()`) → Tasks 1–3
- §5.1 test structure (one `it` per fixture, seeded RNG) → Task 4
- §5.2 `FUZZ_ITER` env override → Task 4 (line `const ITERATIONS = Number(process.env.FUZZ_ITER ?? 200);`)
- §5.3 invariant 1 no-throw → Task 4
- §5.3 invariant 2 result-shape consistency → Task 5
- §5.3 invariant 3 AST shape sanity → Task 6
- §5.3 invariant 4 idempotence → Task 7
- §5.4 failure reporting format → Task 8 (verifies via manual injection)
- §8 build/scripts/CI (no changes) → Tasks 9 confirms nothing regressed

**Placeholder scan:** No TBD/TODO. Every code block is complete. Every command has an expected output. No "similar to Task N" hand-waves.

**Type consistency:**
- `ParseResult` shape used consistently: `{ ok, ast?, errors, partial? }` ✓
- `ParseError.loc` (Position, single offset) used consistently in Tasks 5 and 7 ✓
- `Element.loc` (SourceLocation, with `start.offset` and `end.offset`) used consistently in Task 7 ✓
- `Document.elements` and `Element` types imported from `ast.ts` ✓
- `FuzzCtx` shape consistent across all callers ✓
