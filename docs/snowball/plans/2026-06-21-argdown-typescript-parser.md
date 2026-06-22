# Argdown Extended TypeScript Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a structural TypeScript parser for the Argdown Extended BNF (`docs/GRAMMAR.bnf`), producing a typed AST consumable by editor/IDE tooling.

**Architecture:** Chevrotain parser combinator with ~35 BNF-mapped rules, producing a discriminated-union AST with mandatory source positions and a discriminated-union `ParseResult`. Single public entry point: `parse(source) → ParseResult`. Flat `src/` layout with co-located tests.

**Tech Stack:** TypeScript 5.4 (ESM, Node 18+), Chevrotain 11, Vitest, oxlint (type-aware), oxfmt. Yarn 4 PnP.

**Spec:** `docs/snowball/specs/2026-06-21-argdown-typescript-parser-design.md` (source of truth for design decisions; this plan is the executable expansion).

---

## File Structure

Files created in this plan (all new, all under `src/` or repo root):

| File | Responsibility | Lines (est.) |
|---|---|---|
| `package.json` | scripts, exports, deps | 40 |
| `tsconfig.json` | strict TS, ESM, declaration emit | 25 |
| `.oxlintrc.json` | type-aware lint rules | 50 |
| `.oxfmtrc.json` | format + sortPackageJson | 8 |
| `src/ast.ts` | discriminated-union node types | 250 |
| `src/tokens.ts` | Chevrotain token vocabulary | 120 |
| `src/tokens.test.ts` | one assertion per token | 150 |
| `src/visitor.ts` | CST → AST transformation | 300 |
| `src/parser.ts` | ArgdownParser class + parse() entry + result types | 250 |
| `src/parser.test.ts` | production / error / recovery / position / example tests | 700 |
| `src/index.ts` | public API re-exports | 30 |

**Dependency direction (one-way, no cycles):**
```
index.ts → parser.ts → visitor.ts → ast.ts
              │           │
              └─→ tokens.ts
```

`ast.ts` is the leaf — pure type definitions, zero runtime imports. `tokens.ts` knows nothing about `ast.ts`. `parser.ts` imports both.

---

## Phase 0: Scaffolding

### Task 1: Project configuration and dependency installation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.oxlintrc.json`
- Create: `.oxfmtrc.json`

- [ ] **Step 1: Create `package.json`**

```jsonc
{
  "name": "@casualtheorics/argdown-2",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "yarn@4.17.0",
  "engines": { "node": ">=18" },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".":     { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./ast": { "types": "./dist/ast.d.ts",   "import": "./dist/ast.js" }
  },
  "files": ["dist"],
  "scripts": {
    "build":         "tsc",
    "typecheck":     "tsc --noEmit",
    "test":          "vitest run",
    "test:watch":    "vitest",
    "lint":          "oxlint src",
    "format":        "oxfmt src",
    "format:check":  "oxfmt --check ."
  },
  "dependencies":     { "chevrotain": "^11.0.3" },
  "devDependencies": {
    "typescript":  "^5.4.5",
    "vitest":      "^1.6.0",
    "oxlint":      "^0.6.0",
    "oxfmt":       "^0.6.0",
    "@types/node": "^20.12.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```jsonc
{
  "compilerOptions": {
    "target":                       "ES2022",
    "module":                       "NodeNext",
    "moduleResolution":             "NodeNext",
    "lib":                          ["ES2022"],
    "strict":                       true,
    "isolatedModules":              true,
    "isolatedDeclarations":         true,
    "noUncheckedIndexedAccess":     true,
    "noImplicitOverride":           true,
    "exactOptionalPropertyTypes":   true,
    "noFallthroughCasesInSwitch":   true,
    "declaration":                  true,
    "declarationMap":               true,
    "sourceMap":                    true,
    "outDir":                       "dist",
    "rootDir":                      "src",
    "skipLibCheck":                 true,
    "types":                        ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `.oxlintrc.json`**

```jsonc
{
  "typeAware": true,
  "categories": { "correctness": "error", "suspicious": "error", "perf": "warn" },
  "rules": {
    "no-floating-promises":          "error",
    "no-misused-promises":           "error",
    "await-thenable":                "error",
    "no-unsafe-assignment":          "error",
    "no-unsafe-member-access":       "error",
    "no-unsafe-call":                "error",
    "no-unsafe-return":              "error",
    "no-unnecessary-condition":      "error",
    "restrict-plus-operands":        "error",
    "restrict-template-expressions": "error",
    "no-non-null-assertion":         "error",
    "no-unused-vars":                "error",
    "no-unused-imports":             "error",
    "no-explicit-any":               "error",
    "no-console":                    "error",
    "no-default-export":             "error",
    "consistent-type-imports":       "error",
    "no-restricted-imports":         "error",
    "no-cyclic-import":              "error",
    "explicit-module-boundary-types":"error",
    "max-lines":                     ["error", { "max": 400, "skipBlankLines": true }],
    "max-lines-per-function":        ["error", { "max": 80 }],
    "max-params":                    ["error", { "max": 5 }],
    "max-depth":                     ["error", { "max": 3 }],
    "no-magic-numbers":              "error",
    "no-duplicate-imports":          "error",
    "perfectionist/sort-imports":          ["error", { "groups": ["builtin", "external", "internal", ["parent", "sibling", "index"]], "newlinesBetween": "always" }],
    "perfectionist/sort-named-imports":    ["error", { "groups": ["side-effect", "multiple", "single", "type"] }],
    "perfectionist/sort-exports":          ["error", { "groups": ["side-effect", "multiple", "single", "type"] }],
    "perfectionist/sort-object-properties":["error", { "order": "asc" }]
  },
  "ignorePatterns": ["dist", "node_modules", ".pnp.cjs"]
}
```

- [ ] **Step 4: Create `.oxfmtrc.json`**

```jsonc
{
  "singleQuote":     true,
  "trailingComma":   "all",
  "printWidth":      100,
  "sortPackageJson": true
}
```

- [ ] **Step 5: Install dependencies**

Run: `yarn install`
Expected: PnP installs all dependencies, no `node_modules/` created. `yarn.lock` updated.

- [ ] **Step 6: Verify toolchain**

Run each:
- `yarn typecheck` → exits 0 (no files yet, but should work)
- `yarn lint` → exits 0
- `yarn format:check` → exits 0
- `yarn test` → exits 0 (no tests yet, vitest reports "no tests found")
- `yarn build` → creates `dist/` (empty since no source files)

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .oxlintrc.json .oxfmtrc.json yarn.lock .gitignore
git commit -m "Scaffold argdown-2 parser project with TS, Vitest, oxlint, oxfmt"
```

---

## Phase 1: AST types

### Task 2: Define the AST type tree

**Files:**
- Create: `src/ast.ts`

- [ ] **Step 1: Create `src/ast.ts` with all type definitions**

```typescript
// src/ast.ts
// Discriminated-union AST node types for Argdown Extended.
// Pure types — no runtime imports, no logic. The leaf of the dep graph.

// ----- Shared -----

export type Position = {
  line: number;     // 1-indexed (IDE convention)
  column: number;   // 1-indexed
  offset: number;   // 0-indexed (UTF-16 code unit)
};

export type SourceLocation = {
  start: Position;
  end: Position;
};

export interface BaseNode {
  loc: SourceLocation;
}

// ----- Top-level -----

export type Document = {
  kind: 'Document';
  frontmatter?: Frontmatter;
  elements: Element[];
  loc: SourceLocation;
};

export type Element =
  | Heading
  | Block
  | FactStatement
  | RuleStatement
  | RelationStatement
  | LineComment
  | BlockComment;

// ----- Frontmatter -----

export type Frontmatter = {
  kind: 'Frontmatter';
  entries: Record<string, Value>;
  loc: SourceLocation;
};

// ----- Heading -----

export type Heading = {
  kind: 'Heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  loc: SourceLocation;
};

// ----- Block -----

export type BlockType = 'meta' | 'evidence' | 'position' | 'stakeholder' | 'domain';

export type BlockTitle = {
  kind: 'BlockTitle';
  text: string;
  loc: SourceLocation;
};

export type Block = {
  kind: 'Block';
  type: BlockType;
  title?: BlockTitle;
  body: BlockLine[];
  loc: SourceLocation;
};

export type BlockLine = YamlLine | ListItem | Element;

export type ListItem = {
  kind: 'ListItem';
  fact: Fact;
  loc: SourceLocation;
};

// ----- Fact -----

export type FactStatement = {
  kind: 'FactStatement';
  fact: Fact;
  loc: SourceLocation;
};

export type Fact = {
  kind: 'Fact';
  ref: FactRef;
  claimText?: string;
  attributes?: AttributeBlock;
  loc: SourceLocation;
};

export type FactRef = {
  kind: 'FactRef';
  head: FactHead;
  loc: SourceLocation;
};

export type FactHead = IdentifierHead | TitleHead;

export type IdentifierHead = {
  kind: 'IdentifierHead';
  identifier: string;
  loc: SourceLocation;
};

export type TitleHead = {
  kind: 'TitleHead';
  title: string;
  loc: SourceLocation;
};

// ----- Rule -----

export type RuleStatement = {
  kind: 'RuleStatement';
  rule: Rule;
  loc: SourceLocation;
};

export type Rule = {
  kind: 'Rule';
  ref: FactRef;
  premises: FactRef[];
  loc: SourceLocation;
};

// ----- Relation -----

export type Arrow =
  | 'support'
  | 'attack'
  | 'undercut'
  | 'undermine'
  | 'concession'
  | 'qualification'
  | 'equivalence';

export type RelationStatement = {
  kind: 'RelationStatement';
  relation: Relation;
  loc: SourceLocation;
};

export type Relation = {
  kind: 'Relation';
  from: RelationEndpoint;
  arrow: Arrow;
  to: RelationEndpoint;
  attributes?: AttributeBlock;
  loc: SourceLocation;
};

export type RelationEndpoint = FactRef | RuleExpr;

export type RuleExpr = {
  kind: 'RuleExpr';
  rule: Rule;
  loc: SourceLocation;
};

// ----- Attributes -----

export type AttributeBlock = {
  kind: 'AttributeBlock';
  entries: Record<string, Value>;
  loc: SourceLocation;
};

// ----- Comments -----

export type LineComment = {
  kind: 'LineComment';
  text: string;
  loc: SourceLocation;
};

export type BlockComment = {
  kind: 'BlockComment';
  text: string;
  loc: SourceLocation;
};

// ----- Values -----

export type Value =
  | StringValue
  | NumberValue
  | BooleanValue
  | NullValue
  | FlowSequence
  | FlowMapping
  | FlowScalar;

export type StringValue = {
  kind: 'StringValue';
  value: string;
  loc: SourceLocation;
};

export type NumberValue = {
  kind: 'NumberValue';
  value: number;
  loc: SourceLocation;
};

export type BooleanValue = {
  kind: 'BooleanValue';
  value: boolean;
  loc: SourceLocation;
};

export type NullValue = {
  kind: 'NullValue';
  loc: SourceLocation;
};

export type FlowSequence = {
  kind: 'FlowSequence';
  items: Value[];
  loc: SourceLocation;
};

export type FlowMapping = {
  kind: 'FlowMapping';
  entries: Record<string, Value>;
  loc: SourceLocation;
};

export type FlowScalar = {
  kind: 'FlowScalar';
  text: string;
  loc: SourceLocation;
};

// ----- YAML -----

export type YamlLine = {
  kind: 'YamlLine';
  key: string;
  value: YamlValue;
  loc: SourceLocation;
};

export type YamlValue = FlowSequence | StringValue | PlainScalar | null;

export type PlainScalar = {
  kind: 'PlainScalar';
  text: string;
  loc: SourceLocation;
};
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS. `ast.ts` is pure types — no runtime to execute.

- [ ] **Step 3: Commit**

```bash
git add src/ast.ts
git commit -m "Define AST type tree for Argdown parser"
```

---

## Phase 2: Token vocabulary

### Task 3: Define the token vocabulary

**Files:**
- Create: `src/tokens.ts`

- [ ] **Step 1: Create `src/tokens.ts` with all token definitions**

```typescript
// src/tokens.ts
// Chevrotain token vocabulary for Argdown Extended.

import { createToken, Lexer } from 'chevrotain';

// ----- Multi-character operators (longest match wins) -----

export const RuleOp = createToken({ name: 'RuleOp', pattern: /:-/ });
export const Support = createToken({ name: 'Support', pattern: /-->/ });
export const Attack = createToken({ name: 'Attack', pattern: /--x/ });
export const Undercut = createToken({ name: 'Undercut', pattern: /-\.->/ });
export const Undermine = createToken({ name: 'Undermine', pattern: /-\.-/ });
export const Concession = createToken({ name: 'Concession', pattern: /~>/ });
export const Qualification = createToken({ name: 'Qualification', pattern: /\?>/ });
export const Equivalence = createToken({ name: 'Equivalence', pattern: /<->/ });
export const FrontmatterDelim = createToken({ name: 'FrontmatterDelim', pattern: /===/ });
export const BlockMarker = createToken({ name: 'BlockMarker', pattern: /:::/ });
// Line comment: // followed by anything except newline (captures the whole line).
export const LineCommentTok = createToken({
  name: 'LineComment',
  pattern: /\/\/[^\n\r]*/,
});

// Block comment: /* ... */  (non-greedy; can span lines).
export const BlockCommentTok = createToken({
  name: 'BlockComment',
  pattern: /\/\*[\s\S]*?\*\//,
});
export const HeadingMarker = createToken({
  name: 'HeadingMarker',
  pattern: /#{1,6}/,
  start_chars_hint: ['#'],
});

// ----- Keywords (higher priority than Identifier) -----

export const True = createToken({ name: 'True', pattern: /true/ });
export const False = createToken({ name: 'False', pattern: /false/ });
export const Null = createToken({ name: 'Null', pattern: /null/ });
export const Meta = createToken({ name: 'Meta', pattern: /meta/ });
export const Evidence = createToken({ name: 'Evidence', pattern: /evidence/ });
export const PositionKw = createToken({ name: 'Position', pattern: /position/ });
export const Stakeholder = createToken({ name: 'Stakeholder', pattern: /stakeholder/ });
export const Domain = createToken({ name: 'Domain', pattern: /domain/ });

// ----- Composite literals -----

export const Identifier = createToken({
  name: 'Identifier',
  pattern: /[a-zA-Z0-9_-]+/,
});

export const Number = createToken({
  name: 'Number',
  pattern: /-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/,
});

export const StringTok = createToken({
  name: 'String',
  pattern: /"(?:[^"\\]|\\.)*"/,
});

// ----- Text runs -----

export const TitleText = createToken({
  name: 'TitleText',
  // First char: not # [ ] LF CR. Rest: not [ ] LF CR.
  // We accept anything then post-validate in the parser.
  pattern: /[^\[\]\n\r#][^\[\]\n\r]*/,
  start_chars_hint: Array.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"\'`'),
});

export const ClaimText = createToken({
  name: 'ClaimText',
  // First char: not space/tab/LF/CR/{/}/[/]/(/)/#/:/"/-/~/?/</,/.
  // Rest: not {/}/LF/CR.
  pattern: /[^\s\n\r{}\[\]()#:.~?<,\-][^{}\n\r]*/,
  start_chars_hint: Array.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_="\''),
});

export const HeadingText = createToken({
  name: 'HeadingText',
  pattern: /[^\n\r]*/,
  start_chars_hint: Array.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"\'`'),
});

export const PlainScalar = createToken({
  name: 'PlainScalar',
  pattern: /[^\n\r]+/,
  start_chars_hint: Array.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"\'`'),
});

export const FlowScalar = createToken({
  name: 'FlowScalar',
  pattern: /[^,[\]{}\n\r]+/,
  start_chars_hint: Array.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"\'`'),
});

// ----- Single-character punctuation -----

export const LBrack = createToken({ name: 'LBrack', pattern: /\[/ });
export const RBrack = createToken({ name: 'RBrack', pattern: /\]/ });
export const LBrace = createToken({ name: 'LBrace', pattern: /\{/ });
export const RBrace = createToken({ name: 'RBrace', pattern: /\}/ });
export const LParen = createToken({ name: 'LParen', pattern: /\(/ });
export const RParen = createToken({ name: 'RParen', pattern: /\)/ });
export const Colon = createToken({ name: 'Colon', pattern: /:/ });
export const Comma = createToken({ name: 'Comma', pattern: /,/ });
export const Period = createToken({ name: 'Period', pattern: /\./ });
export const Dash = createToken({ name: 'Dash', pattern: /-/ });
export const Minus = createToken({ name: 'Minus', pattern: /-/ });  // used in list items; same as Dash
export const Plus = createToken({ name: 'Plus', pattern: /\+/ });

// ----- Whitespace (skipped) -----

export const Whitespace = createToken({
  name: 'Whitespace',
  pattern: /[ \t]+/,
  group: Lexer.SKIPPED,
});

export const Newline = createToken({
  name: 'Newline',
  pattern: /\r\n|\r|\n/,
  group: Lexer.SKIPPED,
});

// ----- Order matters: longest match first within a start char -----
// Chevrotain uses longest match by default, but explicit ordering is clearer.

export const allTokens = [
  // Multi-char operators
  RuleOp, Support, Attack, Undercut, Undermine, Concession, Qualification, Equivalence,
  FrontmatterDelim, BlockMarker, LineCommentTok, BlockCommentTok,
  HeadingMarker,
  // Keywords (must come before Identifier for these strings)
  True, False, Null, Meta, Evidence, PositionKw, Stakeholder, Domain,
  // String before Identifier to allow leading digits in escaped strings? No — strings start with ".
  // Actually order: String is fine here because it starts with ".
  StringTok,
  // Punctuation that could prefix numbers
  Minus, Plus,
  // Numbers
  Number,
  // Identifiers
  Identifier,
  // Text runs (catch-all-ish for long runs)
  TitleText, ClaimText, HeadingText, PlainScalar, FlowScalar,
  // Single-char punctuation
  LBrack, RBrack, LBrace, RBrace, LParen, RParen, Colon, Comma, Period, Dash,
  // Whitespace (always last, always skipped)
  Whitespace, Newline,
];

export const ArgdownLexer = new Lexer(allTokens, {
  // Track line/column for source positions
  positionTracking: 'full',
  ensureOptimizations: true,
});

export function tokenize(source: string) {
  return ArgdownLexer.tokenize(source);
}
```

> **Note on `Minus` vs `Dash`:** The BNF has only one `-` character, but it serves as both a number sign and a list-item marker. We declare both tokens with the same pattern — Chevrotain will pick the one declared first (`Minus` for numbers, `Dash` for list items). In practice, we treat them as a single token at the parser level; the split is internal to the token vocabulary.

- [ ] **Step 2: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS. Some `isolatedDeclarations` errors may surface for non-exported items; fix by adding explicit types or exporting only what's needed. Most internal helpers in this file are exports.

- [ ] **Step 3: Commit**

```bash
git add src/tokens.ts
git commit -m "Define Chevrotain token vocabulary for Argdown parser"
```

---

### Task 4: Write token tests

**Files:**
- Create: `src/tokens.test.ts`

- [ ] **Step 1: Create `src/tokens.test.ts`**

```typescript
// src/tokens.test.ts
// One assertion per token: lex a short input, verify the token type and image.

import { describe, it, expect } from 'vitest';

import { ArgdownLexer } from './tokens';

const lexOne = (source: string) => {
  const result = ArgdownLexer.tokenize(source);
  expect(result.errors).toEqual([]);
  const first = result.tokens[0];
  if (!first) throw new Error(`no tokens for input: ${JSON.stringify(source)}`);
  return first;
};

describe('token vocabulary', () => {
  // ----- Multi-character operators -----

  it('lexes RuleOp (":-")', () => {
    expect(lexOne(':-').tokenType.name).toBe('RuleOp');
  });

  it('lexes Support ("-->")', () => {
    expect(lexOne('-->').tokenType.name).toBe('Support');
  });

  it('lexes Attack ("--x")', () => {
    expect(lexOne('--x').tokenType.name).toBe('Attack');
  });

  it('lexes Undercut ("-.->")', () => {
    expect(lexOne('-.->').tokenType.name).toBe('Undercut');
  });

  it('lexes Undermine ("-.-")', () => {
    expect(lexOne('-.-').tokenType.name).toBe('Undermine');
  });

  it('lexes Concession ("~>")', () => {
    expect(lexOne('~>').tokenType.name).toBe('Concession');
  });

  it('lexes Qualification ("?>")', () => {
    expect(lexOne('?>').tokenType.name).toBe('Qualification');
  });

  it('lexes Equivalence ("<->")', () => {
    expect(lexOne('<->').tokenType.name).toBe('Equivalence');
  });

  it('lexes FrontmatterDelim ("===")', () => {
    expect(lexOne('===').tokenType.name).toBe('FrontmatterDelim');
  });

  it('lexes BlockMarker (":::")', () => {
    expect(lexOne(':::').tokenType.name).toBe('BlockMarker');
  });

  it('lexes LineComment ("//..." capturing body)', () => {
    const t = lexOne('// foo bar');
    expect(t.tokenType.name).toBe('LineComment');
    expect(t.image).toBe('// foo bar');
  });

  it('lexes BlockComment ("/* ... */" capturing body, can span lines)', () => {
    const t = lexOne('/* hi\nthere */');
    expect(t.tokenType.name).toBe('BlockComment');
    expect(t.image).toBe('/* hi\nthere */');
  });

  it('lexes HeadingMarker with 1-6 hashes', () => {
    expect(lexOne('#').tokenType.name).toBe('HeadingMarker');
    expect(lexOne('######').tokenType.name).toBe('HeadingMarker');
  });

  // ----- Keywords -----

  it.each(['true', 'false', 'null', 'meta', 'evidence', 'position', 'stakeholder', 'domain'])(
    'lexes keyword "%s"',
    (kw) => {
      expect(lexOne(kw).tokenType.name).toBe(kw[0]!.toUpperCase() + kw.slice(1));
    },
  );

  // ----- Composite literals -----

  it('lexes Identifier', () => {
    const t = lexOne('foo_bar-123');
    expect(t.tokenType.name).toBe('Identifier');
    expect(t.image).toBe('foo_bar-123');
  });

  it('lexes integer Number', () => {
    expect(lexOne('42').tokenType.name).toBe('Number');
  });

  it('lexes negative Number', () => {
    expect(lexOne('-3.14').tokenType.name).toBe('Number');
  });

  it('lexes Number with exponent', () => {
    expect(lexOne('1.5e-3').tokenType.name).toBe('Number');
  });

  it('lexes String with escapes', () => {
    const t = lexOne('"hello \\"world\\""');
    expect(t.tokenType.name).toBe('String');
    expect(t.image).toBe('"hello \\"world\\""');
  });

  // ----- Single-character punctuation -----

  it.each(['[', ']', '{', '}', '(', ')', ':', ',', '.', '-'])(
    'lexes punctuation "%s"',
    (ch) => {
      expect(lexOne(ch).tokenType.name).toBe(
        ch === ':' ? 'Colon'
        : ch === ',' ? 'Comma'
        : ch === '.' ? 'Period'
        : ch === '-' ? 'Minus'
        : ch === '[' ? 'LBrack'
        : ch === ']' ? 'RBrack'
        : ch === '{' ? 'LBrace'
        : ch === '}' ? 'RBrace'
        : ch === '(' ? 'LParen'
        : 'RParen',
      );
    },
  );

  // ----- Whitespace is skipped -----

  it('skips whitespace', () => {
    const result = ArgdownLexer.tokenize('   \t  ');
    expect(result.tokens).toHaveLength(0);
  });

  it('skips newlines', () => {
    const result = ArgdownLexer.tokenize('\n\r\n');
    expect(result.tokens).toHaveLength(0);
  });

  // ----- Longest-match precedence -----

  it('prefers ":::" over "::"', () => {
    expect(lexOne(':::').tokenType.name).toBe('BlockMarker');
  });

  it('prefers ":-" over ":"', () => {
    expect(lexOne(':-').tokenType.name).toBe('RuleOp');
  });

  it('prefers "===" over "=="', () => {
    expect(lexOne('===').tokenType.name).toBe('FrontmatterDelim');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `yarn test src/tokens.test.ts`
Expected: All ~30 tests PASS.

- [ ] **Step 3: If any fail, fix the token definitions**

Common issues:
- `start_chars_hint` is missing on a text-run token → fix by adding it
- A keyword isn't recognized → check the ordering (keywords must come before `Identifier`)
- Punctuation conflicts with operators → check the `allTokens` array order

- [ ] **Step 4: Commit**

```bash
git add src/tokens.test.ts
git commit -m "Test token vocabulary lexes every BNF terminal"
```

---

## Phase 3: Parser implementation

### Task 5: Parser skeleton and parse() entry point

**Files:**
- Create: `src/parser.ts`

- [ ] **Step 1: Create `src/parser.ts` with the parser class skeleton and result types**

```typescript
// src/parser.ts
// ArgdownParser: Chevrotain-based parser for Argdown Extended.

import { CstParser } from 'chevrotain';

import type { Document } from './ast';
import { allTokens } from './tokens';

// ----- Result types -----

export type ParseErrorCode =
  | 'parse.mismatchedToken'
  | 'parse.noViableAlternative'
  | 'parse.notAllInputParsed'
  | 'parse.earlyExit'
  | 'parse.unexpectedToken'
  | 'parse.invalidStringEscape'
  | 'parse.invalidNumber'
  | 'parse.unterminatedString'
  | 'parse.unterminatedBlockComment'
  | 'parse.unclosedFrontmatter';

export type ParseError = {
  code: ParseErrorCode;
  message: string;
  severity: 'error' | 'warning';
  loc: { line: number; column: number; offset: number };
  expected?: string[];
  found?: string;
};

export type ParseOptions = {
  filename?: string;
  maxErrors?: number;
};

export type ParseResult =
  | { ok: true;  ast: Document;        errors: ParseError[] }
  | { ok: false; errors: ParseError[]; partial?: Document };

// ----- Parser class -----

export class ArgdownParser extends CstParser {
  constructor() {
    super(allTokens, {
      recoveryEnabled: true,
      maxLookahead: 3,
    });

    const $ = this;

    // RULES WILL BE ADDED IN SUBSEQUENT TASKS
    $.RULE('document', () => {
      // placeholder
    });
  }
}

export function formatError(err: ParseError, filename = '<anonymous>'): string {
  return `${filename}:${err.loc.line}:${err.loc.column}: ${err.message}`;
}

export function parse(source: string, options: ParseOptions = {}): ParseResult {
  // Implementation in Task 18.
  throw new Error('parse() not yet implemented');
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS. The `parse()` stub throws at runtime, but typecheck passes.

- [ ] **Step 3: Commit**

```bash
git add src/parser.ts
git commit -m "Add ArgdownParser class skeleton and ParseResult types"
```

---

### Task 6: Document and element rules (the top-level structure)

**Files:**
- Modify: `src/parser.ts` (replace the `document` rule stub)

- [ ] **Step 1: Replace the parser class with the document + element rules**

```typescript
// In src/parser.ts, replace the entire class body with:

export class ArgdownParser extends CstParser {
  constructor() {
    super(allTokens, {
      recoveryEnabled: true,
      maxLookahead: 3,
    });

    const $ = this;

    // ----- Top-level structure -----

    $.RULE('document', () => {
      $.OPTION(() => $.SUBRULE($.frontmatter));
      $.MANY({
        GATE: () => this.LA(1).tokenType !== this.EOF,  // prevent infinite loop
        DEF: () => $.SUBRULE($.element),
      });
    });

    $.RULE('element', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.blankLine) },
        { ALT: () => $.SUBRULE($.comment) },
        { ALT: () => $.SUBRULE($.heading) },
        { ALT: () => $.SUBRULE($.block) },
        { ALT: () => $.SUBRULE($.statement) },
      ]);
    });

    // The `statement` rule disambiguates fact / rule / relation.
    $.RULE('statement', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.ruleStatement) },
        { ALT: () => $.SUBRULE($.relationStatement) },
        { ALT: () => $.SUBRULE($.factStatement) },
      ]);
    });

    // Placeholder rules — defined in later tasks
    $.RULE('frontmatter', () => {});
    $.RULE('blankLine', () => { $.CONSUME(this.EOF); });
    $.RULE('comment', () => {});
    $.RULE('heading', () => {});
    $.RULE('block', () => {});
    $.RULE('factStatement', () => {});
    $.RULE('ruleStatement', () => {});
    $.RULE('relationStatement', () => {});
  }
}
```

> **Note:** The `blankLine` placeholder always consumes EOF, which makes the `MANY` in `document` stop. Once `blankLine` is properly implemented in Task 18, it'll consume newlines (which are skipped) plus the next token — but since newlines are skipped, it'll only match on the first non-newline token. For now, this is a stub that prevents compile errors.

- [ ] **Step 2: Verify it compiles**

Run: `yarn typecheck`
Expected: PASS. The `isolatedDeclarations` option requires every rule method to have an explicit return type — the Chevrotain library types should provide this via the `RULE` decorator.

- [ ] **Step 3: Commit**

```bash
git add src/parser.ts
git commit -m "Add document and element rules with OR disambiguation"
```

---

### Task 7: Terminal-consuming rules (identifier, string, number, text runs, punctuation)

**Files:**
- Modify: `src/parser.ts` (add terminal rules)

- [ ] **Step 1: Add terminal rules to the parser class**

```typescript
// Append to the constructor body, after the existing rules:

    // ----- Terminals -----

    $.RULE('identifier', () => {
      $.CONSUME(Identifier);
    });

    $.RULE('string', () => {
      $.CONSUME(StringTok);
    });

    $.RULE('number', () => {
      $.CONSUME(Number);
    });

    $.RULE('titleText', () => {
      $.CONSUME(TitleText);
    });

    $.RULE('claimText', () => {
      $.CONSUME(ClaimText);
    });

    $.RULE('headingText', () => {
      $.CONSUME(HeadingText);
    });

    $.RULE('plainScalar', () => {
      $.CONSUME(PlainScalar);
    });

    $.RULE('flowScalar', () => {
      $.CONSUME(FlowScalar);
    });
```

- [ ] **Step 2: Add the missing token imports**

At the top of `src/parser.ts`, update the import:

```typescript
import {
  allTokens,
  Identifier,
  StringTok,
  Number,
  TitleText,
  ClaimText,
  HeadingText,
  PlainScalar,
  FlowScalar,
} from './tokens';
```

- [ ] **Step 3: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/parser.ts
git commit -m "Add terminal-consuming rules to ArgdownParser"
```

---

### Task 8: Fact-head, fact-ref, comment, and blank-line rules

**Files:**
- Modify: `src/parser.ts` (add fact-ref family and comments)

- [ ] **Step 1: Add the new rules**

```typescript
// Append to the constructor body:

    // ----- Fact refs and heads -----

    $.RULE('factRef', () => {
      $.CONSUME(LBrack);
      $.SUBRULE($.factHead);
      $.CONSUME(RBrack);
    });

    $.RULE('factHead', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.identifierHead) },
        { ALT: () => $.SUBRULE($.titleHead) },
      ]);
    });

    $.RULE('identifierHead', () => {
      $.CONSUME(Hash);  // "#"
      $.SUBRULE($.identifier);
    });

    $.RULE('titleHead', () => {
      $.SUBRULE($.titleText);
    });

    // ----- Comments -----

    $.RULE('comment', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.lineComment) },
        { ALT: () => $.SUBRULE($.blockComment) },
      ]);
    });

    $.RULE('lineComment', () => {
      $.CONSUME(LineCommentTok);
    });

    $.RULE('blockComment', () => {
      $.CONSUME(BlockCommentTok);
    });

    // ----- Blank line (no tokens; matched by absence of meaningful content) -----
    // Since newlines are skipped, a "blank line" is matched when the next token
    // is EOF OR starts a new logical element after a gap. For now, we no-op:
    $.RULE('blankLine', () => { /* matches no tokens */ });
```

- [ ] **Step 2: Add the new token imports**

Update the import at the top of `src/parser.ts`:

```typescript
import {
  allTokens,
  Identifier, StringTok, Number,
  TitleText, ClaimText, HeadingText, PlainScalar, FlowScalar,
  LBrack, RBrack, LBrace, RBrace, LParen, RParen,
  Colon, Comma, Period, Dash, Minus, Plus,
  Hash,            // ← NEW: need to add to tokens.ts if not present
  LineCommentTok, BlockCommentTok,
} from './tokens';
```

- [ ] **Step 3: Add the `Hash` token to `src/tokens.ts`**

Insert after `HeadingMarker` and before `True`:

```typescript
// Single "#" — used for fact-ref heads (the "#id" in "[#id]")
export const Hash = createToken({ name: 'Hash', pattern: /#/ });
```

And add `Hash` to the `allTokens` array, right after `HeadingMarker`.

- [ ] **Step 4: Verify it compiles and token tests still pass**

Run: `yarn typecheck && yarn test src/tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parser.ts src/tokens.ts
git commit -m "Add fact-ref, fact-head, and comment rules to ArgdownParser"
```

---

### Task 9: Value, attribute-block, and attribute-entry rules

**Files:**
- Modify: `src/parser.ts`

- [ ] **Step 1: Add the new rules**

```typescript
// Append to the constructor body:

    // ----- Values -----

    $.RULE('value', () => {
      $.OR9([
        { ALT: () => $.SUBRULE($.string) },
        { ALT: () => $.SUBRULE($.number) },
        { ALT: () => $.SUBRULE($.boolean) },
        { ALT: () => $.SUBRULE($.nullValue) },
        { ALT: () => $.SUBRULE($.flowSequence) },
        { ALT: () => $.SUBRULE($.flowMapping) },
        { ALT: () => $.SUBRULE($.flowScalar) },
      ]);
    });

    $.RULE('boolean', () => {
      $.OR([
        { ALT: () => $.CONSUME(True) },
        { ALT: () => $.CONSUME(False) },
      ]);
    });

    $.RULE('nullValue', () => {
      $.CONSUME(Null);
    });

    $.RULE('flowSequence', () => {
      $.CONSUME(LBrack);
      $.MANY_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.value),
      });
      $.CONSUME(RBrack);
    });

    $.RULE('flowMapping', () => {
      $.CONSUME(LBrace);
      $.MANY_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.attributeEntry),
      });
      $.CONSUME(RBrace);
    });

    // ----- Attribute blocks -----

    $.RULE('attributeBlock', () => {
      $.CONSUME(LBrace);
      $.MANY_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.attributeEntry),
      });
      $.CONSUME(RBrace);
    });

    $.RULE('attributeEntry', () => {
      $.SUBRULE($.identifier);
      $.CONSUME(Colon);
      $.SUBRULE($.value);
    });
```

> **Note on `OR9`:** Chevrotain requires `OR1` through `OR10` to avoid label conflicts. We're using `OR9` to leave room for later additions. The other `OR`s are `OR1` (default), `OR2`, etc., assigned in order of use.

- [ ] **Step 2: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/parser.ts
git commit -m "Add value, attribute-block, and attribute-entry rules"
```

---

### Task 10: Fact and fact-statement rules

**Files:**
- Modify: `src/parser.ts`

- [ ] **Step 1: Add the new rules**

```typescript
// Append to the constructor body:

    // ----- Facts -----

    $.RULE('fact', () => {
      $.SUBRULE($.factRef);
      $.OPTION1(() => $.SUBRULE($.claimText));
      $.OPTION2(() => $.SUBRULE($.attributeBlock));
    });

    $.RULE('factStatement', () => {
      $.SUBRULE($.fact);
    });
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/parser.ts
git commit -m "Add fact and fact-statement rules"
```

---

### Task 11: Rule, fact-ref-list, and rule-statement rules

**Files:**
- Modify: `src/parser.ts`

- [ ] **Step 1: Add the new rules**

```typescript
// Append to the constructor body:

    // ----- Rules -----

    $.RULE('rule', () => {
      $.SUBRULE($.factRef);
      $.CONSUME(RuleOp);
      $.SUBRULE($.factRefList);
      $.CONSUME(Period);
    });

    $.RULE('factRefList', () => {
      $.SUBRULE($.factRef);
      $.MANY({
        DEF: () => {
          $.CONSUME(Comma);
          $.SUBRULE($.factRef);
        },
      });
    });

    $.RULE('ruleStatement', () => {
      $.SUBRULE($.rule);
    });
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/parser.ts
git commit -m "Add rule, fact-ref-list, and rule-statement rules"
```

---

### Task 12: Relation, relation-endpoint, rule-expr, arrow, relation-statement rules

**Files:**
- Modify: `src/parser.ts`

- [ ] **Step 1: Add the new rules**

```typescript
// Append to the constructor body:

    // ----- Relations -----

    $.RULE('relation', () => {
      $.SUBRULE($.relationEndpoint);
      $.SUBRULE($.arrow);
      $.SUBRULE($.relationEndpoint);
      $.OPTION3(() => $.SUBRULE($.attributeBlock));
    });

    $.RULE('relationEndpoint', () => {
      $.OR3([
        { ALT: () => $.SUBRULE($.factRef) },
        { ALT: () => $.SUBRULE($.ruleExpr) },
      ]);
    });

    $.RULE('ruleExpr', () => {
      $.CONSUME(LParen);
      $.SUBRULE($.factRef);
      $.CONSUME(RuleOp);
      $.SUBRULE($.factRefList);
      $.CONSUME(RParen);
    });

    $.RULE('arrow', () => {
      $.OR4([
        { ALT: () => $.CONSUME(Support,         { LABEL: 'arrow' }) },
        { ALT: () => $.CONSUME(Attack,          { LABEL: 'arrow' }) },
        { ALT: () => $.CONSUME(Undercut,        { LABEL: 'arrow' }) },
        { ALT: () => $.CONSUME(Undermine,       { LABEL: 'arrow' }) },
        { ALT: () => $.CONSUME(Concession,      { LABEL: 'arrow' }) },
        { ALT: () => $.CONSUME(Qualification,   { LABEL: 'arrow' }) },
        { ALT: () => $.CONSUME(Equivalence,     { LABEL: 'arrow' }) },
      ]);
    });

    $.RULE('relationStatement', () => {
      $.SUBRULE($.relation);
    });
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/parser.ts
git commit -m "Add relation, relation-endpoint, rule-expr, arrow rules"
```

---

### Task 13: Heading rule

**Files:**
- Modify: `src/parser.ts`

- [ ] **Step 1: Add the heading rule**

```typescript
// Append to the constructor body:

    $.RULE('heading', () => {
      $.CONSUME(HeadingMarker);
      $.OPTION5(() => $.SUBRULE($.headingText));
    });
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/parser.ts
git commit -m "Add heading rule"
```

---

### Task 14: List-item, yaml-line, yaml-value rules

**Files:**
- Modify: `src/parser.ts`

- [ ] **Step 1: Add the new rules**

```typescript
// Append to the constructor body:

    // ----- List items -----

    $.RULE('listItem', () => {
      $.CONSUME(Dash);
      $.SUBRULE($.fact);
    });

    // ----- YAML -----

    $.RULE('yamlLine', () => {
      $.SUBRULE($.identifier);
      $.CONSUME(Colon);
      $.OPTION6(() => $.SUBRULE($.yamlValue));
    });

    $.RULE('yamlValue', () => {
      $.OR5([
        { ALT: () => $.SUBRULE($.flowSequence) },
        { ALT: () => $.SUBRULE($.string) },
        { ALT: () => $.SUBRULE($.plainScalar) },
      ]);
    });
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/parser.ts
git commit -m "Add list-item, yaml-line, yaml-value rules"
```

---

### Task 15: Block family rules

**Files:**
- Modify: `src/parser.ts`

- [ ] **Step 1: Add the block rules**

```typescript
// Append to the constructor body:

    // ----- Blocks -----

    $.RULE('block', () => {
      $.SUBRULE($.blockOpen);
      $.SUBRULE($.blockBody);
      $.SUBRULE($.blockClose);
    });

    $.RULE('blockOpen', () => {
      $.CONSUME(BlockMarker);
      $.SUBRULE($.blockType);
      $.OPTION7(() => $.SUBRULE($.blockTitle));
    });

    $.RULE('blockClose', () => {
      $.CONSUME(BlockMarker);
    });

    $.RULE('blockType', () => {
      $.OR6([
        { ALT: () => $.CONSUME(Meta) },
        { ALT: () => $.CONSUME(Evidence) },
        { ALT: () => $.CONSUME(PositionKw) },
        { ALT: () => $.CONSUME(Stakeholder) },
        { ALT: () => $.CONSUME(Domain) },
      ]);
    });

    $.RULE('blockTitle', () => {
      $.CONSUME(LBrack);
      $.SUBRULE($.titleText);
      $.CONSUME(RBrack);
    });

    $.RULE('blockBody', () => {
      $.MANY({
        GATE: () => this.LA(1).tokenType !== BlockMarker && this.LA(1).tokenType !== this.EOF,
        DEF: () => $.SUBRULE($.blockLine),
      });
    });

    $.RULE('blockLine', () => {
      $.OR7([
        { ALT: () => $.SUBRULE($.yamlLine) },
        { ALT: () => $.SUBRULE($.listItem) },
        { ALT: () => $.SUBRULE($.element) },
      ]);
    });
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/parser.ts
git commit -m "Add block family rules"
```

---

### Task 16: Frontmatter rule

**Files:**
- Modify: `src/parser.ts`

- [ ] **Step 1: Add the frontmatter rule**

```typescript
// Append to the constructor body:

    $.RULE('frontmatter', () => {
      $.CONSUME(FrontmatterDelim);
      $.MANY({
        GATE: () => this.LA(1).tokenType !== FrontmatterDelim && this.LA(1).tokenType !== this.EOF,
        DEF: () => $.SUBRULE($.yamlLine),
      });
      $.CONSUME(FrontmatterDelim);
    });
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/parser.ts
git commit -m "Add frontmatter rule"
```

---

### Task 17: CST-to-AST visitor (separate file)

**Files:**
- Create: `src/visitor.ts`

- [ ] **Step 1: Create `src/visitor.ts` with the CST-to-AST transformation**

```typescript
// src/visitor.ts
// Walks the Chevrotain CST and produces the typed AST.

import type {
  Document, Frontmatter, Heading, Block, BlockTitle, ListItem,
  FactStatement, RuleStatement, RelationStatement,
  Fact, FactRef, FactHead, IdentifierHead, TitleHead,
  Rule, Relation, RelationEndpoint, RuleExpr, Arrow,
  AttributeBlock, Value, StringValue, NumberValue, BooleanValue, NullValue,
  FlowSequence, FlowMapping, FlowScalar,
  YamlLine, YamlValue, PlainScalar,
  LineComment, BlockComment, BlockType, Element,
  SourceLocation,
} from './ast';

// ----- CST shape (loose runtime type; the parser produces this from any rule) -----

type CstNode = { image?: string; tokenType?: { name: string } } & Record<string, unknown>;
type CstChildren = Record<string, CstNode[] | unknown[] | undefined>;

type TokenLike = {
  image: string;
  startOffset?: number;
  endOffset?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
};

// ----- Helpers -----

function pickFirst<T>(arr: T[] | undefined): T | undefined {
  return arr?.[0];
}

function locFromTokens(tokens: TokenLike[]): SourceLocation {
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  if (!first || !last) {
    return { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };
  }
  return {
    start: { line: first.startLine ?? 1, column: first.startColumn ?? 1, offset: first.startOffset ?? 0 },
    end:   { line: last.endLine ?? 1,     column: (last.endColumn ?? 1) + 1, offset: (last.endOffset ?? 0) + 1 },
  };
}

function collectAllTokens(cst: CstChildren): TokenLike[] {
  const out: TokenLike[] = [];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (typeof obj['image'] === 'string' && obj['tokenType'] !== undefined) {
      out.push(obj as unknown as TokenLike);
      return;
    }
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(cst);
  return out;
}

function arrowName(tokName: string): Arrow {
  switch (tokName) {
    case 'Support':       return 'support';
    case 'Attack':        return 'attack';
    case 'Undercut':      return 'undercut';
    case 'Undermine':     return 'undermine';
    case 'Concession':    return 'concession';
    case 'Qualification': return 'qualification';
    case 'Equivalence':   return 'equivalence';
    default: throw new Error(`unknown arrow token: ${tokName}`);
  }
}

function blockTypeName(tokName: string): BlockType {
  switch (tokName) {
    case 'Meta':        return 'meta';
    case 'Evidence':    return 'evidence';
    case 'Position':    return 'position';
    case 'Stakeholder': return 'stakeholder';
    case 'Domain':      return 'domain';
    default: throw new Error(`unknown block type token: ${tokName}`);
  }
}

function decodeString(s: string): string {
  const inner = s.slice(1, -1);
  return inner
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\\//g, '/')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeNumber(s: string): number {
  return Number(s);
}

// ----- Value visitor -----

function makeValueNode(cst: CstChildren): Value {
  const stringChild = pickFirst(cst['string'] as CstNode[]);
  if (stringChild) {
    const tok = stringChild.image ?? '';
    return { kind: 'StringValue', value: decodeString(tok), loc: locFromTokens([stringChild as TokenLike]) };
  }
  const numberChild = pickFirst(cst['number'] as CstNode[]);
  if (numberChild) {
    const tok = numberChild.image ?? '';
    return { kind: 'NumberValue', value: decodeNumber(tok), loc: locFromTokens([numberChild as TokenLike]) };
  }
  const boolChild = pickFirst(cst['boolean'] as CstNode[]);
  if (boolChild) {
    const tok = boolChild.image ?? '';
    return { kind: 'BooleanValue', value: tok === 'true', loc: locFromTokens([boolChild as TokenLike]) };
  }
  const nullChild = pickFirst(cst['nullValue'] as CstNode[]);
  if (nullChild) {
    return { kind: 'NullValue', loc: locFromTokens([nullChild as TokenLike]) };
  }
  const seqChild = pickFirst(cst['flowSequence'] as CstNode[]);
  if (seqChild) return visitFlowSequence(seqChild as CstChildren);
  const mapChild = pickFirst(cst['flowMapping'] as CstNode[]);
  if (mapChild) return visitFlowMapping(mapChild as CstChildren);
  const scalarChild = pickFirst(cst['flowScalar'] as CstNode[]);
  if (scalarChild) {
    const tok = scalarChild.image ?? '';
    return { kind: 'FlowScalar', text: tok, loc: locFromTokens([scalarChild as TokenLike]) };
  }
  throw new Error('value rule matched no alternative');
}

function visitFlowSequence(cst: CstChildren): FlowSequence {
  const items = ((cst['value'] as CstNode[]) ?? []).map((v) => makeValueNode(v as CstChildren));
  return { kind: 'FlowSequence', items, loc: locFromTokens(collectAllTokens(cst)) };
}

function visitFlowMapping(cst: CstChildren): FlowMapping {
  const entries: Record<string, Value> = {};
  for (const entry of (cst['attributeEntry'] as CstNode[]) ?? []) {
    const child = entry as CstChildren;
    const idSub = pickFirst(child['identifier'] as CstNode[]);
    const valSub = pickFirst(child['value'] as CstNode[]);
    if (!idSub || !valSub) continue;
    const key = idSub.image ?? '';
    entries[key] = makeValueNode(valSub as CstChildren);
  }
  return { kind: 'FlowMapping', entries, loc: locFromTokens(collectAllTokens(cst)) };
}

// ----- Top-level -----

function visitDocument(cst: CstChildren): Document {
  const frontmatterChild = pickFirst(cst['frontmatter'] as CstNode[]) as CstChildren | undefined;
  const elementChildren = (cst['element'] as CstNode[]) ?? [];
  const elements = elementChildren
    .map((e) => visitElement(e as CstChildren))
    .filter((e): e is Element => e !== undefined);
  return {
    kind: 'Document',
    frontmatter: frontmatterChild ? visitFrontmatter(frontmatterChild) : undefined,
    elements,
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitFrontmatter(cst: CstChildren): Frontmatter {
  const entries: Record<string, Value> = {};
  for (const yl of (cst['yamlLine'] as CstNode[]) ?? []) {
    const child = yl as CstChildren;
    const idSub = pickFirst(child['identifier'] as CstNode[]);
    const valSub = pickFirst(child['yamlValue'] as CstNode[]);
    if (!idSub) continue;
    const key = idSub.image ?? '';
    if (!valSub) continue;  // empty yaml value: skip the entry
    const yv = valSub as CstChildren;
    const stringChild = pickFirst(yv['string'] as CstNode[]);
    const seqChild = pickFirst(yv['flowSequence'] as CstNode[]);
    const scalarChild = pickFirst(yv['plainScalar'] as CstNode[]);
    if (stringChild) {
      const tok = stringChild.image ?? '';
      entries[key] = { kind: 'StringValue', value: decodeString(tok), loc: locFromTokens([stringChild as TokenLike]) };
    } else if (seqChild) {
      entries[key] = visitFlowSequence(seqChild as CstChildren);
    } else if (scalarChild) {
      const tok = scalarChild.image ?? '';
      entries[key] = { kind: 'PlainScalar', text: tok, loc: locFromTokens([scalarChild as TokenLike]) };
    }
  }
  return { kind: 'Frontmatter', entries, loc: locFromTokens(collectAllTokens(cst)) };
}

function visitElement(cst: CstChildren): Element | undefined {
  if (pickFirst(cst['blankLine'] as CstNode[])) return undefined;  // stripped
  const comment = pickFirst(cst['comment'] as CstNode[]);
  if (comment) return visitComment(comment as CstChildren);
  const heading = pickFirst(cst['heading'] as CstNode[]);
  if (heading) return visitHeading(heading as CstChildren);
  const block = pickFirst(cst['block'] as CstNode[]);
  if (block) return visitBlock(block as CstChildren);
  const statement = pickFirst(cst['statement'] as CstNode[]);
  if (statement) return visitStatement(statement as CstChildren);
  return undefined;
}

function visitStatement(cst: CstChildren): Element {
  const fact = pickFirst(cst['factStatement'] as CstNode[]);
  if (fact) return visitFactStatement(fact as CstChildren);
  const rule = pickFirst(cst['ruleStatement'] as CstNode[]);
  if (rule) return visitRuleStatement(rule as CstChildren);
  const rel = pickFirst(cst['relationStatement'] as CstNode[]);
  if (rel) return visitRelationStatement(rel as CstChildren);
  throw new Error('statement rule matched no alternative');
}

function visitComment(cst: CstChildren): LineComment | BlockComment {
  const line = pickFirst(cst['lineComment'] as CstNode[]);
  if (line) {
    const tokens = collectAllTokens(cst);
    const text = tokens.map((t) => t.image).join('').replace(/^\/\//, '');
    return { kind: 'LineComment', text, loc: locFromTokens(tokens) };
  }
  const block = pickFirst(cst['blockComment'] as CstNode[]);
  if (block) {
    const tokens = collectAllTokens(cst);
    const text = tokens.map((t) => t.image).join('').replace(/^\/\*|\*\/$/g, '');
    return { kind: 'BlockComment', text, loc: locFromTokens(tokens) };
  }
  throw new Error('comment rule matched no alternative');
}

function visitHeading(cst: CstChildren): Heading {
  const marker = pickFirst(cst['HeadingMarker'] as CstNode[]);
  const textNode = pickFirst(cst['headingText'] as CstNode[]);
  return {
    kind: 'Heading',
    level: (marker?.image?.length ?? 1) as 1 | 2 | 3 | 4 | 5 | 6,
    text: textNode?.image ?? '',
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitBlock(cst: CstChildren): Block {
  const tokens = collectAllTokens(cst);
  const open = pickFirst(cst['blockOpen'] as CstNode[]) as CstChildren;
  const body = pickFirst(cst['blockBody'] as CstNode[]) as CstChildren | undefined;

  const typeTok = pickFirst(open['blockType'] as CstNode[]);
  const typeName = typeTok?.tokenType?.name ?? 'Meta';

  const titleChild = pickFirst(open['blockTitle'] as CstNode[]);
  let title: BlockTitle | undefined;
  if (titleChild) {
    const t = pickFirst((titleChild as CstChildren)['titleText'] as CstNode[]);
    if (t?.image !== undefined) {
      title = { kind: 'BlockTitle', text: t.image, loc: locFromTokens([t as TokenLike]) };
    }
  }

  const bodyLines: Block['body'] = [];
  if (body) {
    for (const line of (body['blockLine'] as CstNode[]) ?? []) {
      const child = line as CstChildren;
      const yl = pickFirst(child['yamlLine'] as CstNode[]);
      if (yl) {
        bodyLines.push(visitYamlLine(yl as CstChildren));
        continue;
      }
      const li = pickFirst(child['listItem'] as CstNode[]);
      if (li) {
        const l = visitListItem(li as CstChildren);
        if (l) bodyLines.push(l);
        continue;
      }
      const el = pickFirst(child['element'] as CstNode[]);
      if (el) {
        const e = visitElement(el as CstChildren);
        if (e) bodyLines.push(e);
      }
    }
  }
  return { kind: 'Block', type: blockTypeName(typeName), title, body: bodyLines, loc: locFromTokens(tokens) };
}

function visitListItem(cst: CstChildren): ListItem | undefined {
  const factSub = pickFirst(cst['fact'] as CstNode[]);
  if (!factSub) return undefined;
  return { kind: 'ListItem', fact: visitFact(factSub as CstChildren), loc: locFromTokens(collectAllTokens(cst)) };
}

function visitYamlLine(cst: CstChildren): YamlLine {
  const idSub = pickFirst(cst['identifier'] as CstNode[]);
  const valSub = pickFirst(cst['yamlValue'] as CstNode[]);
  let value: YamlValue = null;
  if (valSub) {
    const yv = valSub as CstChildren;
    const stringChild = pickFirst(yv['string'] as CstNode[]);
    const seqChild = pickFirst(yv['flowSequence'] as CstNode[]);
    const scalarChild = pickFirst(yv['plainScalar'] as CstNode[]);
    if (stringChild) {
      const tok = stringChild.image ?? '';
      value = { kind: 'StringValue', value: decodeString(tok), loc: locFromTokens([stringChild as TokenLike]) };
    } else if (seqChild) {
      value = visitFlowSequence(seqChild as CstChildren);
    } else if (scalarChild) {
      const tok = scalarChild.image ?? '';
      value = { kind: 'PlainScalar', text: tok, loc: locFromTokens([scalarChild as TokenLike]) };
    }
  }
  return { kind: 'YamlLine', key: idSub?.image ?? '', value, loc: locFromTokens(collectAllTokens(cst)) };
}

function visitFactStatement(cst: CstChildren): FactStatement {
  return {
    kind: 'FactStatement',
    fact: visitFact(pickFirst(cst['fact'] as CstNode[]) as CstChildren),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitFact(cst: CstChildren): Fact {
  const refSub = pickFirst(cst['factRef'] as CstNode[]);
  const claimSub = pickFirst(cst['claimText'] as CstNode[]);
  const attrSub = pickFirst(cst['attributeBlock'] as CstNode[]);
  return {
    kind: 'Fact',
    ref: visitFactRef(refSub as CstChildren),
    claimText: claimSub?.image,
    attributes: attrSub ? visitAttributeBlock(attrSub as CstChildren) : undefined,
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitFactRef(cst: CstChildren): FactRef {
  return {
    kind: 'FactRef',
    head: visitFactHead(pickFirst(cst['factHead'] as CstNode[]) as CstChildren),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitFactHead(cst: CstChildren): FactHead {
  const idSub = pickFirst(cst['identifierHead'] as CstNode[]);
  if (idSub) {
    const id = pickFirst((idSub as CstChildren)['identifier'] as CstNode[]);
    return { kind: 'IdentifierHead', identifier: id?.image ?? '', loc: locFromTokens(collectAllTokens(idSub as CstChildren)) };
  }
  const titleSub = pickFirst(cst['titleHead'] as CstNode[]);
  if (titleSub) {
    const t = pickFirst((titleSub as CstChildren)['titleText'] as CstNode[]);
    return { kind: 'TitleHead', title: t?.image ?? '', loc: locFromTokens(collectAllTokens(titleSub as CstChildren)) };
  }
  throw new Error('factHead matched no alternative');
}

function visitRuleStatement(cst: CstChildren): RuleStatement {
  return {
    kind: 'RuleStatement',
    rule: visitRule(pickFirst(cst['rule'] as CstNode[]) as CstChildren),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitRule(cst: CstChildren): Rule {
  const refSub = pickFirst(cst['factRef'] as CstNode[]);
  const listSub = pickFirst(cst['factRefList'] as CstNode[]);
  const premises: FactRef[] = [];
  if (listSub) {
    for (const fr of ((listSub as CstChildren)['factRef'] as CstNode[]) ?? []) {
      premises.push(visitFactRef(fr as CstChildren));
    }
  }
  return {
    kind: 'Rule',
    ref: visitFactRef(refSub as CstChildren),
    premises,
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitRelationStatement(cst: CstChildren): RelationStatement {
  return {
    kind: 'RelationStatement',
    relation: visitRelation(pickFirst(cst['relation'] as CstNode[]) as CstChildren),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitRelation(cst: CstChildren): Relation {
  const endpoints = (cst['relationEndpoint'] as CstNode[]) ?? [];
  const arrowNode = pickFirst(cst['arrow'] as CstNode[]);
  const attrSub = pickFirst(cst['attributeBlock'] as CstNode[]);
  return {
    kind: 'Relation',
    from: visitRelationEndpoint(endpoints[0] as CstChildren),
    arrow: arrowName(arrowNode?.tokenType?.name ?? 'Support'),
    to: visitRelationEndpoint(endpoints[1] as CstChildren),
    attributes: attrSub ? visitAttributeBlock(attrSub as CstChildren) : undefined,
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitRelationEndpoint(cst: CstChildren): RelationEndpoint {
  const fr = pickFirst(cst['factRef'] as CstNode[]);
  if (fr) return visitFactRef(fr as CstChildren);
  const re = pickFirst(cst['ruleExpr'] as CstNode[]);
  if (re) return visitRuleExpr(re as CstChildren);
  throw new Error('relationEndpoint matched no alternative');
}

function visitRuleExpr(cst: CstChildren): RuleExpr {
  const refSub = pickFirst(cst['factRef'] as CstNode[]);
  const listSub = pickFirst(cst['factRefList'] as CstNode[]);
  if (!refSub) throw new Error('ruleExpr matched no alternative');
  const premises: FactRef[] = [];
  if (listSub) {
    for (const fr of ((listSub as CstChildren)['factRef'] as CstNode[]) ?? []) {
      premises.push(visitFactRef(fr as CstChildren));
    }
  }
  const tokens = collectAllTokens(cst);
  return {
    kind: 'RuleExpr',
    rule: { kind: 'Rule', ref: visitFactRef(refSub as CstChildren), premises, loc: tokens },
    loc: tokens,
  };
}

function visitAttributeBlock(cst: CstChildren): AttributeBlock {
  const entries: Record<string, Value> = {};
  for (const entry of (cst['attributeEntry'] as CstNode[]) ?? []) {
    const child = entry as CstChildren;
    const idSub = pickFirst(child['identifier'] as CstNode[]);
    const valSub = pickFirst(child['value'] as CstNode[]);
    if (!idSub || !valSub) continue;
    entries[idSub.image ?? ''] = makeValueNode(valSub as CstChildren);
  }
  return { kind: 'AttributeBlock', entries, loc: locFromTokens(collectAllTokens(cst)) };
}

// ----- Public entry -----

export function buildAst(cst: CstChildren): Document {
  return visitDocument(cst);
}
```

> **Note on type casts:** The CST is intentionally loosely typed (`Record<string, unknown>` under the hood). The visitor narrows with structural `as` casts at the boundary; this is contained inside `visitor.ts` and does not leak. `no-explicit-any` is honored — there is no `any` in the file.

- [ ] **Step 2: Update `parser.ts` to import from `visitor.ts`**

In `src/parser.ts`, add to the imports near the top:

```typescript
import { buildAst } from './visitor';
```

- [ ] **Step 3: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/visitor.ts src/parser.ts
git commit -m "Add CST-to-AST visitor in dedicated file"
```

---

### Task 18: Error normalization and `parse()` entry point

**Files:**
- Modify: `src/parser.ts`

- [ ] **Step 1: Replace the `parse()` stub with a real implementation**

```typescript
// Replace the `parse()` function in src/parser.ts:

import { ArgdownLexer } from './tokens';
// `tokenize` is exported from tokens.ts as a convenience for callers that want
// raw tokens; the parser calls the lexer directly via `ArgdownLexer.tokenize`.

function mapChevrotainError(err: { message?: string; token?: { tokenType?: { name: string }; startOffset?: number; endOffset?: number; startLine?: number; startColumn?: number; endLine?: number; endColumn?: number }; context?: { expectedTokens?: { name: string }[] } }): ParseError {
  const tok = err.token;
  const loc = {
    line: tok?.startLine ?? 1,
    column: tok?.startColumn ?? 1,
    offset: tok?.startOffset ?? 0,
  };
  // Chevrotain's error types are classes; check by name
  const ctorName = (err as { constructor?: { name?: string } }).constructor?.name ?? '';
  let code: ParseErrorCode = 'parse.mismatchedToken';
  if (ctorName === 'MismatchedTokenException')      code = 'parse.mismatchedToken';
  else if (ctorName === 'NoViableAlternativeError') code = 'parse.noViableAlternative';
  else if (ctorName === 'NotAllInputParsedException') code = 'parse.notAllInputParsed';
  else if (ctorName === 'EarlyExitException')      code = 'parse.earlyExit';
  return {
    code,
    message: err.message ?? 'parse error',
    severity: 'error',
    loc,
    expected: err.context?.expectedTokens?.map((t) => t.name),
    found: tok?.tokenType?.name,
  };
}

export function parse(source: string, options: ParseOptions = {}): ParseResult {
  const filename = options.filename ?? '<anonymous>';
  const maxErrors = options.maxErrors ?? 100;

  // ----- Lexical errors (from the lexer itself) -----
  const lexResult = ArgdownLexer.tokenize(source);
  const errors: ParseError[] = [];

  for (const lexErr of lexResult.errors) {
    if (errors.length >= maxErrors) break;
    let code: ParseErrorCode = 'parse.invalidStringEscape';
    if (lexErr.message?.includes('UNTERMINATED')) {
      code = lexErr.message.includes('string') ? 'parse.unterminatedString' : 'parse.unterminatedBlockComment';
    }
    errors.push({
      code,
      message: lexErr.message ?? 'lex error',
      severity: 'error',
      loc: {
        line: lexErr.line ?? 1,
        column: lexErr.column ?? 1,
        offset: lexErr.offset ?? 0,
      },
    });
  }

  // ----- Parse (always run, even with lex errors, to get partial CST) -----
  const parser = new ArgdownParser();
  parser.input = lexResult.tokens;
  const cst = parser.document();

  for (const chevErr of parser.errors) {
    if (errors.length >= maxErrors) break;
    errors.push(mapChevrotainError(chevErr as never));
  }

  // ----- Build AST -----
  // Even with lexical errors, attempt to construct the AST from whatever the parser
  // produced and surface it as `partial` so callers can show diagnostics alongside
  // the partial tree.
  let ast: Document | undefined;
  try {
    ast = buildAst(cst as unknown as CstChildren);
  } catch {
    ast = undefined;
  }

  if (lexResult.errors.length > 0 || parser.errors.length > 0) {
    return ast ? { ok: false, errors, partial: ast } : { ok: false, errors };
  }

  return ast
    ? { ok: true, ast, errors }
    : { ok: false, errors };
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/parser.ts
git commit -m "Implement parse() entry point with error normalization"
```

---

## Phase 4: Public exports

### Task 19: Wire up `src/index.ts`

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create `src/index.ts`**

```typescript
// src/index.ts
// Public API surface.

export { parse, formatError } from './parser';
export type {
  ParseResult, ParseOptions, ParseError, ParseErrorCode,
  SourceLocation, Position,
} from './parser';

export type {
  Document, Frontmatter, Heading, Block, BlockLine, BlockTitle, ListItem,
  FactStatement, RuleStatement, RelationStatement,
  Fact, FactRef, FactHead, IdentifierHead, TitleHead,
  Rule, Relation, RelationEndpoint, RuleExpr, Arrow,
  AttributeBlock,
  Value, StringValue, NumberValue, BooleanValue, NullValue,
  FlowSequence, FlowMapping, FlowScalar,
  YamlLine, YamlValue, PlainScalar,
  LineComment, BlockComment,
  BlockType, Element,
} from './ast';
```

- [ ] **Step 2: Verify it builds**

Run: `yarn build && ls dist/`
Expected: `dist/ast.d.ts`, `dist/ast.js`, `dist/index.d.ts`, `dist/index.js`, `dist/parser.d.ts`, `dist/parser.js`, `dist/tokens.d.ts`, `dist/tokens.js` are all present.

- [ ] **Step 3: Verify it typechecks**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "Add public API surface in index.ts"
```

---

## Phase 5: Tests

### Task 20: Production tests (one per BNF production)

**Files:**
- Create: `src/parser.test.ts`

- [ ] **Step 1: Create `src/parser.test.ts` with happy-path tests**

```typescript
// src/parser.test.ts
// Production tests: one happy-path test per BNF production, plus error, recovery, position, and example tests.

import { describe, it, expect } from 'vitest';

import { parse } from './parser';
import type { Document, Fact, Rule, Relation, Heading, Block, Value } from './ast';

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
    expect(fact.attributes?.entries['author']).toMatchObject({ kind: 'StringValue', value: 'alice' });
    expect(fact.attributes?.entries['confidence']).toMatchObject({ kind: 'NumberValue', value: 0.95 });
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
    expect(rel.attributes?.entries['strength']).toMatchObject({ kind: 'StringValue', value: 'strong' });
  });
});

describe('production: headings', () => {
  it.each(['#', '##', '###', '####', '#####', '######'])(
    'parses heading level %s',
    (marker) => {
      const ast = parseOk(`${marker} Title`);
      const h = ast.elements[0] as Heading;
      expect(h.level).toBe(marker.length);
      expect(h.text).toBe('Title');
    },
  );
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
    const v = (((ast.elements[0] as { fact: Fact }).fact.attributes?.entries['a']) as Value);
    expect(v).toMatchObject({ kind: 'StringValue', value: 'hello' });
  });

  it('parses number value', () => {
    const ast = parseOk('[#x] { a: 42 }');
    const v = ((ast.elements[0] as { fact: Fact }).fact.attributes?.entries['a']) as Value;
    expect(v).toMatchObject({ kind: 'NumberValue', value: 42 });
  });

  it('parses boolean value', () => {
    const ast = parseOk('[#x] { a: true }');
    const v = ((ast.elements[0] as { fact: Fact }).fact.attributes?.entries['a']) as Value;
    expect(v).toMatchObject({ kind: 'BooleanValue', value: true });
  });

  it('parses null value', () => {
    const ast = parseOk('[#x] { a: null }');
    const v = ((ast.elements[0] as { fact: Fact }).fact.attributes?.entries['a']) as Value;
    expect(v).toMatchObject({ kind: 'NullValue' });
  });

  it('parses flow sequence', () => {
    const ast = parseOk('[#x] { a: [1, 2, 3] }');
    const v = ((ast.elements[0] as { fact: Fact }).fact.attributes?.entries['a']) as Value;
    expect(v).toMatchObject({ kind: 'FlowSequence' });
  });

  it('parses flow mapping (nested)', () => {
    const ast = parseOk('[#x] { a: { b: 1 } }');
    const v = ((ast.elements[0] as { fact: Fact }).fact.attributes?.entries['a']) as Value;
    expect(v).toMatchObject({ kind: 'FlowMapping' });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `yarn test src/parser.test.ts`
Expected: Most tests PASS; some may fail due to visitor bugs uncovered by complex inputs. Note any failures.

- [ ] **Step 3: Fix any failures**

Iterate on `src/parser.ts` until all production tests pass. Common fixes:
- AST visitor missing a subrule
- Token type name lookup wrong
- Loc construction from CST tokens incorrect

- [ ] **Step 4: Commit**

```bash
git add src/parser.test.ts
git commit -m "Add production tests for every BNF production"
```

---

### Task 21: Error-case and recovery tests

**Files:**
- Modify: `src/parser.test.ts` (append new test blocks)

- [ ] **Step 1: Append error and recovery tests**

```typescript
// Append to src/parser.test.ts:

describe('error cases', () => {
  it('reports mismatched token on missing closing bracket', () => {
    const r = parse('[#unclosed');
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe('parse.mismatchedToken');
  });

  it('reports mismatched token on unterminated string', () => {
    const r = parse('[#x] { a: "unterminated }');
    expect(r.errors.some((e) => e.code === 'parse.unterminatedString' || e.code === 'parse.mismatchedToken')).toBe(true);
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
    const elements = r.ok ? r.ast.elements : r.partial?.elements ?? [];
    expect(elements.length).toBeGreaterThan(0);
  });

  it('reports multiple errors in one pass', () => {
    const r = parse('[#a] :- [#b]\n[#c] claim { broken: }\n[unclosed');
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `yarn test src/parser.test.ts`
Expected: PASS. If recovery tests fail, adjust the document rule's MANY/GATE/fallback logic in `src/parser.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/parser.test.ts
git commit -m "Add error-case and recovery tests"
```

---

### Task 22: Position-accuracy tests

**Files:**
- Modify: `src/parser.test.ts` (append)

- [ ] **Step 1: Append position tests**

```typescript
// Append to src/parser.test.ts:

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
    const r = parse('[#x');  // missing ]
    expect(r.ok).toBe(false);
    const err = r.errors[0];
    expect(err).toBeDefined();
    expect(err!.loc.line).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `yarn test src/parser.test.ts`
Expected: PASS. If positions are off, fix `locFromTokens` in `src/parser.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/parser.test.ts
git commit -m "Add source position accuracy tests"
```

---

### Task 23: DESIGN.md example tests with snapshots

**Files:**
- Modify: `src/parser.test.ts` (append)

- [ ] **Step 1: Append the Climate Policy example as a snapshot test**

```typescript
// Append to src/parser.test.ts:

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
```

- [ ] **Step 2: Run tests**

Run: `yarn test src/parser.test.ts`
Expected: PASS. The snapshot file `src/__snapshots__/parser.test.ts.snap` is created on first run.

- [ ] **Step 3: Inspect the snapshot**

Run: `cat src/__snapshots__/parser.test.ts.snap | head -100`
Expected: A reasonable serialized AST. If it's wildly wrong, fix the visitor.

- [ ] **Step 4: Commit**

```bash
git add src/parser.test.ts src/__snapshots__/
git commit -m "Add Climate Policy example as snapshot test"
```

---

### Task 24: Smoke test (full pipeline)

**Files:**
- Modify: `src/parser.test.ts` (append)

- [ ] **Step 1: Add a self-check test**

```typescript
// Append to src/parser.test.ts:

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
```

- [ ] **Step 2: Run tests**

Run: `yarn test src/parser.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/parser.test.ts
git commit -m "Add smoke test for the full parse() pipeline"
```

---

## Phase 6: Verification

### Task 25: Full pipeline verification

- [ ] **Step 1: Run the full toolchain in order**

```bash
yarn typecheck
yarn lint
yarn format:check
yarn test
yarn build
```

Expected: each step exits 0.

- [ ] **Step 2: Fix any issues**

Common issues and fixes:
- `oxlint` complaints about explicit types → add return type annotations
- `oxlint` complaints about `any` → narrow the type
- `tsc` errors with `isolatedDeclarations` → add explicit type to every export
- `oxfmt` formatting → run `yarn format` to auto-fix
- `vitest` snapshot drift → review the diff and update if intentional

- [ ] **Step 3: Verify the package is publishable**

```bash
node -e "import('@casualtheorics/argdown-2').then(m => console.log(Object.keys(m)))" \
  --input-type=module 2>/dev/null || \
node --input-type=module -e "import('./dist/index.js').then(m => console.log(Object.keys(m)))"
```

Expected: prints a list including `parse`, `formatError`, and all exported types (printed as the values; types don't show at runtime, but `parse` and `formatError` should be present).

- [ ] **Step 4: Verify `./ast` subpath works**

```bash
node --input-type=module -e "import('./dist/ast.js').then(m => console.log('ast loaded'))"
```

Expected: prints `ast loaded`.

- [ ] **Step 5: Final commit (if any fixes were made)**

```bash
git add -A
git diff --cached --quiet || git commit -m "Verification fixes"
```

- [ ] **Step 6: Tag the milestone**

```bash
git tag v0.0.1
```

- [ ] **Step 7: Push (if a remote is configured)**

```bash
git push origin main
git push origin v0.0.1
```

---

## Self-Review Checklist

After completing all tasks, verify:

- [ ] All 10 new files exist (`package.json`, `tsconfig.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `src/ast.ts`, `src/tokens.ts`, `src/tokens.test.ts`, `src/parser.ts`, `src/parser.test.ts`, `src/index.ts`)
- [ ] `yarn typecheck` exits 0
- [ ] `yarn lint` exits 0
- [ ] `yarn format:check` exits 0
- [ ] `yarn test` exits 0 with 100% line coverage of `src/parser.ts` and `src/tokens.ts`
- [ ] `yarn build` produces `dist/` with `.js`, `.d.ts`, and source maps
- [ ] The DESIGN.md Climate Policy example parses with `ok: true` and `errors: []`
- [ ] A document with 3 distinct syntax errors produces 3 errors in `result.errors`
- [ ] Source positions on AST nodes match the actual byte/line/column of the source
