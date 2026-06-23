## TRADEOFFS

**Parser approach: hand-written recursive descent over Chevrotain's CstParser.** Chevrotain's `OPTION` and `MANY`-with-`GATE` constructs would not fire their body when the next token matched the expected type, in the context of the grammar's statement disambiguation. The BNF's note-4 disambiguation requires `rule / relation / fact` (all sharing a leading `[fact-ref]`) to be distinguished by the next token. Chevrotain cannot backtrack across `SUBRULE` calls, so each failed alternative consumed tokens and stranded the parser mid-stream. We kept Chevrotain's lexer (tokenization is solid) and replaced the parser generator with a hand-written recursive descent over its token stream. `save()`/`restore()` on the stream provides the true backtracking that the grammar requires.

**Error model: `ParseResult` discriminated union, not throw.** For editor-tooling consumers, errors are data, not exceptions. A single `parse(source)` call returns a uniform `{ ok, ast, errors }` shape (or `{ ok: false, errors, partial? }` on failure). Consumers surface diagnostics in their UI without exception handling, and a partial AST stays available so the editor can keep highlighting the rest of the document while reporting errors.

**AST shape: discriminated unions with a `kind` literal, plain data.** Every node carries a mandatory `loc: SourceLocation`. No classes, no methods, no `this`. Pure data serializes (for LSP transport, snapshot testing, caching), exhausts with `switch (node.kind)`, and traverses with a generic walker. Classes would couple shape to behavior we don't need at the AST layer; the parsing cost of `as const` literals is negligible.

**Visitor in `src/visitor.ts`, parser in `src/parser.ts`.** Splitting kept each file under the `max-lines: 400` lint cap and matched the dependency direction (parser produces CST, visitor converts to AST). The visitor is independently testable from the parser, and the CST intermediate lets us swap parser implementations without touching AST construction.

**Trivia: comments as AST nodes, whitespace skipped at lex time.** Comments are user-visible (highlighting, toggling, doc generation) — they need a place in the AST. Whitespace is not. We did not build full trivia machinery (leading/trailing arrays per token) for v1 — YAGNI, and the spec deferred it.

**Token stream not exposed in the public API.** Consumers that need raw tokens can ask later. Exposing now would lock the AST to the lexer's shape and force consumers to depend on Chevrotain even when they only want the AST.

**`Position` token renamed to `PositionKw`.** The block-type keyword `position` shares a name with the `Position` AST type. TypeScript's value/type namespaces are shared per identifier, so a single import cannot bind both. We rename the *variable* (`PositionKw`) while keeping the Chevrotain *token type name* `Position` (matches the BNF keyword). The parser imports the renamed variable; consumers see no rename.

**Public subpath export `./ast`.** Type-only consumers (e.g., a doc generator that ships its own analyzer) can `import type { Fact } from '@casualtheorics/argdown-2/ast'` without pulling Chevrotain into their bundle. The runtime path defaults to the main entry.

## PHILOSOPHY

**Editor-tooling first.** Source positions on every node (1-indexed line/column, 0-indexed offset — matches LSP, Monaco, VS Code, JetBrains). Multi-error recovery with forward-progress skipping so a single `parse()` call yields all diagnostics for the editor's problem panel. Discriminated-union `ParseResult` so the call shape is uniform regardless of whether parsing succeeded, failed, or partially failed.

**YAGNI ruthlessly.** No CJS build. No browser bundle. No semantic warnings (unused attributes, duplicate IDs — those belong in a separate analyzer). No AST builders. No visitor/walker utilities (consumers can write a one-liner walker if they need one). No performance benchmarks. No published README. No `examples/` directory. The minimum that satisfies the spec — and no more.

**Conservative TypeScript.** `strict`, `isolatedModules`, `isolatedDeclarations`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Every export carries an explicit type annotation. No `any`. Chevrotain 11's runtime-generated rule methods need `declare` field annotations for the type system to see them — this is a documented pattern now part of the project conventions.

**Strict tooling as enforcement.** oxlint type-aware (semantic lints that need the type system: `no-floating-promises`, `await-thenable`, `no-unsafe-*`, `restrict-*`) plus structural rules (`max-lines: 400`, `max-lines-per-function: 80`, `max-params: 5`, `max-depth: 3`). oxfmt with `sortImports` and `sortExports` for deterministic diffs. The lint rules are not bikeshedding — `no-magic-numbers` ignores common sentinels (`-1, 0, 1, 2`) so it doesn't fight the lexer.

**The AST is the contract.** Arrow names are semantic (`'support'`, `'attack'`, `'undercut'`, …) not symbols (`'-->'`, `'--x'`, `-.->`). Block types are string literals (`'evidence'`, `'position'`). Consumers never need to know the operator symbol or token shape to interpret a node. A future LSP hover can map `'undercut'` back to `-.->` without the AST itself leaking token-shape details.

**Granularity by responsibility, not technical layer.** `ast.ts` is pure types. `tokens.ts` is the lexer. `visitor.ts` is CST-to-AST. `parser.ts` is the parser. `index.ts` is the public surface. Each file has one clear purpose with a well-defined interface. Dependency direction is strictly one-way (index → parser → visitor, all → ast; parser → tokens). No cycles. Splitting by responsibility, not by syntactic class, is what makes each file independently understandable in one context window.

<!-- snowball:decisions-digest:sha256:12f9c6bba83b5e79 -->
