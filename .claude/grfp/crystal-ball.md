# Crystal Ball Report — `argdown-2`

**Stage:** 2 of 5 (Crystal Ball) — RESTART after drift resolution
**Date:** 2026-06-23
**Codebase HEAD:** `9384257`
**Graph tools available:** ✅ Yes (`Users-kellen-Projects-argdown-2`, 705 nodes, 1559 edges)
**Reviewing:** `.claude/grfp/deep-dive.md` (post-`308c0b9`)

---

## 1. Dead code (graph-confirmed)

| Symbol | Location | Inbound edges (graph) | Confidence | Action |
|---|---|---|---|---|
| `parseHeadingText` | `src/parser-frontmatter.ts:63–72` | **0** (confirmed via `trace_path` + grep) | **High** | Defined, re-exported by `src/parser.ts:60`, but never imported or called anywhere. ~10 lines + the stale comment at line 231 ("matches parseTitleText / parseHeadingText — see those for the lexer"). **Delete.** |
| `parsePlainScalar` | `src/parser-frontmatter.ts:74–76` | **0** (confirmed via `trace_path` + grep) | **High** | Defined, re-exported by `src/parser.ts:61`, but never called. The `PlainScalar` token is consumed inline by other parsers. 3 lines. **Delete.** |
| `blockTypeName` (duplicate) | `src/visitor.ts:110–125` | **0** | **High** | A second copy exists at `src/visitor-block.ts:17` (and IS used at line 88). The one in `visitor.ts` is genuine dead code from the cycle-2 visitor split. 16 lines. **Delete** (the `visitor-block.ts` copy is the canonical one). |

**Verified non-dead (false positives flagged by graph):**

- `formatError` — re-exported via `src/index.ts:4`. **Keep** (public API).
- `tokenNode` (parser-util.ts) — graph shows 20 in-degree. **Keep** (workhorse).
- `pickFirst`, `locFromTokens`, `collectAllTokens` (visitor.ts) — graph shows 14–17 in-degree. **Keep** (visitor helpers).
- All `src/index.ts` re-exports — they're the public surface, even if internal callers don't exist.

**Total removable:** ~29 lines and a confusing duplicate. XS effort, M impact (smaller, cleaner surface for first publish).

## 2. Complexity hotspots (fan-in / fan-out)

The graph's `complexity` field is empty for most functions, so I'm ranking by **structural fan-in/fan-out** from the live graph.

**Top fan-out (high coupling — these orchestrate):**

| Function | File | Out-degree | Role |
|---|---|---|---|
| `parseFrontmatter` | `parser-frontmatter.ts` | 10 | YAML + value parser dispatch |
| `parseStatement` | `parser.ts` | 9 | Per-line dispatcher (fact / arg / relation / block / heading) |
| `parseValue` | `parser-frontmatter.ts` | 8 | Value-type dispatcher (string / number / bool / null / flow) |
| `visitBlock` | `visitor-block.ts` | 8 | AST constructor for `:::meta[…]`, `:::evidence[…]`, etc. |
| `parseArgument` | `parser-arg.ts` | 7 | Argument parser (conclusion + premise-list + attributes) |
| `parsePremise` | `parser-arg.ts` | 7 | Premise parser (atom / disjunction / nested arg) |
| `parseDisjunction` | `parser-arg.ts` | 6 | `([#A] | [#B])` parser |
| `parseAttributeEntry` | `parser-relation.ts` | 6 | Single `key: value` entry in `{}` |
| `visitFact`, `visitRelations` | `visitor.ts` | 6 each | CST → AST constructors |

These are inherent to the problem: dispatchers must know about every variant. Not a smell. **Action: none.**

**Top fan-in (highly reused helpers — KEEP GREEN):**

| Function | File | In-degree | Role |
|---|---|---|---|
| `tokenNode` | `parser-util.ts` | **20** | CST node wrapper — used everywhere |
| `pickFirst` | `visitor.ts` | 17 | First-child helper |
| `locFromTokens` | `visitor.ts` | 14 | Source location from token range |
| `collectAllTokens` | `visitor.ts` | 14 | Flatten CST children |
| `parse` | `parser.ts` | 11 | **Public entry point** |
| `tokenRule` | `parser-util.ts` | 11 | Token → CST rule helper |
| `splitLines`, `joinLines` | `parser.mutate.ts` | 8 each | Mutation testing infrastructure |

**Action:** keep these stable. If anyone changes a 20-in-degree workhorse, it propagates to 1/4 of the parser.

## 3. Performance posture (`perf-baseline.json`, captured 2026-06-22)

| Fixture | Size | ops/sec | p99 (ms) | Peak heap Δ (MB) |
|---|---|---|---|---|
| `small-claim` | 181 B | 41,479 | 0.038 | 0.6 |
| `small-rule` (now small-arg) | 127 B | 56,723 | 0.024 | 0.3 |
| `small-relation` | 216 B | 31,132 | 0.045 | 0.7 |
| `medium-climate` | 1,646 B | 5,261 | 0.326 | 0.9 |
| `heavy-relations` | 2,311 B | 2,487 | 0.585 | 1.2 |
| `deep-nesting` | 1,439 B | 7,415 | 0.168 | 0.4 |
| `large-stress` | 120,873 B | 41 | 39.66 | 34.8 |

Throughput scales linearly with file size; `large-stress` (121 KB) takes ~40ms p99 — comfortably interactive for editor use. No regression versus prior capture. Chevrotain 12 is faster than 11 in published benchmarks but requires Node ≥22 — this project's `engines.node: ">=18"`, so the upgrade is a coupled decision (see §5).

## 4. Dependency posture

| Dep | Pinned | Notes |
|---|---|---|
| `chevrotain` | `^11.0.3` | Major version behind (12.x released 2026-03; requires Node ≥22). **Real fork:** bump `engines.node` to `>=22` or stay on 11 and document why. |
| `vitest` | `^1.6.0` | Minor drift; works fine. |
| `typescript` | `^5.4.5` | Stable. |
| `oxlint`, `oxfmt` | `^0.6.0` | Active rust-based tooling; will move. |
| `@stryker-mutator/*` | `8.7.1` | Pinned exact. |

**No security advisories visible in `package.json`.** No hardcoded secrets in source. No `TODO`/`FIXME`/`HACK`/`XXX` markers anywhere in `src/` (grep returns empty).

## 5. Ecosystem fit & gaps

**Adjacent / next-door projects:**

- **Original Argdown** (`@argdown/core`) — canonical predecessor. Clean-room successor; **no shim for 1.x syntax exists** (the `:-` lexer token is retained only to emit a hard error, not to translate). Anyone migrating needs a translator → opportunity for a sibling `argdown-migrate` package.
- **Datalog engines** (`Soufflé`, `logic.js`) — argdown-2's `->` + `,` argument syntax is *Datalog-evocative* but the AST doesn't yet expose an evaluation interface. A pure-TS evaluator on top of `Argument`/`Fact` would unlock "ask questions about the argument graph" — a clear product feature.
- **Graphviz/D2/DOT renderers** — the seven-arrow taxonomy maps cleanly to DOT; a sibling `argdown-to-dot` package is the obvious next step.
- **Editor plugins** (VS Code, Obsidian) — the `./ast` subpath export and the partial-AST-on-error behavior are exactly what editor integrations need.

## 6. Audience segments that could benefit

1. **Policy analysts / researchers** writing structured argument maps (climate, ethics, jurisprudence). The DESIGN.md worked example is literally a climate-policy graph.
2. **LLM pipeline builders** who want `Fact` / `Argument` / `Relation` shapes for RAG knowledge graphs.
3. **Argument-mining researchers** extracting claims from text — the typed AST is downstream-friendly.
4. **Formal-reasoning hobbyists** — the linked-argument / nested / disjunction syntax reads like a logic textbook.
5. **Editor / IDE plugin authors** who need a deterministic parser with error recovery for hover/diagnostics.
6. **Argdown 1.x users** wanting a clean replacement (segment 5 → migration tooling).

## 7. Roadmap candidates (ranked)

| # | Title | Effort | Impact | Why now |
|---|---|---|---|---|
| 1 | **Delete dead code** (`parseHeadingText`, `parsePlainScalar`, `blockTypeName` dup) | XS | M | ~29 lines gone; zero risk. Do before any public commit. |
| 2 | **Add CI workflow** (`.github/workflows/ci.yml`) | S | H | No CI today; `vitest` + `oxlint` + `oxfmt --check` + `tsc --noEmit` + `bench:check` is one file. |
| 3 | **Decide on chevrotain 12 + Node 22** | S | M | Coupled engine-floor decision; affects every consumer. Document either way. |
| 4 | **Publish to npm** (`private: true` → `false`, `0.0.0` → `0.1.0`) | XS | H | One-line change + provenance + signing. README cannot do its job until the package is findable. |
| 5 | **Add `parseFile()` / `parseFiles()` helper** | S | M | 80% of consumers will want this; today every caller does their own I/O. |
| 6 | **Stringifier (`format(ast)`) + `FormatOptions`** | M | H | Symmetric read/write surface; closes the loop for editor plugins. |
| 7 | **Argdown 1.x → 2.x translator** (`argdown-migrate`) | M | M | Unblocks adoption from existing Argdown users. |
| 8 | **D2/DOT/graphviz renderer** (`argdown-to-dot`) | M | H | Standalone package; immediately useful for visualization. |
| 9 | **Argument evaluator** (does the conclusion follow from the premises, given assumptions?) | L | H | Unlocks "evaluate argument graph" — biggest product differentiation move. |
| 10 | **Editor plugin** (VS Code or Obsidian) | L | H | Distribution channel. `./ast` export already makes integration painless. |
| 11 | **Language Server** (LSP wrapper around `parse`) | M | H | Reusable across editors; foundation for diagnostics, hover, jump-to-def. |

## 8. Vision (the "could be" picture)

argdown-2 is currently a *parser + Mermaid renderer*. The natural arc:

```
parser ──→ stringifier ──→ migrator (Argdown 1.x → 2.x)
                ↓
         graph renderers (D2 / DOT / Mermaid-alternatives)
                ↓
         argument evaluator (does the inference hold?)
                ↓
         editor plugins (VS Code, Obsidian)
                ↓
         language server (diagnostics, hover, jump-to-def)
```

In one year this could be a **small toolkit** (4–6 packages under `@casualtheorics/argdown-*`) covering read, write, migrate, evaluate, and visualize — with the parser as the foundational truth and `.argdown` as the unified file extension. The current architecture (clean CST→AST boundary, rich discriminated-union AST, fuzz+mutate invariants as the test base, spec-as-source-of-truth with the BNF) is already the right shape for that. The two missing pieces are *distribution* (npm publish, CI) and *symmetry* (stringifier).

---

**Next stage:** `/claudikins-grfp:think-tank` — research how similar high-star parser/grammar projects write their READMEs.
