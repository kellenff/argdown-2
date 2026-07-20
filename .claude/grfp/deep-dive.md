# Deep-Dive Report — argdown-2

**Date:** 2026-07-19
**Project version:** 0.2.0-alpha4 (with significant Unreleased changes)
**Graph tools:** partial (Serena cache present, but `find_symbol`/`search_for_pattern` return empty → fell back to Read/Bash)
**Method:** filename-fallback for everything (Read, Bash with wc/find/grep; project is small enough — 6075 LOC src/)
**Note on prior 2026-06-27 / 2026-07-18 deep-dives:** describe 0.1.0-alpha1 parser / 0.2.0-alpha1 reset state; current run captures alpha4 + Unreleased (first-class solver components, evidential solver, builder nesting, marketplace plugin, removed Cursor plugin).

---

## 1. What problem does this solve?

`argdown-2` is a **deterministic, formally grounded argument-graph solver** delivered as a TypeScript library and an MCP server. Concretely:

- Loads, validates, and solves **argument graphs encoded in EDN** (Extensible Data Notation).
- Implements Dung-style abstract argumentation semantics (grounded, preferred, stable, complete) plus bipolar / evidential reductions of support.
- Replaces the original Argdown 1.x custom `.argdown` language pipeline with a **canonical EDN-only representation** — parser/AST/Mermaid/CLI are gone in 0.2.0.

Two audiences:
1. **Library users** who want a strict, EDN-native argumentation solver in TypeScript/Deno.
2. **LLM agents** (Claude Code, Claude Desktop, any MCP client) who build and solve argument graphs through 14 MCP builder tools.

## 2. Tech stack

| Layer | Tech |
|---|---|
| Runtime | **Deno** (no Node-only path; release binaries compiled from `src/mcp/cli.ts`) |
| Language | TypeScript strict + `noImplicitAny` |
| Validation | **Zod 4.4.3** (cross-reference checks layered on top) |
| EDN parsing | `edn-parser-js` (vendored at `./vendor/edn-parser-js/lib/index.js`) |
| MCP | `@modelcontextprotocol/sdk` 1.29.0 (stdio transport) |
| Testing | `deno test -A --frozen --parallel` over 14 `*.test.ts` files |
| Mutation testing | Stryker + Vitest (alpha2 added it; current status unclear) |
| Distribution | JSR (`@casualtheorics/argdown-2`), GitHub Releases (native MCP binaries) |

## 3. Dependencies (from `deno.json`)

```
"edn-parser-js": "./vendor/edn-parser-js/lib/index.js"
"zod": "npm:zod@4.4.3"
"@modelcontextprotocol/sdk/": "npm:/@modelcontextprotocol/sdk@1.29.0/"
"@std/assert": "jsr:@std/assert@1"
"@std/expect": "jsr:@std/expect@1"
"@std/testing/bdd": "jsr:@std/testing@1/bdd"
"@std/testing/": "jsr:@std/testing@1/"
```

`nodeModulesDir: "auto"`, `unstable: ["npm-lazy-caching", "sloppy-imports", "node-globals"]`, strict TS with `lib: ["es2022", "deno.window"]`.

**Contradiction to flag:** `deno.json` declares `"license": "Unlicense"`. README says "Private. The license will be chosen before the first public release." These are inconsistent — README is current posture; deno.json field is likely aspirational.

## 4. Entry points

### Library
- `src/index.ts` — re-exports types + three functions: `load`, `validate`, `solve`
- `src/index.ts:63` — `load(source: string): LoadResult` (EDN → validated Document)
- `src/index.ts:58` — `validate(value: unknown): ValidationResult`
- `src/index.ts:68` — `solve(document: Document): ComponentSolveResult`

### MCP server
- `src/mcp/cli.ts:3` — `run()` from `./server.js`
- `src/mcp/server.ts:19` — `buildServer()` registers 14 tools via `McpServer`
- Binary: `argdown-2-mcp` (stdio), launched via `bash scripts/argdown-2-mcp`

### Solver pipeline (dataflow)
1. `src/edn.ts` — strict EDN reader → raw JS value
2. `src/schema.ts` (877 lines — largest file) — Zod decoding into typed `Document`
3. `src/validate.ts` (422 lines) — identity, reference, endpoint, per-solver relation-kind validation
4. `src/component-eval.ts` (167 lines) — folds component tree post-order
5. `src/reduce-dung.ts`, `src/reduce-bipolar.ts`, `src/reduce-evidential.ts`, `src/multi-extension.ts` (263 lines) — solver reducers

### Builder MCP
- `src/builder/apply.ts` (703 lines) — pure apply function for builder ops (add/remove/update)
- `src/mcp/tools.ts` — wraps builder ops as MCP tool handlers

## 5. Core features

### 5.1 Library API (`{ ok: true, ... } | { ok: false, errors }`)
**Single return-shape invariant**: every entry point returns a tagged result. Library never throws, never returns partial documents. Strongest framing in the codebase.

### 5.2 Solver catalog
| Solver | Output | Support | Reduction |
|---|---|---|---|
| `grounded` | labels | rejected at validation | — |
| `bipolar` | labels | yes | deductive (`B → sup:A->B → A`) |
| `evidential` | labels | yes | necessary (`A → nec:A->B → B`) |
| `preferred` | extensions | rejected | multi-extension |
| `stable` | extensions | rejected | multi-extension |
| `complete` | extensions | rejected | multi-extension |

### 5.3 First-class solver components (Unreleased)
- Solver is an **identified element** in its parent's local scope.
- Child internals private; child ID is a valid parent relation endpoint.
- Evaluation strictly **bottom-up** (parent relations can't feed back into child).
- Boundary layers: `native`, `aggregate`, `boundary`, `children`, `warnings`.
- Parent sees only the child's boundary confidence — clean modular composition.

### 5.4 MCP server (14 tools)
| Category | Tools |
|---|---|
| Document lifecycle | `create_document`, `list_elements` |
| Statements/Args/Inferences | `add_statement`, `update_statement`, `add_argument`, `add_inference` |
| Relations | `add_relation`, `remove_relation` |
| Solver nesting | `add_solver`, `set_import`, `remove_import` |
| Removal | `remove_element` |
| Validation/Solving | `validate`, `solve` |

Mutating tools accept `path` (atomic write via temp+rename) **or** `source` (returns updated text). Optional `parentId` scopes mutation to a nested solver. Builder refuses `builder/duplicate-id`, `builder/missing-id`, `builder/unsupported-relation-kind` with a `refused` field and no document change.

### 5.5 Claude Code plugin (one-click install)
- Marketplace: `.claude-plugin/marketplace.json` registers `argdown-2` plugin at `./plugins/argdown-2`
- Plugin bundles: MCP launcher + 3 skills (`build-graph`, `interpret-solve`, `validate-debug`)
- Distribution: launch via `bash ${CLAUDE_PLUGIN_ROOT}/scripts/argdown-2-mcp`
- Version pinned in `scripts/argdown-2-mcp.version` (CI enforces pin matches `deno.json` version)

## 6. Architecture (dataflow)

```
                ┌─────────────────────┐
   raw source → │  load(source)       │
                │  ├─ readEdn (EDN)   │
                │  ├─ decodeWire (Zod)│
                │  └─ validate        │
                │     ├─ endpoints    │
                │     ├─ references   │
                │     └─ relation-kind│
                └─────────┬───────────┘
                          │ Document
                          ▼
                ┌─────────────────────┐
                │  solve(document)    │
                │  evaluateComponent  │
                │  post-order fold:   │
                │   ├─ native layer   │
                │   ├─ aggregate layer│
                │   └─ boundary layer │
                └─────────────────────┘
```

Key invariant: **parent relations cannot feed state back into a child**. Children are sealed; their boundaries are the only thing visible upward.

## 7. CI / Release

- `.github/workflows/ci.yml` (PR to main):
  - `npm: allowlist` → `lint` → `fmt:check` → `typecheck` (`deno check`) → `test` → `check:mcp-deno` → `compile:mcp` → probe binary
  - `dry-run-publish` job verifies JSR slow-types compliance
- `.github/workflows/release.yml` (push to main):
  - Always publishes timestamped `*-dev.<UTC>` prerelease to JSR (OIDC, no mutable "latest")
  - On `deno.json` version bump → compiles 4 MCP binaries (linux/darwin × x86_64/aarch64), probes Linux, generates checksums, publishes stable JSR + GitHub Release with binaries + checksums
  - Concurrency: release queue does NOT cancel-in-progress (back-to-back merges both publish)

## 8. What makes it unique

1. **EDN as canonical.** Most argumentation frameworks expose JSON or custom DSLs. EDN gives namespaced tagged literals (`#casualtheorics.argdown2.solver/grounded`), keywords-as-IDs, and rich structural data without losing human readability.
2. **One return shape.** `{ok, ...} | {ok, errors}` for every entry point — no exceptions, no partial documents.
3. **First-class nested solvers.** Solvers are identified, scoped, and composable — unusual for argumentation libraries that treat the whole graph as one solver.
4. **MCP-as-API.** The same validation/solver pipeline powers library calls AND agent tool calls. There's no separate code path.
5. **Atomic-write I/O.** MCP tools either succeed with the new file in place, or don't touch the existing file — backed by temp+rename.
6. **CLAUDE.md for plugins.** Soft rule "never hand-edit EDN; use builder MCP tools only" is enforced in the plugin's own skills.

## 9. Test fixtures and rigor

- 7 EDN fixtures in `src/bench.fixtures/` — `small-minimal`, `small-relations`, `small-argument`, `medium-censorship`, `heavy-attacks`, `deep-arguments`, `large-stress`
- `src/parity.test.ts` — verifies that grounded labels match the **pure-attack expected set** from the Argdown 1.x censorship tutorial
- Tests run on every PR (gates quality → publish dry-run)

## 10. Open threads / contradictions

- **License.** `deno.json` declares `"license": "Unlicense"`. README says "Private. The license will be chosen before the first public release." Inconsistent; README is current posture.
- **Status.** 0.2.0-alpha4 is pre-1.0. Lots of `Unreleased` work (first-class solver components, evidential solver, builder nesting) — public release posture is "early".
- **Cursor plugin removed.** Was in alpha2, gone in unreleased. Codebase is now Claude-Code-only for plugin distribution.
- **Mutation testing paused?** Alpha2 added Stryker; not mentioned in alpha3/4 changelogs or current README.
- **EDN learning curve.** Most JS/TS developers don't know EDN. README opens with raw EDN syntax before explaining the rationale.

## 11. Vocabulary / framing candidates

The README already leads with strong framings:
- "Three functions, one return shape"
- "The library never throws and never produces a partial document"
- "First-class solver components"
- "MCP-as-API" (implied — "no separate code path")

Anti-slop risks:
- Heavy EDN exposure before explaining why EDN was chosen
- Solver table is dense; bipolar vs evidential difference is subtle
- Plugin install steps assume Claude Code context — desktop / generic MCP consumers need a different path

## 12. Sources read

| File | Purpose |
|---|---|
| `deno.json` | tasks, imports, version, license |
| `README.md` | current README state |
| `CHANGELOG.md` (200 lines) | version history |
| `AGENTS.md` | Cursor Cloud agent instructions |
| `src/index.ts` | library entry |
| `src/mcp/cli.ts` | MCP entry |
| `src/mcp/server.ts` | tool registration |
| `src/model.ts` | type definitions, solver tags |
| `src/validate.ts` | validation logic |
| `examples/argdown1-censorship.edn` | sample input |
| `examples/argdown1-censorship.mapping.md` | parity-check mapping |
| `.github/workflows/ci.yml` | CI pipeline |
| `.github/workflows/release.yml` | release pipeline |
| `.claude-plugin/marketplace.json` | marketplace manifest |
| `plugins/argdown-2/.claude-plugin/plugin.json` | plugin manifest |
| `.brainstorm/graph-status.json` | Phase 0 status |
