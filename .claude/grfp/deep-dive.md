# Deep Dive Report — `argdown-2`

**Project:** `@casualtheorics/argdown-2` v0.0.0
**Date:** 2026-06-22
**Graph tools available:** Yes (`Users-kellen-Projects-argdown-2`, 520 nodes, 1200 edges, status `ready`)

---

## 1. What problem does this solve?

`argdown-2` is a **parser for Argdown Extended (Datalog-lite)** — a notation for representing
argument maps, claims, and formal derivations. The original Argdown syntax is informal and
ambiguous around edge cases (modifier prefixes, inline annotations, disambiguating undercut
vs undermine). This project replaces that ad-hoc surface with a **deterministic, formally
specified grammar** so that downstream tools (graph renderers, argument-mining pipelines,
LLM-facing claim extractors) can rely on a clean AST.

The grammar is defined in `docs/DESIGN.md` and formalised in `docs/GRAMMAR.bnf` (complete
BNF — the section-5 EBNF in DESIGN.md is intentionally only a sketch).

## 2. Who is it for?

- **Argument-mapping tool authors** who need a typed AST instead of a hand-rolled regex pass.
- **LLM-pipeline builders** who want `Fact` / `Rule` / `Relation` shapes they can post-process
  without learning chevrotain.
- **Formal-reasoning tinkerers** who want Datalog-style rules (`[#A] :- [#B], [#C].`) on top
  of an argument graph.

## 3. Core features

1. **Lexer + parser pipeline** built on `chevrotain` (the only runtime dep).
2. **Best-effort error recovery** — `parse()` returns `{ ok: false, errors, partial }` on
   failure, so a partial AST is still useful for IDE-style feedback.
3. **CST → AST visitor** in a separate file (`src/visitor.ts`) that turns the chevrotain
   concrete syntax tree into a discriminated-union AST (`Document`, `Fact`, `Rule`,
   `Relation`, `Block`, `AttributeBlock`, `Value` variants, `SourceLocation`, …).
4. **Rich value model** inside `AttributeBlock`: strings, numbers, booleans, null, flow
   sequences (`[a, b]`), flow mappings (`{ k: v }`), plain scalars — a YAML-ish mini-language.
5. **Structured blocks** — `:::evidence[…]`, `:::stakeholder[…]`, `:::meta[…]`,
   `:::position[…]`, `:::domain[…]` with YAML-ish bodies.
6. **Full arrow taxonomy** — `-->` (support), `--x` (attack), `-.->` (undercut), `-.-`
   (undermine), `~>` (concession), `?>` (qualification), `<->` (equivalence), plus the
   `([#A] :- [#B])` rule-expression syntax for undercuts.
7. **Bench harness** (`src/parser.bench.ts`) with 7 fixtures and a checked-in
   `perf-baseline.json` for regression detection.
8. **Property-based fuzz + mutation tests** (`parser.fuzz.test.ts`, `parser.mutate.test.ts`)
   enforcing the no-throw, shape, walker-coverage, and idempotence invariants.

## 4. Architecture (graph-derived)

**File → module map (from `get_architecture` + filename scan):**

| File | Role | Notes |
|---|---|---|
| `src/tokens.ts` | Chevrotain lexer (`ArgdownLexer`, `tokenize()`) | 217-line public entry, returns `ILexingResult`. |
| `src/parser.ts` | Chevrotain parser + CST builder + `parse()` | 1256 lines. The `parse()` orchestrator (lines 1213–1256) is the only public parser entry; everything else is internal. |
| `src/visitor.ts` | CST → AST transformer | Has per-construct `visitX` functions; isolated from chevrotain types. |
| `src/ast.ts` | AST type definitions (discriminated unions) | `Document`, `Fact`, `Rule`, `Relation`, `Block`, `AttributeBlock`, `Value` variants, `SourceLocation`, `Position`. |
| `src/index.ts` | **Public API surface** (47 lines) | Re-exports `parse`, `formatError`, `ParseResult`, `ParseOptions`, `ParseError`, `ParseErrorCode`, plus all AST types. |
| `src/parser.bench.ts` | tinybench harness | 7 fixtures, baseline JSON I/O. |
| `src/parser.test.ts` | Snapshot tests | One big snapshot of representative constructs. |
| `src/parser.fuzz.test.ts` | Fuzz invariants (no-throw, shape) | |
| `src/parser.mutate.test.ts` | Mutation-roundtrip invariants | |
| `src/tokens.test.ts` | Lexer tests | |

**Pipeline (graph: `parse` → `ArgdownLexer.tokenize` → `TokenStream` → `parseDocument` → `buildAst`):**

```
source:string
   │
   ▼
ArgdownLexer.tokenize(source)         ← src/tokens.ts (chevrotain)
   │
   ▼  (ILexingResult { tokens, errors })
TokenStream(t)                        ← src/parser.ts (save/restore, error collection)
   │
   ▼
parseDocument(s) → parseElement(s)   ← src/parser.ts (chevrotain parser, CST output)
   │
   ▼  (CstNode tree)
buildAst(cst)                         ← src/visitor.ts (CST → AST)
   │
   ▼
{ ok, errors, ast?, partial? }        ← ParseResult
```

**`is_entry_point: true` (per graph metadata):** `parse`, `tokenize`. Everything else is
internal to the module.

## 5. True entry points (the public API)

From `src/index.ts` (the only file the consumer touches):

```ts
import { parse, formatError } from '@casualtheorics/argdown-2';
import type {
  ParseResult, ParseOptions, ParseError, ParseErrorCode,
  Document, Fact, Rule, Relation, Block, AttributeBlock, Value, SourceLocation,
  // …all AST types
} from '@casualtheorics/argdown-2';
import type { /* same AST types */ } from '@casualtheorics/argdown-2/ast';
```

Subpath export `./ast` (per `package.json` `exports`) lets consumers import AST types
without pulling chevrotain's parser surface.

## 6. What makes it unique

- **Datalog-lite, not just a graph syntax.** `:-` + `,` is a real derivation operator.
  Argdown 1.x did not have it.
- **One unified attribute block** replaces every previous inline-modifier hack (parenthetical
  notes, bracket prefixes, dual-curlies). The grammar is **additive** — old syntactic sugar
  is gone, not aliased.
- **Best-effort partial AST** on parse failure. Most parsers return `null` and force
  consumers to lint the source themselves; this one gives you what it could recover so a
  VS Code extension can still highlight.
- **CST separation.** Chevrotain produces a CST; the AST is built in a separate `visitor.ts`
  with no chevrotain types leaking past the boundary. Consumers see clean discriminated
  unions.
- **Property-based invariants** as first-class tests (fuzz + mutate), not just golden files.

## 7. Method traceability

| Finding | Method |
|---|---|
| Public API surface | `get_code_snippet(src.index)` (graph) |
| `parse()` signature & error policy | `get_code_snippet(src.parser.parse)` (graph) |
| `parseDocument` recovery logic | `get_code_snippet(src.parser.parseDocument)` (graph) |
| AST type shapes (`Document`, `Fact`, `Rule`) | `get_code_snippet(src.ast.*)` (graph) |
| File/function inventory | `query_graph` + `search_graph` (graph) |
| Test files | `query_graph` (graph) + `ls` (fallback) |
| Design principles, grammar | Read `docs/DESIGN.md`, `docs/GRAMMAR.bnf` (text fallback) |
| Bench fixtures | Read `src/parser.bench.ts` (text fallback) |
| Perf numbers | Read `perf-baseline.json` (text fallback) |

## 8. Open questions for Crystal Ball

- Is there a published vs. in-house deployment story? (No `.github/`, no CI visible.)
- Is the package meant to be published, or is it a personal tool today?
- What's the migration story for Argdown 1.x users?
- Where does the partial-AST surface break consumers' assumptions today?

---

**Next stage:** `/claudikins-grfp:crystal-ball`
