# Deep Dive — argdown-2

**Stage:** 1 of 5 (Deep Dive) — RESTART after grammar/spec drift resolution
**Date:** 2026-06-23
**Codebase HEAD:** `9384257 Merge pull request #1 from kellenff/cursor/update-bnf-grammar-phase-2-774e`
**Graph tools available:** ✅ Yes (`Users-kellen-Projects-argdown-2`, 705 nodes, 1559 edges, status `ready`)
**Method:** Graph-augmented (architecture, code snippets, search); Read for docs and non-code files.

---

## 0. Drift status (vs prior deep-dive 2026-06-22)

| Item | Prior report | Current state |
| --- | --- | --- |
| `docs/GRAMMAR.bnf` `<rule-statement>` | Stale (described removed `Rule`) | ✅ Fixed (commit `308c0b9`): replaced with `<argument-statement>` |
| `<argument>` syntax | Not in prior BNF | ✅ Added: `(<conclusion>) -> <premise-list> .` with nested `<arg-expr>` and `<disjunction>` |
| `:-` operator | Described as rule syntax | ✅ Marked REMOVED in NOTE 10; lexer retains the token to emit a hard parse error |
| Implementation (`Argument` AST, no `Rule`) | Already matched post-Cycle-2 | Unchanged — `src/parser-arg.ts` and `src/index.ts` exports are post-Cycle-2 |

Resolution: spec and implementation are now in sync. Source code is unchanged since the 2026-06-22 index; the graph remains valid.

---

## 1. What problem does this solve?

argdown-2 is a TypeScript parser and Mermaid renderer for **Argdown Extended — a textual language for representing argument maps, claims, inferences, and the relations between them**. It sits between prose argumentation and diagrammatic argument visualization (Mermaid flowcharts):

- Prose hides structure. Diagrams show it. Argdown is the markup in between: human-writable, machine-parseable, downstream-renderable.

The "Extended" qualifier is the project's distinctive contribution. Canonical Argdown (argdown.org) is informal around edge cases — modifier prefixes overlap, parentheses do too many jobs, undercut/undermine share a glyph. argdown-2 replaces that with:

- **Linked inferences as `Argument`** — `([#X]) -> [#Y], [#Z].` with optional disjunction `([#A] | [#B])` and arbitrary nesting `([#thesis]) -> ([#sub]) -> [#p1], [#p2].`. Replaces Datalog-style `:-` rules.
- **Seven-arrow taxonomy** — support (`-->`), attack (`--x`), undercut (`-.->`), undermine (`-.-`), concession (`~>`), qualification (`?>`), equivalence (`<->`).
- **Unified `{}` attribute blocks** for metadata, modality, evidence — no more bracket-prefix overload.
- **Multi-premise endpoints** — comma lists at either end of a relation.
- **Structured blocks** — `:::evidence[...]`, `:::stakeholder[...]`, `:::meta[...]`, `:::position[...]`, `:::domain[...]` with YAML-ish bodies.

## 2. Who is it for?

- **Policy analysts / researchers** writing structured argument maps (climate policy, ethics, jurisprudence). `docs/DESIGN.md` ships a worked example: a complete climate-policy argument graph with IPCC stakeholders.
- **Tool builders** embedding argumentation rendering in a TS/ESM pipeline — `parse()` returns a typed AST; `renderMermaid()` returns a string.
- **Engineers writing CLIs** that consume `.argdown` files — the `argdown-mermaid` binary reads stdin or a file and writes a Mermaid diagram to stdout.

It is **not yet**: a public-facing argumentation web-app, a collaborative editor, a non-TS-bindings library. The package is `private: true` at version `0.0.0`.

## 3. Core features

| Feature | Status | Notes |
| --- | --- | --- |
| Lexer + parser → typed AST | ✅ | Chevrotain-based; splits per construct (`parser-arg`, `parser-block`, `parser-fact`, `parser-frontmatter`, `parser-relation`) |
| Position-preserving parse errors | ✅ | `formatError(err, label)` formats with filename/line/column |
| Partial-AST on error | ✅ | Returns `{ ok: false, partial: ast }` — best-effort downstream rendering |
| Mermaid `flowchart TD` renderer | ✅ | Pure AST → string, content-keyed dedupe |
| `argdown-mermaid` CLI | ✅ | stdin/file → Mermaid on stdout, errors to stderr |
| Frontmatter (`===`) | ✅ | YAML key:value lines |
| Headings (`# ...`–`######`) | ✅ | |
| Structured blocks (`:::evidence [...] ... :::`) | ✅ | meta, evidence, position, stakeholder, domain |
| Comments (`//`, `/* */`) | ✅ | |
| Attribute blocks (`{}`) | ✅ | Typed values (string/number/bool/null/flow-seq/flow-map) |
| Linked arguments (`([#X]) -> [#Y].`) | ✅ | Multi-premise, disjunction, nesting |
| Relations (7 arrow types) | ✅ | Support, attack, undercut, undermine, concession, qualification, equivalence |
| Multi-premise endpoints | ✅ | Comma-separated lists, unfolded into binary pairs |
| Hard-error for legacy `:-` | ✅ | Lexer retains the token so the parser can reject with a clear message |
| Mutation testing (Stryker) | ✅ | 80%+ threshold enforced per recent commit |
| Fuzz testing | ✅ | `parser.fuzz.test.ts` |
| Performance baseline | ✅ | `tinybench` + `perf-baseline.json` |
| Snapshot tests | ✅ | `src/__snapshots__/` |
| Public npm release | ❌ | `private: true, "0.0.0"` |

## 4. Architecture

**Type:** Library + CLI tool. ESM-only. Node ≥18. Yarn 4 with PnP.

**Runtime dependency:** `chevrotain ^11.0.3`. That's it.

**Public surface** (`src/index.ts` — 49 lines):

```ts
export { parse, formatError } from './parser.js';
export type { ParseResult, ParseOptions, ParseError, ParseErrorCode } from './parser.js';
export { renderMermaid } from './mermaid.js';
// 30+ AST types: Document, Frontmatter, Heading, Block, BlockLine, BlockTitle,
//   ListItem, FactStatement, RelationStatement, Fact, FactRef, FactHead,
//   IdentifierHead, TitleHead, Argument, Conclusion, Premise, Relation,
//   RelationEndpoint, Arrow, AttributeBlock, Value, StringValue, NumberValue,
//   BooleanValue, NullValue, FlowSequence, FlowMapping, FlowScalar, YamlLine,
//   YamlValue, PlainScalar, LineComment, BlockComment, BlockType, Element,
//   SourceLocation, Position
```

Subpath export `./ast` lets consumers import AST types without pulling in chevrotain's parser surface.

**Internal source layout** (graph: 705 nodes, 1559 edges):

| File | Role |
| --- | --- |
| `src/index.ts` | Public API re-exports |
| `src/parser.ts` | Top-level `parse()` — lex → token-stream → CST → AST pipeline |
| `src/parser-util.ts` | `TokenStream` helper (save/restore + error collection) |
| `src/parser-frontmatter.ts` | `===` YAML block |
| `src/parser-fact.ts` | `[#id] claim text { attrs }` |
| `src/parser-block.ts` | `:::type [...] ... :::` |
| `src/parser-arg.ts` | `([#X]) -> [#Y], [#Z].` and disjunctions |
| `src/parser-relation.ts` | `[#A] --> [#B] { ... }` |
| `src/visitor.ts` | AST visitor base |
| `src/visitor-walk.ts`, `visitor-arg.ts`, `visitor-block.ts`, `visitor-frontmatter.ts` | Specialized walkers |
| `src/ast.ts` | TypeScript discriminated-union AST types |
| `src/mermaid.ts` | Pure AST → Mermaid `flowchart TD` |
| `src/cli.ts` | `argdown-mermaid` binary (stdin/file → Mermaid) |
| `src/tokens.ts` | Chevrotain token definitions |
| `src/parser.bench.ts` | `tinybench` harness |
| `src/parser.mutate.ts` | Stryker mutations |
| `src/parser.{bench,fuzz,mutate,arg}.test.ts`, `tokens.test.ts`, `mermaid.test.ts` | Tests |
| `src/parser.fixtures/*.argdown` | 7 fixture documents |
| `docs/GRAMMAR.bnf` | Source-of-truth grammar (post-`308c0b9`) |
| `docs/DESIGN.md` | Worked-example spec with the climate-policy graph |

**Pipeline** (`parse()` in `src/parser.ts:281–324`): 6 steps — lex, normalize lex errors, parse to CST (always, even with lex errors), collect parse errors from stream, build AST (best-effort, wrapped in try/catch), decide `ok` vs `partial`. Even with lex errors, parsing continues to recover a partial CST for downstream tooling.

```
source:string
   │
   ▼
ArgdownLexer.tokenize(source)         ← src/tokens.ts (chevrotain)
   │
   ▼  (ILexingResult { tokens, errors })
TokenStream(t)                        ← src/parser-util.ts (save/restore, error collection)
   │
   ▼
parseDocument(s) → parseElement(s)    ← src/parser.ts (chevrotain parser, CST output)
   │  + per-construct helpers in parser-{arg,block,fact,frontmatter,relation}.ts
   ▼  (CstNode tree)
buildAst(cst)                         ← src/visitor.ts (CST → AST)
   │
   ▼
{ ok, errors, ast?, partial? }        ← ParseResult
```

**`is_entry_point: true` (per graph metadata):** `parse` (11 callers). Everything else is internal to the module.

## 5. True entry points (the public API)

From `src/index.ts` (the only file the consumer touches):

```ts
import { parse, formatError, renderMermaid } from '@casualtheorics/argdown-2';
import type {
  ParseResult, ParseOptions, ParseError, ParseErrorCode,
  Document, Fact, Argument, Relation, Block, AttributeBlock, Value, SourceLocation,
  // …30+ AST types
} from '@casualtheorics/argdown-2';
import type { /* same AST types */ } from '@casualtheorics/argdown-2/ast';
```

CLI binary `argdown-mermaid` for stdin/file → Mermaid on stdout.

## 6. What makes it unique

1. **Linked `Argument` syntax** (`([#X]) -> [#Y], [#Z].`) — replaces both canonical Argdown's prose inference AND Datalog-style `:-` rules, with first-class nesting and disjunction.
2. **Seven-arrow taxonomy.** Canonical Argdown has roughly four; argdown-2 splits undercut/undermine and adds concession/qualification.
3. **Partial-AST on error.** The parser keeps producing output even when the input is broken — useful for editor/IDE scenarios.
4. **Content-keyed Mermaid dedupe.** Same `FactHead` content always renders to the same Mermaid node ID across parses. Documented in `src/mermaid.ts` as a deliberate `ponytail:` comment.
5. **Spec-as-tests rigor.** `docs/GRAMMAR.bnf` (~640 lines post-update, with explicit NOTES on every ambiguity) is the source of truth. The Chevrotain grammar in `src/tokens.ts` and `src/parser-*.ts` implements it. Mutation testing at 80%+ ensures the grammar implementation matches the spec.
6. **Hard-error migration path.** The `:-` token is retained by the lexer solely so the parser can emit a clear error (`"':-' syntax was removed. Use '->' for inference ..."`) when it encounters legacy input. That's a deliberate UX choice, not dead code.
7. **Self-aware minimalism.** `ponytail:` comments in `src/mermaid.ts` declare deliberate shortcuts — the codebase records its own simplifications.

## 7. Method traceability

| Finding | Method |
| --- | --- |
| Source layout, 705 nodes/1559 edges | graph: `get_architecture` |
| `parse()` signature, 11 callers, 6-step pipeline | graph: `get_code_snippet` |
| Mermaid renderer full body | graph: `get_code_snippet` |
| CLI behavior | graph: `get_code_snippet` |
| Public API surface | graph: `get_code_snippet` on `src/index.ts` |
| BNF current state (Argument, NOTE 10, `:-` removal) | Read `docs/GRAMMAR.bnf` (post-`308c0b9`) |
| DESIGN.md spec (facts, arguments, relations, 7 arrows) | Read |
| package.json (deps, scripts, exports) | Read |
| Source file list | Bash `ls` |
| Drift resolution commits | git log / git diff |

## 8. Open questions for Crystal Ball

- Package is `private: true` at `0.0.0` — first public release is unannounced work. What's the launch story?
- No `.github/` CI workflows visible. Is CI run locally only?
- The codebase has its own planning system (`docs/snowball/`). What's the relationship between that and the public README?
- Is the Mermaid renderer the only output target, or are there other renderers planned?

---

**Next stage:** `/claudikins-grfp:crystal-ball`
