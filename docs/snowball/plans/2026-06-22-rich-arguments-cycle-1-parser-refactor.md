# Rich Arguments — Cycle 1: Parser Refactor (Behavior-Preserving)

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/parser.ts` (currently 1236 lines, over the 400-line cap) into focused files. Add the new `Argument`, `Conclusion`, `Premise` AST types (declared but unused). Add Stryker JS for mutation testing. **No behavior change** — all existing tests pass unchanged.

**Architecture:** The parser is split by responsibility: shared helpers, frontmatter, blocks, facts, relations, and (later) arguments. `parser.ts` becomes a thin dispatch + re-export shim. The new AST types are added to `src/ast.ts` but no parser code references them yet. Stryker config is set up but the `mutate` patterns target the new files (none of which exist yet, so Stryker runs with zero mutations on Cycle 1 — verifies the config works).

**Tech Stack:** TypeScript strict, Vitest (existing), Stryker JS (new dev deps). No runtime dependencies added.

**Spec:** `docs/snowball/specs/2026-06-22-rich-arguments-design.md`

**Cycle 2 (separate plan):** Adds the new `Argument` feature, removes the old `parseRule*` code, hard-breaks `:-`, updates the visitor, and runs the new tests + migration codemod. Cycle 2 ships as a major version bump.

---

## File Structure

**New files:**
- `src/parser-util.ts` — `TokenStream`, `tokenNode`, `tokenRule`, `isArrowToken`, `isNonEmptyImage`, `peekPastFactRef`
- `src/parser-frontmatter.ts` — frontmatter + YAML + value parsers
- `src/parser-block.ts` — blocks, headings, list items
- `src/parser-fact.ts` — facts, fact-refs, fact-ref-lists, identifiers, comments
- `src/parser-relation.ts` — relations, arrows, relation endpoints (still uses `parseRuleExpr` from `parser.ts` — Cycle 2 will replace)
- `stryker.config.mjs` — Stryker mutation testing config

**Modified files:**
- `src/parser.ts` — slim to dispatch + re-export shim (still contains `parseRule*` for now)
- `src/ast.ts` — add `Argument`, `Conclusion`, `Premise` types (declared but unused in Cycle 1)
- `package.json` — Stryker dev deps + `mutate` script

**Behavior preserved:** All existing tests pass. The `:-` syntax continues to work as before. The `parseRule*` functions are still in `parser.ts` (and called from `parser-relation.ts`); Cycle 2 removes them.

---

## Task 1: Add `Argument`, `Conclusion`, `Premise` types to `src/ast.ts`

**Files:**
- Modify: `src/ast.ts` (after the existing `FactRef` type)

- [ ] **Step 1: Read `src/ast.ts` to find the insertion point**

Read the file and locate the `FactRef` type definition. We'll insert the new types right after it.

- [ ] **Step 2: Add the new types**

Insert after the `FactRef` type:

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

- [ ] **Step 3: Run typecheck**

Run: `yarn typecheck`
Expected: PASS (the types are unused but valid)

- [ ] **Step 4: Commit**

```bash
git add src/ast.ts
git commit -m "feat(ast): add Argument, Conclusion, Premise types (declared, unused)"
```

---

## Task 2: Extract `src/parser-util.ts` (shared helpers)

**Files:**
- Create: `src/parser-util.ts`
- Modify: `src/parser.ts`

- [ ] **Step 1: Create `src/parser-util.ts`**

Move these definitions from `src/parser.ts`:
- The `TokenStream` class (search for `class TokenStream`)
- `tokenNode` (line 186)
- `tokenRule` (line 202)
- `isArrowToken` (line 219)
- `isNonEmptyImage` (line 244)
- `peekPastFactRef` (line 958)

The new file:

```ts
import type { IToken } from 'chevrotain';
import type { CstChildren, CstNode } from './ast.js';

export class TokenStream {
  // ... copy exact implementation
}

export function tokenNode(tok: IToken): CstNode { /* ... */ }
export function tokenRule(s: TokenStream, tokenName: string): CstNode | undefined { /* ... */ }
export function isArrowToken(name: string): boolean { /* ... */ }
export function isNonEmptyImage(tok: IToken): boolean { /* ... */ }
export function peekPastFactRef(s: TokenStream): string { /* ... */ }
```

- [ ] **Step 2: Update `src/parser.ts` to re-export from `./parser-util.ts`**

Add at the top of `src/parser.ts`:

```ts
export { TokenStream, tokenNode, tokenRule, isArrowToken, isNonEmptyImage, peekPastFactRef } from './parser-util.js';
```

Delete the moved definitions from `src/parser.ts`.

- [ ] **Step 3: Run typecheck and tests**

Run: `yarn typecheck && yarn test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/parser.ts src/parser-util.ts
git commit -m "refactor(parser): extract shared helpers to parser-util.ts"
```

---

## Task 3: Extract `src/parser-frontmatter.ts`

**Files:**
- Create: `src/parser-frontmatter.ts`
- Modify: `src/parser.ts`

- [ ] **Step 1: Create `src/parser-frontmatter.ts`**

Move these functions from `src/parser.ts`:
- `parseString`, `parseNumber`, `parseTitleText`, `parseClaimText`, `parseHeadingText`
- `parsePlainScalar`, `parseFlowScalar`, `parseBoolean`, `parseNullValue`, `parseFlowSequence`, `parseFlowMapping`
- `parseValue`, `parseYamlLine`, `parseYamlValue`, `isYamlScalarToken`
- `parseFrontmatter`

Update imports to use `./parser-util.js`.

- [ ] **Step 2: Update `src/parser.ts` to re-export**

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

## Task 4: Extract `src/parser-block.ts`

**Files:**
- Create: `src/parser-block.ts`
- Modify: `src/parser.ts`

- [ ] **Step 1: Create `src/parser-block.ts`**

Move these functions:
- `parseBlock`, `parseBlockOpen`, `parseBlockClose`, `parseBlockType`, `parseBlockTitle`, `parseBlockBody`, `parseBlockLine`
- `parseHeading`, `parseListItem`

Imports: `./parser-util.js`, `./parser-frontmatter.js` (for `parseYamlLine`), `./parser-fact.js` (forward — for `parseFact`; will resolve once Task 5 lands).

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

## Task 5: Extract `src/parser-fact.ts`

**Files:**
- Create: `src/parser-fact.ts`
- Modify: `src/parser.ts`

- [ ] **Step 1: Create `src/parser-fact.ts`**

Move these functions:
- `parseIdentifier`, `parseIdentifierHead`, `parseTitleHead`
- `parseFactRef`, `parseFactHead`, `parseFact`, `parseFactRefList`, `parseFactStatement`
- `parseComment`, `parseLineComment`, `parseBlockComment`

Imports: `./parser-util.js`, `./parser-relation.js` (forward — for `parseAttributeBlock`; resolves once Task 6 lands).

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

## Task 6: Extract `src/parser-relation.ts`

**Files:**
- Create: `src/parser-relation.ts`
- Modify: `src/parser.ts`

- [ ] **Step 1: Create `src/parser-relation.ts`**

Move these functions:
- `parseArrow`, `parseRelation`, `parseRelationEndpoint`, `parseRelationStatement`
- `parseAttributeBlock`, `parseAttributeEntry`

For now, `parseRelationEndpoint` continues to call `parseRuleExpr` from `./parser.js` (Cycle 2 will replace this with `parseArgExpr`).

```ts
import { TokenStream, tokenNode, tokenRule, isArrowToken } from './parser-util.js';
import type { CstChildren, CstNode } from './ast.js';
import { parseFact, parseFactRef, parseFactRefList } from './parser-fact.js';
import { parseRuleExpr } from './parser.js'; // forward — replaced in Cycle 2
```

- [ ] **Step 2: Update `src/parser.ts` to re-export**

```ts
export {
  parseArrow, parseRelation, parseRelationEndpoint, parseRelationStatement,
  parseAttributeBlock, parseAttributeEntry,
} from './parser-relation.js';
```

- [ ] **Step 3: Run typecheck and tests**

Run: `yarn typecheck && yarn test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/parser.ts src/parser-relation.ts
git commit -m "refactor(parser): extract relation parsers to parser-relation.ts"
```

---

## Task 7: Slim `src/parser.ts` to dispatch + re-export

**Files:**
- Modify: `src/parser.ts`

- [ ] **Step 1: Confirm `src/parser.ts` is now under 400 lines**

Run: `wc -l src/parser.ts`
Expected: 250 lines or fewer (it should contain only `parseStatement`, `parseElement`, `parseDocument`, `parse`, `formatError`, `parseRule`, `parseRuleStatement`, `parseRuleExpr`, and re-exports)

- [ ] **Step 2: Add a file header documenting the split**

```ts
// Top-level parser dispatch.
//
// This file is a thin facade. The actual parser implementations live in:
//   - parser-util.ts:        shared helpers (TokenStream, tokenNode, etc.)
//   - parser-frontmatter.ts: frontmatter + YAML + value parsers
//   - parser-block.ts:       blocks + headings + list items
//   - parser-fact.ts:        facts + fact-refs + comments
//   - parser-relation.ts:    relations + arrows + attribute blocks
//
// Cycle 2 (separate plan) adds:
//   - parser-arg.ts:         arguments (the -> construct)
//
// We re-export everything from those files so consumers that import
// from 'src/parser.ts' see no change.
```

- [ ] **Step 3: Run full verification**

Run: `yarn typecheck && yarn test && yarn lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/parser.ts
git commit -m "refactor(parser): document split; parser.ts is now a dispatch facade"
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

In the `scripts` section:

```json
"mutate": "stryker run"
```

- [ ] **Step 4: Run Stryker to verify config is valid (no mutations yet)**

Run: `yarn mutate`
Expected: Stryker runs and reports zero mutations (the mutate paths don't match any files yet). The run should complete without errors.

- [ ] **Step 5: Commit**

```bash
git add package.json yarn.lock stryker.config.mjs
git commit -m "build(deps): add Stryker JS for mutation testing (Cycle 2 will use it)"
```

---

## Cycle 1 verification

- [ ] **All existing tests pass**: `yarn test` returns success
- [ ] **Typecheck passes**: `yarn typecheck` returns success
- [ ] **Lint passes**: `yarn lint` returns success
- [ ] **Format check passes**: `yarn format:check` returns success
- [ ] **`src/parser.ts` is under 400 lines**: `wc -l src/parser.ts` reports < 400
- [ ] **Build passes**: `yarn build` returns success
- [ ] **Stryker config valid**: `yarn mutate` completes without error (zero mutations)

When all checks pass, Cycle 1 is ready to ship. Cycle 2 picks up the new `Argument` feature work.
