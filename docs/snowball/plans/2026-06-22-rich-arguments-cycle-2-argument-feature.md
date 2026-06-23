# Rich Arguments — Cycle 2: Argument Feature (Breaking)

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the new `Argument` AST node kind with multi-premise, disjunction, nesting, and conclusion hierarchies. Hard-break the `:-` syntax (parse error). Add multi-premise relations. Remove the old `parseRule*` code. Update the visitor. Add fuzz invariants, mutate operations, Mermaid regression test, migration codemod, and documentation. Run Stryker on the new code.

**Architecture:** New `src/parser-arg.ts` with the argument parser family. `parseRelationEndpoint` switches from `parseRuleExpr` to `parseArgExpr`. `parseStatement` dispatches to `parseArgumentStatement` for top-level arguments. Visitor gets `visitArgument` and unfolds `EndpointList` into multiple binary `Relation` nodes. Migration codemod rewrites `kind: 'Rule'` → `kind: 'Argument'` in any remaining test or fixture files.

**Tech Stack:** TypeScript strict, Vitest (existing), Stryker JS (added in Cycle 1), Chevrotain (existing). No new runtime dependencies.

**Spec:** `docs/snowball/specs/2026-06-22-rich-arguments-design.md`

**Cycle 1 (separate plan):** Parser file split + Stryker config. Shipped as a behavior-preserving refactor. This cycle assumes Cycle 1 has landed.

**Breaking change:** The `:-` syntax is removed. Documents using `:-` will fail to parse. The migration codemod updates source files (parser tests, Mermaid tests, fuzz tests, etc.). External consumers need to update their `kind: 'Rule'` pattern matches to `kind: 'Argument'`. This cycle ships as a major version bump.

---

## File Structure

**New files:**
- `src/parser-arg.ts` — arguments, premises, conclusions, disjunctions, `ArgExpr`
- `src/parser-arg.test.ts` — unit tests for the new parser
- `scripts/migrate-rule-to-arg.mjs` — one-shot codemod for `kind: 'Rule'` → `kind: 'Argument'`

**Modified files:**
- `src/parser.ts` — `parseStatement` dispatches to `parseArgumentStatement`; emits `:-` parse error
- `src/parser-relation.ts` — `parseRelationEndpoint` calls `parseArgExpr` instead of `parseRuleExpr`; supports multi-premise `EndpointList` in CST
- `src/parser.test.ts` — delete `:-` rule tests
- `src/parser.fuzz.test.ts` — 4 new invariants
- `src/parser.mutate.ts` — 2 new mutate operations
- `src/parser.mutate.test.ts` — unit tests for the new mutators
- `src/mermaid.test.ts` — 1 new regression test for disjunction rendering
- `src/visitor.ts` — `visitArgument`, `visitConclusion`, `visitPremise`; unfold `EndpointList`
- `docs/DESIGN.md` — EBNF update
- `stryker.config.mjs` — threshold adjustment if needed

**Removed functions (from `src/parser.ts`):**
- `parseRule`, `parseRuleStatement`, `parseRuleExpr` — replaced by `parseArgument` family

---

## Task 9: Create `src/parser-arg.ts` skeleton with `parseArgument`

**Files:**
- Create: `src/parser-arg.ts`

- [ ] **Step 1: Create the file with the `parseArgument` skeleton**

```ts
import { TokenStream, tokenNode } from './parser-util.js';
import type { CstChildren, CstNode } from './ast.js';
import { parseFactRef, parseFactRefList } from './parser-fact.js';

export function parseArgument(s: TokenStream): CstNode | undefined {
  // Skeleton: parses (FactRef) -> [FactRef]. only. Other shapes
  // (multi-premise, disjunction, nesting) added in subsequent tasks.
  const cst: CstChildren = {};
  const before = s.save();
  const lb = s.consume('LParen');
  if (!lb) return undefined;
  cst['LParen'] = [tokenNode(lb)];

  const head = parseFactRef(s);
  if (!head) {
    s.restore(before);
    return undefined;
  }
  cst['conclusion'] = [head];

  const rb = s.consume('RParen');
  if (!rb) return undefined;
  cst['RParen'] = [tokenNode(rb)];

  const arrow = s.consume('Arrow');
  if (!arrow) return undefined;
  cst['arrow'] = [tokenNode(arrow)];

  const premise = parseFactRef(s);
  if (!premise) return undefined;
  cst['premise'] = [premise];

  const period = s.consume('Period');
  if (!period) return undefined;
  cst['period'] = [tokenNode(period)];

  return cst;
}
```

Note: `Arrow` is the token name for `->`. If the existing lexer has a different name for it, adapt. Check `src/tokens.ts` for the actual token name.

- [ ] **Step 2: Run typecheck**

Run: `yarn typecheck`
Expected: PASS (the new function is unused; it just needs to compile)

- [ ] **Step 3: Commit**

```bash
git add src/parser-arg.ts
git commit -m "feat(parser-arg): add parseArgument skeleton"
```

---

## Task 10: Add `parsePremise` and `parsePremiseList` for multi-premise support

**Files:**
- Modify: `src/parser-arg.ts`

- [ ] **Step 1: Replace `parseArgument` body to call `parsePremise` and `parsePremiseList`**

```ts
export function parseArgument(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const before = s.save();
  const lb = s.consume('LParen');
  if (!lb) return undefined;
  cst['LParen'] = [tokenNode(lb)];

  const head = parseFactRef(s);
  if (!head) {
    s.restore(before);
    return undefined;
  }
  cst['conclusion'] = [head];

  const rb = s.consume('RParen');
  if (!rb) return undefined;
  cst['RParen'] = [tokenNode(rb)];

  const arrow = s.consume('Arrow');
  if (!arrow) return undefined;
  cst['arrow'] = [tokenNode(arrow)];

  // Multi-premise: comma-separated list
  const premises: CstNode[] = [];
  const first = parsePremise(s);
  if (!first) {
    s.restore(before);
    return undefined;
  }
  premises.push(first);
  while (s.check('Comma')) {
    s.consume('Comma');
    const next = parsePremise(s);
    if (!next) break;
    premises.push(next);
  }
  cst['premise'] = premises;

  const period = s.consume('Period');
  if (!period) return undefined;
  cst['period'] = [tokenNode(period)];

  return cst;
}

export function parsePremise(s: TokenStream): CstNode | undefined {
  // Tries FactRef first; ArgExpr and Disjunction added in later tasks.
  return parseFactRef(s);
}
```

- [ ] **Step 2: Run typecheck**

Run: `yarn typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/parser-arg.ts
git commit -m "feat(parser-arg): add parsePremise for multi-premise lists"
```

---

## Task 11: Add `parseDisjunction` (TDD)

**Files:**
- Create: `src/parser-arg.test.ts` (start of test file)
- Modify: `src/parser-arg.ts`
- Modify: `src/tokens.ts` (add `Pipe` token if not present)

- [ ] **Step 1: Check if `Pipe` token exists in `src/tokens.ts`**

Run: `grep -n "Pipe\|'\\|'" src/tokens.ts`
Expected: either the token exists (no change needed) or it doesn't (add it).

- [ ] **Step 2: If `Pipe` doesn't exist, add it to `src/tokens.ts`**

```ts
export const Pipe = createToken({ name: 'Pipe', pattern: /\|/ });
```

Register it in the lexer config alongside the other tokens.

- [ ] **Step 3: Add the failing test for disjunction**

In `src/parser-arg.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `yarn test src/parser-arg.test.ts`
Expected: FAIL — `parseDisjunction` not implemented yet.

- [ ] **Step 5: Implement `parseDisjunction`**

In `src/parser-arg.ts`:

```ts
export function parseDisjunction(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const before = s.save();
  const lb = s.consume('LParen');
  if (!lb) return undefined;
  cst['LParen'] = [tokenNode(lb)];

  const refs: CstNode[] = [];
  const first = parseFactRef(s);
  if (!first) {
    s.restore(before);
    return undefined;
  }
  refs.push(first);
  let pipeCount = 0;
  while (s.check('Pipe')) {
    s.consume('Pipe');
    pipeCount++;
    const next = parseFactRef(s);
    if (!next) {
      s.restore(before);
      return undefined;
    }
    refs.push(next);
  }
  if (pipeCount === 0) {
    s.restore(before);
    return undefined;
  }
  cst['factRef'] = refs;

  const rb = s.consume('RParen');
  if (!rb) {
    s.restore(before);
    return undefined;
  }
  cst['RParen'] = [tokenNode(rb)];

  return cst;
}
```

- [ ] **Step 6: Update `parsePremise` to try `parseDisjunction`**

```ts
export function parsePremise(s: TokenStream): CstNode | undefined {
  const before = s.save();
  const fr = parseFactRef(s);
  if (fr) return fr;
  s.restore(before);
  const disj = parseDisjunction(s);
  if (disj) return disj;
  s.restore(before);
  // parseArgExpr added in Task 12
  return undefined;
}
```

- [ ] **Step 7: Run the test**

Run: `yarn test src/parser-arg.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/parser-arg.ts src/parser-arg.test.ts src/tokens.ts
git commit -m "feat(parser-arg): implement parseDisjunction"
```

---

## Task 12: Add `parseArgExpr` and update `parsePremise` for nesting

**Files:**
- Modify: `src/parser-arg.ts`
- Modify: `src/parser-arg.test.ts`

- [ ] **Step 1: Add the failing test for nesting**

```ts
describe('parseArgument — nesting', () => {
  it('parses (C) -> (SubC) -> [P].', () => {
    const ast = parseOk('([#A]) -> ([#B]) -> [#C].');
    expect(JSON.stringify(ast)).toContain('argument');
  });

  it('parses a conclusion hierarchy (two args, shared head)', () => {
    const ast = parseOk('([#Thesis]) -> ([#Sub]) -> [#P1].\n([#Sub]) -> [#P2].');
    // Both arguments are present
    const args = JSON.stringify(ast).match(/"kind":"Argument"/g);
    expect(args?.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/parser-arg.test.ts -t nesting`
Expected: FAIL

- [ ] **Step 3: Implement `parseArgExpr`**

```ts
export function parseArgExpr(s: TokenStream): CstNode | undefined {
  // An ArgExpr is just an Argument used as a value. Same parser.
  return parseArgument(s);
}
```

- [ ] **Step 4: Update `parsePremise` to try `parseArgExpr`**

```ts
export function parsePremise(s: TokenStream): CstNode | undefined {
  const before = s.save();
  const fr = parseFactRef(s);
  if (fr) return fr;
  s.restore(before);
  const arg = parseArgExpr(s);
  if (arg) return arg;
  s.restore(before);
  const disj = parseDisjunction(s);
  if (disj) return disj;
  s.restore(before);
  return undefined;
}
```

- [ ] **Step 5: Run the test**

Run: `yarn test src/parser-arg.test.ts -t nesting`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/parser-arg.ts src/parser-arg.test.ts
git commit -m "feat(parser-arg): implement parseArgExpr for nested arguments"
```

---

## Task 13: Add the hard-break `:-` error and update `parseStatement`

**Files:**
- Modify: `src/parser.ts`
- Modify: `src/parser.test.ts` (delete `:-` tests)

- [ ] **Step 1: Add the failing test for `:-` hard-break**

In `src/parser-arg.test.ts`:

```ts
describe('hard-break :-', () => {
  it('emits a parse error for [A] :- [B].', () => {
    const result = parse(' [#A] :- [#B]. ');
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.message).toContain("':-'");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/parser-arg.test.ts -t "hard-break"`
Expected: FAIL

- [ ] **Step 3: Update `parseStatement` to emit the `:-` error**

In `src/parser.ts`, find `parseStatement` and update the `RuleOp` branch:

```ts
function parseStatement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LBrack')) {
    const afterClose = peekPastFactRef(s);
    if (afterClose === 'RuleOp') {
      // Hard break: :- is removed.
      const tok = s.peek();
      const loc: SourceLocation = tok
        ? { start: { line: tok.startLine ?? 0, column: tok.startColumn ?? 0 }, end: { line: tok.endLine ?? 0, column: tok.endColumn ?? 0 } }
        : { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
      s.consume('RuleOp'); // consume to make progress
      s.errors.push({
        code: 'syntax-removed',
        message: "':-' syntax was removed. Use '->' for inference (e.g., '([#A]) -> [#B].').",
        loc,
      });
      return undefined;
    }
    if (isArrowToken(afterClose)) {
      const rs = parseRelationStatement(s);
      if (rs) {
        cst['relationStatement'] = [rs];
        return cst;
      }
      return undefined;
    }
    const fs = parseFactStatement(s);
    if (fs) {
      cst['factStatement'] = [fs];
      return cst;
    }
    return undefined;
  }
  // ... LParen branch updated in Task 14
  return undefined;
}
```

- [ ] **Step 4: Delete the old `:-` tests in `src/parser.test.ts`**

Open `src/parser.test.ts` and remove all tests using `:-` syntax. Keep other tests.

- [ ] **Step 5: Run all tests**

Run: `yarn test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/parser.ts src/parser.test.ts src/parser-arg.test.ts
git commit -m "feat(parser): hard-break :- as parse error"
```

---

## Task 14: Update `parseStatement` to dispatch to `parseArgumentStatement` and update `parseRelationEndpoint` to use `parseArgExpr`

**Files:**
- Modify: `src/parser.ts`
- Modify: `src/parser-relation.ts`

- [ ] **Step 1: Add `parseArgumentStatement` to `src/parser-arg.ts`**

```ts
export function parseArgumentStatement(s: TokenStream): CstNode | undefined {
  const arg = parseArgument(s);
  if (!arg) return undefined;
  // Optional attribute block after the period
  if (s.check('LBrace')) {
    const attr = parseAttributeBlock(s);
    if (attr) {
      (arg as unknown as { attributeBlock?: CstNode[] }).attributeBlock = [attr];
    }
  }
  return arg;
}
```

Add import: `import { parseAttributeBlock } from './parser-relation.js';`

- [ ] **Step 2: Update `parseStatement` in `src/parser.ts` for the LParen branch**

```ts
if (s.check('LParen')) {
  const before = s.save();
  const as_ = parseArgumentStatement(s);
  if (as_) {
    cst['argumentStatement'] = [as_];
    return cst;
  }
  s.restore(before);
  // Fall back to relation if the parens don't form an argument
  const rs = parseRelationStatement(s);
  if (rs) {
    cst['relationStatement'] = [rs];
    return cst;
  }
  return undefined;
}
```

- [ ] **Step 3: Update `parseRelationEndpoint` in `src/parser-relation.ts`**

Replace the `parseRuleExpr` call with `parseArgExpr`:

```ts
import { parseArgExpr } from './parser-arg.js';
// remove: import { parseRuleExpr } from './parser.js';

function parseRelationEndpoint(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LParen')) {
    const ae = parseArgExpr(s);
    if (ae) {
      cst['argExpr'] = [ae];
      return cst;
    }
  }
  if (s.check('LBrack')) {
    const fr = parseFactRef(s);
    if (fr) {
      cst['factRef'] = [fr];
      return cst;
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Remove `parseRule`, `parseRuleStatement`, `parseRuleExpr` from `src/parser.ts`**

Delete these three function definitions. Update the dispatch table in `parseStatement` (already done in Task 13 / Step 2 above).

- [ ] **Step 5: Run all tests**

Run: `yarn typecheck && yarn test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/parser.ts src/parser-relation.ts src/parser-arg.ts
git commit -m "feat(parser): dispatch to parseArgument; replace parseRuleExpr with parseArgExpr"
```

---

## Task 15: Add `visitArgument` to `src/visitor.ts`

**Files:**
- Modify: `src/visitor.ts`
- Modify: `src/parser-arg.test.ts`

- [ ] **Step 1: Add the failing test**

In `src/parser-arg.test.ts`:

```ts
import { visit } from './visitor.js';

describe('visitArgument', () => {
  it('walks an argument with disjunction, nesting, and attributes', () => {
    const ast = parseOk('([#A]) -> ([#B] | [#C]), ([#D]) -> [#E]. { confidence: 0.8 }');
    const kinds = new Set<string>();
    visit(ast, (node) => {
      kinds.add(node.kind);
    });
    expect(kinds.has('Argument')).toBe(true);
    expect(kinds.has('disjunction')).toBe(true);
  });
});
```

Note: the exact `visit` API depends on the existing visitor. Adapt to match.

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/parser-arg.test.ts -t visitArgument`
Expected: FAIL

- [ ] **Step 3: Implement `visitArgument`**

In `src/visitor.ts`, add:

```ts
export function visitArgument(node: Argument, visitor: Visitor): void {
  visitor.enter?.(node);
  visitConclusion(node.conclusion, visitor);
  for (const premise of node.premises) {
    visitPremise(premise, visitor);
  }
  if (node.attributes) {
    visitAttributeBlock(node.attributes, visitor);
  }
  visitor.leave?.(node);
}

function visitConclusion(c: Conclusion, visitor: Visitor): void {
  visitor.enter?.(c);
  if (c.kind === 'atom') {
    visitor.enter?.(c.value);
    visitor.leave?.(c.value);
  } else {
    visitArgument(c.value, visitor);
  }
  visitor.leave?.(c);
}

function visitPremise(p: Premise, visitor: Visitor): void {
  visitor.enter?.(p);
  if (p.kind === 'atom') {
    visitor.enter?.(p.value);
    visitor.leave?.(p.value);
  } else if (p.kind === 'argument') {
    visitArgument(p.value, visitor);
  } else {
    for (const ref of p.values) {
      visitor.enter?.(ref);
      visitor.leave?.(ref);
    }
  }
  visitor.leave?.(p);
}
```

- [ ] **Step 4: Run the test**

Run: `yarn test src/parser-arg.test.ts -t visitArgument`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/visitor.ts src/parser-arg.test.ts
git commit -m "feat(visitor): add visitArgument with Conclusion and Premise sub-cases"
```

---

## Task 16: Update `visitRelation` to unfold `EndpointList` into multiple binary `Relation`s

**Files:**
- Modify: `src/parser-relation.ts` (parser produces `EndpointList` in CST)
- Modify: `src/visitor.ts` (visitor unfolds)
- Modify: `src/parser-arg.test.ts`

- [ ] **Step 1: Update `parseRelationEndpoint` in `src/parser-relation.ts` to support comma lists**

```ts
export function parseRelationEndpoint(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const single = parseSingleRelationEndpoint(s);
  if (!single) return undefined;
  if (!s.check('Comma')) {
    cst['relationEndpoint'] = [single];
    return cst;
  }
  const endpoints: CstNode[] = [single];
  while (s.check('Comma')) {
    s.consume('Comma');
    const next = parseSingleRelationEndpoint(s);
    if (!next) break;
    endpoints.push(next);
  }
  cst['relationEndpoint'] = endpoints;
  return cst;
}

function parseSingleRelationEndpoint(s: TokenStream): CstNode | undefined {
  // Original parseRelationEndpoint body
  const cst: CstChildren = {};
  if (s.check('LParen')) {
    const ae = parseArgExpr(s);
    if (ae) {
      cst['argExpr'] = [ae];
      return cst;
    }
  }
  if (s.check('LBrack')) {
    const fr = parseFactRef(s);
    if (fr) {
      cst['factRef'] = [fr];
      return cst;
    }
  }
  return undefined;
}
```

- [ ] **Step 2: Add the failing test**

```ts
describe('multi-premise relations', () => {
  it('unfolds [A], [B] --> [C] into two binary Relations', () => {
    const ast = parseOk('[#A], [#B] --> [#C].');
    const relations: unknown[] = [];
    visit(ast, (node) => {
      if (node.kind === 'Relation') relations.push(node);
    });
    expect(relations).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `yarn test src/parser-arg.test.ts -t "multi-premise relations"`
Expected: FAIL — visitor doesn't unfold yet.

- [ ] **Step 4: Implement the unfold in the visitor**

In `src/visitor.ts`, modify the relation-visiting logic to detect multi-endpoint CSTs and emit multiple AST `Relation` nodes. The exact approach depends on the existing visitor API:

```ts
function visitRelationCst(cst: CstNode): Relation[] {
  // If both endpoints are single, return one Relation
  // If one or both are EndpointList, return N Relations (cartesian)
}
```

Adapt to match the existing visitor's patterns.

- [ ] **Step 5: Run the test**

Run: `yarn test src/parser-arg.test.ts -t "multi-premise relations"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/parser-relation.ts src/visitor.ts src/parser-arg.test.ts
git commit -m "feat(visitor): unfold EndpointList into multiple binary Relations"
```

---

## Task 17: Add error case tests and implement error emissions

**Files:**
- Modify: `src/parser-arg.test.ts`
- Modify: `src/parser-arg.ts`

- [ ] **Step 1: Add failing tests for the error cases**

```ts
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
```

- [ ] **Step 2: Run to verify which fail**

Run: `yarn test src/parser-arg.test.ts -t "argument errors"`
Expected: some or all fail.

- [ ] **Step 3: Implement error emissions in `parseArgument`**

Add the missing error emissions:
- "Argument requires at least one premise" — when the period follows `->` directly with no premises
- "Unclosed argument" — when `(` is not matched by `)`
- "Expected '.' to end argument" — when the argument has no period

- [ ] **Step 4: Run the tests**

Run: `yarn test src/parser-arg.test.ts -t "argument errors"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser-arg.ts src/parser-arg.test.ts
git commit -m "feat(parser-arg): implement argument error emissions"
```

---

## Task 18: Add 4 new fuzz invariants

**Files:**
- Modify: `src/parser.fuzz.test.ts`

- [ ] **Step 1: Read the existing fuzz test file**

Find where invariants 1-4 are defined. Add invariants 5-8 below them, following the same pattern.

- [ ] **Step 2: Add invariant 5 — premise shape closure**

```ts
it('invariant 5: premise shape closure', () => {
  for (const mutated of corpus) {
    const result = parse(mutated);
    if (result.ok) {
      for (const arg of findAll(result.ast, (n) => n.kind === 'Argument')) {
        for (const premise of arg.premises) {
          expect(['atom', 'argument', 'disjunction']).toContain(premise.kind);
          if (premise.kind === 'disjunction') {
            expect(premise.values.length).toBeGreaterThanOrEqual(2);
          }
        }
      }
    }
  }
});
```

- [ ] **Step 3: Add invariant 6 — conclusion shape closure**

```ts
it('invariant 6: conclusion shape closure', () => {
  for (const mutated of corpus) {
    const result = parse(mutated);
    if (result.ok) {
      for (const arg of findAll(result.ast, (n) => n.kind === 'Argument')) {
        expect(['atom', 'argument']).toContain(arg.conclusion.kind);
      }
    }
  }
});
```

- [ ] **Step 4: Add invariant 7 — period attached**

```ts
it('invariant 7: period attached', () => {
  for (const mutated of corpus) {
    const result = parse(mutated);
    if (result.ok) {
      for (const arg of findAll(result.ast, (n) => n.kind === 'Argument')) {
        expect(arg.loc).toBeDefined();
        // The source range must include a period — verify via CST or
        // a recorded field on the AST node.
      }
    }
  }
});
```

- [ ] **Step 5: Add invariant 8 — multi-premise relation structure**

```ts
it('invariant 8: multi-premise relation structure', () => {
  for (const mutated of corpus) {
    const result = parse(mutated);
    if (result.ok) {
      for (const rel of findAll(result.ast, (n) => n.kind === 'Relation')) {
        // After the visitor unfolds, every Relation has single endpoints
        expect(rel.from).toBeDefined();
        expect(rel.to).toBeDefined();
      }
    }
  }
});
```

- [ ] **Step 6: Run the fuzz tests**

Run: `yarn test src/parser.fuzz.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/parser.fuzz.test.ts
git commit -m "test(fuzz): add invariants 5-8 for argument shape and period"
```

---

## Task 19: Add 2 new mutate operations

**Files:**
- Modify: `src/parser.mutate.ts`
- Modify: `src/parser.mutate.test.ts`

- [ ] **Step 1: Add `flipArrow` mutation**

```ts
export function flipArrow(source: string, rng: () => number): string {
  const lines = source.split('\n');
  const idx = Math.floor(rng() * lines.length);
  const line = lines[idx] ?? '';
  if (line.includes('->') && rng() < 0.5) {
    lines[idx] = line.replace('->', ':-');
  } else if (line.includes(':-') && rng() < 0.5) {
    lines[idx] = line.replace(':-', '->');
  }
  return lines.join('\n');
}
```

- [ ] **Step 2: Add `flipDisjunction` mutation**

```ts
export function flipDisjunction(source: string, rng: () => number): string {
  const lines = source.split('\n');
  const idx = Math.floor(rng() * lines.length);
  const line = lines[idx] ?? '';
  if (line.includes('|') && rng() < 0.5) {
    lines[idx] = line.replace('|', ',');
  } else if (line.includes(',') && rng() < 0.5) {
    lines[idx] = line.replace(',', '|');
  }
  return lines.join('\n');
}
```

- [ ] **Step 3: Register the new ops in `mutate()`**

Add `flipArrow` and `flipDisjunction` to the rotation in `mutate()`.

- [ ] **Step 4: Add unit tests for the new ops**

In `src/parser.mutate.test.ts`, add tests for `flipArrow` and `flipDisjunction` following the pattern of the existing 6 op tests.

- [ ] **Step 5: Run all tests**

Run: `yarn test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/parser.mutate.ts src/parser.mutate.test.ts
git commit -m "test(mutate): add flipArrow and flipDisjunction mutation operations"
```

---

## Task 20: Add Mermaid regression test for disjunction

**Files:**
- Modify: `src/mermaid.test.ts`

- [ ] **Step 1: Read `src/mermaid.test.ts`**

Find an existing test for a relation rendering; follow its pattern.

- [ ] **Step 2: Add the regression test**

```ts
describe('disjunction rendering', () => {
  it('renders a disjunctive premise as a single node with alternative labels', () => {
    const ast = parseOk('([#A]) -> ([#B] | [#C]).');
    const svg = renderToMermaid(ast);
    expect(svg).toContain('B');
    expect(svg).toContain('C');
  });
});
```

- [ ] **Step 3: Run the test**

Run: `yarn test src/mermaid.test.ts`
Expected: PASS. Adapt the assertion if the actual Mermaid output differs.

- [ ] **Step 4: Commit**

```bash
git add src/mermaid.test.ts
git commit -m "test(mermaid): add disjunction regression test"
```

---

## Task 21: Write and run the migration codemod

**Files:**
- Create: `scripts/migrate-rule-to-arg.mjs`

- [ ] **Step 1: Create the migration script**

```js
#!/usr/bin/env node
// One-shot codemod: rewrites `kind: 'Rule'` and `visitRule` to `Argument` / `visitArgument`.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function migrate(content) {
  return content
    .replace(/kind:\s*'Rule'/g, "kind: 'Argument'")
    .replace(/\bvisitRule\b/g, 'visitArgument')
    .replace(/\bparseRule\b/g, 'parseArgument')
    .replace(/\bparseRuleStatement\b/g, 'parseArgumentStatement')
    .replace(/\bparseRuleExpr\b/g, 'parseArgExpr')
    .replace(/\bRuleExpr\b/g, 'ArgExpr');
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

const args = process.argv.slice(2);
const targets = args.includes('--all')
  ? walk('src')
  : args.filter((a) => !a.startsWith('--'));

let totalChanges = 0;
for (const file of targets) {
  const original = readFileSync(file, 'utf-8');
  const migrated = migrate(original);
  if (migrated !== original) {
    writeFileSync(file, migrated);
    console.log(`migrated: ${file}`);
    totalChanges++;
  }
}
console.log(`Done. ${totalChanges} files changed.`);
```

- [ ] **Step 2: Run the codemod**

```bash
node scripts/migrate-rule-to-arg.mjs --all
```

Expected: a few files listed as migrated.

- [ ] **Step 3: Run the full test suite**

Run: `yarn typecheck && yarn test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-rule-to-arg.mjs src/
git commit -m "refactor: migrate Rule/RuleExpr to Argument/ArgExpr (codemod)"
```

---

## Task 22: Run Stryker and resolve surviving mutations

**Files:**
- Modify: any file where surviving mutations are found

- [ ] **Step 1: Run Stryker**

Run: `yarn mutate`
Expected: a report showing mutations and which were killed vs survived. Output to `reports/mutation/`.

- [ ] **Step 2: Inspect surviving mutations**

Open `reports/mutation/html/index.html`. For each surviving mutation:
- Read the mutation (line + change)
- Read the test that should have caught it
- Decide: real gap? Strengthen the test. Equivalent mutation? Document.

- [ ] **Step 3: Strengthen tests for any real gaps**

For each surviving mutation that exposes a real test gap, add a test to the appropriate test file. Re-run Stryker to verify.

- [ ] **Step 4: Document the final mutation score**

If the score is below 80%, document why in `stryker.config.mjs` and lower the threshold if appropriate.

- [ ] **Step 5: Commit**

```bash
git add stryker.config.mjs tests/ for strengthened mutations
git commit -m "test: strengthen mutation coverage to 80%+"
```

---

## Task 23: Update `docs/DESIGN.md` EBNF

**Files:**
- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Read `docs/DESIGN.md` sections to update**

Sections 2.3, 2.4, and 5.

- [ ] **Step 2: Update section 2.3 (Rules → Arguments)**

Replace with examples showing the new `Argument` syntax (multi-premise, disjunction, nesting, hierarchies).

- [ ] **Step 3: Update the EBNF in section 5**

Replace the `Rule` and `RuleExpr` productions with the new `Argument`, `Conclusion`, `Premise`, `Disjunction`, `ArgExpr`, `Endpoint`, and `EndpointList` productions.

- [ ] **Step 4: Verify no `:-` references remain**

Run: `grep -n ":-" docs/DESIGN.md`
Expected: no matches (or only in error-message examples)

- [ ] **Step 5: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs: update DESIGN.md for Argument syntax and multi-premise relations"
```

---

## Task 24: Final verification

- [ ] **Typecheck passes**: `yarn typecheck` returns success
- [ ] **Lint passes**: `yarn lint` returns success
- [ ] **Format check passes**: `yarn format:check` returns success
- [ ] **Full test suite passes**: `yarn test` returns success
- [ ] **Build passes**: `yarn build` returns success
- [ ] **`./ast` subpath export includes new types**: run `node -e "import('@casualtheorics/argdown-2/ast').then(m => console.log(Object.keys(m).sort()))"` (after build) — `Argument`, `Conclusion`, `Premise` are exported
- [ ] **Benchmark shows no regression** (if baseline exists): `yarn bench`
- [ ] **Stryker mutation score ≥ 80%**: `yarn mutate` shows the configured threshold met

When all checks pass, Cycle 2 is ready to ship as a major version bump.
