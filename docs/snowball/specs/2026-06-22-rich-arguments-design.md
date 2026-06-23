# Rich Arguments in argdown-2

**Status:** Draft
**Date:** 2026-06-22
**Scope:** Parser, AST, visitor, file layout, testing infrastructure

## Goals

Add a first-class `Argument` AST node kind that subsumes the existing `Rule` and supports:

- **Multi-premise arguments** — comma-separated premises in the body
- **Conjunctive premises** — the comma is AND (carried over from `Rule`)
- **Disjunctive premises** — `|` introduces a disjunction as a single premise value
- **Nested arguments** — an `Argument` can appear as a premise of another
- **Conclusion hierarchies** — an `Argument`'s conclusion can be another `Argument`, so a hierarchy emerges from inference chains

Also add **multi-premise relations** — comma-lists at relation endpoints (`[A, B] --> [C]`).

Replace the existing `Rule` syntax (`[#A] :- [#B], [#C].`) with `->` (`([#A]) -> [#B], [#C].`). `:-` is **dropped entirely** — a hard break, no deprecation channel.

## Non-goals

- Analyzers, linters, semantic warnings (those belong in a separate analyzer per the ADR)
- New block types or new attribute keys
- Mermaid renderer changes (renderer reads AST, not parser)
- Pre-existing facts, relations, and blocks remain unchanged

## Architecture

### AST shape

One `Argument` node kind with discriminated-union `conclusion` and `premises`. No optional fields — richer features are *types*, not `?` fields.

```ts
// Conclusion is intentionally narrower than Premise — the grammar
// production rules cannot produce a disjunction-conclusion.
// Don't add a disjunction variant here without updating the parser
// and adding a grammar rule that produces one.
type Conclusion =
  | { kind: 'atom'; value: FactRef; loc: SourceLocation }
  | { kind: 'argument'; value: Argument };

// Premise is the full set — three variants earn their keep on
// consumer-side dispatch (atom: reference resolution; argument:
// sub-argument validation and recursion; disjunction: set-membership
// semantics and proof-search branching).
type Premise =
  | { kind: 'atom'; value: FactRef; loc: SourceLocation }
  | { kind: 'argument'; value: Argument }
  | { kind: 'disjunction'; values: FactRef[]; loc: SourceLocation };

type Argument = {
  kind: 'Argument';
  conclusion: Conclusion;
  premises: Premise[];
  attributes?: AttributeBlock;
  loc: SourceLocation;
};
```

`Conclusion` and `Premise` share *shape* (both have a `kind` literal, both are plain data, both have `loc`) but do not share a base type. The unification is at the structural level (same shape discipline), not at the type-system level (no common ancestor).

### File layout

Split `src/parser.ts` (currently 1236 lines, over the 400-line cap) into focused files. The split is by responsibility, mirroring the existing `parse*` function boundaries:

| File | Responsibility | Est. lines |
|---|---|---|
| `src/parser.ts` | Top-level: `parse`, `parseDocument`, `parseStatement`, dispatch | ~250 |
| `src/parser-arg.ts` | `parseArgument`, `parseConclusion`, `parsePremise`, `parsePremiseList`, `parseDisjunction`, `parseArgExpr` | ~250 |
| `src/parser-relation.ts` | `parseRelation`, `parseRelationEndpoint`, multi-premise endpoint | ~200 |
| `src/parser-fact.ts` | `parseFact`, `parseFactRef`, `parseFactHead`, `parseFactStatement` | ~250 |
| `src/parser-block.ts` | `parseBlock`, `parseBlockBody`, etc. | ~200 |
| `src/parser-frontmatter.ts` | `parseFrontmatter`, YAML helpers | ~200 |
| `src/parser-util.ts` | `TokenStream` save/restore, `peekPastFactRef`, shared helpers | ~150 |

The existing `src/parser.ts` becomes a re-export shim: `export * from './parser-impl'`. Tests continue to import from `src/parser.ts`.

### Visitor

`src/visitor.ts` (currently 614 lines) gains a `visitArgument` method. Three sub-cases for `conclusion.kind` and three for each `premise.kind`, expressed in the discriminated union.

Multi-premise relations: the visitor unfolds `EndpointList` in the CST into multiple binary `Relation` AST nodes. The CST preserves the source structure; the AST is always binary.

## Grammar (EBNF)

```ebnf
(* Argument: a single-line inference statement *)
Argument        ::= "(" Conclusion ")" "->" PremiseList "." AttributeBlock?
Conclusion      ::= FactRef | ArgExpr
PremiseList     ::= Premise ("," Premise)*
Premise         ::= FactRef | ArgExpr | Disjunction
Disjunction     ::= "(" FactRef ("|" FactRef)+ ")"
ArgExpr         ::= Argument                (* an argument used as a value *)

(* Relation: graph edges, with multi-premise endpoints *)
Relation        ::= Endpoint Arrow Endpoint AttributeBlock?
Endpoint        ::= FactRef | ArgExpr
EndpointList    ::= Endpoint ("," Endpoint)+   (* multi-premise endpoint *)
```

### Concrete examples

| Source | AST |
|---|---|
| `([#A]) -> [#B], [#C].` | 1 `Argument` with 1 atom conclusion, 2 atom premises |
| `([#A]) -> ([#B] \| [#C]), [#D].` | 1 `Argument` with 1 disjunction premise + 1 atom premise |
| `([#A]) -> ([#B]) -> [#C], [#D].` | 1 `Argument` with 1 nested `Argument` premise |
| `([#Thesis]) -> ([#Sub]) -> [#P1].` <br> `([#Sub]) -> [#P2].` | 2 `Argument` nodes; the second's head `#Sub` is the same `FactRef` referenced in the first's nested premise — hierarchy emerges from the data |
| `[#A], [#B] --> [#C].` | 1 `Relation` with `EndpointList([#A], [#B])` in CST; visitor unfolds to 2 binary `Relation` nodes |
| `[#X] --x ([#R]) -> [#P].` | 1 `Relation` with `ArgExpr` (parenthesized argument) as the right endpoint |
| `([#A]) -> [#B]. { confidence: 0.8 }` | 1 `Argument` with `attributes` attached |

## Parse disambiguation

The hardest call is `(` lookahead:

- `([#A])` — opening of an argument (head)
- `([#A] | [#B])` — opening of a disjunctive premise
- `([#A]) -> [#B].` — opening of an `ArgExpr` (nested argument)

The disambiguator is what follows the matching `)`: if `|` appears before the matching `)`, it's a disjunction; if `->` appears after the matching `)`, it's a nested argument. This mirrors the existing `peekPastFactRef` pattern in `parseStatement` (note-4 disambiguation) — `save()`/`restore()` on the token stream handles the lookahead.

For the comma-in-relations case: `[#A], [#B] --> [#C]` — at relation-endpoint parse time, after consuming a `FactRef`, the parser checks for `Comma`. If present, consumes the comma and parses another endpoint, building an `EndpointList`. The visitor unfolds this into multiple binary `Relation` nodes.

`ArgExpr` detection: when `parseRelationEndpoint` sees `(`, it delegates to `parseArgExpr` → `parseArgument`. Same parser used for top-level arguments.

Period consumption: the existing `parseRule` has a documented fix (commit `080b6a6`) where the period attaches to the CST subtree. `parseArgument` does the same.

## Error handling

### Hard break for `:-`

When the parser sees `FactRef :-`, it emits a parse error at the `:-` token with the message:

> `':-' syntax was removed. Use '->' for inference (e.g., '([#A]) -> [#B].').`

The error attaches to the `:-` token's source location, not the surrounding fact-ref, so editor tooling can highlight the operator specifically.

### Argument parse errors

| Condition | Error | Location |
|---|---|---|
| `(` with no matching `)` | `Unclosed argument: missing ')'` | the `(` |
| `)` with no matching `(` | `Unexpected ')'` | the `)` |
| `([#A])` with no `->` | `Expected '->' after argument head` | position after `)` |
| `([#A]) -> .` (no premises) | `Argument requires at least one premise` | the `.` |
| `([#A] \|` (unclosed disjunction) | `Unclosed disjunction: missing ')'` | the `(` |
| `([#A] \| [#B])` outside premise position | `Disjunction is only valid in premise position` | the `(` |
| `([#A]) -> [#B]` (no period) | `Expected '.' to end argument` | the EOF or next token |
| `([#A]) -> ([#B] -> [#C]` (nesting without closing paren) | `Unclosed nested argument` | the outer `(` |

### Recovery

Multi-error recovery via `ParseResult.errors[]` (per the ADR):
- Save token position before each parse attempt
- On failure, restore position, emit error, continue with the next statement
- Forward-progress skipping (consume one token and try again) prevents infinite loops on garbage

### Edge cases

- **Empty document** — no argument, no errors.
- **Argument at EOF with no period** — emit error at EOF, do not consume beyond.
- **Deep nesting** (5+ levels) — recursive descent naturally handles depth limited by stack.
- **Disjunction in conclusion position** — emit error, do not produce a malformed AST. The type system's narrower `Conclusion` makes this a compile-time guarantee.
- **Mixed comma and pipe at top level** — `([#A]) -> [#B], [#C] | [#D].` parses as: premise 1 = atom `#B`, premise 2 = disjunction `([#C] | [#D])`. The comma is the list separator; the pipe inside parens is the disjunction operator.
- **Trailing comma** — `([#A]) -> [#B],.` is a parse error at the `,` (consistent with existing parser treatment of trailing commas in lists).

## Testing

### Unit tests

New file `src/parser-arg.test.ts` with parse-and-assert tests for each new construct:

- Simple argument: `([#A]) -> [#B].` → 1 atom conclusion, 1 atom premise
- Multi-premise: `([#A]) -> [#B], [#C], [#D].` → 1 conclusion, 3 atom premises
- Disjunction: `([#A]) -> ([#B] | [#C]).` → 1 conclusion, 1 disjunction premise
- Mixed: `([#A]) -> ([#B] | [#C]), [#D].` → 1 conclusion, 1 disjunction + 1 atom premise
- Nesting: `([#A]) -> ([#B]) -> [#C].` → 1 conclusion, 1 nested argument premise
- Hierarchy (two-arg chain): 2 separate `Argument` nodes, the second's head referenced in the first's nested premise
- ArgExpr in relation: `[#X] --x ([#R]) -> [#P].` → 1 `Relation` with `ArgExpr` as right endpoint
- Multi-premise relation: `[#A], [#B] --> [#C].` → visitor unfolds to 2 binary `Relation` nodes
- Hard-break error: `[#A] :- [#B].` → 1 parse error at `:-`
- All error cases from the table above

### Snapshot tests

Vitest snapshot tests for AST output. Snapshot the entire `Argument` node (modulo `loc` via a `stripLoc` helper) for each new construct. Snapshot mismatches reviewed in code review.

### Fuzz invariant extensions

The existing fuzz suite (`src/parser.fuzz.test.ts`) gains:

- **Invariant 5: premise shape closure** — every `Premise` has exactly one of `{atom, argument, disjunction}` kind; disjunction premises have at least 2 fact-refs.
- **Invariant 6: conclusion shape closure** — every `Conclusion` has exactly one of `{atom, argument}` kind, never `disjunction`. Enforces the grammar at the AST level.
- **Invariant 7: period attached** — every `Argument` has a period in its source range, captured in the CST subtree.
- **Invariant 8: multi-premise relation structure** — every `EndpointList` in a `Relation` has at least 2 endpoints.

New mutation operations: `->` ↔ `:-` (verifies hard-break error is uniform), `<disjunction> | <atom>` (verifies disjunction-conclusion error).

### Stryker mutation testing

Add Stryker JS for the new code:

- **Tooling:** `@stryker-mutator/core` + `@stryker-mutator/typescript-checker` + `@stryker-mutator/vitest-runner`
- **Scope:** Only mutate new and modified files (`src/parser-arg.ts`, `src/parser-relation.ts`, the new sections of `src/visitor.ts`). The existing files stay clean.
- **Config:** `stryker.config.mjs` at the repo root. Mutation score threshold: 80% killed.
- **Workflow:** Manual pre-merge check via `yarn mutate`. The run is 5-15 min, too long for every PR. Surviving mutations are reported as test gaps and fixed before merge.

### Mermaid regression

The Mermaid renderer's tests don't change (renderer reads AST). One regression test: `([#A]) -> ([#B] | [#C]).` should render the disjunction as a single node with the alternative labels, distinct from a multi-premise relation.

### Consumer migration tests

Every test file that pattern-matches `kind: 'Rule'` updates to `kind: 'Argument'`:

- `src/parser.test.ts` — existing rule tests deleted; new argument tests replace them
- `src/mermaid.test.ts` — verify still passes after updates
- `src/parser.fuzz.test.ts` — invariants 1–4 reference `Rule` in their walk closure; update to `Argument`

A migration script (one-shot Node script) scans for `kind: 'Rule'` and `visitRule` and rewrites them. Run once, verify test suite passes.

## Files changed

| File | Action |
|---|---|
| `src/parser.ts` | Split (re-export shim) |
| `src/parser-arg.ts` | New |
| `src/parser-relation.ts` | New |
| `src/parser-fact.ts` | New |
| `src/parser-block.ts` | New |
| `src/parser-frontmatter.ts` | New |
| `src/parser-util.ts` | New |
| `src/ast.ts` | Add `Argument`, `Conclusion`, `Premise` types |
| `src/visitor.ts` | Add `visitArgument`; unfold `EndpointList` in `visitRelation` |
| `src/parser-arg.test.ts` | New |
| `stryker.config.mjs` | New |
| `docs/DESIGN.md` | EBNF update |
| `package.json` | Stryker deps + `mutate` script |
| `src/parser.test.ts` | Rewrite (rule tests → argument tests) |
| `src/parser.fuzz.test.ts` | 4 new invariants + mutate ops |
| `src/mermaid.test.ts` | 1 regression test |

## Consumer impact

External type-only consumers that pattern-match `kind: 'Rule'` need to update to `kind: 'Argument'`. The CasuallyTheorics LSP server (external) needs an update; the codemod is mechanical. The Mermaid renderer doesn't change (it reads AST).

## Open ADR implications

The design implies three additions to the project ADR. These should be captured in `manage_adr(mode="update")` as part of the implementation plan:

1. **Deprecation channel policy** — the ADR's "no semantic warnings in the parser" rule permits syntactic deprecations as parser-output. The hard-break policy means no deprecation channel is needed *for this feature*; the rule is in scope for any future deprecation work.

2. **AST contract clarification** — "an AST node's shape reflects the document's semantics, not its surface syntax." This is already implicit in the ADR but worth making explicit given the design decisions here.

3. **File layout philosophy** — the parser split is by responsibility, mirroring the existing `parse*` function boundaries. This is a worked example of the ADR's "granularity by responsibility, not technical layer" principle.
