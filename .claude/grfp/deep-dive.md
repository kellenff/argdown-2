# Deep-Dive Report — argdown-2

**Date:** 2026-08-07 (refresh)
**Project version:** `0.2.0-alpha4`
**Branch:** `001-upgrade-deno` (Deno 2.9.2 pin)
**Graph tools:** Yes — `codebase-memory-mcp` (6,577 nodes, 18,236 edges)
**Method:** graph-augmented (architecture, entry points, function topology, fan-in analysis) + Read fallback for non-code files (`deno.json`, `CHANGELOG.md`, `.specify/memory/constitution.md`)

**Note on prior 2026-06-27 / 2026-07-19 deep-dives:** the Jul-19 capture is the source of truth for alpha4 + Unreleased scope; this refresh captures deltas since then. The old report's `license` contradiction is resolved (both README and `deno.json` now say `Unlicense`).

---

## 1. What problem does this solve?

`argdown-2` is a **deterministic, formally grounded argument-graph solver** delivered as a TypeScript library, a stdio MCP server, a CLI, a Claude Code plugin, and a Pi coding-agent package. Concretely:

- Loads, validates, and solves **argument graphs encoded in EDN** (Clojure-origin data notation).
- Implements Dung-style abstract argumentation semantics (`grounded`, `preferred`, `stable`, `complete`) plus bipolar / evidential reductions of support.
- Replaces the original Argdown 1.x custom `.argdown` language pipeline with a **canonical EDN-only representation** — parser / source AST / Mermaid renderer / CLI are gone in `0.2.0`.

**Two audiences:**
1. **Library users** — strict, EDN-native argumentation solver in TypeScript/Deno.
2. **LLM agents** (Claude Code, Pi, any MCP client) — build and solve argument graphs through **14 builder MCP tools**.

---

## 2. Authoritative framing: the Constitution

`.specify/memory/constitution.md` (ratified 2026-08, v1.0.0, 292 lines, 5 principles) is the project's spec-of-record for non-code decisions. README + CHANGELOG defer to it.

| # | Principle | One-line |
|---|---|---|
| I | **Pipeline Purity** | `load → validate → solve` is a strict three-stage data pipeline; all return `Effect`; library never throws or produces a partial document. |
| II | **Wire Stability** | EDN theory tags (`casualtheorics.argdown2.solver/*`, etc.) are spec-frozen; additive only. |
| III | **Test-First / Effect-Composition** | Every public function gets positive + every-tagged-failure tests; BDD via `@std/testing/bdd`. |
| IV | **End-to-End MCP Coverage** | Every MCP tool is a round-trip test + stdio probe of the compiled binary is a release gate. |
| V | **Builder-as-Authoring** | EDN is mutated only through builder tools (`apply`, `emptyDocument`); hand-editing `.edn` is forbidden; UX contracts (refs, atomic write, refusal shape, exit codes) are enforced. |

**Tech constraints & distribution:**
- Runtime: **Deno only** (no Node path); pinned in `scripts/deno-version` = `2.9.2`.
- TypeScript: `strict + noImplicitAny`; CI runs `deno task publish:dry-run`.
- Distribution: JSR for library (`jsr:@casualtheorics/argdown-2`), GitHub Releases for native MCP binaries.
- MCP binary: compiled directly from `src/mcp/cli.ts` — no bundler (no esbuild, no tsdown).

---

## 3. Tech stack (from `deno.json`)

| Layer | Tech |
|---|---|
| Runtime | **Deno 2.9.2** (pinned) |
| Language | TypeScript strict + `noImplicitAny`, `lib: ["es2022", "deno.window"]` |
| Effect runtime | `npm:effect@^4.0.0-beta.101` (Effect-native library + MCP + builder + CLI) |
| Validation | `npm:zod@4.4.3` (wire decode) |
| EDN parsing | `edn-parser-js` (vendored at `./vendor/edn-parser-js/lib/index.js`) |
| MCP | `npm:@modelcontextprotocol/sdk@1.29.0` (stdio transport only) |
| CLI parser | `jsr:@optique/core@^1.2.0` + `jsr:@optique/run@^1.2.0` |
| Testing | `jsr:@std/assert@1`, `@std/expect@1`, `@std/testing/bdd@1` |
| Distribution | JSR (`@casualtheorics/argdown-2`), GitHub Releases (native MCP binaries) |

Tasks (from `deno.json`): `test`, `check`, `publish:dry-run`, `lint`, `fmt`, `mcp`, `compile:mcp`, `check:mcp-deno`, `probe:mcp`, `cli`, `check:cli-deno`, `check:npm-allowlist`.

---

## 4. Entry points (graph-derived)

### Library (`src/index.ts`)
- `load(source: string): Effect.Effect<Document, LoadError, never>` — graph: `in_degree=4, out_degree=5` (entry point).
- `validate(value: unknown): Effect.Effect<Document, SchemaError | ValidateError, never>` — graph: `in_degree=1`.
- `solve(document: Document): Effect.Effect<ComponentSolveResult, SolveError>` — graph: `in_degree=6, transitive_loop_depth=7` (entry point).
- `parseCandidate(source: string): Effect.Effect<CandidateDocument, ParseCandidateError, never>` — graph: `in_degree=6` (entry point, builder).
- `apply(doc, edit): Effect.Effect<AppliedEdit, BuilderError>` — graph: `in_degree=4, out_degree=19, complexity=50, cognitive=140, 445 lines` — **largest/hottest** function.
- `emptyDocument(solver, id, rootId): CandidateDocument` — graph: `in_degree=4`.

### MCP server (`src/mcp/cli.ts`)
- `bash scripts/argdown-2-mcp` (downloads pinned binary from `scripts/argdown-2-mcp.version`).
- `deno task mcp` (stdio MCP from source).
- `deno task compile:mcp` (compile release binary).
- `deno task probe:mcp <bin>` (release-gate stdio probe).

### CLI (`src/cli.ts`)
- `argdown-2 solve <doc.edn>` (default solver from root tag), `argdown-2 validate <doc.edn>`, `argdown-2 <doc.edn>` (back-compat bare invocation), `--dry-run` (back-compat synonym).
- Output: `table | dot | mermaid | json` (default `table`).
- Exit: `0` success, `1` parse/validate/solve error, `2` usage error.

---

## 5. Pipeline (the load → validate → solve spine)

```
EDN source
    │
    ▼ parseCandidate ──► decodeWire (Zod) ──► validateCandidate ──► Document
        │                                              │
        │                                              │
        ▼                                              ▼
  Effect<LoadError, never>                       Effect<SchemaError | ValidateError, never>
                                                           │
                                                           ▼
                                                       solve(doc)
                                                           │
                                                           ▼
                                              Effect<ComponentSolveResult, SolveError>
                                                  (SolveError = `never` in v1)
```

- **`parseCandidate`** (`src/builder/parse-candidate.ts`): strict EDN → typed `CandidateDocument`. Renamed from `softParse` (post alpha1).
- **`decodeWire`** (`src/schema.ts`): Zod-decode the candidate. Returns `Effect<CandidateDocument, SchemaError, never>`.
- **`validateCandidate`** (`src/validate.ts`): identity, reference, endpoint, per-solver relation-kind validation. `validate.ts` is a **leaf** in the package layer graph.
- **`evaluateComponent`** (`src/component-eval.ts`): post-order fold over the component tree (Unreleased first-class solver components).
- **Solver reducers** (`src/reduce-dung.ts`, `reduce-bipolar.ts`, `reduce-evidential.ts`, `multi-extension.ts`).

**Boundary contract:** every entry point returns `Effect`; every consumer unwraps with `Effect.match` (sync) or `Effect.match + Effect.runPromise` (async). The MCP layer collapses Effect→Promise at a single `runMcpEffect` adapter (`src/mcp/io.ts`).

---

## 6. Solver catalog (6 solvers)

| Solver | Tag | Output | Support | Reduction |
|---|---|---|---|---|
| `grounded` | `casualtheorics.argdown2.solver/grounded` | labels (`in`/`out`) | rejected | — (default) |
| `preferred` | `solver/preferred` | extensions | rejected | multi-extension |
| `stable` | `solver/stable` | extensions | rejected | multi-extension |
| `complete` | `solver/complete` | extensions | rejected | multi-extension |
| `bipolar` | `solver/bipolar` | labels | yes (deductive: `B → sup:A→B → A`) | `reduce-bipolar.ts` |
| `evidential` | `solver/evidential` | labels | yes (necessary: `A → nec:A→B → B`) | `reduce-evidential.ts` |

Governed by `SOLVER_TAGS` tuple + `supportedRelationKinds(solver)` in `src/model.ts`. Unsupported relation kinds fail validation with `semantic/unsupported-relation-kind` and the builder refuses them with `builder/unsupported-relation-kind` — **fail fast**, not silent omission.

---

## 7. MCP server — 14 tools, no parallel code path

Per Constitution IV, the MCP server is **not** a separate code path. Every tool calls the same `load / validate / solve / apply` pipeline as the library.

| Category | Tools |
|---|---|
| Document lifecycle | `create_document`, `list_elements` |
| Statements / Arguments / Inferences | `add_statement`, `update_statement`, `add_argument`, `add_inference` |
| Relations | `add_relation`, `remove_relation` |
| Solver nesting (Unreleased) | `add_solver`, `set_import`, `remove_import` |
| Removal | `remove_element` |
| Validation / Solving | `validate`, `solve` |

**Document refs:** every tool that takes a document accepts exactly one of `path` (filesystem `.edn`, atomic write via temp+rename) or `source` (full text, returns updated text). Both-or-neither → `mcp/invalid-ref`.

**Mutation response shape:**
- Success: `{ ok: true, warnings, diff, path|source }`.
- Builder refusal: `{ ok: false, refused: { code, message }, warnings, diff }`.
- I/O or load failure: `{ ok: false, errors }`.

---

## 8. First-class solver components (Unreleased — the key evolution)

Solver is now an **identified element** in its parent's local scope:
- Child internals private; child ID is a valid parent relation endpoint.
- Evaluation strictly **bottom-up** (parent relations can't feed back into child).
- Boundary layers: `native`, `aggregate`, `boundary`, `children`, `warnings`.
- Parent sees only the child's **boundary confidence** — clean modular composition.

`examples/argdown1-censorship.edn` ports the Argdown 1.x tutorial; `src/parity.test.ts` verifies grounded labels match the pure-attack expected set.

Seven EDN fixtures in `src/bench.fixtures/` are exercised by every commit: `small-minimal`, `small-relations`, `small-argument`, `medium-censorship`, `heavy-attacks`, `deep-arguments`, `large-stress`.

---

## 9. Architecture (package layer graph)

Top 5 call-boundary edges (graph-derived):
| from → to | count |
|---|---|
| `mcp` → `builder` | 5 |
| `builder` → `model` | 4 |
| `component-eval` → `multi-extension` | 4 |
| `mcp` → `model` | 3 |
| `mcp` → `src` | 3 |

Layer topology (Leiden):
- **core** (high fan-in): `model`, `builder`, `multi-extension`, `optique` (vendored).
- **entry** (only outbound): `cli`, `mcp`, `component-eval`, `edn-write`, `schema`, `scripts`.
- **leaf** (only inbound, no outbound): `validate`.
- **internal**: `src`, `extensions`.
- **api** (route definitions): `edn`, `json`, `txt`, `yaml`.

Top function hotspots (fan-in) — all from vendored `repos/optique/packages/core/src/`:
- `message` (175), `text` (87), `option` (86), `object` (84), `string` (65), `optional` (49), `choice` (49), `constant` (42), `withDefault` (41), `argument` (39).

Largest / most complex first-party functions:
- `apply` (`src/builder/apply.ts`): complexity 50, cognitive 140, 445 lines, out_degree 19 — by far the hottest first-party hotspot.

---

## 10. Distribution & install surface

| You want to… | Use |
|---|---|
| Use the library from Deno | `deno add jsr:@casualtheorics/argdown-2` |
| Run the MCP server in any MCP client | `bash scripts/argdown-2-mcp` (downloads pinned native binary) |
| Install in Claude Code | `/plugin marketplace add kellenff/argdown-2` then `/plugin install argdown-2@argdown-2` |
| Install in Pi coding agent | root `package.json` (Pi manifest) + `pi/extensions/` MCP bridge (unix only) |
| Run the CLI | `deno task cli <doc.edn>` or compile binary |

Constitution V forbids hand-editing `.edn` in install docs and skill prompts — the builder performs identity resolution, interface repair, and refusal checks that hand-written EDN silently bypasses.

---

## 11. What makes it unique

1. **EDN as canonical source format** — not a custom DSL. Clojure-origin data notation maps 1:1 to JS values.
2. **Effect-returning public API** — the library never throws and never produces a partial document; every failure is a tagged error in a typed union (`EdnError | SchemaError | ValidateError | BuilderError | McpIoError | SolveError=never`).
3. **6 argumentation semantics** in 1 canonical tree: Dung (`grounded`, `preferred`, `stable`, `complete`) + bipolar + evidential, all composed via first-class solver components with bottom-up evaluation.
4. **Single pipeline, 4 surfaces** — library, CLI, MCP server, plugin — share the exact same `load → validate → solve / apply` spine. No shadow paths.
5. **14-tool MCP builder** that is the **only** sanctioned way to author EDN graphs — refuses typed `BuilderCode`s rather than silently corrupting.
6. **Spec-frozen wire format** — additive evolution only; renames are MAJOR-version breaks paired with migration entries.
7. **Two AI surfaces share the same skills** — `interactive-argument` and `prose-to-argdown-2` skills live in one tree, used by both Claude Code and Pi (`pi install git:…`).

---

## 12. State hygiene / what changed since Jul-19 deep-dive

- **+** Constitution v1.0.0 ratified (`.specify/memory/constitution.md`, 292 lines, 5 principles).
- **+** Effect-native migration **complete** (`load`, `validate`, `parseCandidate`, `solve`, `apply` all return Effects; MCP collapses at `runMcpEffect`).
- **+** `McpIoError` + `BuilderError`/`BuilderCode` union introduced.
- **+** `SolveError` alias reserved (typed `never` for v1).
- **+** First-class solver components (Unreleased): `add_solver`, `set_import`, `remove_import` MCP tools.
- **+** Evidential solver (`solver/evidential`) — Cayrol & Lagasquie-Schiex 2005 §3.3 necessary-support reduction.
- **+** `interactive-argument` and `prose-to-argdown-2` skills (shared Claude Code + Pi).
- **+** Deno pin updated to `2.9.2`.
- **−** Snowball references removed (alpha5 reverted, references cleaned).
- **=** License: both README and `deno.json` now `Unlicense` — **Jul-19 contradiction is resolved**.
- **=** Version still `0.2.0-alpha4` (alpha5 bump reverted pending GitHub Release for host-native binaries).

---

**Next stage:** Stage 2 (Crystal Ball) — use this as the baseline "what it IS" to envision "what it COULD become" (dead code, complexity hotspots, attack-surface tracing, roadmap candidates).
