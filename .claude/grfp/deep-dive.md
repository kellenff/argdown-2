# Deep Dive — argdown-2

**Stage:** 1 of 5 (Deep Dive) — fresh run, 2026-06-27
**Codebase HEAD:** `9384257 Merge pull request #1 from kellenff/cursor/update-bnf-grammar-phase-2-774e`
**Graph tools available:** Yes (`Users-kellen-Projects-argdown-2`, 1253 nodes, 2541 edges, status `ready`)
**Method:** Graph-augmented (architecture, search_graph, trace_path, get_code_snippet); Read for docs and non-code files.

---

## 0. Drift status (vs prior deep-dive 2026-06-23)

| Item | Prior report | Current state |
| --- | --- | --- |
| Graph size | 705 nodes, 1559 edges | **1253 nodes, 2541 edges** (re-indexed) |
| Solver toolkit | Not present | **NEW**: `solver.ts` (428 lines), `solver-aspic.ts`, `solver-multi.ts`, `solver-graph.ts`, 4 solver benchmarks, 11 solver test files |
| Stringifier | Not present | **NEW**: `stringifier.ts` (292 lines), `stringifier.test.ts` (576 lines, 184 snapshot cases) |
| CLI surface | Single binary, render-only | **NEW**: subcommand tree (`cli/{ast,format,help,input,render,solve,validate}.ts`); legacy `argdown-mermaid` shim retained |
| Multi-extension semantics | Not present | **NEW**: preferred/stable/complete × dung/bipolar/aspic/evidential = 12 new `--semantics` values |
| Public API exports | 5 functions | **31 functions** (15 solvers, parse, render, stringify, formatError) |
| AST types exported | 4 | **38 types** (full discriminated-union surface) |
| Dead code from prior report | `parseHeadingText`, `parsePlainScalar`, `blockTypeName` dup | Still 0 in-degree; still present (not yet deleted) |

**Resolution:** The codebase has grown substantially between deep-dives. The lead example still works (parser + Mermaid render is the same pipeline), but the README must reflect the new solver surface, stringifier, and CLI subcommand tree.

---

## 1. What problem does this solve?

`argdown-2` is a TypeScript parser, formal-semantics solver, and Mermaid renderer for **Argdown Extended** — a textual language for representing argument maps, claims, inferences, and the relations between them. It sits in three places simultaneously:

- Between prose argumentation and diagrammatic argument visualization (Mermaid flowcharts): human-writable, machine-parseable, downstream-renderable.
- Between an argument's source text and a formal-labelling of which claims survive which attacks (Dung-style grounded extension, bipolar support, ASPIC+, evidential necessary support, and 12 multi-extension variants).
- Between an argument as expressed and an argument as round-tripped: `stringify(ast)` reconstructs `.argdown` source from the AST.

The "Extended" qualifier is the project's distinctive contribution. Canonical Argdown (argdown.org) is informal around edge cases — modifier prefixes overlap, parentheses do too many jobs, undercut/undermine share a glyph. `argdown-2` replaces that with:

- **Linked inferences as `Argument`** — `([#X]) -> [#Y], [#Z].` with optional disjunction `([#A] | [#B])` and arbitrary nesting `([#thesis]) -> ([#sub]) -> [#p1], [#p2].`. Replaces Datalog-style `:-` rules.
- **Seven-arrow taxonomy** — support (`-->`), attack (`--x`), undercut (`-.->`), undermine (`-.-`), concession (`~>`), qualification (`?>`), equivalence (`<->`).
- **Unified `{}` attribute blocks** for metadata, modality, evidence (typed values: string, number, bool, null, flow-seq, flow-map, plain scalar).
- **Multi-premise endpoints** — comma lists at either end of a relation.
- **Structured blocks** — `:::evidence[...]`, `:::stakeholder[...]`, `:::meta[...]`, `:::position[...]`, `:::domain[...]` with YAML-ish bodies.

## 2. Who is it for?

- **Policy analysts / researchers** writing structured argument maps (climate policy, ethics, jurisprudence). `docs/DESIGN.md` ships a worked example.
- **Tool builders** embedding argumentation in a TS/ESM pipeline — `parse()` returns a typed AST, `renderMermaid()` returns a string, `solve()` returns `{ labels, warnings }`.
- **Engineers writing CLIs** that consume `.argdown` files — the `argdown` binary reads stdin or a file and dispatches to subcommands.
- **Formal-reasoning developers** who need grounded labelling or multi-extension semantics over an argument graph.
- **Editor / IDE plugin authors** — the `./ast` subpath and partial-AST-on-error behavior are exactly what hover/diagnostics need.

It is **not yet**: a public-facing argumentation web-app, a collaborative editor, a non-TS-bindings library. The package is `private: true` at version `0.0.0`.

## 3. Core features

| Feature | Status | Notes |
| --- | --- | --- |
| Lexer + parser to typed AST | Yes | Chevrotain-based; splits per construct (`parser-arg`, `parser-block`, `parser-fact`, `parser-frontmatter`, `parser-relation`) |
| Position-preserving parse errors | Yes | `formatError(err, label)` formats with filename/line/column |
| Partial-AST on error | Yes | Returns `{ ok: false, partial: ast }` for best-effort downstream output |
| Mermaid `flowchart TD` renderer | Yes | Pure AST to string, content-keyed dedupe ("Ponytail Principle") |
| **Stringifier (AST to source round-trip)** | **Yes (NEW)** | `stringify(ast, options?)` — 292 lines, 184 snapshot cases |
| **Solver: Dung grounded extension** | **Yes (NEW)** | `solve(ast)` |
| **Solver: bipolar support** | **Yes (NEW)** | `solveBipolar(ast)` — Cayrol & Lagasquie-Schiex §3.2 deductive support |
| **Solver: ASPIC+ structured argumentation** | **Yes (NEW)** | `solveAspic(ast)` — reads `preference:` attribute |
| **Solver: evidential necessary support** | **Yes (NEW)** | `solveEvidential(ast)` — Cayrol & Lagasquie-Schiex §3.3 |
| **Multi-extension semantics (12 variants)** | **Yes (NEW)** | preferred/stable/complete × {dung, bipolar, aspic, evidential} |
| **CLI subcommand tree** | **Yes (NEW)** | `render`, `solve`, `ast`, `validate`, `format`, `input`, `help` |
| **CLI legacy shim** | **Yes** | `argdown-mermaid` binary and `--solve`/`--semantics=...` flag form still work; one-time stderr deprecation hint |
| **Solver benchmarks** | **Yes (NEW)** | `tinybench` over 7 fixtures, baseline JSON, `bench:solver:check` regression guard |
| Frontmatter (`===`) | Yes | YAML key:value lines |
| Headings (`# ...` to `######`) | Yes | |
| Structured blocks | Yes | `:::evidence`, `:::meta`, `:::position`, `:::stakeholder`, `:::domain` |
| Comments (`//`, `/* */`) | Yes | |
| Attribute blocks (`{}`) | Yes | Typed values (string/number/bool/null/flow-seq/flow-map/plain scalar) |
| Linked arguments (`([#X]) -> [#Y].`) | Yes | Multi-premise, disjunction, nesting |
| Relations (7 arrow types) | Yes | Support, attack, undercut, undermine, concession, qualification, equivalence |
| Multi-premise endpoints | Yes | Comma-separated lists, unfolded into binary pairs |
| Hard-error for legacy `:-` | Yes | Lexer retains the token so the parser rejects with a clear message |
| Mutation testing (Stryker) | Yes | 80%+ threshold enforced |
| Fuzz testing | Yes | `parser.fuzz.test.ts` |
| Performance baseline | Yes | `tinybench` + `perf-baseline.json` (parser) and `perf-baseline-solver.json` (solver) |
| Snapshot tests | Yes | `src/__snapshots__/`, plus `stringifier.test.ts` |
| Public npm release | No | `private: true, "0.0.0"` |

## 4. Architecture

**Type:** Library + CLI tool. ESM-only. Node ≥18. Yarn 4 with PnP. Single runtime dependency: `chevrotain ^11.0.3`.

**Public surface** (`src/index.ts` — 74 lines):
- **Functions:** `parse`, `formatError`, `renderMermaid`, `stringify`, plus **15 solver entry points** (`solve`, `solveBipolar`, `solveEvidential`, `solveAspic`, and the 11 multi-extension variants).
- **Types:** `ParseResult`, `ParseOptions`, `ParseError`, `ParseErrorCode`, `StringifyOptions`, `SolveResult`, `MultiSolveResult`, `Label`, and the full 38-node discriminated-union AST surface.
- **`./ast` subpath** exists so type-only consumers don't pull Chevrotain into their bundle.

**Folder structure** (`src/`):

```
index.ts              public API surface
parser.ts             thin facade re-exporting per-construct parsers (parse, formatError)
tokens.ts             Chevrotain lexer (ArgdownLexer.tokenize)
parser-util.ts        TokenStream + helpers
parser-frontmatter.ts `===` YAML frontmatter
parser-fact.ts        `[#id] claim text { attrs }`
parser-relation.ts    `[#A] --> [#B] { ... }` (7-arrow taxonomy)
parser-arg.ts         `([#X]) -> [#Y], [#Z].`  (the cycle-2 addition)
parser-block.ts       `:::evidence[...] ... :::`
ast.ts                discriminated-union AST types (pure data, no runtime)
visitor.ts            CST-to-AST transformers (entry point)
visitor-arg.ts        Argument CST-to-AST
visitor-block.ts      Block CST-to-AST
visitor-frontmatter.ts YAML CST-to-AST
visitor-walk.ts       AST walker utilities
mermaid.ts            pure AST to Mermaid `flowchart TD`
stringifier.ts        AST to source round-trip (NEW)
solver.ts             15 solver entry points (NEW)
solver-aspic.ts       ASPIC+ solver (NEW)
solver-multi.ts       multi-extension SCC/lift machinery (NEW)
solver-graph.ts       argument-graph reduction (NEW)
cli.ts                top-level `argdown` dispatcher (argv to subcommand)
cli/                  one file per subcommand (render, solve, ast, validate, format, input, help)
parser.bench.ts       tinybench, 7 fixtures
solver.bench.ts       tinybench, 4 solver benches × 7 fixtures (NEW)
parser.fixtures/      7 documented .argdown fixtures
```

**Entry points** (from `trace_path` on `parse`):
- 2-hop callers: `cli/input.ts:loadInput` (CLI), `parser.bench.ts:runBench`, `solver.bench.ts:makeTaskBody` + `runSolverBench`, `cli/solve.ts:run`.
- 2-hop callees: `parser.ts:parseDocument` to `parser-frontmatter.ts:parseFrontmatter` to `parser-util.ts:TokenStream.{save,restore,eof}`, and `parser.ts:parseElement` to `visitor.ts:visitDocument`.

## 5. Top fan-in / fan-out (graph)

**Top fan-in (highly reused helpers — KEEP GREEN):**

| Function | File | In-degree | Role |
| --- | --- | --- | --- |
| `parse` | `parser.ts` | **29** | Public entry point |
| `pickFirst` | `visitor.ts` | 21 | First-child helper |
| `tokenNode` | `parser-util.ts` | 20 | CST node wrapper — used everywhere |
| `locFromTokens` | `visitor.ts` | 19 | Source location from token range |
| `collectAllTokens` | `visitor.ts` | 18 | Flatten CST children |
| `stringify` | `stringifier.ts` | 13 | AST to source round-trip |
| `solveMulti` | `solver.ts` | 9 | Multi-extension dispatcher |
| `tokenRule` | `parser-util.ts` | 11 | Token to CST rule helper |

**Top fan-out (high coupling — these orchestrate):**

| Function | File | Out-degree | Role |
| --- | --- | --- | --- |
| `dispatchMulti` | `cli/solve.ts` | 12 | Multi-extension flag dispatcher |
| `run` | `cli/solve.ts` | 11 | Solve subcommand top-level |
| `parseFrontmatter` | `parser-frontmatter.ts` | 10 | YAML + value parser dispatch |
| `parseStatement` | `parser.ts` | 10 | Per-line dispatcher |
| `makeTaskBody` | `solver.bench.ts` | 18 | Benchmark task generator |
| `parseValue` | `parser-frontmatter.ts` | 8 | Value-type dispatcher |
| `visitBlock` | `visitor-block.ts` | 8 | AST constructor for structured blocks |
| `parseArgument` | `parser-arg.ts` | 7 | Argument parser |
| `parsePremise` | `parser-arg.ts` | 7 | Premise parser |

## 6. Dead code (graph-confirmed)

| Symbol | Location | Inbound edges | Confidence | Action |
| --- | --- | --- | --- | --- |
| `parseHeadingText` | `parser-frontmatter.ts:63–72` | **0** | High | Delete (~10 lines + stale comment) |
| `parsePlainScalar` | `parser-frontmatter.ts:74–76` | **0** | High | Delete (3 lines) |
| `blockTypeName` | `visitor.ts:110–125` | **0** | High | Delete (duplicate of `visitor-block.ts:17`; 16 lines) |
| `tarjanScc` | `solver-multi.ts` | **0** | Medium | Read with `get_code_snippet`; may be reserved for future use |
| `run` | `cli/validate.ts` | **0** | Low | Likely called via dispatcher; trace needed before deletion |

**Verified non-dead:**
- All `src/index.ts` re-exports (public API)
- `tokenNode` (20 in-degree), `pickFirst` (21), `locFromTokens` (19), `collectAllTokens` (18), `tokenRule` (11)

## 7. Performance posture

`perf-baseline.json` (parser, captured 2026-06-22):

| Fixture | Size | ops/sec | p99 (ms) | Peak heap delta (MB) |
| --- | --- | --- | --- | --- |
| `small-claim` | 181 B | 41,479 | 0.038 | 0.6 |
| `small-rule` | 127 B | 56,723 | 0.024 | 0.3 |
| `small-relation` | 216 B | 31,132 | 0.045 | 0.7 |
| `medium-climate` | 1,646 B | 5,261 | 0.326 | 0.9 |
| `heavy-relations` | 2,311 B | 2,487 | 0.585 | 1.2 |
| `deep-nesting` | 1,439 B | 7,415 | 0.168 | 0.4 |
| `large-stress` | 120,873 B | 41 | 39.66 | 34.8 |

`perf-baseline-solver.json` (solver, NEW since prior deep-dive). Throughput scales linearly with file size; the 121 KB fixture parses in ~40 ms p99. No regression vs prior capture.

## 8. Dependencies

| Dep | Pinned | Notes |
| --- | --- | --- |
| `chevrotain` | `^11.0.3` | Major version behind (12.x released 2026-03; requires Node ≥22). Fork: bump `engines.node` to `>=22` or stay on 11 and document why. |
| `vitest` | `^1.6.0` | Minor drift; works fine. |
| `typescript` | `^5.4.5` | Stable. |
| `oxlint`, `oxfmt` | `^0.6.0` | Active rust-based tooling; will move. |
| `tinybench` | `^2.6.0` | Benchmark harness. |
| `tsx` | `^4.22.4` | TS execution for benchmarks. |
| `@stryker-mutator/*` | `8.7.1` | Pinned exact. |
| `@types/node` | `^20.12.0` | Node 18+ compatible types. |

**No security advisories visible in `package.json`.** No hardcoded secrets. No `TODO`/`FIXME`/`HACK`/`XXX` markers anywhere in `src/` (per crystal-ball prior run; re-grep pending).

## 9. CI/Automation

**No CI workflow present.** `.github/workflows/` does not exist (or is empty). Local validation steps are documented in `package.json` scripts: `yarn lint`, `yarn typecheck`, `yarn test`, `yarn mutate`, `yarn bench:check`, `yarn bench:solver:check`.

## 10. Chat History Context

The orchestrator references `~/.claude/history.jsonl` for repeated-question patterns. Locally-grounded evidence (staging files from the prior 2026-06-23 run) shows the user struggled with:
- Argdown 1.x resemblance risk (brain-jam §3: the "pragmatic correction")
- README audience tradeoff: Tool Integrator vs Document Author (brain-jam §4)
- Spec-conformance vs parser-extensibility as a status fact, not architecture (brain-jam §4)
- M-dash usage in prose (style-guide §4 violation in the prior README)

## 11. Output Format

```markdown
# Deep Dive Findings

## Project Overview
- Type: Library + CLI tool (TypeScript, ESM, Node ≥18, Yarn 4 PnP)
- Tech Stack: TypeScript, Chevrotain 11, Vitest, Stryker, tinybench, oxlint/oxfmt
- Value Proposition: parser + Mermaid renderer + 4 grounded solvers + 12 multi-extension variants + AST stringifier for Argdown Extended argumentation markup
- Entry Point: `parse(source, options)` (library); `argdown <subcommand> <file>` (CLI)
- Architecture: per-construct parser files, single CST-to-AST boundary, solver side is pure functions over the AST, CLI dispatcher + per-subcommand file

## Dependencies
- Runtime: Node ≥18, chevrotain ^11.0.3 (single runtime dep)
- System: none
- Dev: vitest, typescript, oxlint, oxfmt, @stryker-mutator/*, tinybench, tsx, @types/node
- Most-imported packages (from graph): chevrotain dominates; otherwise only Node built-ins

## Entry Points (from search_graph + trace_path)
- `src/parser.ts:parse` (in-degree 29, public) — calls `parseDocument` to `parseFrontmatter` + `parseElement` (2-hop)
- `src/cli/input.ts:loadInput` — wraps `parse` for CLI consumption
- `src/parser.bench.ts:runBench` and `src/solver.bench.ts:runSolverBench` — both wrap `parse`
- `src/cli/solve.ts:run` — calls `parse`, then dispatches to one of 12 solvers

## CI/Automation
- Build: none (no `.github/workflows/`)
- Badge sources: none (no CI to badge)

## User Context (from prior staging + repo history)
- Common Struggles: audience-tradeoff framing (Tool Integrator vs Document Author), Argdown 1.x resemblance risk, M-dash Anti-Slop violations
- Decisions Made: spec-frozen grammar, no shims, single runtime dep, `./ast` subpath boundary, hard-error on legacy `:-`
- Focus Areas: parser correctness, formal-semantics solvers, solver coverage (Dung / bipolar / ASPIC+ / evidential), stringifier round-trip

## Missing Information (Blockers)
- [ ] Whether `tarjanScc` in `solver-multi.ts` is reserved or dead (in-degree 0)
- [ ] Whether `run` in `cli/validate.ts` is dispatcher-called (in-degree 0 from search_graph but very likely called via the CLI dispatcher)
- [ ] Re-grep for TODO/FIXME after the prior run's claim that there were none

## Graph Index State
- Indexed: Yes (`Users-kellen-Projects-argdown-2`, 1253 nodes, 2541 edges)
- Method: graph
```