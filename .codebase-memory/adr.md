## TRADEOFFS

**EDN-only, solver-rooted contract.** The public data model is a strict EDN document with one top-level solver tag (`#casualtheorics.argdown2.solver/grounded`) and namespaced theory elements. This removes custom-language parsing variability and makes solver intent explicit in the source itself.

**Strict reader dependency with pinned patch.** The library uses `edn-parser-js@2.0.2` with a checked-in one-line ESM import patch so Node ESM loads are deterministic and reproducible across environments.

**Two-phase validation pipeline.** Zod first decodes EDN wire values and tagged shapes, then semantic validation resolves identity/reference constraints. This separation keeps structural and graph-integrity failures understandable and composable.

**Semantic paths over source locations.** Diagnostics report logical paths (vector index + field path) instead of parser-source token spans. The contract now targets EDN data validity rather than custom syntax trivia.

**Pure-attack grounded reduction.** Grounded solving reduces attack and contradiction into Dung attacks; support and undercut remain represented in the validated document but are omitted from v1 reduction with warnings.

**Library-only surface.** Public APIs are intentionally constrained to `load`, `validate`, and `solve` plus semantic types. CLI, renderer, parser AST, and other runtime surfaces were removed to keep the package contract minimal and stable.

**Deferred advanced solver tags.** Richer solver semantics are postponed behind future namespaced tags rather than mixed into the grounded contract now, keeping current behavior formally clear and testable.

## PHILOSOPHY

**YAGNI, explicitly.** Keep only capabilities required for the EDN+grounded contract. Additional syntax layers, compatibility shims, and advanced semantics are deferred until there is concrete demand.

**Conservative TypeScript.** Maintain strict compiler settings and explicit typing so runtime behavior and API surfaces remain auditable in a small library.

**Strict tooling as enforcement.** Formatting, linting, typechecking, tests, and build gates are mandatory release criteria, not optional quality checks.

**Granularity by responsibility.** Modules should have one clear job (read, decode, validate, reduce, solve), with directional dependencies and no feature-crossing abstractions.

<!-- snowball:decisions-digest:sha256:9855f76440d46a5e -->
