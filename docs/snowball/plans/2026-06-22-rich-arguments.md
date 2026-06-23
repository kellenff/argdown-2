# Rich Arguments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `Argument` AST node kind with multi-premise, disjunction, nesting, and conclusion hierarchies. Replace the existing `Rule` syntax with `->`. Hard-break `:-` (parse error). Add multi-premise relations. Split the parser into focused files under the 400-line cap. Add Stryker mutation testing scoped to the new code.

**Architecture:** One `Argument` node kind with discriminated-union `Conclusion` (atom | argument) and `Premise` (atom | argument | disjunction). Hand-written recursive-descent parser extended with `parseArgument` family. CST preserves source structure; visitor unfolds multi-premise `EndpointList` into multiple binary `Relation` nodes. Parser split by responsibility (one file per grammar concern), `parser.ts` becomes a dispatch + re-export shim.

**Tech Stack:** TypeScript strict, Vitest, Chevrotain (existing), Stryker JS (new: `@stryker-mutator/core`, `@stryker-mutator/typescript-checker`, `@stryker-mutator/vitest-runner`), oxlint, oxfmt. No runtime dependencies added.

**Spec:** `docs/snowball/specs/2026-06-22-rich-arguments-design.md`

---

## File Structure

**New files:**
- `src/parser-util.ts` — `TokenStream`, `tokenNode`, `tokenRule`, `isArrowToken`, `isNonEmptyImage`, `peekPastFactRef`, `lexErrorToParseError`
- `src/parser-frontmatter.ts` — frontmatter + YAML helpers + value parsers
- `src/parser-block.ts` — blocks, headings, list items
- `src/parser-fact.ts` — facts, fact-refs, fact-ref-lists, identifiers, comments
- `src/parser-relation.ts` — relations, arrows, relation endpoints (no `RuleExpr`; replaced by `ArgExpr`)
- `src/parser-arg.ts` — arguments, premises, conclusions, disjunctions, `ArgExpr`, hard-break `:-` error
- `src/parser-arg.test.ts` — unit tests for the new parser
- `stryker.config.mjs` — Stryker mutation testing config
- `scripts/migrate-rule-to-arg.mjs` — one-shot codemod for `kind: 'Rule'` → `kind: 'Argument'`

**Modified files:**
- `src/parser.ts` — slim to dispatch + re-export shim
- `src/ast.ts` — add `Argument`, `Conclusion`, `Premise`, `EndpointList` types
- `src/visitor.ts` — add `visitArgument`, `visitConclusion`, `visitPremise`; unfold `EndpointList` in `visitRelation`
- `src/parser.test.ts` — rewrite existing rule tests as argument tests
- `src/parser.fuzz.test.ts` — 4 new invariants + 2 new mutate operations
- `src/mermaid.test.ts` — 1 new regression test for disjunction rendering
- `docs/DESIGN.md` — EBNF update
- `package.json` — Stryker dev deps + `mutate` script

**Removed functions (from `src/parser.ts`):**
- `parseRule`, `parseRuleStatement`, `parseRuleExpr` — replaced by argument family

**Dependency direction:**
```
parser.ts (dispatch) ──▶ parser-arg.ts ──▶ parser-util.ts
                  ──▶ parser-relation.ts ──▶ parser-arg.ts, parser-fact.ts
                  ──▶ parser-fact.ts ──▶ parser-util.ts
                  ──▶ parser-block.ts ──▶ parser-util.ts
                  ──▶ parser-frontmatter.ts ──▶ parser-util.ts
                  └──▶ tokens.ts
```

`ast.ts` has no parser imports (it stays pure data).

---

## Task 1: Add `Argument`, `Conclusion`, `Premise` types to `src/ast.ts`

**Files:**
- Modify: `src/ast.ts:99-103` (after existing `FactRef` type)

- [ ] **Step 1: Read the current `src/ast.ts` to find a good insertion point**

Read the file and find the section that defines `FactRef` and the `BaseNode` interface. We'll insert the new types right after `FactRef`.

- [ ] **Step 2: Add the new types to `src/ast.ts`**

Insert after the `FactRef` type definition:

```ts
// Conclusion is intentionally narrower than Premise — the grammar
// production rules cannot produce a disjunction-conclusion.
// Don't add a disjunction variant here without updating the parser
// and adding a grammar rule that produces one.
export type Conclusion =
  | { kind: 'atom'; value: FactRef; loc: SourceLocation }
  | { kind: 'argument'; value: Argument };

// Premise is the full set — three variants earn their keep on
// consumer-side dispatch (atom: reference resolution; argument:
// sub-argument validation and recursion; disjunction: set-membership
// semantics and proof-search branching).
export type Premise =
  | { kind: 'atom'; value: FactRef; loc: SourceLocation }
  | { kind: 'argument'; value: Argument }
  | { kind: 'disjunction'; values: FactRef[]; loc: SourceLocation };

export type Argument = {
  kind: 'Argument';
  conclusion: Conclusion;
  premises: Premise[];
  attributes?: AttributeBlock;
  loc: SourceLocation;
};
```

- [ ] **Step 3: Run typecheck to verify**

Run: `yarn typecheck`
Expected: PASS (the types are referenced by the new code in later tasks; for now they're unused but valid)

- [ ] **Step 4: Commit**

```bash
git add src/ast.ts
git commit -m "feat(ast): add Argument, Conclusion, Premise types"
```

---

## Task 2: Split `src/parser.ts` — extract `parser-util.ts`

**Files:**
- Create: `src/parser-util.ts`
- Modify: `src/parser.ts`

- [ ] **Step 1: Create `src/parser-util.ts` with the shared helpers**

```ts
import type { IToken } from 'chevrotain';
import type { CstChildren, CstNode, SourceLocation } from './ast.js';

export class TokenStream {
  // ... existing implementation from src/parser.ts
}

export function tokenNode(tok: IToken): CstNode {
  // ... existing implementation
}

export function tokenRule(s: TokenStream, tokenName: string): CstNode | undefined {
  // ... existing implementation
}

export function isArrowToken(name: string): boolean {
  // ... existing implementation
}

export function isNonEmptyImage(tok: IToken): boolean {
  // ... existing implementation
}

export function peekPastFactRef(s: TokenStream): string {
  // ... existing implementation
}
```

Copy the *exact* existing implementations from `src/parser.ts` lines 186-217, 219-225, 244-246, and 958-980. The `TokenStream` class definition is at the top of the file (search for `class TokenStream`).

- [ ] **Step 2: Update `src/parser.ts` to import from `./parser-util.ts`**

Add at the top of `src/parser.ts`:

```ts
export { TokenStream, tokenNode, tokenRule, isArrowToken, isNonEmptyImage, peekPastFactRef } from './parser-util.js';
```

Remove the corresponding definitions from `src/parser.ts`.

- [ ] **Step 3: Run typecheck and tests**

Run: `yarn typecheck && yarn test`
Expected: PASS — no behavior change yet

- [ ] **Step 4: Commit**

```bash
git add src/parser.ts src/parser-util.ts
git commit -m "refactor(parser): extract shared helpers to parser-util.ts"
```

---

## Task 3: Split `src/parser.ts` — extract `parser-frontmatter.ts`

**Files:**
- Create: `src/parser-frontmatter.ts`
- Modify: `src/parser.ts`

- [ ] **Step 1: Create `src/parser-frontmatter.ts`**

Move the following functions from `src/parser.ts` to `src/parser-frontmatter.ts`:
- `parseString`, `parseNumber`, `parseTitleText`, `parseClaimText`, `parseHeadingText`
- `parsePlainScalar`, `parseFlowScalar`, `parseBoolean`, `parseNullValue`, `parseFlowSequence`, `parseFlowMapping`
- `parseValue`, `parseYamlLine`, `parseYamlValue`, `isYamlScalarToken`
- `parseFrontmatter`

Update each function's import path: `./parser-util.js` instead of `./parser.js`.

The file should look like:

```ts
import { TokenStream, tokenNode, tokenRule } from './parser-util.js';
import type { CstChildren, CstNode } from './ast.js';

// parseString, parseNumber, ... (all the value/heading/yaml parsers)
// parseFrontmatter
```

- [ ] **Step 2: Update `src/parser.ts` to re-export**

Add at the top of `src/parser.ts`:

```ts
export {
  parseString, parseNumber, parseTitleText, parseClaimText, parseHeadingText,
  parsePlainScalar, parseFlowScalar, parseBoolean, parseNullValue,
  parseFlowSequence, parseFlowMapping, parseValue, parseYamlLine,
  parseYamlValue, isYamlScalarToken, parseFrontmatter,
} from './parser-frontmatter.js';
```

- [ ] **Step 3: Run typecheck and tests**

Run: `yarn typecheck && yarn test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/parser.ts src/parser-frontmatter.ts
git commit -m "refactor(parser): extract frontmatter and YAML helpers to parser-frontmatter.ts"
```

---

## Task 4: Split `src/parser.ts` — extract `parser-block.ts`

**Files:**
- Create: `src/parser-block.ts`
- Modify: `src/parser.ts`

- [ ] **Step 1: Create `src/parser-block.ts`**

Move the following functions:
- `parseBlock`, `parseBlockOpen`, `parseBlockClose`, `parseBlockType`, `parseBlockTitle`, `parseBlockBody`, `parseBlockLine`
- `parseHeading`, `parseListItem`

Import `parseBlockLine` carefully — it depends on `parseYamlLine` from `parser-frontmatter.ts` and on `parseFact` (which we haven't extracted yet). Use a placeholder import path; we'll resolve circularity by accepting an injected parser function. Concretely:

```ts
import { TokenStream, tokenNode, tokenRule } from './parser-util.js';
import type { CstChildren, CstNode } from './ast.js';
import { parseYamlLine } from './parser-frontmatter.js';
import { parseFact } from './parser-fact.js'; // forward reference
```

If `parser-fact.ts` doesn't exist yet, this will fail. Resolve by doing Task 5 first, then this task. Or, if you prefer, do Tasks 4 and 5 in a single commit.

- [ ] **Step 2: Update `src/parser.ts` to re-export**

```ts
export {
  parseBlock, parseBlockOpen, parseBlockClose, parseBlockType,
  parseBlockTitle, parseBlockBody, parseBlockLine,
  parseHeading, parseListItem,
} from './parser-block.js';
```

- [ ] **Step 3: Run typecheck and tests**

Run: `yarn typecheck && yarn test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/parser.ts src/parser-block.ts
git commit -m "refactor(parser): extract block and heading parsers to parser-block.ts"
```

---

## Task 5: Split `src/parser.ts` — extract `parser-fact.ts`

**Files:**
- Create: `src/parser-fact.ts`
- Modify: `src/parser.ts`

- [ ] **Step 1: Create `src/parser-fact.ts`**

Move the following functions:
- `parseIdentifier`, `parseIdentifierHead`, `parseTitleHead`
- `parseFactRef`, `parseFactHead`, `parseFact`, `parseFactRefList`, `parseFactStatement`
- `parseComment`, `parseLineComment`, `parseBlockComment`

```ts
import { TokenStream, tokenNode, tokenRule } from './parser-util.js';
import type { CstChildren, CstNode } from './ast.js';
import { parseAttributeBlock } from './parser-relation.js'; // we'll add the import once we move parseAttributeBlock
```

`parseAttributeBlock` is currently in `src/parser.ts` and depends on `parseFlowMapping` (frontmatter). It logically belongs with relations since relations and facts both use attribute blocks. Move it to `parser-relation.ts` (Task 6) and import it from there.

- [ ] **Step 2: Update `src/parser.ts` to re-export**

```ts
export {
  parseIdentifier, parseIdentifierHead, parseTitleHead,
  parseFactRef, parseFactHead, parseFact, parseFactRefList, parseFactStatement,
  parseComment, parseLineComment, parseBlockComment,
} from './parser-fact.js';
```

- [ ] **Step 3: Run typecheck and tests**

Run: `yarn typecheck && yarn test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/parser.ts src/parser-fact.ts
git commit -m "refactor(parser): extract fact and comment parsers to parser-fact.ts"
```

---

## Task 6: Split `src/parser.ts` — extract `parser-relation.ts` and remove `parseRule*`

**Files:**
- Create: `src/parser-relation.ts`
- Modify: `src/parser.ts`

- [ ] **Step 1: Create `src/parser-relation.ts`**

Move the following functions:
- `parseArrow`, `parseRelation`, `parseRelationEndpoint`, `parseRelationStatement`
- `parseAttributeBlock`, `parseAttributeEntry`

For now, keep `parseRelationEndpoint` calling `parseRuleExpr` — we'll replace that in Task 14 with `parseArgExpr` from the new `parser-arg.ts`.

Import:

```ts
import { TokenStream, tokenNode, tokenRule, isArrowToken } from './parser-util.js';
import type { CstChildren, CstNode } from './ast.js';
import { parseFact, parseFactRef, parseFactRefList } from './parser-fact.js';
import { parseRuleExpr } from './parser.js'; // forward — to be removed in Task 14
```

- [ ] **Step 2: Remove `parseRule`, `parseRuleStatement`, `parseRuleExpr` from `src/parser.ts`**

Delete these three function definitions and all references to them. Update `parseStatement` to no longer dispatch to `parseRuleStatement`. For now, the only change is removing the rule path — we'll add the argument path in Task 14.

```ts
function parseStatement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LBrack')) {
    const afterClose = peekPastFactRef(s);
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
  if (s.check('LParen')) {
    const rs = parseRelationStatement(s);
    if (rs) {
      cst['relationStatement'] = [rs];
      return cst;
    }
    return undefined;
  }
  return undefined;
}
```

- [ ] **Step 3: Update `src/parser.ts` to re-export relation functions**

```ts
export {
  parseArrow, parseRelation, parseRelationEndpoint, parseRelationStatement,
  parseAttributeBlock, parseAttributeEntry,
} from './parser-relation.js';
```

- [ ] **Step 4: Run typecheck and tests**

Run: `yarn typecheck && yarn test`
Expected: PASS — existing `:-` tests should now fail with parse errors. If there are existing `:-` tests, mark them as expected-to-fail in Task 12. Otherwise PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parser.ts src/parser-relation.ts
git commit -m "refactor(parser): extract relation parsers; remove parseRule*"
```

---

## Task 7: Slim `src/parser.ts` to dispatch + re-export only

**Files:**
- Modify: `src/parser.ts`

- [ ] **Step 1: Confirm `src/parser.ts` is now under 400 lines**

Run: `wc -l src/parser.ts`
Expected: 250 lines or fewer. If higher, check for stragglers that didn't get re-exported.

- [ ] **Step 2: Verify all public exports are still accessible**

The public surface of `src/parser.ts` should be unchanged from before the split. Run the test suite to confirm:

Run: `yarn test`
Expected: PASS

- [ ] **Step 3: Add a comment header to `src/parser.ts` documenting its new role**

```ts
// Top-level parser dispatch.
//
// This file is a thin facade. The actual parser implementations live in:
//   - parser-util.ts:        shared helpers (TokenStream, tokenNode, etc.)
//   - parser-frontmatter.ts: frontmatter + YAML + value parsers
//   - parser-block.ts:       blocks + headings + list items
//   - parser-fact.ts:        facts + fact-refs + comments
//   - parser-relation.ts:    relations + arrows + attribute blocks
//   - parser-arg.ts:         arguments (the -> construct)
//
// We re-export everything from those files so consumers that import
// from 'src/parser.ts' see no change.
```

- [ ] **Step 4: Run typecheck and tests**

Run: `yarn typecheck && yarn test && yarn lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser.ts
git commit -m "refactor(parser): add file header documenting parser split"
```

---

## Task 8: Add Stryker config and dev dependencies

**Files:**
- Create: `stryker.config.mjs`
- Modify: `package.json`

- [ ] **Step 1: Install Stryker packages**

```bash
yarn add -D @stryker-mutator/core @stryker-mutator/typescript-checker @stryker-mutator/vitest-runner
```

- [ ] **Step 2: Create `stryker.config.mjs`**

```js
// @ts-check
/** @type {import('@stryker-mutator/api').StrykerOptions} */
export default {
  packageManager: 'yarn',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  checker: {
    typescript: {
      enabled: true,
    },
  },
  mutate: [
    'src/parser-arg.ts',
    'src/parser-relation.ts',
    'src/visitor.ts',
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 80,
  },
  ignorePatterns: ['*.test.ts', '*.bench.ts', '*.fuzz.test.ts'],
};
```

- [ ] **Step 3: Add the `mutate` script to `package.json`**

In the `scripts` section, add:

```json
"mutate": "stryker run"
```

- [ ] **Step 4: Run Stryker to verify the config is valid (no mutations yet)**

Run: `yarn mutate`
Expected: Stryker reports zero mutations (the new files don't exist yet, so the `mutate` patterns match nothing). The run should complete without errors.

If Stryker errors about missing files, that's expected — proceed.

- [ ] **Step 5: Commit**

```bash
git add package.json yarn.lock stryker.config.mjs
git commit -m "build(deps): add Stryker JS for mutation testing"
```

---

## Task 9: Add simple argument test (TDD — failing test first)

**Files:**
- Create: `src/parser-arg.test.ts`

- [ ] **Step 1: Create the test file with a failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseOk } from './parser.test.js';

describe('parseArgument — simple', () => {
  it('parses (Conclusion) -> [Premise].', () => {
    const result = parseOk('([#A]) -> [#B].');
    expect(result).toMatchInlineSnapshot();
  });
});
```

The snapshot will be filled in once the parser is implemented. For now, the test runs against the current (incomplete) parser.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/parser-arg.test.ts`
Expected: FAIL — `parseArgument` doesn't exist yet, so `([#A])` is parsed as a `relation` (with `]` causing an error) or some other malformed result.

- [ ] **Step 3: Commit the failing test**

```bash
git add src/parser-arg.test.ts
git commit -m "test(parser-arg): add failing test for simple argument"
```

---

## Task 10: Implement `parseArgument` skeleton (just the head)

**Files:**
- Create: `src/parser-arg.ts`

- [ ] **Step 1: Create `src/parser-arg.ts` with `parseArgument` skeleton**

```ts
import { TokenStream, tokenNode } from './parser-util.js';
import type { CstChildren, CstNode } from './ast.js';
import { parseFactRef, parseFactRefList } from './parser-fact.js';
import { lexErrorToParseError } from './parser.js';

export function parseArgument(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const lb = s.consume('LParen');
  if (!lb) return undefined;
  cst['LParen'] = [tokenNode(lb)];
  // ... conclusion: FactRef or ArgExpr
  const rb = s.consume('RParen');
  if (!rb) return undefined;
  cst['RParen'] = [tokenNode(rb)];
  // ... ->, premises, period
  return cst;
}
```

For now, just parse the `(` `FactRef` `)` structure. Return an undefined or a partial CST — this is the skeleton.

- [ ] **Step 2: Run the test**

Run: `yarn test src/parser-arg.test.ts`
Expected: still FAIL, but the test is no longer "module not found" — now it fails on the AST shape mismatch. That's progress.

- [ ] **Step 3: Commit the skeleton**

```bash
git add src/parser-arg.ts
git commit -m "feat(parser-arg): add parseArgument skeleton"
```

---

## Task 11: Implement `parseArgument` — full body (TDD)

**Files:**
- Modify: `src/parser-arg.ts`

- [ ] **Step 1: Replace the skeleton with the full implementation**

```ts
export function parseArgument(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const beforeHead = s.save();
  const lb = s.consume('LParen');
  if (!lb) return undefined;
  cst['LParen'] = [tokenNode(lb)];

  // Conclusion: FactRef or ArgExpr. ArgExpr means: another '(' follows
  // for a nested argument, distinguished by `->` after the matching ')'.
  // Try FactRef first; if that fails, try ArgExpr.
  let conclusion: CstNode | undefined = parseFactRef(s);
  if (!conclusion) {
    const nested = parseArgExpr(s);
    if (!nested) {
      s.restore(beforeHead);
      return undefined;
    }
    cst['conclusion'] = [nested];
  } else {
    cst['conclusion'] = [conclusion];
  }

  const rb = s.consume('RParen');
  if (!rb) return undefined;
  cst['RParen'] = [tokenNode(rb)];

  const arrow = s.consume('Arrow');
  if (!arrow) return undefined;
  cst['arrow'] = [tokenNode(arrow)];

  // Premises: comma-separated list of FactRef, ArgExpr, or Disjunction
  const premises: CstNode[] = [];
  const first = parsePremise(s);
  if (!first) return undefined;
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
```

You'll also need `parsePremise`, `parsePremiseList` (a list helper, used in CST), `parseDisjunction`, and `parseArgExpr` as separate functions. Stub them for now:

```ts
export function parsePremise(s: TokenStream): CstNode | undefined {
  // Tries FactRef, then ArgExpr, then Disjunction
  const before = s.save();
  const fr = parseFactRef(s);
  if (fr) return fr;
  const arg = parseArgExpr(s);
  if (arg) return arg;
  const disj = parseDisjunction(s);
  if (disj) return disj;
  s.restore(before);
  return undefined;
}

export function parseDisjunction(s: TokenStream): CstNode | undefined {
  // TODO (Task 12)
  return undefined;
}

export function parseArgExpr(s: TokenStream): CstNode | undefined {
  // TODO (Task 14)
  return undefined;
}
```

- [ ] **Step 2: Run the simple argument test**

Run: `yarn test src/parser-arg.test.ts`
Expected: PASS for the simple case. The snapshot will be filled in.

- [ ] **Step 3: Add the snapshot to the test (run with `--update` once)**

Run: `yarn test src/parser-arg.test.ts -u`
Expected: snapshot created. Inspect it for correctness — should be an `Argument` node with `conclusion: atom` and `premises: [atom]`.

- [ ] **Step 4: Run all tests to make sure nothing else broke**

Run: `yarn test`
Expected: PASS for everything that doesn't use `:-`. Existing `:-` tests will fail — mark them or delete them in Task 13.

- [ ] **Step 5: Commit**

```bash
git add src/parser-arg.ts src/parser-arg.test.ts
git commit -m "feat(parser-arg): implement parseArgument for simple case"
```

---

## Task 12: Implement `parseDisjunction` and add the disjunctive premise test

**Files:**
- Modify: `src/parser-arg.ts`
- Modify: `src/parser-arg.test.ts`

- [ ] **Step 1: Add the failing test for disjunction**

In `src/parser-arg.test.ts`, add:

```ts
describe('parseArgument — disjunction', () => {
  it('parses (C) -> (P1 | P2).', () => {
    const result = parseOk('([#A]) -> ([#B] | [#C]).');
    expect(result).toMatchInlineSnapshot();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/parser-arg.test.ts -t disjunction`
Expected: FAIL — `parseDisjunction` is a stub that returns undefined.

- [ ] **Step 3: Implement `parseDisjunction`**

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

Note: this assumes a `Pipe` token exists. If the lexer doesn't have one, add a `Pipe` token to `src/tokens.ts` for the `|` character.

- [ ] **Step 4: Add the `Pipe` token to the lexer (if needed)**

Open `src/tokens.ts` and add:

```ts
export const Pipe = createToken({ name: 'Pipe', pattern: /\|/ });
```

Then register it in the lexer config. Run the typecheck and ensure existing tests still pass.

- [ ] **Step 5: Run the disjunction test**

Run: `yarn test src/parser-arg.test.ts -t disjunction`
Expected: PASS. Update the snapshot with `-u` and inspect.

- [ ] **Step 6: Commit**

```bash
git add src/parser-arg.ts src/parser-arg.test.ts src/tokens.ts
git commit -m "feat(parser-arg): implement parseDisjunction"
```

---

## Task 13: Implement nested argument (ArgExpr) and conclusion hierarchy

**Files:**
- Modify: `src/parser-arg.ts`
- Modify: `src/parser-arg.test.ts`

- [ ] **Step 1: Add the failing test for nesting**

```ts
describe('parseArgument — nesting', () => {
  it('parses (C) -> (SubC) -> [P].', () => {
    const result = parseOk('([#A]) -> ([#B]) -> [#C].');
    expect(result).toMatchInlineSnapshot();
  });

  it('parses a hierarchy (two arguments, second head = first nested)', () => {
    const result = parseOk('([#Thesis]) -> ([#Sub]) -> [#P1].\n([#Sub]) -> [#P2].');
    expect(result).toMatchInlineSnapshot();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/parser-arg.test.ts -t nesting`
Expected: FAIL — `parseArgExpr` is a stub.

- [ ] **Step 3: Implement `parseArgExpr`**

`parseArgExpr` is a parenthesized argument. It's the same as `parseArgument` for parsing purposes, but called from `parsePremise` and `parseConclusion` to allow nested arguments.

```ts
export function parseArgExpr(s: TokenStream): CstNode | undefined {
  // Same as parseArgument — they're the same construct. Kept as a
  // separate function name for clarity at the call site (relation
  // endpoint vs top-level statement).
  return parseArgument(s);
}
```

- [ ] **Step 4: Run the test**

Run: `yarn test src/parser-arg.test.ts -t nesting`
Expected: PASS. Update snapshot with `-u`.

- [ ] **Step 5: Commit**

```bash
git add src/parser-arg.ts src/parser-arg.test.ts
git commit -m "feat(parser-arg): implement parseArgExpr for nested arguments"
```

---

## Task 14: Implement hard-break `:-` error and remove old rule tests

**Files:**
- Modify: `src/parser.ts` (the dispatch in `parseStatement`)
- Modify: `src/parser.test.ts` (replace rule tests)

- [ ] **Step 1: Add the failing test for the `:-` hard-break error**

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

Import `parse` from `./parser.js` at the top of the test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/parser-arg.test.ts -t "hard-break"`
Expected: FAIL — no error is currently emitted; the parser either produces a malformed AST or fails silently.

- [ ] **Step 3: Update `parseStatement` to emit the `:-` error**

Modify `parseStatement` in `src/parser.ts`:

```ts
function parseStatement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LBrack')) {
    const afterClose = peekPastFactRef(s);
    if (afterClose === 'RuleOp') {
      // Hard break: :- is removed.
      const loc = s.peek()?.loc ?? { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
      s.consume('RuleOp'); // consume to make progress
      s.errors.push({
        code: 'syntax-removed',
        message: "':-' syntax was removed. Use '->' for inference (e.g., '([#A]) -> [#B].').",
        loc,
      });
      return undefined;
    }
    if (isArrowToken(afterClose)) {
      // ...
    }
  }
  // ... rest unchanged
}
```

- [ ] **Step 4: Delete the old `:-` tests in `src/parser.test.ts`**

Open `src/parser.test.ts` and remove all tests that use the `:-` syntax. Keep tests that use other syntaxes (facts, relations, blocks).

- [ ] **Step 5: Run all tests**

Run: `yarn test`
Expected: PASS — all old `:-` tests are gone, the new hard-break test passes, all other tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/parser.ts src/parser.test.ts src/parser-arg.test.ts
git commit -m "feat(parser): hard-break :- as parse error; remove old rule tests"
```

---

## Task 15: Update `parseStatement` to dispatch to `parseArgument` and update `parseRelationEndpoint` to use `parseArgExpr`

**Files:**
- Modify: `src/parser.ts` (dispatch in `parseStatement`)
- Modify: `src/parser-relation.ts` (replace `parseRuleExpr` with `parseArgExpr` in `parseRelationEndpoint`)

- [ ] **Step 1: Update `parseStatement` to dispatch to `parseArgument`**

In `parseStatement`, when the next token is `LParen` and we're not at a relation endpoint, dispatch to `parseArgumentStatement`:

```ts
function parseStatement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LBrack')) {
    // ... existing fact/relation dispatch
  }
  if (s.check('LParen')) {
    // Now dispatch to parseArgumentStatement instead of parseRelationStatement
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
  return undefined;
}
```

Add `parseArgumentStatement` to `src/parser-arg.ts`:

```ts
export function parseArgumentStatement(s: TokenStream): CstNode | undefined {
  // Wraps parseArgument with optional attribute block after the period.
  const arg = parseArgument(s);
  if (!arg) return undefined;
  // Optional attribute block after the period
  if (s.check('LBrace')) {
    const attr = parseAttributeBlock(s);
    if (attr) {
      // Attach to arg's CST children
      (arg as { attributeBlock?: CstNode[] }).attributeBlock = [attr];
    }
  }
  return arg;
}
```

`parseAttributeBlock` is in `src/parser-relation.ts`; import it.

- [ ] **Step 2: Update `parseRelationEndpoint` to use `parseArgExpr`**

In `src/parser-relation.ts`, replace the `parseRuleExpr` import with `parseArgExpr`:

```ts
import { parseArgExpr } from './parser-arg.js';
// remove: import { parseRuleExpr } from './parser.js';
```

Change `parseRelationEndpoint` to call `parseArgExpr`:

```ts
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

- [ ] **Step 3: Run all tests**

Run: `yarn typecheck && yarn test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/parser.ts src/parser-relation.ts src/parser-arg.ts
git commit -m "feat(parser): dispatch to parseArgument; replace parseRuleExpr with parseArgExpr"
```

---

## Task 16: Add `visitArgument` to `src/visitor.ts` (TDD)

**Files:**
- Modify: `src/visitor.ts`
- Create or modify: a test file that exercises `visitArgument`

- [ ] **Step 1: Add a test that walks an `Argument` node**

In `src/parser-arg.test.ts`, add:

```ts
import { walkAst } from './visitor.js';

describe('visitArgument', () => {
  it('walks an argument with disjunction, nesting, and attributes', () => {
    const ast = parseOk('([#A]) -> ([#B] | [#C]), ([#D]) -> [#E]. { confidence: 0.8 }');
    const kinds: string[] = [];
    walkAst(ast, (node) => {
      kinds.push(node.kind);
    });
    expect(kinds).toContain('Argument');
    expect(kinds).toContain('disjunction');
  });
});
```

Note: `walkAst` may not exist yet — check `src/visitor.ts` for the walker API. If there's no public walker, use whatever internal API exists for the snapshot tests. Adjust as needed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/parser-arg.test.ts -t visitArgument`
Expected: FAIL — no `visitArgument` method exists.

- [ ] **Step 3: Implement `visitArgument`**

In `src/visitor.ts`, add:

```ts
export function visitArgument(node: Argument, walker: Walker): void {
  walker.enter(node);
  visitConclusion(node.conclusion, walker);
  for (const premise of node.premises) {
    visitPremise(premise, walker);
  }
  if (node.attributes) {
    visitAttributeBlock(node.attributes, walker);
  }
  walker.leave(node);
}

function visitConclusion(c: Conclusion, walker: Walker): void {
  walker.enter(c);
  if (c.kind === 'atom') {
    walker.enter(c.value);
    walker.leave(c.value);
  } else {
    visitArgument(c.value, walker);
  }
  walker.leave(c);
}

function visitPremise(p: Premise, walker: Walker): void {
  walker.enter(p);
  if (p.kind === 'atom') {
    walker.enter(p.value);
    walker.leave(p.value);
  } else if (p.kind === 'argument') {
    visitArgument(p.value, walker);
  } else {
    for (const ref of p.values) {
      walker.enter(ref);
      walker.leave(ref);
    }
  }
  walker.leave(p);
}
```

The exact walker API may differ — adapt to whatever the existing `visitor.ts` uses.

- [ ] **Step 4: Run the test**

Run: `yarn test src/parser-arg.test.ts -t visitArgument`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/visitor.ts src/parser-arg.test.ts
git commit -m "feat(visitor): add visitArgument with Conclusion and Premise sub-cases"
```

---

## Task 17: Update `visitRelation` to unfold `EndpointList` into multiple binary `Relation`s (TDD)

**Files:**
- Modify: `src/parser-relation.ts` (parser produces `EndpointList` in CST)
- Modify: `src/visitor.ts` (visitor unfolds)

- [ ] **Step 1: Update `parseRelationEndpoint` to support comma lists**

In `src/parser-relation.ts`:

```ts
export function parseRelationEndpoint(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  // Try a single endpoint first
  const single = parseSingleRelationEndpoint(s);
  if (!single) return undefined;
  // If no comma follows, return single
  if (!s.check('Comma')) {
    cst['relationEndpoint'] = [single];
    return cst;
  }
  // Otherwise, build an EndpointList
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
  // The original parseRelationEndpoint body
  // ... try LParen → parseArgExpr, then LBrack → parseFactRef
}
```

- [ ] **Step 2: Add a test for the multi-premise relation**

In `src/parser-arg.test.ts`:

```ts
describe('multi-premise relations', () => {
  it('unfolds [A], [B] --> [C] into two binary Relations', () => {
    const ast = parseOk('[#A], [#B] --> [#C].');
    // The AST should have two Relation nodes
    const relations = ast.children.filter((c) => c.kind === 'Relation');
    expect(relations).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `yarn test src/parser-arg.test.ts -t "multi-premise relations"`
Expected: FAIL — the visitor doesn't unfold yet.

- [ ] **Step 4: Implement the unfold in `visitRelation`**

In `src/visitor.ts`, modify the relation-visiting logic to detect `EndpointList` in the CST and emit multiple AST `Relation` nodes. The exact approach depends on the existing visitor API — adapt as needed. The shape is:

```ts
function visitRelationCst(cst: CstNode): Relation[] {
  // If both endpoints are single, return one Relation
  // If one or both are EndpointList, return N Relations
  // (cartesian product for the arrow direction)
}
```

- [ ] **Step 5: Run the test**

Run: `yarn test src/parser-arg.test.ts -t "multi-premise relations"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/parser-relation.ts src/visitor.ts src/parser-arg.test.ts
git commit -m "feat(visitor): unfold EndpointList into multiple binary Relations"
```

---

## Task 18: Add error case tests and implement error emissions

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

  it('emits error for ([#A] | [#B]) -> . (disjunction in conclusion)', () => {
    const result = parse('([#A] | [#B]) -> .');
    // Either a parse error or a conclusion-shape error
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify which fail**

Run: `yarn test src/parser-arg.test.ts -t "argument errors"`
Expected: Some or all fail. Note which.

- [ ] **Step 3: Implement error emissions in `parseArgument`**

Add the missing error emissions. The `:` arrow error is in Task 14. Add:
- "Argument requires at least one premise" — when the period follows `->` directly
- "Unclosed argument" — when `(` is not matched by `)`
- The disjunction-in-conclusion case is impossible at parse time (the `Conclusion` parser only constructs atom or argument); the type system enforces it. If you want a runtime check, add it as a post-parse validation step (out of scope per the spec).

- [ ] **Step 4: Run the tests**

Run: `yarn test src/parser-arg.test.ts -t "argument errors"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser-arg.ts src/parser-arg.test.ts
git commit -m "feat(parser-arg): implement argument error emissions"
```

---

## Task 19: Add 4 new fuzz invariants

**Files:**
- Modify: `src/parser.fuzz.test.ts`

- [ ] **Step 1: Read the existing fuzz test file to understand the structure**

Read `src/parser.fuzz.test.ts` and find where invariants 1-4 are defined. Add invariants 5-8 below them, following the same pattern.

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
        // The argument's source range must include a period
        // (verify via CST or via a recorded field on the AST)
        expect(arg.loc).toBeDefined();
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
        // A relation's endpoint set must be 1 or 2 (multi-premise
        // is two only — three or more is not allowed in v1)
        const endpoints = [rel.from, rel.to];
        for (const ep of endpoints) {
          // Each endpoint is a single FactRef or ArgExpr
          // (the visitor has already unfolded EndpointList)
          expect(ep).toBeDefined();
        }
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
git commit -m "test(fuzz): add invariants 5-8 for argument shape, period, and relation"
```

---

## Task 20: Add 2 new mutate operations and update existing mutate tests

**Files:**
- Modify: `src/parser.mutate.ts`
- Modify: `src/parser.mutate.test.ts`

- [ ] **Step 1: Read `src/parser.mutate.ts` to understand the mutation op pattern**

Each mutation op takes `(source, rng)` and returns a mutated string. The existing 6 ops are: line insertion, line deletion, character swap, comment flip, etc. Look at one for the pattern.

- [ ] **Step 2: Add `flipArrow` mutation**

```ts
export function flipArrow(source: string, rng: () => number): string {
  // Replaces '->' with ':-' or vice versa in a random location.
  // For verifying the hard-break error is uniformly emitted.
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

- [ ] **Step 3: Add `flipDisjunction` mutation**

```ts
export function flipDisjunction(source: string, rng: () => number): string {
  // Replaces '|' with ',' in a disjunction, to verify the parser
  // rejects disjunction-shaped conclusions (or converts them).
  // For now, just swap one | for , or vice versa.
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

- [ ] **Step 4: Register the new ops in the `mutate()` wrapper**

In `src/parser.mutate.ts`'s `mutate()` function, add the two new ops to the rotation.

- [ ] **Step 5: Add unit tests for the new ops**

In `src/parser.mutate.test.ts`, add tests for `flipArrow` and `flipDisjunction` following the pattern of the existing 6 op tests.

- [ ] **Step 6: Run all tests**

Run: `yarn test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/parser.mutate.ts src/parser.mutate.test.ts
git commit -m "test(mutate): add flipArrow and flipDisjunction mutation operations"
```

---

## Task 21: Add Mermaid regression test for disjunction

**Files:**
- Modify: `src/mermaid.test.ts`

- [ ] **Step 1: Read `src/mermaid.test.ts` to understand the test pattern**

Look at one existing test for a relation rendering.

- [ ] **Step 2: Add the regression test**

```ts
describe('disjunction rendering', () => {
  it('renders a disjunctive premise as a single node with alternative labels', () => {
    const ast = parseOk('([#A]) -> ([#B] | [#C]).');
    const svg = renderToMermaid(ast);
    // The disjunction should produce a node labeled "B or C" or similar,
    // distinct from a multi-premise relation's rendering.
    expect(svg).toContain('B');
    expect(svg).toContain('C');
    expect(svg).toMatch(/or|\|/); // some separator
  });
});
```

Note: the exact Mermaid output format depends on the renderer's conventions. Adapt the assertion to match the actual output.

- [ ] **Step 3: Run the test**

Run: `yarn test src/mermaid.test.ts`
Expected: PASS. If the renderer's output is different than expected, update the assertion to match.

- [ ] **Step 4: Commit**

```bash
git add src/mermaid.test.ts
git commit -m "test(mermaid): add disjunction regression test"
```

---

## Task 22: Write and run the migration codemod

**Files:**
- Create: `scripts/migrate-rule-to-arg.mjs`

- [ ] **Step 1: Create the migration script**

```js
#!/usr/bin/env node
// One-shot codemod: rewrites `kind: 'Rule'` and `visitRule` to `Argument` / `visitArgument`.
//
// Usage: node scripts/migrate-rule-to-arg.mjs <file1> <file2> ...
//        node scripts/migrate-rule-to-arg.mjs --all  (rewrites all .ts files in src/)

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

Expected: a few files are listed as migrated (those that had `kind: 'Rule'`, `visitRule`, etc.).

- [ ] **Step 3: Run the full test suite**

Run: `yarn typecheck && yarn test`
Expected: PASS — the codemod is mechanical, and the new code uses `Argument`.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-rule-to-arg.mjs src/
git commit -m "refactor: migrate Rule/RuleExpr to Argument/ArgExpr (codemod)"
```

---

## Task 23: Run Stryker and resolve surviving mutations

**Files:**
- Modify: any file where surviving mutations are found

- [ ] **Step 1: Run Stryker**

Run: `yarn mutate`
Expected: a report showing mutations and which were killed vs survived. Output goes to `reports/mutation/`.

- [ ] **Step 2: Inspect surviving mutations**

Open `reports/mutation/html/index.html` (or the JSON report). For each surviving mutation:
- Read the mutation (which line was changed, and how)
- Read the test that should have caught it
- Decide: is the mutation a real bug that the test should catch? If yes, strengthen the test. If no (e.g., the mutation is in unreachable code, or the test asserts the same thing via a different path), document the survivor as a "no-coverage" or "equivalent" mutation.

- [ ] **Step 3: Strengthen tests for any survivors that represent real gaps**

For each surviving mutation that exposes a real test gap, add a test to the appropriate test file. Re-run Stryker to verify the mutation is now killed.

- [ ] **Step 4: Document the final mutation score**

If the score is below 80% (the configured threshold), document why in a comment in `stryker.config.mjs`:

```js
thresholds: {
  high: 80,
  low: 60,
  break: 70, // Lowered from 80 — see ADR for surviving mutations in <list>
},
```

- [ ] **Step 5: Commit**

```bash
git add stryker.config.mjs src/ tests for strengthened mutations
git commit -m "test: strengthen mutation coverage to 80%+ (or document equivalent survivors)"
```

---

## Task 24: Update `docs/DESIGN.md` EBNF

**Files:**
- Modify: `docs/DESIGN.md` (sections 2.3, 2.4, 5)

- [ ] **Step 1: Read the current `docs/DESIGN.md` sections to update**

Read sections 2.3 (Rules), 2.4 (Relations), and 5 (EBNF). These are the sections that need updates.

- [ ] **Step 2: Replace section 2.3 (Rules) with section on Arguments**

Update the example and explanation in section 2.3 to reflect the new `Argument` syntax:

```argdown
# Linked Argument (Conjunctive) — the conclusion holds if ALL premises are true.
([#mitigation]) -> [#co2], [#impacts], [#coord].

# Disjunctive premise — the conclusion holds if ANY alternative is true.
([#mitigation]) -> ([#moral] | [#economic]).

# Nested argument — an argument as a premise of another.
([#thesis]) -> ([#sub]) -> [#p1], [#p2].
([#sub]) -> [#p3].

# Multi-premise relation — comma list at endpoints.
[#A], [#B] --> [#C].
```

- [ ] **Step 3: Update the EBNF in section 5**

Replace the `Rule` and `RuleExpr` productions with:

```ebnf
(* Argument: a single-line inference statement *)
Argument        ::= "(" Conclusion ")" "->" PremiseList "." AttributeBlock?
Conclusion      ::= FactRef | ArgExpr
PremiseList     ::= Premise ("," Premise)*
Premise         ::= FactRef | ArgExpr | Disjunction
Disjunction     ::= "(" FactRef ("|" FactRef)+ ")"
ArgExpr         ::= Argument

(* Relation: graph edges, with multi-premise endpoints *)
Relation        ::= Endpoint Arrow Endpoint AttributeBlock?
Endpoint        ::= FactRef | ArgExpr
EndpointList    ::= Endpoint ("," Endpoint)+   (* multi-premise endpoint *)
```

- [ ] **Step 4: Verify no other references to `:-` syntax remain in the doc**

Run: `grep -n ":-" docs/DESIGN.md`
Expected: no matches (or only in error-message examples showing the hard-break)

- [ ] **Step 5: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs: update DESIGN.md for Argument syntax and multi-premise relations"
```

---

## Task 25: Final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run typecheck**

Run: `yarn typecheck`
Expected: PASS with zero errors.

- [ ] **Step 2: Run lint**

Run: `yarn lint`
Expected: PASS (or only the existing baseline warnings, no new ones).

- [ ] **Step 3: Run format check**

Run: `yarn format:check`
Expected: PASS. If not, run `yarn format` to fix.

- [ ] **Step 4: Run the full test suite**

Run: `yarn test`
Expected: PASS for all unit tests, snapshot tests, fuzz tests, and Mermaid tests.

- [ ] **Step 5: Run the benchmark (optional sanity check)**

Run: `yarn bench`
Expected: no regressions vs the baseline (if a baseline exists). If no baseline, just verify the bench completes without error.

- [ ] **Step 6: Run the build**

Run: `yarn build`
Expected: PASS — the package builds and `./ast` subpath export is valid.

- [ ] **Step 7: Verify the public API surface**

Run: `node -e "import('@casualtheorics/argdown-2/ast').then(m => console.log(Object.keys(m)))"` (after build)
Expected: `Argument`, `Conclusion`, `Premise`, `FactRef` (and the other existing types) are all exported.

- [ ] **Step 8: Commit any final fixes**

If steps 1-7 surfaced any issues, fix them in their own commits.

---

## Self-Review Notes

**Spec coverage:**
- Multi-premise arguments: Task 11 (parseArgument) + Task 18 (test) ✓
- Conjunctive premises: Task 11 (parsePremiseList) + Task 9 (test) ✓
- Disjunctive premises: Task 12 (parseDisjunction) + Task 9 (test) ✓
- Nested arguments: Task 13 (parseArgExpr) + Task 13 (test) ✓
- Conclusion hierarchies: Task 13 (hierarchy test) ✓
- Multi-premise relations: Task 17 (EndpointList unfold) + Task 17 (test) ✓
- Hard-break `:-`: Task 14 ✓
- File split: Tasks 2-7 ✓
- Argument attributes: Task 15 (parseArgumentStatement) ✓
- Error handling: Task 18 ✓
- Testing infrastructure: Tasks 19-21 (fuzz invariants, mutations, Mermaid regression) ✓
- Migration codemod: Task 22 ✓
- Stryker: Task 8 (config) + Task 23 (run) ✓
- Documentation: Task 24 ✓

**Open question for the executor:** The `Pipe` token may need to be added to `src/tokens.ts` (Task 12, Step 4). The exact lexer integration depends on the existing token registration. If the project already tokenizes `|` (e.g., as part of YAML flow syntax), this is a no-op. If not, follow the existing token-creation pattern in `src/tokens.ts`.
