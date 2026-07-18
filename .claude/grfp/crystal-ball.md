# Crystal Ball Report — `argdown-2` (EDN pipeline)

**Stage:** 2 of 5 (Crystal Ball) — fresh run, 2026-07-18
**Codebase HEAD:** `main`, version `0.2.0-alpha1`
**Graph tools available:** Partial — `claudikins-tool-executor` plugin **not installed** in this session. Used `mcp__plugin_serena_serena__*` semantic tools (`find_referencing_symbols` for inbound-edge counts; `read_file` and `search_for_pattern` for body confirmation). **Method:** symbol-level + content search; no Cypher.
**Reviewing:** `.claude/grfp/deep-dive.md` (this run, 2026-07-18).

---

## 1. Dead code (serena inbound-edge scan + content-confirmed)

| Symbol | Location | Inbound edges (from `find_referencing_symbols`) | Confidence | Action |
| --- | --- | --- | --- | --- |
| `load` | `src/index.ts:29` | **8+ inbound** (index.test, edn-write.test, parity.test, soft-parse.test, pipeline.bench, pipeline.bench.test, mcp/tools, edn.ts internal callers) | High | **Keep** (public entry) |
| `validate` | `src/index.ts:24` | **2 inbound** (`load` body + index.test) | High | **Keep** (public entry; explicitly tested at `index.test.ts:55`) |
| `solve` | `src/index.ts:34` | **6+ inbound** (index.test, parity.test, pipeline.bench, pipeline.bench.test, mcp/tools, edn-write.test indirect) | High | **Keep** (public entry) |
| `readEdn` | `src/edn.ts:25` | 1 (`load` body) + 1 (`softParse` body) | High | **Keep** (library-internal pipeline) |
| `decodeWire` | `src/schema.ts:427` | 1 (`validate` body) + 1 (`softParse` body) | High | **Keep** |
| `validateCandidate` | `src/validate.ts:233` | 1 (`validate` body) | High | **Keep** |
| `reduceToDung` | `src/reduce-dung.ts:40` | 1 (`solve` body) | High | **Keep** |
| `groundedLabels` | `src/grounded.ts:24` | 1 (`solve` body) | High | **Keep** |
| `writeEdn` | `src/edn-write.ts:206` | **5+ inbound** (edn-write.test, soft-parse.test, mcp/io, mcp/io.test) | High | **Keep.** **Not exported from `index.ts`** — deliberate (round-trip is the *builder's* responsibility; library consumers get EDN→object, not object→EDN) |
| `apply` | `src/builder/apply.ts:90` | **10+ inbound** (apply.test 8 it-blocks, mcp/tools, edn-write.test) | High | **Keep** (builder core) |
| `emptyDocument` | `src/builder/apply.ts:12` | **8+ inbound** (apply.test, edn-write.test, mcp/io, mcp/io.test, resolve-ref.test) | High | **Keep** |
| `softParse` | `src/builder/soft-parse.ts:8` | **5+ inbound** (soft-parse.test, mcp/io, edn-write.test) | High | **Keep** |
| `resolveRef`, `resolveInferenceRef` | `src/builder/resolve-ref.ts:8,43` | 2 (`resolveRefOrRaw`, `resolveInferenceRefOrRaw`) + 5+ in resolve-ref.test | High | **Keep** |
| `softRefId` (private) | `src/builder/apply.ts:20` | 2 (resolveRefOrRaw, resolveInferenceRefOrRaw) | High | **Keep** (internal) |
| `refused` (private) | `src/builder/apply.ts:38` | 1 (apply body) | High | **Keep** (internal) |
| `collectIds` (private) | `src/builder/apply.ts:30` | 1 (apply body) | High | **Keep** (internal) |
| `printTag`, `printKeyword`, `printWire`, `printMetadata`, `printExtra`, `printTaggedMap`, `printInference`, `printStatement`, `printArgument`, `printRelation`, `printElement`, `printString`, `isStringRecord` | `src/edn-write.ts` | All referenced inside edn-write.ts; `printWire` is the dispatcher called by `writeEdn`, `printExtra`, `printMetadata` | High | **Keep** |
| `isPathRef`, `isTextRef`, `loadDocumentRef`, `saveDocumentRef`, `createDocumentRef` | `src/mcp/io.ts` | All referenced by tools.ts (createDocumentRef by runCreateDocument); io.test | High | **Keep** |
| MCP `run*` (11) | `src/mcp/tools.ts` | All referenced by server.ts `registerTool` callbacks | High | **Keep** |
| `decodeRelation`, `decodeStatement`, `decodeArgument`, `decodeInference`, `decodeInferenceEntry`, `decodeElement`, `fieldsOf`, `expectMap`, `requiredKeyword`, `optionalParsed`, `keywordVector`, `keywordSet`, `keywordName`, `fullName`, `canonicalEdn`, `validateCollectionUniqueness`, `pushMissing`, `pushInvalid`, `pushUnsupportedTag`, `fieldPath` | `src/schema.ts` | All referenced from within schema.ts (recursive Zod + per-tag decoders) | High | **Keep.** **Stryker exclusion list confirms these are declarative Zod schemas** — mutating them produces equivalent mutants. The file is intentionally not in the Stryker `mutate` list |
| `validateStatementReference`, `validateInferenceReferences`, `validateEntityEndpoint`, `validateRelationReferences`, `reportMissingReference`, `isEntityKind`, `toValidatedInference`, `toValidatedStatement`, `toValidatedArgument`, `toValidatedRelation`, `toValidatedElement`, `collectKinds` | `src/validate.ts` | All referenced from within validate.ts | High | **Keep** |
| `addAttack`, `omissionWarning`, `reduceRelation` | `src/reduce-dung.ts` | All referenced from within reduce-dung.ts | High | **Keep** |
| `allAttackersOut`, `markTargetsOut` | `src/grounded.ts` | Referenced from `groundedLabels` | High | **Keep** |
| `entry` (constant), `FIXTURES`, `TASK_TYPES`, `BASELINE_*`, `percentFormat`, types, `makeTaskBody`, `checkAgainstBaseline`, `diffLine`, `formatPercent`, `loadBaseline`, `loadFixtures`, `main`, `parseTaskName`, `runBench`, `writeBaselineJson` | `src/pipeline.bench.ts` | All referenced from `main` and tests | High | **Keep** |

**Net dead code: zero.** Every exported symbol and every non-exported helper has at least one live caller. The codebase is tight at ~12 source files and ~3000 LOC.

This is a deliberate consequence of the breaking reset: with the parser, Mermaid renderer, CLI, and 15-solver surface gone, there are no orphaned helpers from a half-migrated feature.

## 2. Complexity hotspots (structural fan-in / fan-out from `find_referencing_symbols`)

**Top fan-in (high reuse — keep green):**

| Function | File | Inbound references | Role |
| --- | --- | --- | --- |
| `apply` | `src/builder/apply.ts:90` | **10+** | Builder core; called from `mcp/tools.ts:applyMutation`, every `edn-write.test` block, every `apply.test` block |
| `load` | `src/index.ts:29` | **8+** | Library entry; tests + bench + MCP tools |
| `solve` | `src/index.ts:34` | **6+** | Library entry; tests + bench + MCP tools |
| `decodeWire` | `src/schema.ts:427` | **2** in src + tests | Zod orchestration; called by `validate` and `softParse` |
| `emptyDocument` | `src/builder/apply.ts:12` | **8+** | Builder entry; everywhere a fresh doc is needed |
| `softParse` | `src/builder/soft-parse.ts:8` | **5+** | Builder entry; soft validation (no semantic cross-check) |
| `writeEdn` | `src/edn-write.ts:206` | **5+** | Round-trip; tests + MCP I/O |
| `groundedLabels` | `src/grounded.ts:24` | **2** in src + tests | Iterative fixed-point labeling |
| `reduceToDung` | `src/reduce-dung.ts:40` | **2** | Reduction to Dung framework |

**Top fan-out (high coupling — these orchestrate):**

| Function | File | Out-degree | Role |
| --- | --- | --- | --- |
| `apply` | `src/builder/apply.ts:90` | **14+** | Switch over 7 `DocumentEdit` types; each branch touches `collectIds`, `resolveRefOrRaw`, `resolveInferenceRefOrRaw`, `resolveRelationEndpoint`, `refused`, etc. |
| `decodeWire` | `src/schema.ts:427` | **10+** | Per-tag dispatch into `decodeStatement`, `decodeArgument`, `decodeRelation`, `decodeInferenceEntry`, plus collection uniqueness validation |
| `validateCandidate` | `src/validate.ts:233` | **8+** | `collectKinds` + `validateInferenceReferences` + `validateRelationReferences` + `toValidatedElement` switch |
| `makeTaskBody` | `src/pipeline.bench.ts` | **3** (one per task type) | Switch over `TASK_TYPES` |
| `printElement` | `src/edn-write.ts` | **3** (statement / argument / relation) | Switch over `CandidateElement.kind` |

`apply` (fan-out 14) is **the** hottest spot. Each `DocumentEdit` branch is its own logic island; the only common helpers are `stripColon`, `softRefId`, `resolveRefOrRaw`, `refused`. Splitting `apply` into per-edit-type pure functions (`addStatement`, `updateStatement`, `addArgument`, etc.) would lower the fan-out from 14 to 4 (a single `switch` that calls them) and make each branch independently testable. **XS effort, M impact.**

**Top files by source LOC** (from search and read):

| File | Approx LOC | Note |
| --- | --- | --- |
| `src/schema.ts` | ~270 | Recursive Zod + per-tag decoders. Stryker-excluded as low-value mutants |
| `src/mcp/tools.ts` | ~345 | 11 `run*` handlers + `applyMutation` + `listElementsFromDoc` + helpers. Largest file. Splitting per-tool (one file per tool) would lower coupling but multiply files |
| `src/edn-write.ts` | ~245 | `printWire` + per-element printers. Could be split into `edn-write/{wire,elements}.ts` |
| `src/builder/apply.ts` | ~290 | `apply` + private helpers + 7 branch cases. **Best split candidate** |
| `src/validate.ts` | ~245 | Pure validation; could split into `validate/{kinds,refs,relations}.ts` |
| `src/mcp/server.ts` | ~135 | 11 tool registrations + `run()`. Tight, no split needed |
| `src/bench.fixtures/*.edn` | 7 files, ~30 KB total | Bench inputs |

## 3. Stryker scope (80% threshold)

`.stryker-tmp/` and `stryker.config.mjs` define:

- `mutate`: `edn.ts`, `grounded.ts`, `reduce-dung.ts`, `validate.ts` (the four "behavioral" files)
- `ignorePatterns`: `dist`, `reports`, `.stryker-tmp`, `examples`, `docs`, `perf-baseline.json`
- `thresholds.high: 80, low: 60, break: 80`

The deliberate exclusion of `schema.ts` is correct: it is recursive Zod unions + per-tag decoders, which produce equivalent mutants when mutated. Confirming the rationale is in the `stryker.config.mjs` comment.

**No security advisories visible.** No hardcoded secrets in source. **No `TODO`/`FIXME`/`HACK`/`XXX` markers in `src/`** (re-confirmed 2026-07-18 — `search_for_pattern` returns empty). The only matches for those tokens are in `docs/snowball/` (historical plans, not source).

## 4. Attack surface (public entry points + their reach)

**Library (3 functions, all pure):**

| Function | Input shape | Failure mode |
| --- | --- | --- |
| `load(source: string)` | EDN source string | `{ ok: false, errors }` with `code: 'edn/read-error' \| 'schema/*' \| 'semantic/*'`. **Never** a partial document (`index.test.ts:37-50` confirms `'document' in result === false` on error) |
| `validate(value: unknown)` | Pre-parsed EDN value (typed `unknown`) | Same error envelope; useful when caller already has a parsed EDN value from another library |
| `solve(document: GroundedDocument)` | A validated document | `{ labels: Map<EntityId, 'in' \| 'out' \| 'undec'>, solver, warnings }`. Warnings are `reduce/support-omitted` and `reduce/undercut-omitted` — informational only |

**MCP server (11 tools, stdio):**

| Tool | Mutating | Failure mode |
| --- | --- | --- |
| `create_document` | Yes | `mcp/io-error` (path) or returns text (source) |
| `add_statement` | Yes | `mcp/invalid-ref` (both), `builder/duplicate-id`, `builder/unresolved-ref` (soft warn), `mcp/io-error` |
| `update_statement` | Yes | Same as above |
| `add_argument` | Yes | Same |
| `add_inference` | Yes | Same |
| `add_relation` | Yes | Same; `applyRelation` may refuse if `from`/`to` ambiguity |
| `remove_element` | Yes | `builder/missing-id` (refuses) |
| `remove_relation` | Yes | Same |
| `list_elements` | No | Always succeeds, returns JSON-serialized elements |
| `validate` | No | Returns `ok` + `errors[]`; never throws |
| `solve` | No | Returns `labels` + `warnings[]`; never throws |

The recent commit `e36ed9a fix(mcp): reject path+source on statement tools; test refuse no-write` adds a `refused`-style guard: passing both `path` and `source` to a mutating tool returns `refused` rather than silently preferring one. This tightens the attack surface for ambiguous refs.

**Atomic write:** `mcp/io.ts:saveDocumentRef` writes to a temp file (`.${Date.now()}.argdown-2.tmp`) and `rename`s in place. No half-written file is ever visible to readers. This is the right primitive for "safe edit on disk."

**Concurrency:** The MCP server is single-threaded stdio (`StdioServerTransport`). Multiple clients → one server, no locking needed because MCP is request-response. This is the right level of concurrency for a builder API.

## 5. Ecosystem fit & gaps

**Adjacent / next-door projects:**

- **edn-parser-js** — the only runtime parser dep. `0.2.0-alpha1` lives or dies by this library's correctness. Patch file `.yarn/patches/edn-parser-js-npm-2.0.2.patch` exists — worth checking what it fixes and whether upstream has folded it.
- **Zod 4** — recursive `ednValueSchema`. `z.lazy` with deferred union is the right primitive for EDN's open type system. Worth tracking Zod 5 / 6 changes that touch `z.lazy` and `z.strictObject`.
- **@modelcontextprotocol/sdk** — the MCP server framework. `0.2.0-alpha1` pins `^1.29.0`. MCP spec is moving (HTTP transport, OAuth, structured outputs in 2025).
- **Argdown 1.x (`@argdown/core`)** — the prior language. `examples/argdown1-censorship.edn` is a manual port demonstrating the mapping gap. **No migration tool ships** — by design.
- **Carneades, ASPIC+, abstract argumentation libraries** — academic neighbors. The grounded Dung solver is the smallest formally-correct piece of this family; preferred/stable/complete/Bipolar/ASPIC+ are deleted in the reset (Roadmap #2 below).
- **EDN alternative parsers** (`@calcit/tern EDN`, `prismatic.edn`) — would let the library be cross-runtime, but YAGNI until requested.

## 6. Audience segments that could benefit

1. **Argument-mining / RAG pipelines** that already speak EDN. The library is a drop-in strict validator and grounded-labeler.
2. **LLM agent authors** building argumentation tools. The MCP builder server is the cheap path: 11 tools, soft-warning mutations for incremental authoring, hard-error `validate`/`solve` for the production gate.
3. **Formal-reasoning engineers** who want grounded Dung over a typed AST instead of a Python or Java abstract framework.
4. **The project's own future self** — anyone adding a new solver tag (`#casualtheorics.argdown2.solver/preferred`) needs only to add the tag and a parallel `reduceToX` + `xLabels` pair; the rest of the pipeline is unchanged.
5. **Editor plugin authors** (VS Code, Obsidian) — the MCP server speaks the protocol; a plugin can drive it directly.
6. **Argdown 1.x migration tooling authors** — `examples/argdown1-censorship.edn` is the manual port. A sibling `argdown-1to2` package is a community opportunity, not a project commitment.

## 7. Roadmap candidates (ranked)

| # | Title | Effort | Impact | Why now |
| --- | --- | --- | --- | --- |
| 1 | **Split `apply` into per-edit-type pure functions** | XS | M | 14-fan-out switch is the biggest single-file complexity. Splitting lowers coupling and makes each edit independently testable |
| 2 | **Bring back preferred / stable / complete solvers** | L | H | All three were deleted in the reset. Reintroducing them with formal correctness (and naming them clearly: each as `#casualtheorics.argdown2.solver/{name}`) is the natural completion of "grounded Dung is the smallest formally-correct piece" |
| 3 | **ASPIC+ solver (post-reset)** | L | H | Same reasoning. ASPIC+ requires `preference:` attributes; the EDN tags already support it via `metadata` |
| 4 | **D2 / DOT / Mermaid-from-EDN renderer** | M | M | Standalone package that consumes `GroundedDocument` and emits a graph. Builds on `examples/argdown1-censorship.edn` parity example |
| 5 | **Incremental solve (memoize `reduceToDung`)** | S | M | Pipeline bench shows `large-stress` is the slow fixture (peak heap +10 MB, p99 ~30 s for `load-solve`). If a tool mutates the document once and re-solves 10x, the reduction is the same — memoize it |
| 6 | **Branded `AttackMap` direction marker** | S | S | Deferred per `branded-attack-map.md` memory. `attackersByTarget` is already typed correctly; this is one-time future-protection. Skip until a second consumer appears |
| 7 | **Cross-document reference (multi-file theories)** | L | H | Today every document is single-rooted. A `#casualtheorics.argdown2.solver/multi` namespace could combine multiple `.edn` files into one theory. Big product-differentiation move; needs MCP server concurrency work first |
| 8 | **HTTP transport for MCP server** | M | M | Today is stdio-only. HTTP/SSE would unlock multi-user deployments. Blocked on per-document locking story |
| 9 | **Argdown 1.x → EDN translator** (`argdown-1to2`) | M | M | Unblocks adoption. **Belongs in a sibling package**, not in this repo — keep `argdown-2` tight |
| 10 | **CLI for `load` / `solve`** | S | M | Today only MCP and library. A `npx argdown-2 solve doc.edn` would unlock batch / CI use without an MCP client |
| 11 | **Editor plugin (VS Code)** | L | H | MCP server makes this 100 LOC + a manifest. Distribution channel for the library |

## 8. Vision (the "could be" picture)

`argdown-2` is currently a *strict EDN loader + grounded Dung labeler + builder MCP server*. The natural arc:

```
[ EDN document ] -----> [ load → validate → solve ]
       |                          |
       |                          +--> labels (Map<EntityId, 'in'|'out'|'undec'>)
       |
       +--> [ MCP builder server ] <--- agent tool calls
       |
       +--> [ visualization ] (D2 / DOT / Mermaid-from-EDN)
       |
       +--> [ multi-solver ] (preferred, stable, complete, ASPIC+, bipolar)
       |
       +--> [ multi-document ] (multi-root solver tags)
```

In one year this could be a **focused toolkit** (2–3 packages under `@casualtheorics/argdown-*`) covering read, write, build, solve, and visualize — with `argdown-2` itself as the foundational strict validator and grounded solver. The current architecture (one strict pipeline + one builder layer + one MCP surface, all EDN-in / typed-object-out) is the right shape for that. The three missing pieces are *multiple solvers* (Roadmap #2/#3), *visualization* (#4), and *multi-document theories* (#7).

**Net drift vs prior 2026-06-27 crystal-ball:** The parser, Mermaid renderer, CLI, and 15-solver surface are gone. The remaining roadmap is shorter and more focused — the reset removed four categories of work that were speculative or drifted.

---

**Next stage:** `/claudikins-grfp:brain-jam` — collaborate on README voice + angle for the EDN pipeline.
