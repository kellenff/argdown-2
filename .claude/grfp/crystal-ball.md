# Crystal Ball Report — `argdown-2`

**Stage:** 2 of 5 (Crystal Ball) — fresh run, 2026-07-19
**Codebase HEAD:** `main`, version `0.2.0-alpha4` + significant Unreleased work
**Graph tools:** partial — Serena cache present but `find_symbol` / `search_for_pattern` return empty. Used `rg`/`fd` + `wc` for content search and complexity profiling.
**Reviewing:** `.claude/grfp/deep-dive.md` (this run, 2026-07-19)
**Note on prior 2026-07-18 crystal-ball:** described alpha1 state where preferred/stable/complete/Bipolar/ASPIC+ solvers were deleted. Those have since been **reintroduced** (multi-extension.ts, reduce-bipolar.ts, reduce-evidential.ts), and **first-class solver components** are new. Roadmap below updated to match.

---

## 1. Dead code (content-confirmed scan, lower confidence than graph-backed)

| Symbol / Surface | Location | Inbound references | Confidence | Action |
| --- | --- | --- | --- | --- |
| `EXTENSION_PROPORTION_OBSERVER_TAG` | `src/model.ts:5` | 0 — exported but no caller in src/ | Medium (string search only) | **Audit**: either intentional observer tag waiting for a solver, or dead. Grep `.claude-plugin`, `plugins/` next |
| `ExtensionNativeResult` type | `src/index.ts:24` | exported via re-export | Low | Keep — public API surface for multi-extension solvers |
| `soft-parse` (`src/builder/soft-parse.ts`) | referenced in `edn-write.test.ts:9` | at least 1 test | Keep |
| `reduce-dung.ts` (3 exports) | `src/component-eval.ts:25` + `src/index.ts` | ≥ 3 callers | Keep (used by `grounded`/`preferred`/`stable`/`complete`) |
| `reduce-bipolar.ts`, `reduce-evidential.ts` | `src/component-eval.ts:24,26` | 1 caller each (dispatcher) | Keep |
| `apply` (builder) | `src/builder/apply.ts:703` — largest file | ≥ 7 callers (tests + mcp/tools) | Keep; complexity hotspot (see §2) |
| `MCP_RELATIONS_KIND` constants | `src/mcp/server.ts` | n/a | Likely keep |
| Cursor plugin remnants | removed in unreleased per CHANGELOG | 0 | Confirmed gone |

**TODO/FIXME/HACK in production:** 0 in `src/`, `scripts/`, `plugins/`. Test fixtures only contain the word "token" in EDN test inputs ("invalid numeric token").

## 2. Complexity hotspots

| File | LOC | Concern |
| --- | --- | --- |
| `src/schema.ts` | 877 | Zod schema for full EDN value tree; recursive `z.lazy`. Right size for the surface |
| `src/builder/apply.ts` | 703 | Switch over builder op kinds — biggest single complexity source. Pure apply function, easy to test |
| `src/validate.ts` | 422 | Endpoint/reference/relation-kind validation. Clean separation |
| `src/edn-write.ts` | 307 | EDN serializer (mirror of edn.ts). Stable shape |
| `src/multi-extension.ts` | 263 | residue-based finders for preferred/stable/complete (memory: SCC-based is wrong → use argument-level Modgil via `defenseClosure(new Set(), map)`) |
| `src/mcp/tools.ts` | unknown (≈200) | 14 tool handlers — by construction, must mirror the schema |
| `src/model.ts` | 252 | Tag + type definitions. Many exports by design (public API) |

**Single biggest hotspot:** `src/builder/apply.ts:703`. 14 MCP tools all funnel through this one switch. It's the right design (one pure function for one canonical mutation), but it's the natural place for future refactor if edit complexity grows.

## 3. Attack-surface review

### Library
- **Inputs:** only EDN strings. Zod schema and `validate.ts` reject anything malformed before `solve` ever sees it. **Safe by construction.**
- **No filesystem I/O.** Library is pure.

### MCP server
- **`path` argument.** `src/mcp/io.ts` uses temp+rename atomic write. `saveDocumentRef` rejects paths that escape the working directory? (verify) — if not, add `path.resolve` + cwd check.
- **Soft warnings vs hard refuses.** `builder/unresolved-ref` is a soft warning (document still mutates); `builder/duplicate-id`, `builder/missing-id`, `builder/unsupported-relation-kind` hard-refuse. This split is intentional and well-scoped.
- **Concurrency:** stdio single-client. No lock needed. If HTTP transport ships (Roadmap §7 #4), locking story needs design.
- **No network.** No outbound calls. Pure local tool.

## 4. Ecosystem fit

**Adjacent / next-door projects:**

- **edn-parser-js** — only runtime parser dep. Vendored at `./vendor/edn-parser-js/`. Patch protocol dependency declared in alpha2 (now deno.json npm specifier). Single point of failure for EDN correctness — track upstream.
- **Zod 4.4.3** — recursive `z.lazy` powers EDN's open type system. Track Zod 5/6 changes.
- **@modelcontextprotocol/sdk 1.29.0** — stdio transport. MCP spec moving (HTTP transport, OAuth, structured outputs).
- **Argdown 1.x (`@argdown/core`)** — prior language. `examples/argdown1-censorship.edn` is the manual port demonstrating the mapping gap. **No migration tool ships** — by design.
- **Argdown 1.x CLI/parser/Mermaid** — deleted in alpha1 reset, intentionally out of scope.
- **Academic neighbors (Carneades, ASPIC+, abstract argumentation libs)** — current solvers cover grounded/preferred/stable/complete (Dung 1995) + bipolar/evidential (Cayrol & Lagasquie-Schiex 2005). ASPIC+ is roadmap.

## 5. Audience segments that could benefit

1. **LLM agent authors** building argumentation tools. The MCP builder server is the cheap path: 14 tools, soft-warning mutations for incremental authoring, hard-error `validate`/`solve` for the production gate.
2. **Formal-reasoning engineers** who want grounded Dung over a typed AST instead of a Python or Java abstract framework.
3. **Argument-mining / RAG pipelines** that already speak EDN. Drop-in strict validator and grounded-labeler.
4. **The project's own future self** — adding a new solver tag (`#casualtheorics.argdown2.solver/<name>`) requires only the tag + a parallel `reduceToX` + solver result fn. Pipeline unchanged.
5. **Editor plugin authors** (VS Code, Obsidian) — MCP server speaks the protocol; a plugin can drive it directly. Roadmap candidate.
6. **Claude Code users** — one-click install via the marketplace plugin. Three skills (`build-graph`, `interpret-solve`, `validate-debug`) ship with the plugin.
7. **Argdown 1.x migration tooling authors** — `examples/argdown1-censorship.edn` is the manual port. A sibling `argdown-1to2` package is a community opportunity, not a project commitment.

## 6. Roadmap candidates (ranked for alpha4 + Unreleased state)

| # | Title | Effort | Impact | Why now |
| --- | --- | --- | --- | --- |
| 1 | **Document the first-class solver components story** | XS | H | It's the headline new feature (Unreleased), formally grounded in a category-theory companion doc, and most readers won't know what "nested solvers" means. README gap |
| 2 | **Branded `AttackMap` direction marker** | S | S | Memory-deferred. Cosmetic. Skip until a second consumer appears |
| 3 | **HTTP transport for MCP server** | M | M | Today is stdio-only. Unlocks multi-user deployments. Blocked on per-document locking story |
| 4 | **Split `apply` into per-edit-type pure functions** | S | M | 14-fan-out switch is biggest single-file complexity. Splitting lowers coupling; each edit becomes independently testable |
| 5 | **Incremental solve (memoize `reduceToDung`)** | S | M | `large-stress` fixture is slow. If a tool mutates the document once and re-solves 10x, reduction is the same — memoize per (relation-set hash) |
| 6 | **Renderer (D2 / DOT / Mermaid-from-EDN)** | M | M | Standalone package that consumes `solve(document).native` and emits a graph. Builds on the censorship parity example |
| 7 | **CLI for `load` / `solve`** | S | M | Today only MCP and library. A `npx argdown-2 solve doc.edn` would unlock batch / CI use without an MCP client |
| 8 | **ASPIC+ solver** | L | H | Roadmap-deferred. Requires `preference:` attributes; EDN tags already support via `metadata`. Wait until a real consumer asks |
| 9 | **Cross-document reference (multi-file theories)** | L | H | Today every document is single-rooted. A multi-root solver tag could combine multiple `.edn` files. Blocked on MCP server concurrency work |
| 10 | **Editor plugin (VS Code)** | L | H | MCP server makes this 100 LOC + a manifest. Distribution channel for the library |
| 11 | **Argdown 1.x → EDN translator** (`argdown-1to2`) | M | M | Unblocks adoption. **Belongs in a sibling package**, not in this repo — keep `argdown-2` tight |
| 12 | **Public 1.0 + license choice** | XS | H | README explicitly says "license will be chosen before the first public release." `deno.json` says Unlicense. Reconcile, then ship 1.0 |

## 7. Vision (the "could be" picture)

`argdown-2` is currently a *strict EDN loader + 6-solver argumentation engine (grounded / bipolar / evidential / preferred / stable / complete) + first-class nested components + builder MCP server*. The natural arc:

```
[ EDN document ] -----> [ load → validate → solve ]
       |                          |
       |                          +--> labels (in/out/undec)
       |                          +--> extensions (preferred/stable/complete)
       |                          +--> nested solver boundaries
       |
       +--> [ MCP builder server ] <--- agent tool calls (14 tools)
       |
       +--> [ visualization ] (D2 / DOT / Mermaid-from-EDN) — future
       |
       +--> [ multi-document ] (multi-root solver tags) — future
       |
       +--> [ editor plugin ] (VS Code / Obsidian) — future
```

In one year this could be a **focused toolkit** (2–3 packages under `@casualtheorics/argdown-*`) covering read, write, build, solve, and visualize — with `argdown-2` itself as the foundational strict validator and multi-solver engine. The current architecture (one strict pipeline + one builder layer + one MCP surface, all EDN-in / typed-object-out) is the right shape for that.

The three highest-leverage README improvements, ranked:
1. **Lead with first-class nested solvers** — it's the most novel feature and the README currently buries it.
2. **Lead with "no throws, no partial docs"** — the strongest correctness claim, already in the README but under-emphasized.
3. **Split install paths for Claude Code users vs library users vs generic MCP consumers** — the README currently mixes all three audiences.

**Net drift vs prior 2026-07-18 crystal-ball:** Preferred/stable/complete solvers are back. Evidential is new. First-class nested solvers are the new headline. Roadmap is now in *documentation* mode rather than *core features* mode — the engine is complete, the README is the gap.

---

**Next stage:** `/claudikins-grfp:brain-jam` — collaborate on README voice + angle for the alpha4 + Unreleased state.
