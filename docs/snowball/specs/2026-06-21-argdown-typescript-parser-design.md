# Argdown Extended — TypeScript Parser Design

**Date:** 2026-06-21
**Status:** Approved (pending user review of this written spec)
**Scope:** First implementation cycle of `argdown-2`. A structural parser for the BNF in `docs/GRAMMAR.bnf`, producing a typed AST consumable by editor/IDE tooling.

---

## 1. Context and goals

`argdown-2` is a fresh repo with a complete 538-line BNF grammar (`docs/GRAMMAR.bnf`) and a design rationale (`docs/DESIGN.md`), but no implementation. This cycle builds the structural parser: a pure function from source string to AST, with source positions on every node and error recovery that surfaces multiple diagnostics per pass. Semantic analysis (name resolution, argument graphs, etc.) is out of scope — a future cycle.

**Goals:**
- Parse every BNF production in `docs/GRAMMAR.bnf` to a typed AST
- Every AST node carries `loc: SourceLocation` (line, column, offset)
- Multi-error recovery suitable for editor diagnostics
- Public API: one `parse()` function, discriminated-union result
- Zero runtime dependencies beyond Chevrotain

**Non-goals (deferred to later cycles):**
- Semantic analysis, name resolution, argument-graph construction
- Source-level transformations, re-emission, formatting
- Token-stream export (consumers can ask later if needed)
- CJS build, browser bundle, published README
- CLI binary

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Consumer profile | Editor / IDE tooling |
| Parser strategy | Chevrotain parser combinator |
| Error surface | Discriminated-union `ParseResult` |
| AST shape | Discriminated unions, plain data |
| Trivia | Comments as AST nodes; whitespace + newlines skipped at lex time |
| Token stream | Not exposed; AST only |
| Source positions | 1-indexed line/column, 0-indexed offset |
| Project layout | Flat `src/`, co-located tests |
| Test framework | Vitest |
| Distribution | ESM only, Node 18+, built `dist/` |
| Lint / format | oxlint (type-aware) + oxfmt, with strict rules and sort/import-ordering |
| TS strictness | `isolatedModules` + `isolatedDeclarations` |

---

## 3. Architecture and module structure

**File layout:**
```
src/
  ast.ts              # discriminated-union node types (leaf, no internal imports)
  tokens.ts           # Chevrotain TokenType vocabulary
  tokens.test.ts      # one assertion per token
  parser.ts           # Chevrotain Parser subclass + parse() wrapper + result types
  parser.test.ts      # main parser tests (production / error / recovery / positions)
  index.ts            # public API: parse(), formatError(), exported types
package.json
tsconfig.json
.oxlintrc.json
.oxfmtrc.json
```

`ast.ts` has no runtime, so no test file accompanies it.

**Dependency direction (one-way, no cycles):**
```
index.ts  ──▶  parser.ts  ──▶  tokens.ts
   │              │
   └──▶  ast.ts ◀─┘
```

`ast.ts` is the leaf — pure type definitions, zero runtime imports. `tokens.ts` and `ast.ts` know nothing about each other. `parser.ts` consumes tokens and constructs AST nodes. `index.ts` is the only file that re-exports.

**Naming:**
- Files: `kebab-case.ts` (single-word exceptions like `ast.ts`)
- Types: `PascalCase`
- Functions: `camelCase`
- Chevrotain tokens: `UPPER_SNAKE` module-level constants; token names as `Title_Case` strings (matches Chevrotain's debug output)

---

## 4. Token vocabulary

The BNF's 60+ terminals collapse to ~40 Chevrotain tokens. Grouped by lexical behavior:

**Multi-character operators** (longest match wins over single-char alternatives):
```
RuleOp = ":-"  Support = "-->"  Attack = "--x"  Undercut = "-.->"
Undermine = "-.-"  Concession = "~>"  Qualification = "?>"  Equivalence = "<->"
FrontmatterDelim = "==="  BlockMarker = ":::"
LineComment = "//"  BlockCommentOpen = "/*"  BlockCommentClose = "*/"
HeadingMarker = /#{1,6}/   // captures 1-6 hashes; value = the literal string
```

**Keywords** (contextual — `Identifier` elsewhere):
- Literals: `True` = "true", `False` = "false", `Null` = "null"
- Block types: `Meta`, `Evidence`, `Position`, `Stakeholder`, `Domain` — lex with higher priority than `Identifier` so `meta` is always `Meta`, even in attribute keys

**Composite literals:**
- `Identifier` = `/[a-zA-Z0-9_-]+/`
- `Number` = JSON number (sign, int, frac, exp all in one token; lexer handles sign/decimal/exponent)
- `String` = `/"(\\.|[^"\\])*"/` with escape decoding in the parser

**Text runs** (each with a different exclusion set per the BNF):
- `TitleText` — chars excluding `#[]`, LF, CR
- `ClaimText` — first char excludes whitespace + operator-leading set (`{}[]()#:-~?<,`); continuation excludes `{}`, LF, CR
- `HeadingText` — chars excluding LF, CR
- `PlainScalar` — chars excluding LF, CR
- `FlowScalar` — chars excluding `,[]{}`, LF, CR

**Single-character punctuation** (after operators):
- `LBrack` `RBrack` `LBrace` `RBrace` `LParen` `RParen` `Colon` `Comma` `Period` `Dash` `Minus`
- `Colon` matches when `:-` or `:::` don't; `Dash` matches when a `Number` doesn't start; `Period` matches when no digits follow; `Plus` is not a standalone token (only appears inside `Number` as the exponent sign)

**Skipped at lex time:**
- Horizontal whitespace (spaces, tabs) — irrelevant per BNF lexical conventions
- Newlines (LF, CRLF, CR) — the BNF's `<line-end>` is implicit; the parser uses `MANY_SEP` and `OR` ordering to disambiguate line-oriented statements, and a `<fact-ref>` not followed by `:-` or an `<arrow>` is always a fact

**Edge case (known limitation):** `:::` always lexes as `BlockMarker` even in a claim-text position. The BNF has no escape mechanism. Documented in the spec; no workaround invented.

**Token start chars** (for Chevrotain TRIE performance): `:` `[` `{` `(` `,` `.` `-` `+` `"` `#` `~` `?` `<` `=` `/` letters, digits.

---

## 5. Parser rules and recovery

**Rule count: ~35** — one rule per BNF production, name-mapped 1:1. The parser class is a single `class ArgdownParser extends CstParser` with one method per rule.

**Mapping BNF constructs to Chevrotain patterns:**

| BNF | Chevrotain |
|---|---|
| `<empty> \| X` repetition | `$.MANY(() => $.SUBRULE($.x))` |
| `<empty> \| X` optional | `$.OPTION(() => $.SUBRULE($.x))` |
| `X \| Y \| Z` choice | `$.OR([{ALT: ...}, {ALT: ...}])` |
| `X "," Y "," Z` | `$.MANY_SEP({SEP: Comma, DEF: () => $.SUBRULE($.y)})` |
| `<line-end>` (newline) | **omitted** — newlines are skipped |
| Token literal `"==="` | `$.CONSUME(FrontmatterDelim)` |
| Character-class terminals | `$.CONSUME(ClaimText)` etc. |

**Operator-leading disambiguation (BNF NOTE 4 — the load-bearing pattern):**

```ts
this.RULE('statement', () => {
  this.OR([
    { ALT: () => this.SUBRULE(this.ruleStatement) },      // [ref] ":-" body "."
    { ALT: () => this.SUBRULE(this.relationStatement) },  // endpoint arrow endpoint {attrs}
    { ALT: () => this.SUBRULE(this.factStatement) },      // catch-all
  ]);
});
```

Order matters: rule first (requires `:-`), then relation (requires arrow), then fact. If the leading `<fact-ref>` is not followed by `:-` or an arrow, `OR` falls through to fact, which always succeeds for a well-formed fact-ref. The BNF's "line-end" check is implicit in the OR ordering, not in the token stream.

**Recovery strategy (three layers):**

1. **Within a rule** — `OR` alternatives try in order. Chevrotain records one `NoViableAlternativeError` per failed OR.
2. **At the document level** — `document()` uses `MANY` with a `GATE: () => this.LA(1).tokenType !== EOF` clause to prevent infinite loops. A trailing `OR` fallback `ALT` consumes one token when no element alternative matches, recording an `UnexpectedToken` error and advancing.
3. **At sub-rule boundaries** — Chevrotain's `recoveryEnabled: true` (default) lets the parser continue after a failed `CONSUME`. `OPTION` never errors; it just doesn't fire if the leading token is missing. `MANY` stops on the first token that doesn't match its body.

**What we deliberately do NOT do:**
- No automatic token insertion (`performInsert`) — Argdown's syntax is too contextual
- No backtracking beyond Chevrotain's `OR` — the grammar is LALR(1)-clean per the BNF
- No statement-end auto-detection — we report, skip one token, let the next `OR` attempt decide

---

## 6. AST node types

All nodes are plain data, discriminated by a `kind` literal. Source position is mandatory on every node (`loc`).

**Shared types:**
```ts
type SourceLocation = { start: Position; end: Position };
type Position = { line: number; column: number; offset: number };

interface BaseNode { loc: SourceLocation; }
```

**Decisions:**

- **Text runs are plain `string`**, not wrapped nodes — no internal structure to navigate
- **Arrows and block types use semantic names** (`'support'` not `'-->'`) — consumers don't need to know the operator symbol
- **Number values are parsed `number`** — precision loss on very large integers is acceptable for an argumentation DSL
- **Frontmatter, attribute blocks, and flow mappings reduce to `Record<string, Value>`** — lookup-friendly, last-write-wins on duplicate keys; the original entry list is dropped, but the value's `loc` preserves the key's position
- **Blank lines are stripped** from the AST — zero semantic value; positions of adjacent nodes are sufficient
- **No builder functions in v1** — object literals with `as const` are fine
- **No symbol table, name resolution, or type checking** — those are semantic analysis, not parsing

**Full taxonomy:**

```
Document
├─ Frontmatter                  ── entries: Record<string, Value> + loc
├─ Heading                      ── level: 1..6 + text: string + loc
├─ Block                        ── type: BlockType + title?: BlockTitle + body: BlockLine[] + loc
│  └─ BlockTitle                 ── text: string + loc
│  └─ BlockLine                  ── YamlLine | ListItem | Element (recursive)
│     ├─ YamlLine               ── key: string + value: YamlValue + loc
│     ├─ ListItem               ── fact: Fact + loc
│     └─ (recurse into Element)
├─ FactStatement                ── fact: Fact + loc
│  └─ Fact                       ── ref: FactRef + claimText?: string + attributes?: AttributeBlock + loc
│     ├─ AttributeBlock          ── entries: Record<string, Value> + loc
│     │  └─ (key/value pairs; key is identifier-string, value is a Value node with loc on the key)
│     │     [key is not a separate node — it's the string property of the Value's loc]
│     └─ FactRef                 ── head: FactHead + loc
│        └─ FactHead             ── { kind: 'IdentifierHead', identifier: string } | { kind: 'TitleHead', title: string }
├─ RuleStatement                ── rule: Rule + loc
│  └─ Rule                       ── ref: FactRef + premises: FactRef[] + loc
├─ RelationStatement            ── relation: Relation + loc
│  └─ Relation                   ── endpoint + arrow: Arrow + endpoint + attributes?: AttributeBlock + loc
│     └─ RelationEndpoint        ── FactRef | RuleExpr
│        └─ RuleExpr             ── rule: Rule + loc
├─ LineComment                  ── text: string + loc
└─ BlockComment                 ── text: string + loc

Element = Heading | Block | FactStatement | RuleStatement | RelationStatement
        | LineComment | BlockComment
        // (the top-level union a Document.elements can hold; blank lines stripped)

Value  = StringValue | NumberValue | BooleanValue | NullValue
       | FlowSequence | FlowMapping | FlowScalar
       // FlowSequence ── items: Value[] + loc
       // FlowMapping  ── entries: Record<string, Value> + loc
       // FlowScalar   ── text: string + loc
       // StringValue  ── value: string + loc
       // NumberValue  ── value: number + loc
       // BooleanValue ── value: boolean + loc
       // NullValue    ── loc (no payload)
```

---

## 7. Public API surface

**The single entry point:**
```ts
export function parse(source: string, options?: ParseOptions): ParseResult;
```

**`ParseOptions`:**
```ts
type ParseOptions = {
  filename?: string;   // shown in error messages, default '<anonymous>'
  maxErrors?: number;  // default 100 (runaway guard)
};
```

**`ParseResult`:**
```ts
type ParseResult =
  | { ok: true;  ast: Document;        errors: ParseError[] }
  | { ok: false; errors: ParseError[]; partial?: Document };
```

Semantics:
- `ok: true` — a complete `Document` was produced; `errors` may be non-empty if the parser recovered
- `ok: false` — unrecoverable: tokenization failure, frontmatter opened with no closer, or a parser internal error; `partial` carries whatever was built

**`ParseError`:**
```ts
type ParseError = {
  code: ParseErrorCode;
  message: string;
  severity: 'error' | 'warning';
  loc: SourceLocation;
  expected?: string[];      // token types we'd have accepted
  found?: string;           // token type we actually saw
};

type ParseErrorCode =
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
```

**`formatError(err): string`** is the only display helper: `<filename>:<line>:<column>: <message>`. Color codes, source-snippet excerpts, and IDE squiggle generation are the consumer's responsibility.

**`src/index.ts` exports (final list):**
```ts
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

**Internal (not exported):** `ArgdownParser` class, token vocabulary, CST, Chevrotain itself.

**Skipped from the public surface (YAGNI for v1):** `tokenize()` standalone, formatted-error variants, `validate()`, AST builder functions, visitor/walker utilities.

---

## 8. Error handling and source locations

**Error collection: all of them, up to `maxErrors`.** Chevrotain's `parser.errors` is the source of truth; we copy into `ParseResult.errors` after the parse finishes. With `recoveryEnabled: true` (default), the parser attempts to continue after every error — a typical document with 3 syntax errors yields 3 diagnostics, not 1.

**Three error layers, normalized into one `ParseError` type:**

1. **Lexical** — raised by custom lexer hooks (Chevrotain's default lexer can't catch invalid escapes or unterminated strings). Codes: `parse.unterminatedString`, `parse.unterminatedBlockComment`, `parse.invalidStringEscape`, `parse.invalidNumber`. These always set `ok: false` because the rest of the parse is unreliable.
2. **Syntactic** — raised by Chevrotain during parsing. Codes: `parse.mismatchedToken`, `parse.noViableAlternative`, `parse.earlyExit`. Recoverable; the parser tries to advance.
3. **Forward-progress** — our explicit fallback. Code: `parse.unexpectedToken`. Raised when no element alternative matched in `document()`. We consume the offending token and try the next iteration of the outer `MANY`.

**Severity:** every entry in `errors` is `'error'`. The parser is structural only — no semantic warnings (unused attributes, duplicate IDs) in v1.

**Source positions (the IDE contract):**
- `line` and `column` are **1-indexed** (matches LSP, Monaco, VS Code, JetBrains)
- `offset` is **0-indexed** (UTF-16 code unit offset, matches ECMAScript string semantics)
- Every token gets `start` and `end` at lex time
- Every AST node's `loc` is the **union of its constituent tokens** — `start` from the first, `end` from the last
- Empty productions (`<empty>`) inherit the surrounding rule's location
- Error `loc` points at the **offending token** for `mismatchedToken` and `unexpectedToken`, or the **first token of the failed alternative** for `noViableAlternative`

**Cost of recovery:** worst case is one extra token consumed per error. For a 10K-line document with 20 errors, parse time increases by ~20 token-lookups — negligible. No O(n²) pathologies; the grammar is LALR(1)-clean.

---

## 9. Testing strategy

**Framework: Vitest.** Zero-config with TS, native ESM, snapshot support, fast watch mode, plays well with Yarn PnP.

**Tests are co-located:** `parser.test.ts` next to `parser.ts`, `tokens.test.ts` next to `tokens.ts`. No separate `tests/` directory.

**Test categories (all in `parser.test.ts` for v1, split later if it grows past ~1k lines):**

1. **Happy path per BNF production** — one test per rule, derived from the BNF's right-hand side. Every alternative of every `OR` gets its own test. ~35 production tests.
2. **Worked examples from DESIGN.md** — the three multi-line examples in section 2-4 (Climate Policy, Modality, Undercut). Snapshot-tested in full so any AST drift fails loudly.
3. **Error cases** — malformed input (mismatched brackets, unterminated strings, missing rule terminator, etc.) checked for: (a) the right `code` is reported, (b) the right `loc` is reported, (c) the parse still produces a best-effort AST where possible.
4. **Recovery** — a document with 3 distinct syntax errors must yield 3 diagnostics in `errors` (not just the first), and the AST must still contain the valid elements surrounding the bad ones.
5. **Source position accuracy** — every AST node's `loc` is checked against the actual byte/line/column in the source string.
6. **Lexer edge cases** — string escapes (`\"`, `\\`, `é`), JSON number edge cases (`0`, `-0`, `1e10`, `1.5e-3`), unterminated string, unterminated block comment, `:::` always lexing as `BlockMarker` even mid-line.

**`tokens.test.ts`** — one assertion per token: a short input, the expected token type, the captured image. Catches lexer regressions (e.g., if someone reorders tokens and longest-match breaks).

**Snapshot policy:** snapshots for full-document parses (DESIGN.md examples), not for individual nodes. The full-document snapshots are the public-contract test — they fail if the AST shape drifts. Individual-node tests use explicit `toEqual` so the failure message tells you exactly what changed.

**Coverage target:** 100% line coverage of `parser.ts` and `tokens.ts`. `ast.ts` is types only, no runtime to cover.

**Smoke test:** parsing the full "Climate Policy" example from DESIGN.md and asserting `result.ok === true` with `result.errors.length === 0` — the smallest possible whole-package self-check.

**YAGNI for v1:** property-based testing (fast-check), fuzzing, performance benchmarks, golden-file conformance against a third-party Argdown parser.

---

## 10. Build, distribution, and project layout

**Final file tree (new files in this design are under `src/` and root):**
```
argdown-2/
  package.json            ← new: scripts, exports, deps
  tsconfig.json           ← new: strict TS, ESM target
  .oxlintrc.json          ← new: type-aware lint rules
  .oxfmtrc.json           ← new: format + sortPackageJson
  src/
    ast.ts                ← new
    tokens.ts             ← new
    tokens.test.ts        ← new
    parser.ts             ← new
    parser.test.ts        ← new
    index.ts              ← new
  docs/
    DESIGN.md             ← (existing)
    GRAMMAR.bnf           ← (existing)
    snowball/specs/2026-06-21-argdown-typescript-parser-design.md  ← this file
  README.md               ← (existing, empty — left for a future task)
  .yarn/, .yarnrc.yml, .pnp.cjs, .editorconfig, .gitignore, .gitattributes  ← (existing, untouched)
```

**`package.json`:**
```jsonc
{
  "name": "@casualtheorics/argdown-2",
  "version": "0.0.0",
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
  "dependencies":     { "chevrotain": "^11.0.0" },
  "devDependencies": {
    "typescript":  "^5.4.0",
    "vitest":      "^1.6.0",
    "oxlint":      "^0.6.0",
    "oxfmt":       "^0.6.0",
    "@types/node": "^20.0.0"
  }
}
```

The `./ast` subpath lets a consumer `import type { Fact } from '@casualtheorics/argdown-2/ast'` and pull in zero runtime.

**`tsconfig.json` (strict, ESM, declaration emit, isolated):**
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
    "skipLibCheck":                 true
  },
  "include": ["src/**/*"]
}
```

**`.oxlintrc.json` — type-aware mode enabled, semantic lints + style:**
```jsonc
{
  "typeAware": true,
  "categories": { "correctness": "error", "suspicious": "error", "perf": "warn" },
  "rules": {
    // Type-aware lints (use tsc's type info; do NOT replace tsc)
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

    // Non-type-aware lints
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

    // Sorting
    "perfectionist/sort-imports":          ["error", { "groups": ["builtin", "external", "internal", ["parent", "sibling", "index"]], "newlinesBetween": "always" }],
    "perfectionist/sort-named-imports":    ["error", { "groups": ["side-effect", "multiple", "single", "type"] }],
    "perfectionist/sort-exports":          ["error", { "groups": ["side-effect", "multiple", "single", "type"] }],
    "perfectionist/sort-object-properties":["error", { "order": "asc" }]
  },
  "ignorePatterns": ["dist", "node_modules", ".pnp.cjs"]
}
```

**Boundary between tsc and oxlint (locked):**

| Concern | Owner |
|---|---|
| Assignability, generics, signature matching | **tsc** |
| Null/undefined propagation, type narrowing | **tsc** |
| `any` propagation beyond where tsc follows it | **oxlint** (`no-unsafe-*`) |
| Promise handling semantics (await, float, misuse) | **oxlint** |
| Dead branches from refined types | **oxlint** (`no-unnecessary-condition`) |
| Operator/operand sanity | **oxlint** (`restrict-*`) |
| Style, file size, naming, import order | **oxlint** |

**`.oxfmtrc.json`:**
```jsonc
{
  "singleQuote":     true,
  "trailingComma":   "all",
  "printWidth":      100,
  "sortPackageJson": true
}
```

`sortPackageJson: true` sorts top-level keys, `dependencies`/`devDependencies` alphabetically, `scripts` alphabetically, `exports` keys alphabetical.

**CI script order:**
```
tsc --noEmit           # 1. type correctness
oxlint src             # 2. type-aware + structural lints
oxfmt --check .        # 3. formatting
vitest run             # 4. behavior
```

**Distribution: ESM only, Node 18+.** No CJS build, no browser bundle in v1.

**Yarn PnP:** the existing `.pnp.cjs` and `.yarnrc.yml` stay as-is. `yarn install` picks up the new `devDependencies` on first run; no `node_modules/` directory.

---

## 11. Skipped (YAGNI list)

- CJS build / `tsconfig.cjs.json`
- Browser-targeted bundle
- `tokenize()` standalone export
- `formatError` variants with source snippets or color codes
- AST builder/factory functions
- Visitor / walker utilities
- Property-based tests (fast-check)
- Fuzzing harness
- Performance benchmarks
- CI workflow / GitHub Actions
- ESLint
- changesets / release-please
- Published README
- `examples/` directory
- `validate()` helper (trivial; consumers can write it)

---

## 12. Open questions

None at design time. The BNF resolves all grammar ambiguities (NOTES 1-9), and the consumer profile (editor tooling) is unambiguous. If the next cycle needs semantic analysis, that's a separate design.

---

## 13. Next steps

1. **User review** of this spec (current gate).
2. **writing-plans** skill invocation to produce a step-by-step implementation plan.
3. **Implementation** in execution order from the plan.
4. **Verification**: full DESIGN.md examples parse with `ok: true` and `errors.length === 0`; error tests produce expected diagnostics; position tests pass.
