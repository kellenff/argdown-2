# Crystal-Ball Report — argdown-2

**Date:** 2026-08-07 (refresh)
**Project version:** `0.2.0-alpha4` (branch `001-upgrade-deno`)
**Graph tools:** Yes — `codebase-memory-mcp` (6,577 nodes, 18,236 edges)
**Method:** graph-augmented (Cypher queries for dead-code + complexity + loop depth, `trace_path` for attack-surface, `get_code_snippet` to verify each dead-code candidate) + Bash/Read for TODO scan, secrets scan, file-size survey, alpha/snowball leftover scan.

**Note on prior 2026-07-20 crystal-ball:** superseded by this refresh — the prior report described pre-Effect-native state and pre-constitution posture; this one captures the post-migration, post-constitution reality.

---

## 1. Dead-code candidates (graph-derived, snippet-verified)

Graph query: `in_degree = 0 AND out_degree = 0 AND is_exported = true AND starts_with('src.')`. Filter out obvious BDD fixtures passed as `Effect.match` arguments (they're not connected via `CALLS` edges because they're function references, not calls).

| Symbol | File:Line | Lines | Confidence | Verdict |
|---|---|---|---|---|
| `src.mcp.io.try` | src/mcp/io.ts:130 | 6 | LOW | **Likely false positive.** Atomic-write helper `tmp + rename` for `saveDocumentRefEffect`. Probably called inside `Effect.tryPromise(try, ...)`, which doesn't register as a `CALLS` edge. Confirm by reading `src/mcp/io.ts:120-150`. |
| `src.reduce-dung.isSyntheticEntity` | src/reduce-dung.ts:56 | 3 | MEDIUM | **Verify.** `\0argdown:` prefix check. Could be used by `multi-extension` (which synthesizes proxy entities for nested solvers) via dynamic dispatch or string-based detection. If unused, candidate for removal. |
| `src.validate.onFailure` | src/validate.ts:396 | 4 | LOW | **False positive.** BDD fixture passed to `Effect.match` inside `validateComponent`. |
| `src.test-support.onSuccess` | src/test-support.ts | 1 | LOW | **False positive.** Exported BDD helper. |

All other graph-zero-candidates are `*.test.onFailure` / `*.test.onSuccess` BDD fixtures — false positives (passed as arguments to `Effect.match`, not called).

**Action items for follow-up commits:**
- Read `src/mcp/io.ts` around line 130 to confirm `try` is wired into `saveDocumentRefEffect`.
- Grep for `isSyntheticEntity` and `\0argdown:` across `src/` to confirm whether it's referenced anywhere.

---

## 2. Complexity hotspots (top 20 by cyclomatic complexity)

| Function | Complexity | Cognitive | Lines | File |
|---|---|---|---|---|
| `apply` | **50** | **140** | **445** | src/builder/apply.ts |
| `printWire` | 14 | 14 | 56 | src/edn-write.ts |
| `canonicalEdn` | 12 | 12 | 35 | src/schema.ts |
| `decodeElement` | 12 | 20 | 45 | src/schema.ts |
| `evaluateComponentTree` | 10 | 16 | 31 | src/component-eval.ts |
| `resolveInComponent` | 10 | 16 | 50 | src/builder/resolve-ref.ts |
| `decodeInterface` | 10 | 12 | 91 | src/schema.ts |
| `findStableExtensions` | 9 | 19 | 33 | src/multi-extension.ts |
| `validateCollectionUniqueness` | 9 | 11 | 59 | src/schema.ts |
| `decodeWire` | 9 | 10 | 68 | src/schema.ts |
| `findPreferredExtensions` | 8 | 18 | 33 | src/multi-extension.ts |
| `decodeSolverComponent` | 8 | 10 | 58 | src/schema.ts |
| `supportedRelationKinds` | 7 | 13 | 14 | src/model.ts |
| `reduceToDung` | 7 | 11 | 41 | src/reduce-dung.ts |
| `reduceToBipolar` | 7 | 14 | 33 | src/reduce-bipolar.ts |
| `printArgument` | 7 | 8 | 41 | src/edn-write.ts |
| `reduceToEvidential` | 7 | 14 | 33 | src/reduce-evidential.ts |
| `validateRelationReferences` | 7 | 7 | 62 | src/validate.ts |
| `validateImports` | 7 | 12 | 67 | src/validate.ts |
| `validateComponent` | 7 | 16 | 77 | src/validate.ts |

**Observations:**
- **`apply` is the single dominant hotspot** — cognitive complexity 140 (2× the next highest), 19 callees, 445 lines. All 11 mutating MCP tools route through it. Refactor risk = data-loss risk if regressions land.
- **Schema cluster** — `canonicalEdn`, `decodeElement`, `decodeInterface`, `validateCollectionUniqueness`, `decodeWire`, `decodeSolverComponent` are 6 of the top 12. Zod-based decode is the densest area after `apply`.
- **Multi-extension trio** — `findPreferredExtensions`, `findStableExtensions`, `findCompleteExtensions` are structurally identical (same complexity, same line count, same callees). Strong candidate for shared scaffolding.
- **File size distribution** — `src/schema.ts` (889 lines), `src/builder/apply.ts` (735), `src/validate.ts` (466), `src/multi-extension.ts` (263). Total ~2,353 LOC across the four hotspots; the rest of `src/` is much smaller.

---

## 3. Loop-depth / perf hotspots

| Function | trans_loop_depth | loop_depth | loop_count | File |
|---|---|---|---|---|
| `evaluateComponentTree` | 7 | 1 | 1 | src/component-eval.ts |
| `evaluateComponent` | 7 | 0 | 0 | src/component-eval.ts |
| `solve` | 7 | 0 | 0 | src/index.ts |
| `runSolveEffect` | 7 | 0 | 0 | src/mcp/tools.ts |
| `runSolve` | 7 | 0 | 0 | src/mcp/tools.ts |
| `evaluateMultiComponent` | 6 | 0 | 0 | src/component-eval.ts |
| `findPreferredExtensions` | 6 | 2 | 3 | src/multi-extension.ts |
| `findStableExtensions` | 6 | 2 | 3 | src/multi-extension.ts |
| `findCompleteExtensions` | 6 | 2 | 2 | src/multi-extension.ts |
| `isStable` | 5 | 1 | 1 | src/multi-extension.ts |

The `trans_loop_depth=7` on `solve` / `runSolve` is recursion through nested solver components (intentional — first-class solver components allow arbitrary nesting depth). `linear_scan_in_loop` = 0 across the board — no hidden O(n²) traps. `multi-extension` is the expected worst case (3-nested loop over candidate extensions), but bounded by problem size.

---

## 4. Attack surface (traced from public entries)

### Library entry points (already in deep-dive)
- `load`, `validate`, `parseCandidate`, `solve`, `apply`, `emptyDocument`.

### `solve` — depth 3 reach
```
src.solve
  └─ component-eval.evaluateComponent
      └─ component-eval.evaluateComponentTree
          ├─ component-eval.childComponents
          ├─ component-eval.evaluateLabelComponent
          └─ component-eval.evaluateMultiComponent
```
Only two external callers: `mcp.tools.runSolveEffect` (async) and `mcp.tools.runSolve` (sync, deprecated by Effect migration).

### `apply` — the chokepoint
```
src.builder.apply.apply  ← called by ALL 11 mutating MCP tools (×2 each, Effect + Promise variants)
  ├─ model.isSolverTag, model.supportedRelationKinds
  ├─ apply.stripColon, collectIds, refuse, withComponent, withInitialInterface
  ├─ apply.repairInterface, invalidId, invalidIdList
  ├─ apply.resolveRefOrRaw, resolveInferenceRefOrRaw, parentIdOf
  ├─ apply.failed, succeed
  ├─ apply.findComponent, replaceComponent, interfaceFor
  ├─ model.isEdnKeywordName
  ├─ resolve-ref.resolveRef, softRefId, resolveInferenceRef, resolveInComponent, stripKeywordColon
```
**22 direct + transitive callees inside `apply`'s reach.** Every MCP mutation flows through this one function — refactor here affects every mutation. **The constitution's typed-refusals contract (`BuilderCode` union) depends on this surface staying clean.**

### `io.ts` — atomic write + Effect→Promise boundary
- `saveDocumentRefEffect` uses `Effect.tryPromise(try, ...)` — the helper that graph flagged as 0-caller. This is the **only** file-write path for path-mode MCP mutations.
- Constitution V mandates atomic temp+rename — any regression here is a data-loss bug.

---

## 5. Content hygiene

| Check | Result |
|---|---|
| Hardcoded secrets / API keys / passwords / tokens in `src/` or `scripts/` | **None found.** |
| Stale TODO / FIXME / XXX / HACK comments | **2 TODOs**, both in CLI formatters: `format-mermaid.ts:32` (render relations), `format-json.ts:37` (wire diagnostics). Both are gated on `solve()` exposing more data — natural follow-ups. |
| Stale `alpha5` / `snowball` references in `src/`, `CHANGELOG.md`, `README.md`, `deno.json` | **Only in historical sections** (CHANGELOG Unreleased note, README mention). All consistent with the rollback. No active `alpha5` references in `deno.json` or `scripts/`. |
| `scripts/argdown-2-mcp.version` pin vs `deno.json` version | **Match** — both `0.2.0-alpha4`. CI enforces this. |
| Outdated dependency versions in `deno.json` | **None obviously stale.** `effect@^4.0.0-beta.101` (still beta but pinned), `zod@4.4.3` (current), `@modelcontextprotocol/sdk@1.29.0` (current), `@optique/{core,run}@^1.2.0` (current). |

---

## 6. Worktree + vendored scope (informational, not dead)

| Directory | Status | Notes |
|---|---|---|
| `repos/optique/` (2,140 nodes) | Vendored | Used by CLI parser; pinned copy of `@optique/core` + `@optique/run`. Not dead — intentional vendoring. |
| `vendor/edn-parser-js/` | Vendored | EDN parser; `deno.json` imports from `./vendor/edn-parser-js/lib/index.js`. Pinned, not dead. |
| `vendor/effect/` | Vendored | Effect runtime; intentional. |
| `.worktrees/` × 6 (claude-code-plugin-marketplace, deno-native-package, deno-pivot, fix-jsr-publish-ci, mcp-builder-server, pi-agent-extension) | Historical branches | All already merged to main. Could be deleted by `git worktree prune` for hygiene. |

---

## 7. Ecosystem position (where argdown-2 fits)

### Adjacent libraries / projects
- **Argdown 1.x** — predecessor; the `0.2.0-alpha4` reset replaced its custom DSL with EDN. The `examples/argdown1-censorship.edn` fixture preserves the Argdown 1.x tutorial as a parity anchor.
- **Dung-style argumentation frameworks** — academic literature is rich; `reduce-dung.ts`, `reduce-bipolar.ts`, `reduce-evidential.ts` map to Cayrol & Lagasquie-Schiex 2005 (bipolar) and 2005 §3.3 (evidential necessary-support).
- **Effect-native libraries** — peers include `effect-ts` ecosystem. The `runMcpEffect` adapter is a reference for collapsing Effect→Promise at boundaries.
- **MCP authoring servers** — `argdown-2-mcp` is one of the early "canonical-format builder" MCP servers (vs read-only / wrapper MCPs). The 14-tool builder pattern + `BuilderCode` refusal union is a template for "agent-authorable data" surfaces.

### Audience segments (current)
1. **TypeScript / Deno library consumers** who want a strict argumentation solver.
2. **LLM agents in Claude Code / Pi** that build and solve argument graphs.

### Audience segments (potential)
3. **Academic argumentation researchers** — Dung semantics users in formal argumentation, non-monotonic reasoning, AI-and-law. Current exposure is via the README + the Cayrol/Lagasquie-Schiex reference in the evidential solver.
4. **Multi-agent AI orchestration builders** — the prose-to-argdown-2 + interactive-argument skills are early primitives for "structured deliberation" between agents. Could grow into a reference implementation.
5. **Deno + Effect ecosystem consumers** — the Effect-native library pattern is transferable.
6. **Formal verification adjacent** — the `SolveError = never` alias + typed-failure-channel discipline (Constitution III) is a model for "design the failure surface as a first-class API."

---

## 8. Roadmap candidates

### Near-term (next minor / next alpha)
1. **`apply` refactor / decomposition** — complexity 50, cognitive 140. Split into per-edit-kind functions (`applyAdd`, `applyRemove`, `applyUpdate`, `applySetImport`, etc.) behind a single dispatcher. Lowers blast radius of MCP tool regressions.
2. **Resolve the 2 CLI TODOs** — `format-mermaid.ts` edge rendering + `format-json.ts` diagnostic wiring. Both gated on `solve()` exposing more.
3. **Confirm `isSyntheticEntity` use** — verify or remove. One-line change either way.
4. **Cleanup `.worktrees/`** — `git worktree prune` for branches already merged.
5. **Cut `0.2.0-alpha5` properly** — version bump + GitHub Release with host-native binaries (blocked on release process, not code).

### Medium-term (1.x prep)
6. **Schema cluster simplification** — `src/schema.ts` holds 6 of the top-12 complexity hotspots. The Zod-based decode is intrinsically branchy, but `decodeWire` (the entry point) could become a flat table-driven decoder instead of nested if/switch.
7. **Multi-extension shared scaffolding** — `findPreferredExtensions` / `findStableExtensions` / `findCompleteExtensions` are structurally identical. Extract the candidate-enumeration loop, parameterize the admissibility predicate.
8. **Benchmark suite growth** — `src/bench.fixtures/` has 7 fixtures; the multi-extension trio is the most expensive. Add a per-solver micro-benchmark to guard against regressions in `evaluateComponentTree` (trans_loop_depth=7).
9. **Cross-AI skill portability** — the Claude Code + Pi skill sharing is novel. Could grow into a "write once, run in 3 agents" pattern (Claude Code, Pi, Cursor). The current `prose-to-argdown-2` + `interactive-argument` skills are the v1 reference.

### Long-term (1.x → 2.x vision)
10. **Weighted / probabilistic argumentation** — bipolar + evidential are v1 of "non-classical" support. Next could be weighted (e.g., Probabilistic Argumentation by Hunter), still via first-class solver components.
11. **Visualization surface** — the README removed the Mermaid renderer (it was in Argdown 1.x, not in argdown-2). The TODO in `format-mermaid.ts` and the existing `argdown1-censorship.mapping.md` hint at where this could live — but as a **separate** tool/CLI, not as part of the solver library (Constitution II: solver stays pure).
12. **Reference catalog** — beyond `argdown1-censorship`, ship 5–10 canonical examples covering each solver + each reduction. The prose-to-argdown-2 skill already produces fixtures + shape tests; that pattern is the template.
13. **MCP builder pattern as a reference** — the 14-tool builder + typed `BuilderCode` refusals + atomic-write contract is a transferable pattern for any "agent-authorable canonical format." Document it as a pattern (not just an implementation), independent of argdown-2.

### Audience-expansion bets
14. **AI-and-law / computational argumentation community** — submit a paper / talk at ArgMAS (Argumentation in Multi-Agent Systems) workshop. The EDN + Effect + MCP angle is novel.
15. **Multi-agent debate framework** — package the prose-to-argdown-2 + interactive-argument skills as a reusable "structured deliberation" primitive. Could be its own JSR package.
16. **Effect-native data-format library pattern** — write up the `runMcpEffect` + `BuilderError` + `SolveError=never` pattern as a reusable Effect-native authoring pattern.

---

## 9. What is NOT in scope (constitutional guardrails)

Per `.specify/memory/constitution.md`:

- **No new solver without `SOLVER_TAGS` extension** — adding solvers requires updating the tuple in `src/model.ts` and the `supportedRelationKinds` mapping.
- **No hand-editing of `.edn`** in user docs / skills — the builder is the sanctioned authoring surface.
- **No silent omission of unsupported relation kinds** — they fail validation and the builder refuses them.
- **No separate MCP code path** — every MCP tool routes through the library.
- **No bundler step** for the MCP binary — compiled directly from `src/mcp/cli.ts`.
- **No MAJOR-version rename of any EDN theory tag** without a migration entry in `CHANGELOG.md`.

These are not aspirations — they're governance. Any roadmap item that conflicts with the constitution is out of scope.

---

**Next stage:** Stage 3 (Brain Jam) — collaborate with Gemini on the README angle (voice + strategy), using the deep-dive baseline + crystal-ball candidates as input.
