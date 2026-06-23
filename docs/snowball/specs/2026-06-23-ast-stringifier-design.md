# AST Stringifier Design

**Date:** 2026-06-23
**Status:** Approved (pending user review of this written spec)
**Scope:** Add an AST → source string function to `argdown-2`. The parser already exists; this cycle adds the reverse direction with a semantic round-trip guarantee. Feeds the parser → stringifier → migrator arc sketched in `docs/snowball/specs/2026-06-21-argdown-typescript-parser-design.md` and `.claude/grfp/crystal-ball.md`.

---

## 1. Context and goals

`argdown-2` parses `.argdown` source into a typed AST (`parse(source) → ParseResult`) but cannot re-emit source from an AST. Without symmetry, every consumer that wants to round-trip a document (formatters, migrators from Argdown 1.x, code-mods, snapshot tests) must reimplement emission. This cycle adds the canonical, lossless-for-semantics emitter.

**Goals:**
- One public function `stringify(ast: Document): string` that re-emits valid `.argdown` source.
- Re-parsing the output produces a structurally equivalent AST.
- One canonical output style — no formatting options in v1.
- Pure, synchronous, no I/O, no mutation of the input AST.
- New `src/stringifier.ts` plus `src/stringifier.test.ts`; existing files unchanged.

**Non-goals (deferred to later cycles):**
- Whitespace preservation, blank-line preservation, original comment placement.
- Formatter / pretty-printer with style options (`indent`, `lineWidth`, `quote`, etc.).
- AST mutation utilities, builders, walkers (YAGNI per ADR PHILOSOPHY).
- Source-anchored emission (slicing original text via `loc` ranges).
- Token-stream export, CST round-trip.

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Role | Round-trip foundation (feeds migrator arc) |
| Fidelity | Semantic round-trip (re-parse ≡ original AST, positions may differ) |
| Output style | One canonical style, no options in v1 |
| API surface | `stringify(ast: Document, options?: StringifyOptions): string` |
| Error model | Best-effort on malformed AST; the contract applies to parser-produced ASTs |
| Module layout | Single file `src/stringifier.ts`; subpath deferred until tree-shaking matters |
| Attributes | Flow-mapping `{...}` form by default (Section 5) |
| Indent | 2 spaces, no tabs |
| Disambiguation | String-escape only; let the parser handle edge cases |
| Tests | Fuzz invariant + fixture round-trip + snapshot + edge cases |

---

## 3. Architecture and module structure

**File layout (new):**
```
src/
  stringifier.ts          # one file, top-level orchestrator + all emission
  stringifier.test.ts      # fixture round-trip + edge cases + snapshots
  __snapshots__/
    stringifier.test.ts.snap
```

`stringifier.ts` is a single file under the 400-line lint cap. If it grows past 400 lines, split by responsibility (`stringifier-doc.ts`, `stringifier-arg.ts`, etc.) — same pattern the parser used when it outgrew one file.

**Dependency direction:**
```
index.ts  ──▶  stringifier.ts  ──▶  ast.ts
   │                                  ▲
   │                                  │ (types only — no runtime)
   └──▶  parser.ts, mermaid.ts, etc. ─┘
```

`stringifier.ts` imports **types only** from `ast.ts`. No runtime imports. The runtime path is pure data in, string out. Same dep shape as `mermaid.ts` (renderer) and `ast.ts` (types).

**Naming:**
- File: `stringifier.ts` (single word, no kebab-case needed).
- Function: `stringify` (matches `parse`, `renderMermaid` shape).
- Type: `StringifyOptions` for the optional second argument.

---

## 4. Public API

Added to `src/index.ts`:
```ts
export { stringify } from './stringifier.js';
export type { StringifyOptions } from './stringifier.js';
```

`StringifyOptions` is `{}` in v1 — present as a typed empty record so the signature is forward-compatible without forcing a breaking change later. Zero runtime cost. The function returns a `string` directly (not a discriminated-union result type), matching `renderMermaid` ergonomics.

**Signature:**
```ts
function stringify(ast: Document, options?: StringifyOptions): string;
```

Synchronous. Pure. Returns the canonical string directly (not a `ParseResult`-style discriminated union — stringifier has no error channel because the contract only applies to parser-produced ASTs).

**Error model:**
- The stringifier is best-effort on malformed input.
- If the AST violates the type system (missing `kind`, missing `loc`, malformed children), the stringifier produces whatever it can and may throw `TypeError` on a structural impossibility (e.g., a stringifier bug exposing an internal invariant violation).
- The documented contract is for ASTs produced by `parse()`. Programmatic or mutated ASTs are out of contract.

---

## 5. Canonical output style

One canonical style. Re-parsing yields a structurally equivalent AST; positions may differ.

### 5.1 Top-level layout

- Frontmatter first (if present), terminated by `===\n` on its own line.
- One blank line between every top-level element.
- One statement per line. No wrapping. No auto-alignment.
- Element order matches the AST `elements` array (parser preserves source order).

### 5.2 Indentation

- Block bodies indented **2 spaces** under the `::: type` opener.
- Argument premises indented **2 spaces** under the conclusion.
- Attribute entries indented **2 spaces** inside their flow mapping.

### 5.3 Block titles

- If present, follow the type on the same line: `::: evidence title text`.

### 5.4 Arrow symbol mapping

Semantic name → source symbol (defined by `Arrow` literal in `ast.ts`):

| AST literal | Source symbol |
|---|---|
| `'support'` | `-->` |
| `'attack'` | `--x` |
| `'undercut'` | `-.->` |
| `'undermine'` | `-.-` |
| `'concession'` | `~>` |
| `'qualification'` | `?>` |
| `'equivalence'` | `<->` |

### 5.5 Block types

Emit literally: `'evidence'` → `::: evidence`, `'position'` → `::: position`, etc.

### 5.6 Fact heads

- `IdentifierHead` → `[identifier]`
- `TitleHead` → `[Title With Spaces]` (the existing title form; the AST discriminated between them, so the choice is determined by `kind`).

### 5.7 Premises

Emit on individual lines prefixed with `-- ` under the conclusion. Disjunction emits `(` `[a]` `,` `[b]` `)` to mirror source form.

### 5.8 Attributes (flow-mapping form, by default)

`AttributeBlock` emits as a flow mapping on the same line as the parent statement. Single-attribute on one line; multi-attribute with entries on subsequent lines.

Single attribute:
```
[fact-ref]: claim text {key: value}
```

Multiple attributes:
```
[fact-ref]: claim text {
  key: value,
  list: [a, b]
}
```

- Opening `{` follows the statement text on the same line.
- Closing `}` goes on its own line at the parent's indent level.
- Entries indented **2 spaces** inside.
- Trailing comma on every entry inside multi-entry blocks.

Applies to `Fact.attributes`, `Argument.attributes`, `Relation.attributes`. Block bodies (the `body: BlockLine[]` of a `Block`) are *not* `AttributeBlock` — they remain YAML lines, one `key: value` per line, indented under the `::: type` opener.

### 5.9 Comments

Emitted in document order at the position they appear in the AST `elements` array — i.e., the same order the parser observed in source.

- `LineComment` → `// text\n`
- `BlockComment` → `/* text */\n`

### 5.10 Frontmatter values

Emitted as YAML. The `Value` discriminated union serializes as:

- `StringValue` → `"escaped"` (double-quoted, JSON-style escapes; see Section 6).
- `NumberValue` → numeric literal.
- `BooleanValue` → `true` / `false`.
- `NullValue` → `null`.
- `FlowSequence` → `[a, b, c]`.
- `FlowMapping` → `{key: value, key: value}`.
- `FlowScalar` → plain text.

---

## 6. Disambiguation policy

The stringifier emits AST text faithfully. It intervenes only where re-tokenization would change the AST shape.

### 6.1 Don't intervene

- Identifiers, titles, claim text, comment text — emitted verbatim.
- Arrow symbols, block types, fact-head strings — emitted exactly as stored.
- Whitespace, blank lines, original line structure — discarded.

### 6.2 String-escape only

**`StringValue` in attribute values, frontmatter entries, flow-mapping entries:** emit as double-quoted with JSON-style escapes:

| Char | Escape |
|---|---|
| `"` | `\"` |
| `\` | `\\` |
| newline | `\n` |
| tab | `\t` |
| carriage return | `\r` |
| other control chars | `\uXXXX` (4 hex digits) |

No multi-line block scalars in v1 — strings containing newlines encode them as `\n` inside double quotes.

**YAML keys** that contain or start with operator-leading chars (`{`, `}`, `[`, `]`, `:`, `,`, `#`, `&`, `*`, `!`, `|`, `>`, `'`, `"`, `%`, `@`, `` ` ``): wrap in double quotes and escape.

### 6.3 Out of scope for v1 (YAGNI)

- Identifier-keyword collisions (`[meta]` vs `[Meta]`) — emit as-is.
- Numbers starting with `-` in YAML values — emit as-is.
- Comments inside attribute blocks or inline comments.
- Round-tripping invalid ASTs — best-effort only.

---

## 7. Round-trip invariant and tests

### 7.1 The invariant

For any source `src` that `parse(src)` accepts (success or partial-success with a non-empty AST):

```
parse(stringify(parse(src).ast)) ≡ parse(src).ast  (positions stripped)
```

Structural equivalence = same `kind` on every node, same children, same order, same string/number/boolean content. `loc` is stripped before comparison.

### 7.2 Test layers

**Layer 1 — Fuzz invariant** (`src/parser.fuzz.test.ts`, extended).

Add invariant 9 to the existing fuzz harness:

```
invariant 9: parse(stringify(ast)) ≡ ast  (positions stripped)
```

Where `ast = parse(randomValidSource).ast`. Comparison helper `stripLocations<T>(ast: T): T` lives inline in `parser.fuzz.test.ts`. If reused across test files in a future cycle, extract to `src/test-utils.ts`.

**Layer 2 — Fixture round-trip** (`src/stringifier.test.ts`, new).

For every parser test fixture in `parser.fixtures/`:

1. `stringify(parse(src))` produces non-empty output.
2. `parse(stringify(parse(src)))` produces an AST structurally equivalent to `parse(src).ast`.
3. Representative fixtures get snapshot tests in `src/__snapshots__/stringifier.test.ts.snap` to lock the canonical style.

**Layer 3 — Disambiguation edges** (`src/stringifier.test.ts`, same file).

Targeted unit tests:

- Attribute value containing `"`, `\`, newline → escaped form, re-parses to same string.
- YAML key containing `:` → quoted form, re-parses to same key.
- Empty document → empty string.
- Document with only comments → comments only.
- Frontmatter with flow sequence and flow mapping → canonical YAML.
- Multi-premise relation → all binary relations preserved.
- Disjunction premise → `(` `[a]` `,` `[b]` `)` form, re-parses to disjunction variant.
- All `Arrow` literals → correct symbol.
- All `BlockType` literals → correct opener.

### 7.3 Out of scope for v1 tests

- Whitespace preservation (semantic equivalence doesn't require it).
- Comment-position preservation (semantic equivalence doesn't require it).
- Position-fidelity fuzzing.
- Property-based testing for malformed ASTs.

---

## 8. Acceptance criteria

The cycle is complete when:

1. `src/stringifier.ts` exists, under 400 lines, passes `yarn lint`, `yarn format:check`, `yarn typecheck`.
2. `stringify(ast)` is exported from `src/index.ts`.
3. `yarn test` is green, including the new fuzz invariant and fixture round-trip.
4. Snapshot file exists and is committed.
5. The round-trip invariant holds for every fixture and every fuzz input.

No README changes. No CLI changes. No new dependencies.
