# Crystal Ball Report — `argdown-2`

**Date:** 2026-06-22
**Graph tools available:** Yes (520 nodes, 1200 edges)
**Reviewing:** `.claude/grfp/deep-dive.md`

---

## 1. Dead code (graph + manual confirmation)

| Symbol | File:Line | Inbound edges | Confidence | Action |
|---|---|---|---|---|
| `parseHeadingText` | `src/parser.ts:293-302` | 0 | **High** | Defined, never called. Grep across `src/` returns only its definition + a stale comment ("matches parseTitleText / parseHeadingText" at line 787). Likely a vestige from a chevrotain declarative-rule approach that was abandoned. **Safe to delete.** |
| `parsePlainScalar` | `src/parser.ts:304-306` | 0 | **High** | Same pattern: defined, no callers. Wraps `tokenRule(s, 'PlainScalar')` but the token is consumed inline at lines 774-777 / 176 by `skipEmptyTextTokens` and the lookahead checks. **Safe to delete.** |
| `formatError` | `src/parser.ts:1209-1211` | 0 (graph) | **Low — false positive** | Re-exported via `src/index.ts` line 3 — it IS part of the public API. The graph only tracks internal `CALLS` edges, not module-level re-exports. **Keep.** |

**Bench interfaces (`RunBenchOptions`, `RunBenchResult`, `BaselineEntry`, `BaselineFile`)**: graph says 0 in-degree, but they are imported as types by `src/parser.bench.test.ts:12,89,109`. Same false-positive pattern (type imports aren't `CALLS` edges). **Keep.**

**Action:** Delete `parseHeadingText` + `parsePlainScalar` (≈13 lines + stale comment) before publishing; nothing else is dead.

## 2. Complexity hotspots (fan-out, not cyclomatic)

The graph's `complexity` field is empty for most functions, so I'm ranking by **fan-out** (how many other symbols a function calls). High fan-out means more coupling, not necessarily bad code.

**Top hotspots (visitor.ts, parser.ts):**

| Function | File | Fan-out | Role |
|---|---|---|---|
| `parseValue` | `src/parser.ts:???` | 8 | Value parser for YAML-like attributes |
| `visitBlock` | `src/visitor.ts` | 7 | AST constructor for `:::meta[…]` blocks |
| `makeValueNode` | `src/visitor.ts` | 6 | CST → AST for any `Value` variant |
| `visitRelation` | `src/visitor.ts` | 6 | Builds `Relation` nodes (any arrow) |
| `parseAttributeEntry` | `src/parser.ts` | 6 | Single `key: value` inside `{}` |
| `parseYamlValue` | `src/parser.ts` | 6 | YAML-ish scalar/sequence/mapping parser |
| `visitDocument` | `src/visitor.ts` | 5 | Top-level AST builder |
| `parseFact`, `parseRule`, `parseRuleExpr`, `parseYamlLine` | `src/parser.ts` | 5 each | Main statement parsers |

These are inherent to the problem (every construct fans into its sub-constructs) and not a smell. **Action: none.**

## 3. Performance headroom (from `perf-baseline.json`)

Current `parse()` throughput on Node 24.17.0, arm64 darwin:

| Fixture | Size | ops/sec | p99 (ms) |
|---|---|---|---|
| small-claim | 181 B | 41,478 | 0.038 |
| small-rule | 127 B | 56,723 | 0.024 |
| small-relation | 216 B | 31,131 | 0.045 |
| medium-climate | (bigger) | — | — |
| heavy-relations | (bigger) | — | — |
| deep-nesting | (bigger) | — | — |
| large-stress | (largest) | — | — |

Throughput already ~30-60k ops/sec on small inputs. Chevrotain 12 is faster than 11 in many benchmarks; the dep upgrade (see §5) is likely a free 10-30% speedup.

## 4. Dependency posture

| Dep | Pinned | Latest | Notes |
|---|---|---|---|
| `chevrotain` | `^11.0.3` | **`12.0.0`** (released 2026-03-13) | Major version behind. Chevrotain 12 requires `node >=22.0.0`; this project says `engines.node: >=18`. **Real fork**: bump the engine floor OR stay on 11 and document why. |
| `vitest` | `^1.6.0` | (2.x line stable) | Minor drift; works fine. |
| `typescript` | `^5.4.5` | (5.x stable) | Fine. |
| `oxlint`, `oxfmt` | `^0.6.0` | — | These are actively-developed rust formatters/linters; they will move. |

**No security advisories detected in `package.json`.** No hardcoded secrets in source.

## 5. Ecosystem fit & gaps

**What's adjacent:**

- **Original Argdown** (`@argdown/core`): the predecessor. This project is a clean-room successor; no shim for 1.x syntax exists. Anyone migrating needs a translator — *opportunity for a sibling `argdown-migrate` package*.
- **Prolog/Datalog engines**: `argdown-2`'s `:-` + `,` syntax is Datalog-flavored but the AST doesn't expose an evaluation interface. A pure-TS Datalog interpreter on top of the AST would unlock "ask questions about the argument graph" — a clear product feature.
- **Graphviz/D2 renderers**: the arrow taxonomy maps cleanly to DOT; a `argdown-to-dot` package is the obvious next step.
- **Argument-mapping UIs**: VS Code / Obsidian plugins need this kind of parser. The `./ast` subpath export already makes integration easy.

## 6. Audience segments that could benefit

1. **Academic argument-mapping researchers** (philosophy, rhetoric, communication studies) — currently use Argdown 1.x or hand-rolled tools.
2. **LLM pipeline builders** who want `Fact` / `Rule` shapes to slot into RAG knowledge graphs.
3. **Formal-reasoning / knowledge-rep hobbyists** (the Datalog-lite angle).
4. **Editors / IDE plugin authors** who need a deterministic parser with error recovery for hover/diagnostics.
5. **Argument-mining researchers** extracting claims from text (the `Fact`/`Rule` shape is downstream-friendly).

## 7. Roadmap candidates (ranked)

| # | Title | Effort | Impact | Why now |
|---|---|---|---|---|
| 1 | **Delete dead code** (`parseHeadingText`, `parsePlainScalar`) | XS | M | First thing before publishing — zero risk, smaller surface. |
| 2 | **Decide on chevrotain 12 upgrade path** | S | M | Engine floor (Node 22) decision affects all downstream consumers. Pick now or document explicitly. |
| 3 | **Add a CI workflow** (`.github/workflows/ci.yml`) | S | H | No CI today — `bench:check` and `lint`/`typecheck` aren't gated. `npx vitest` + `oxlint` + `oxfmt --check` + `tsc --noEmit` is one file. |
| 4 | **Add a `parseFile()` / `parseFiles()` helper** | S | M | 80% of consumers will want this; current API is `parse(source: string)` and consumers do their own I/O. |
| 5 | **Expose `FormatOptions` + a stringifier (`format(ast)`)** | M | H | Symmetric surface: read AND write argdown. Closes the loop for editor plugins. |
| 6 | **Datalog evaluator on top of the AST** | L | H | Unlocks "evaluate argument graph" — biggest product differentiation move. |
| 7 | **Argdown 1.x → 2.x translator** (`argdown-migrate`) | M | M | Unblocks adoption from existing Argdown users. |
| 8 | **D2/DOT/graphviz renderer** (`argdown-to-dot`) | M | H | Standalone package; immediately useful for visualization. |
| 9 | **Editor plugin** (VS Code or Obsidian) | L | H | Distribution channel. The `./ast` export already makes integration painless. |
| 10 | **Language Server** (LSP wrapper around `parse`) | M | H | Reusable across editors; foundation for diagnostics, hover, jump-to-def. |
| 11 | **Publish to npm** (today `private: true`) | XS | H | One-line change in `package.json` + provenance + signing. |

## 8. Vision (the "could be" picture)

`argdown-2` is currently a *parser library*. The natural arc is:

```
parser ──→ stringifier ──→ migrator (1.x → 2.x)
                ↓
         graph renderers (D2/DOT)
                ↓
         Datalog evaluator
                ↓
         editor plugins (VS Code, Obsidian)
                ↓
         language server (diagnostics, hover)
```

In one year this could be a **small toolkit** (4-6 packages under `@casualtheorics/argdown-*`) covering read, write, migrate, evaluate, and visualize — with the parser as the foundational truth and a unified `.argdown` file extension. The current architecture (clean CST→AST boundary, rich discriminated-union AST, fuzz+mutate invariants as the test base) is already the right shape for that.

---

**Next stage:** `/claudikins-grfp:think-tank` — research how similar high-star parser/grammar projects nail their READMEs and extract patterns.