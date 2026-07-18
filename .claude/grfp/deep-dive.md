# Deep Dive — argdown-2 (EDN pipeline)

**Stage:** 1 of 5 (Deep Dive) — fresh run, 2026-07-18
**Codebase HEAD:** `main`, version `0.2.0-alpha1` (post-breaking-reset)
**Graph tools available:** Partial — codebase-memory `available: true` (`Users-kellen-Projects-argdown-2`, 520 nodes, 1200 edges, status `ready`), but the `claudikins-tool-executor` plugin is **not installed** in this session. The `mcp__plugin_serena_serena__*` family (list_dir, get_symbols_overview, find_symbol, find_referencing_symbols, read_file) was used in place of `search_graph` / `trace_path` / `get_code_snippet` / `query_graph` / `get_architecture`. **Method:** symbol-level + Read; no Cypher, no graph degrees.
**Note on prior 2026-06-27 deep-dive:** describes parser + Chevrotain + Mermaid + 15-solver surface that the breaking reset (commit `73a9ba1`) deleted. **Stale** as a description of current code. Replaced wholesale below.

---

## 0. Drift status (vs prior 2026-06-27 deep-dive)

| Item | Prior report | Current state |
| --- | --- | --- |
| Language surface | Custom `.argdown` + BNF | **EDN only.** `#casualtheorics.argdown2.solver/grounded` roots, `#casualtheorics.argdown2.argdown/{statement,argument,inference,support,attack,contradiction,undercut}` entries |
| Parser | Chevrotain 11 | **None.** `edn-parser-js@2.0.2` (with `.yarn/patches/`) is the only reader |
| Public API | 31 functions, 38 types | **3 functions, 14 types** (`load`, `validate`, `solve`; 14 type aliases) |
| Solvers | 15 (Dung, Bipolar, ASPIC+, Evidential × grounded/preferred/stable/complete) | **1.** Grounded Dung. Other solvers deleted in reset |
| Renderer | Mermaid `flowchart TD` | **None.** EDN round-trip via `writeEdn()` only |
| CLI surface | `argdown <subcommand> <file>` | **None.** Sole binary is `argdown-2-mcp` (the MCP server) |
| MCP surface | Legacy custom-language MCP | **Builder MCP** (11 tools, stdio, `path` or `source` modes) |
| Bench | 7 parser fixtures × parser benches + 4 solver benches | **7 EDN fixtures × 3 task types** (`load`, `solve`, `load-solve`) over `tinybench` |
| Stryker | 80%+ threshold, parser+15-solver module set | **80% break, 4 behavioral files** (`edn.ts`, `grounded.ts`, `reduce-dung.ts`, `validate.ts`). `schema.ts` deliberately excluded as low-value mutants |
| Distribution | Pre-publish | **GitHub Releases tarball via `.github/workflows/release.yml`** — no npm publish |
| Spec doc | `docs/GRAMMAR.bnf` (640 lines) | **None.** Pre-reset only. Spec lives in code (the namespace + tag set) |

**Resolution:** The prior 2026-06-27 deep-dive no longer reflects current state in any section. This report is the new baseline. The previous artifacts under `.claude/grfp/{deep-dive,crystal-ball,brain-jam,think-tank,pen-wielding}.md` from 2026-06-27 are historical, not authoritative.

---

## 1. What problem does this solve?

`argdown-2` is a small TypeScript library that takes an **EDN document** describing a theory of statements, arguments, and relations, validates it strictly, and computes **grounded Dung labels** for every entity. Its second surface is an **MCP builder server** that lets a model (or human) author or edit the same document incrementally through tool calls.

The pitch in one sentence: *argument maps are data, and the right format is EDN, and the right label set is grounded Dung's in / out / undec.*

It sits in two places simultaneously:

- Between argument-mining pipelines and formal-semantics evaluators. The EDN layer separates "how the document is stored" from "how it is computed over."
- Between LLM agents and an authoritative theory. The MCP server turns the document into something an agent can edit, list, validate, and solve through tool calls, with the same validation the library enforces.

The "post-reset" qualifier is the project's deliberate bet. `0.1.0-alpha1` shipped a custom `.argdown` language, parser, AST, Mermaid renderer, MCP server, and 15-solver surface. `0.2.0-alpha1` deleted all of that in favor of EDN-only input, grounded-Dung-only output, and a builder MCP server. **No migration tool, no shim, no two-track API.** `0.1.0` is in `CHANGELOG.md` for history, not for export.

The EDN choice matters for two reasons:

- The wire format is **parseable by any EDN library, in any language**. Any pipeline that can read EDN can already take a `0.2.0-alpha1` document; the library sits at the validation and computation layer, not at the file-format layer.
- The theory is **explicitly namespaced**. Every tag carries `#casualtheorics.argdown2.solver/...` or `#casualtheorics.argdown2.argdown/...`. There is no inference to do from the document about which theory it belongs to.

## 2. Who is it for?

- **Argument-mining / RAG teams** who already have an EDN-shaped pipeline and want a strict, type-safe, mutation-tested library that turns their document into grounded labels. The discriminated-union `model.ts` types and the explicit `EntityId` / `InferenceId` brand types are exactly what TS consumers want.
- **LLM agent authors** writing evaluation or argumentation tooling. The MCP builder server is the cheap path: 11 tools, all `path` or `source` mode, soft-warning-but-still-succeeds apply model, hard-error `validate` and `solve` paths.
- **Formal-reasoning engineers** who want grounded Dung evaluation as a pure function over a typed AST, not as a side effect of an editor session.
- **The same project's TypeScript monorepo (future)** — `CHANGELOG.md` describes a release tarball distribution that is itself the integration artifact.

It is **not yet**: a public npm package (`CHANGELOG.md` is explicit: install from a GitHub Release tarball, not npm). It is **not**: a multi-solver library (preferred / stable / complete / bipolar / ASPIC+ / evidential are gone in the reset — though `examples/argdown1-censorship.edn` retains `support` and `undercut` tags that emit `reduce/<kind>-omitted` warnings rather than contributing to the Dung reduction).

## 3. Core features

| Feature | Status | Notes |
| --- | --- | --- |
| `load(source)` → typed `GroundedDocument` *or* diagnostics | Yes | Three-stage: EDN read → Zod schema → cross-reference validate. Failures are diagnostic objects with semantic paths, **never partial documents**. `index.test.ts` 37-50 confirms no `document` field on `ok: false` |
| `validate(value)` for pre-parsed EDN values | Yes | Reuses stages 2 + 3 only (skips the EDN read). `index.test.ts` 52-56 |
| `solve(document)` → grounded labels (in/out/undec) | Yes | Pinned to `casualtheorics.argdown2.solver/grounded` only. Returns `{ labels, solver, warnings }`. `reduce/support-omitted` and `reduce/undercut-omitted` for relations that are preserved but ignored |
| `readEdn` / `decodeWire` / `validateCandidate` exports | Indirect | Library only exposes `load`, `validate`, `solve`. The pipeline pieces are package-internal |
| `writeEdn(doc)` round-trip | Yes | Used by `edn-write.test.ts` for round-trip tests, by `soft-parse.test.ts`, by `builder/apply.ts`. Not exported from `index.ts` (deliberate — see Project Status below) |
| MCP builder server (11 tools, stdio) | Yes | `create_document`, `add_statement`, `update_statement`, `add_argument`, `add_inference`, `add_relation`, `remove_element`, `remove_relation`, `list_elements`, `validate`, `solve`. Single namespace, MCP v1.29.0 SDK |
| Soft-warning mutations | Yes | `apply(doc, edit)` may emit `builder/unresolved-ref` and proceed; `builder/duplicate-id` and `builder/missing-id` **refuse** the edit (return `{ refused, warnings, diff: [] }`) |
| Text-or-id reference resolution | Yes | `resolveRef(doc, raw)` returns `via: 'id' \| 'text'`. `text` mode is exact-match-only and treats ambiguity as a soft warning with slugified stored id (`softRefId`) |
| Bench harness + baseline JSON | Yes | tinybench, `perf-baseline.json` schema v1, `--baseline` and `--check` modes |
| 7 EDN bench fixtures | Yes | `small-minimal`, `small-relations`, `small-argument`, `medium-censorship`, `heavy-attacks`, `deep-arguments`, `large-stress`. `pipeline.bench.test.ts` confirms each fixture loads cleanly |
| Stryker mutation testing, 80% break | Yes | Focused on `edn.ts`, `grounded.ts`, `reduce-dung.ts`, `validate.ts`. `schema.ts` excluded (declarative Zod schemas produce equivalent mutants) |
| Broken-on-error documents | **No (deliberate)** | `index.test.ts` 37-50: malformed input returns diagnostics and no document field. There is no partial-AST-on-error in this codebase |

## 4. Architecture

```
[ EDN source string ]
        |
        |  readEdn  (edn-parser-js 2.0.2 + 1 patch)
        v
[ Raw EDN value ]  -----  schema.ts: decodeWire (Zod + per-tag decoder)
        |
        |  Zod union of: number|boolean|string|keyword|symbol|char|
        |                array|map|set|list|tagged|metadata
        |  Plus per-namespace decoders for the 4 element tags.
        v
[ CandidateDocument ]  -----  validate.ts: validateCandidate
        |
        |  1. collectKinds (statement/argument/inference id space)
        |  2. validateInferenceReferences (every premise + conclusion is a statement id)
        |  3. validateRelationReferences (attack/contradiction/support endpoints are
        |     statement or argument; undercut endpoints are inference)
        v
[ GroundedDocument ]  -----  reduce-dung.ts: reduceToDung
        |
        |  Drops support + undercut with a reduce/<kind>-omitted warning.
        |  Contradiction becomes two attacks.
        v
[ DungFramework ]  -----  grounded.ts: groundedLabels
        |
        |  Fixed-point iteration: IN iff all attackers are OUT;
        |  OUT iff any attacker is IN. Self-attacks stay UNDEC.
        v
[ Map<EntityId, 'in' | 'out' | 'undec'> ]
```

The library surface (`index.ts`) is exactly three functions: `load`, `validate`, `solve`. Everything else in the diagram (`readEdn`, `decodeWire`, `validateCandidate`, `reduceToDung`, `groundedLabels`) is exported from its own file for testing but is not part of the public package surface.

The MCP server surface is parallel, not orthogonal. `mcp/tools.ts` calls `load` / `solve` / `validate` directly, then wraps the result in MCP-shaped JSON. `mcp/io.ts` adds a `path` / `source` document ref on top. The MCP server can mutate (`create_document`, `add_*`, `remove_*`) by going through `builder/apply.ts`, which mutates a `CandidateDocument` and round-trips through `writeEdn` to produce the new persisted form.

### Why EDN and not the prior custom language

The `0.2.0-alpha1` reset `CHANGELOG.md` is explicit on this:

> ### Removed
> - Custom `.argdown` lexer, parser, source AST, stringifier, CLI, MCP server, and Mermaid renderer.
> - Bipolar, ASPIC+, evidential, preferred, stable, and complete solver surfaces.
> - Parser and solver benchmark/mutation infrastructure.
>
> ### Fixed
> - Grounded labeling now applies the formal conditions: IN iff all attackers are OUT; OUT iff any attacker is IN. Self-attacks are UNDEC.

The reset's stated motivation: the custom parser was the source of complexity, and the custom solver surfaces had drifted from formal correctness. EDN + grounded Dung is the smallest thing that is both standards-based and formally correct.

## 5. Entry points

- `src/index.ts:load` (library) — `package.json` `main: "./dist/index.js"`, `types: "./dist/index.d.ts"`. Called by `index.test.ts`, `edn-write.test.ts`, `parity.test.ts`, `soft-parse.test.ts`, `pipeline.bench.ts`, `mcp/tools.ts` (transitively through `runSolve`/`runValidate`)
- `src/index.ts:solve` — same callers as `load` plus `pipeline.bench.ts` directly
- `src/mcp/cli.ts` — `package.json` `bin.argdown-2-mcp: "./dist/mcp/cli.js"`. 9-line shim that calls `run()`. `run()` is exported from `src/mcp/server.ts:130` and `src/mcp/server.ts:buildServer()` is the only other entry into the MCP tree
- `src/pipeline.bench.ts:main` — `yarn bench` / `yarn bench:baseline` / `yarn bench:check`. Reads `src/bench.fixtures/*.edn`, runs tinybench across `TASK_TYPES = ['load', 'solve', 'load-solve']`, writes or compares `perf-baseline.json`

Distribution: `.github/workflows/release.yml` (CHANGELOG references it) builds, tests, packs the tarball, and attaches it to a GitHub Release whenever `package.json` version changes on `main`. There is no `publish.yml` to npm; the CHANGELOG is explicit that the npm tarball is from a GitHub Release URL, not the registry.

## 6. Modules by file

| File | Responsibility | LOC (approx) | Tests |
| --- | --- | --- | --- |
| `src/index.ts` | Public surface (`load`, `validate`, `solve`) + type re-exports | 38 | `index.test.ts` |
| `src/edn.ts` | EDN read; one top-level value; diagnostic on parse failure or wrong form count | 32 | `edn.test.ts` |
| `src/schema.ts` | Zod recursive `ednValueSchema`, `decodeWire`, per-tag decoders, collection uniqueness check | ~270 | `schema.test.ts` |
| `src/validate.ts` | `validateCandidate` — collect id kinds, validate inference refs, validate relation refs, brand `EntityId` / `InferenceId` | ~245 | `validate.test.ts` |
| `src/model.ts` | Types: `EntityId`, `InferenceId`, `Label`, `Diagnostic`, candidate vs. validated, `DungFramework`, `GROUNDED_SOLVER_TAG` constant | 113 | (covered transitively) |
| `src/grounded.ts` | Iterative fixed-point labeling | 30 | `grounded.test.ts` |
| `src/reduce-dung.ts` | `reduceToDung` — drop support/undercut with warning; contradiction becomes 2 attacks | 50 | `reduce-dung.test.ts` |
| `src/edn-write.ts` | `writeEdn`, `printWire`, per-element printers | ~245 | `edn-write.test.ts` |
| `src/builder/apply.ts` | `apply(doc, edit)` — pure document-edit application. Refuses duplicates, slugifies unresolved refs | ~250+ | `builder/apply.test.ts` |
| `src/builder/soft-parse.ts` | `softParse` = `readEdn` + `decodeWire` (no semantic validation; the builder uses this so it can ingest documents with missing refs and resolve them) | 13 | `builder/soft-parse.test.ts` |
| `src/builder/resolve-ref.ts` | `resolveRef` (statement/argument, id-or-text), `resolveInferenceRef` (id only) | 50 | `builder/resolve-ref.test.ts` |
| `src/builder/types.ts` | `DocumentEdit`, `DiffOp`, `ApplyResult`, `BuilderWarning`, `RefResolution` | 65 | (covered transitively) |
| `src/mcp/server.ts` | `buildServer()` registers 11 tools; `run()` connects stdio transport | ~135 | `mcp/server.test.ts` |
| `src/mcp/tools.ts` | 11 `run*` functions: `runCreateDocument`, `runAddStatement`, `runUpdateStatement`, `runAddArgument`, `runAddInference`, `runAddRelation`, `runRemoveElement`, `runRemoveRelation`, `runListElements`, `runValidate`, `runSolve` | ~345 | `mcp/tools.test.ts` |
| `src/mcp/io.ts` | `DocumentRef` (path or text), `loadDocumentRef`, `saveDocumentRef`, `createDocumentRef` (atomic write via temp + rename) | ~110 | `mcp/io.test.ts` |
| `src/pipeline.bench.ts` | tinybench harness, baseline JSON loader/checker | ~318 | `pipeline.bench.test.ts` |
| `examples/argdown1-censorship.edn` + `examples/argdown1-censorship.mapping.md` | The canonical port. Medium-censorship fixture in `src/bench.fixtures/` is a derivative | — | — |

## 7. Tooling

| Tool | Pin | Role |
| --- | --- | --- |
| `edn-parser-js` | `2.0.2` (patched) | EDN read; single source of truth for the wire format |
| `zod` | `^4.4.3` | Recursive `ednValueSchema` for raw EDN value validation; used in MCP tool input shapes |
| `@modelcontextprotocol/sdk` | `^1.29.0` | The MCP server (`McpServer`, `StdioServerTransport`) |
| `vitest` | `^3` | Test runner; required by `@stryker-mutator/vitest-runner` 9.x |
| `typescript` | `^5.4.5` | Build + type-check |
| `oxlint`, `oxfmt` | `^0.6.0` | Lint + format; pre-commit via husky + lint-staged |
| `@stryker-mutator/{api,core,typescript-checker,vitest-runner}` | `^9.6.1` | Mutation testing with Vitest runner and TypeScript checker |
| `tinybench` | `^2.6.0` | Pipeline benchmark harness |
| `tsx` | `^4.0.0` | TS execution for bench runner |
| `@types/node` | `^20.12.0` | Node 18+ types |
| `husky` + `lint-staged` | `^9.1.7` / `^17.0.8` | Pre-commit `oxfmt` |
| `knip` | `6.27.0` (patched) | Unused/missing dependency check |

Patches: `.yarn/patches/edn-parser-js-npm-2.0.2.patch` and `.yarn/patches/knip-npm-6.27.0-648296b906.patch`. Both referenced from `package.json` `resolutions`.

No security advisories visible. No hardcoded secrets.

## 8. Tests

- `src/index.test.ts` — public API smoke (loads, fails, validates pre-parsed)
- `src/edn.test.ts`, `src/schema.test.ts`, `src/validate.test.ts`, `src/grounded.test.ts`, `src/reduce-dung.test.ts` — per-module behavioral coverage
- `src/edn-write.test.ts` — round-trip via builder → `writeEdn` → `load`
- `src/builder/{apply,soft-parse,resolve-ref}.test.ts` — builder semantics
- `src/mcp/{server,tools,io}.test.ts` — server registration, tool handlers, I/O atomicity
- `src/parity.test.ts` — loads `examples/argdown1-censorship.edn`, checks labels against the pure-attack expected set, asserts support/warning count
- `src/pipeline.bench.test.ts` — every fixture in `FIXTURES` loads cleanly

The `08aab62` commit on `main` adds a "refuse no-write" test pattern to MCP tools, indicating a recent tightening: pass both `path` and `source` to a mutating tool, expect `refused`.

## 9. CI / Automation

`.github/workflows/release.yml` is referenced by `CHANGELOG.md` as the single workflow. It auto-builds, tests, mutates (?), packs the tarball, and attaches to a GitHub Release on every `package.json` version bump on `main`. No additional CI files visible. **To be confirmed during Stage 2 (Crystal Ball) by listing `.github/workflows/` directly.**

Local validation:
```bash
yarn lint           # oxlint src
yarn format:check   # oxfmt --check --threads=1 src
yarn typecheck      # tsc --noEmit
yarn test           # vitest run --passWithNoTests
yarn mutate         # stryker run, 80% threshold
yarn bench          # tinybench pipeline
yarn bench:check    # vs perf-baseline.json
yarn knip           # dead-dep check
yarn build          # tsc to dist/
yarn mcp            # node ./dist/mcp/cli.js
```

## 10. Chat History Context

The project's auto-memory at `.claude/projects/-Users-kellen-Projects-argdown-2/memory/MEMORY.md` carries 7 entries:

- `always-commit-pnp-loaders.md` — `.pnp.cjs` and `.pnp.loader.mjs` are tracked; `node_modules/` is gitignored (Yarn 4 PnP).
- `grfp-aborted-grammar-drift.md` — README pipeline paused; the BNF describes `:-` rules, code removed them in `73a9ba1`. Fix spec or re-add rules before resuming. **(This memory is the root cause of the 2026-06-27 stale artifacts — the reset moot'd it.)**
- `scc-grounded-incorrect.md` — SCC-based Modgil labeling omits args attacked only by a cyclic-SCC member that's counter-attacked externally. Use argument-level Modgil via `defenseClosure(new Set(), map)`. Tarjan SCC kept for topological-order optimizations elsewhere. **(Note: with the reset deleting preferred/stable/complete ASPIC+ surfaces, SCC no longer applies at the Dung reduction level. May still apply if a future solver re-introduces SCC — stale in current code.)**
- `defense-closure-full-map.md` — `isClosedUnderDefense(lifted, map)` must use the FULL map, not `subMap`. **(Reset deleted the function — stale.)**
- `residue-search-full-map.md` — All residue-search checks on T ∪ G use full map. **(Stale in current code.)**
- `branded-attack-map.md` — Brand `Map<string, string[]>` to express 'attackers-of' direction. **Still relevant** — `model.ts:97-100` already uses `attackersByTarget: ReadonlyMap<EntityId, ReadonlySet<EntityId>>`, but the brand is on the value side (`EntityId`), not the key. Branded AttackMap was deferred per the memory note.

The reset has demolished most of these. Stage 5 (Pen Wielding) must not surface them as live architecture; they are **historical** reasoning about code that is gone.

## 11. Output Format

The pen-wielding-stage deliverable will be an updated `README.md`. Today the README is already a post-reset artifact — accurate, has EDN quick start, MCP server section, validation section, grounded reduction section, Argdown 1.x parity example, breaking-reset note, Development section. Stage 5 will verify and tighten (the pen-wielding-skill sets the section order and the sound-check rules).

## 12. Snapshot Summary

```markdown
# Deep Dive Findings

## Project Overview
- Type: Library + MCP server (TypeScript, ESM, Node ≥18, Yarn 4 PnP)
- Tech Stack: TypeScript, edn-parser-js (patched), Zod 4, @modelcontextprotocol/sdk, Vitest 3, Stryker 9, tinybench, oxlint/oxfmt
- Value Proposition: strict EDN loader + ground Dung labeling + builder MCP server for theory-of-arguments documents
- Entry Point: `load(source)` / `validate(value)` / `solve(document)` (library); `argdown-2-mcp` stdio server (binary)
- Architecture: three-stage pipeline (EDN read → Zod validate with namespaced decoders → cross-reference validate) → reduce-to-Dung → iterative fixed-point labeling; MCP tools wrap the library and add a builder layer

## Dependencies
- Runtime: Node ≥18, edn-parser-js@2.0.2 (patched), zod@^4.4.3, @modelcontextprotocol/sdk@^1.29.0
- Dev: vitest, typescript, oxlint, oxfmt, @stryker-mutator/*, tinybench, tsx, @types/node, husky, lint-staged, knip

## Entry Points (from find_referencing_symbols + Read)
- `src/index.ts:load` (used in: index.test, edn-write.test, parity.test, soft-parse.test, pipeline.bench, mcp/tools.test transitively)
- `src/index.ts:solve` (same set)
- `src/index.ts:validate` (index.test 52-56 + load internal)
- `src/mcp/cli.ts:1` (calls `run()` from server.ts)
- `src/pipeline.bench.ts:main` (yarn bench / yarn bench:check)

## CI / Automation
- Build: `.github/workflows/release.yml` (per CHANGELOG), packages a tarball attached to a GitHub Release on version bump
- Badge sources: none currently configured

## User Context (from prior staging + repo history)
- Common Struggles: clarity about what is "the project" after the breaking reset; the readme must reflect EDN-only input, not the prior custom language; the prior custom-language memories are stale and should not appear in the README
- Decisions Made: EDN-only canonical, grounded-Dung-only solver, namespaced tags, MCP builder replaces custom-language MCP, GitHub Releases tarball (no npm publish)
- Focus Areas: parse correctness (Zod schema), solve correctness (formal grounded labeling), builder ergonomics (soft-warning mutations, hard-error validation), bench regression safety

## Missing Information (Stage 2 follow-ups)
- [ ] Confirm `.github/workflows/release.yml` is present and matches CHANGELOG description
- [ ] Confirm exact stryker score on last run (CHANGELOG notes 80%+ threshold, no number)
- [ ] Confirm whether `apply` returning `refused` is observable from MCP `tools.ts` (the recent commit `08aab62` adds a test for "refuse no-write")
- [ ] Confirm whether `text:` matches in `resolveRef` are case-sensitive

## Graph Index State
- Indexed: Yes (`Users-kellen-Projects-argdown-2`, 520 nodes, 1200 edges)
- Method: serena semantic tools (list_dir, get_symbols_overview, find_referencing_symbols, read_file) — no claudikins-tool-executor available in this session
```
