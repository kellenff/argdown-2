# `prose-to-argdown` Skill Design

**Date:** 2026-07-11
**Status:** Approved (rev 2: distribution moved from user-scope to repo-scope with multi-host packaging)
**Scope:** A new snowball SKILL.md that takes argumentative or research/technical prose and distills it into a full argdown-2 document, with strict provenance and grounded arguments. Lives **inside the `argdown-2` repo** at `skills/prose-to-argdown/SKILL.md`, alongside host-specific adapters: a pi-coding-agent extension at `.pi/extensions/prose-to-argdown.ts` and a Claude Code plugin at `.claude-plugin/plugin.json` + `commands/prose-to-argdown.md`. Validates output by parsing and rendering through `argdown-2`'s MCP server before delivering inline.

---

## 1. Context and goals

`argdown-2` is a TypeScript parser and Mermaid renderer for the Argdown Extended argumentation markup language. Its grammar is frozen at `v0.1.0-alpha1`; its public API exposes `parse`, `formatError`, `renderMermaid`, `solve`, `solveBipolar`, `solveAspic`, `solveEvidential`, the multi-extension variants, and a CLI with an MCP-server subcommand (`argdown mcp`).

Today, producing argdown-2 documents from natural-language prose is a manual exercise. The user reads an essay or paper and writes the argdown by hand. This skill automates that translation **without inventing arguments**: every fact and argument in the output must be grounded in the source prose, with verifiable provenance.

**Goals**

- One new SKILL.md at `skills/prose-to-argdown/SKILL.md` inside the `argdown-2` repo. The skill loads into any agent that has the snowball skill-discovery machinery (project-local `.agents/skills` or equivalent).
- Pi-coding-agent extension at `.pi/extensions/prose-to-argdown.ts` that registers a `prose_to_argdown` tool and `/prose-to-argdown` command, both of which load the SKILL.md content as instructions and validate output via the argdown-2 MCP server.
- Claude Code plugin at `.claude-plugin/plugin.json` plus a slash command at `commands/prose-to-argdown.md` that mirrors the pi extension's command behavior for Claude Code hosts.
- Triggered by user requests to "extract the claims", "map the argument", "turn this into argdown", "structure this", or similar — applied to argumentative prose (essays, op-eds, reviews, polemics, position papers) and research/technical prose (paper sections, technical reports, book chapter excerpts).
- Three-pass reasoning pipeline inside the skill (Facts → Relations → Arguments). Each pass validated via `argdown-2`'s MCP server.
- Strict provenance: every fact and argument carries `source-line` and `source-quote` attributes. `source-quote` MUST be a verbatim substring of the input prose; the skill verifies this programmatically before delivery.
- **Grounded arguments.** The skill emits `([#X]) -> [#Y], [#Z].` constructions only when the prose states or strongly implies that argument. It does not synthesize arguments from background knowledge. Silence is a valid output — if the prose does not argue anything, the arguments section is empty.
- Output delivered as a fenced ` ```argdown ` code block in the chat reply.
- 80%+ test coverage on the skill's behaviors (fixtures + assertions, not Stryker — there is no parser to mutate).

**Non-goals (deferred)**

- Argdown-1.x `:—` syntax migration. Out of scope; a separate `argdown-migrate` package is the right home (per the argdown-2 README's "deliberately not here" list).
- Standalone argdown-2 extensions (DOT/D2 renderer, editor plugin, datalog evaluator). Unrelated.
- A library/SDK form of this skill (e.g., `import { extractClaims } from 'prose-to-argdown'`). The skill is conversational; programmatic use is a separate cycle.
- Strict inference rules (where undercut does not defeat). ASPIC+ solver change, separate cycle.
- Resolving contradictions in the source prose. The skill preserves them as `--x` relations.
- Translation across languages. English-only for v1.
- Streaming or incremental output. The skill processes a complete chunk end-to-end before delivery.
- Inferring arguments beyond what the prose states or strongly implies. Explicitly out of scope by design (the grounded-arguments invariant).
- Publishing the skill to a public marketplace or registry (Claude marketplace listing, npm `prose-to-argdown` package, etc.). v1 ships in-repo; publication is a future cycle.
- Cursor, Aider, or Gemini CLI plugins. The snowball SKILL.md is portable to all three; explicit adapters for non-pi / non-Claude hosts are deferred until requested.

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Skill scope (repo-level) | `skills/prose-to-argdown/SKILL.md` inside the `argdown-2` repo |
| Pi extension | `.pi/extensions/prose-to-argdown.ts` registering a `prose_to_argdown` tool + `/prose-to-argdown` command |
| Claude plugin | `.claude-plugin/plugin.json` manifest + `commands/prose-to-argdown.md` slash command |
| Skill name | `prose-to-argdown` |
| Trigger scope | Argumentative prose (essays, op-eds, reviews, polemics, position papers) and research/technical prose (paper sections, technical reports, book excerpts) |
| Output shape | Full argdown-2 document: frontmatter + facts + relations + arguments + structured blocks |
| Provenance | Every fact and argument carries `source-line: N` and `source-quote: "verbatim span"` |
| Provenance validation | Programmatic verbatim-substring check on every `source-quote` before delivery |
| Extraction architecture | Three reasoning passes (Facts → Relations → Arguments), each validated independently |
| Facts pass | Extract atomic claims from prose. IDs lowercase-hyphenated, semantic. No synthesis. |
| Relations pass | Identify `-->` / `--x` / `-.->` / `-.-` / `~>` / `?>` / `<->` edges stated or strongly implied. No background-knowledge relations. |
| Arguments pass | Extract `([#X]) -> [#Y], [#Z].` argument structures stated or strongly implied. **Grounded**: every argument has a defensible span in the prose. No synthesis. |
| Validation loop | Pass 1+2: `argdown parse` via MCP, 1 retry on syntax errors. Pass 3: parse + `argdown render` + LLM visual sanity-check against prose; up to 2 refinement rounds. |
| Sanity-check rubric | Completeness, fidelity, provenance. If any fail, rewrite Pass 3 output (not Pass 1/2). |
| Sanity-check budget | 2 refinement rounds, then deliver best-effort with a one-line warning note |
| Parse-failure budget | 1 parse retry per pass (2 total attempts); then deliver best-effort with parser errors surfaced |
| Output delivery | Inline `argdown` code block in chat reply |
| Chat wrapper | Brief intro line (`Extracted N facts, M relations, K arguments from <words> words of prose.`) + the code block + one-line footer advising review of `source-quote` attributes |
| Excluded from delivery | Internal reasoning traces, MCP tool outputs, refinement history, the Mermaid diagram |
| Structured blocks | `:::evidence` only when prose provides evidence/claim distinction; `:::position` only when a position is attributed to a specific source. No decoration. |
| Frontmatter fields | `title`, `source`, `extracted-from: lines X-Y` (or chunk list), `validated: <date>` |
| Short-prose guard | < 50 words → no extraction; plain-prose explanation, no code block |
| Long-prose handling | > 10,000 words → chunk on paragraph boundaries (≥ 500 words each), process each, concatenate with `<!-- chunk N of M -->` separator, re-validate |
| No-claims guard | Recipes, logs, lists → plain-prose explanation that no argumentative claims were detected |
| Contradictions | Preserved as `--x` relations; not resolved |
| MCP-unavailable mode | Detect at load; warn user once; proceed without validation; add `<!-- unvalidated -->` comment in frontmatter |
| Provenance mismatch | Programmatic check catches before delivery; rewrite quote or drop the fact/argument |
| ID convention | Lowercase, hyphenated, semantic (`co2-emissions-cause`, not `claim_3`) |
| Multi-line spans | `source-line: 42-45` + multi-line `source-quote` with `\n` separators |
| Discontiguous spans | `source-line: [42, 67]` flow-sequence; quotes concatenated with `\n--\n` separator |
| Quote escaping | `\"` inside quotes, or wrap the argdown attribute in single quotes |
| Attribute ordering | `source-line` first, `source-quote` second (deterministic diffs) |
| Argument grounding test | Every emitted argument must trace to a sentence using inference language ("therefore", "because", "follows from", "implies") OR have premise/conclusion visibly adjacent in a single paragraph |
| Tests | Fixtures with golden `.argdown` files + `assertions.json` per fixture; manual smoke-test `MANUAL.md` with 3 passages |
| Coverage target | 80%+ of skill behaviors exercised by fixtures |
| Stryker mutation | Not applicable — no parser to mutate |

## 3. Skill metadata (frontmatter)

```yaml
---
name: prose-to-argdown
description: Use when the user provides a block of argumentative or research/technical prose (an essay, op-ed, position paper, paper section, technical report, book chapter excerpt) and asks to "extract the claims", "map the argument", "turn this into argdown", "structure this", "what is this arguing", or similar. Distills the prose into a full argdown-2 document with strict provenance — `source-line` and `source-quote` on every fact and argument — grounded in what the prose actually states or strongly implies. Does not invent arguments, premises, or relations that go beyond the source. Validates the output by parsing and rendering through argdown-2's MCP server before delivering inline. Trigger when the prose argues a case; do not trigger for recipes, code, logs, lists, or text without claims.
---
```

**File location:** `skills/prose-to-argdown/SKILL.md` inside the `argdown-2` repo (project-local; snowball-compatible loaders discover it automatically). The skill depends on argdown-2's MCP server being available in the user's environment; that is a host-side concern satisfied by the user's MCP host config, not by the repo. Pi and Claude packaging adapters live alongside, at `.pi/extensions/prose-to-argdown.ts` and `.claude-plugin/plugin.json` respectively (see Section 11).

**Trigger logic:**
- Fires on: "extract the claims from…", "map the argument in…", "turn this essay into argdown", "structure this paper", "what does this argue"
- Does NOT fire on: code, log output, recipes, shopping lists, calendar entries, JSON blobs, prose that does not make a case

## 4. Pipeline architecture

Three reasoning passes inside the loaded skill. The skill body instructs the LLM through these stages in conversation; validation is via MCP calls to `argdown-2`'s tools.

```
Prose input
    │
    ▼
[Pass 1: Facts]              extract atomic claims with provenance
    │                        validate via argdown parse (MCP)
    ▼
[Pass 2: Relations]          identify support/attack/undercut edges (grounded)
    │                        validate via argdown parse
    ▼
[Pass 3: Arguments]          extract stated/implied argument structures (grounded)
    │                        validate via argdown parse
    │                        render Mermaid via argdown render
    │                        LLM sanity-check diagram against prose
    │                        refine up to 2 rounds on structural mismatch
    ▼
[Assembly]                   frontmatter + facts + relations + arguments + blocks
    │
    ▼
Inline argdown-2 code block delivered in chat reply
```

**Key invariants:**

- Each pass is **read-only on the prose** — never modifies or paraphrases the source.
- Each pass emits a complete argdown-2 fragment for that layer, parseable in isolation by appending a minimal `Document` shell if needed.
- Pass 3's render + sanity-check is the load-bearing correctness step. If the Mermaid does not match the prose's actual structure, the LLM rewrites Pass 3's output — not the facts.
- **Grounded-arguments invariant:** the LLM MAY NOT add `([#X]) -> [#Y].` constructions beyond what the prose states or strongly implies. If the prose asserts "A, B, and C are reasons for D" → emit `([#D]) -> [#A], [#B], [#C].`. If the prose does NOT argue anything → emit facts and relations only, no arguments section. Silence is a valid output.
- Pass 2 may need to split a Pass 1 fact into two if a relation reveals two claims packed into one. If so, Pass 2 updates the fact list and re-validates from Pass 1.

## 5. Per-pass detailed instructions

### Pass 1: Facts

- **Goal:** Identify every atomic claim in the prose.
- **Output shape:** `[#id] claim text { source-line: N, source-quote: "…" }`
- **ID convention:** Lowercase, hyphenated, semantic. `co2-emissions-cause` not `claim_3`.
- **Atomicity rule:** One claim per fact. If a sentence makes two claims, split them.
- **Wording rule:** `claim text` preserves the prose's terminology where possible; minor grammar smoothing is OK but no semantic paraphrase. `source-quote` MUST be a verbatim substring of the prose.
- **Hallucination rule:** Do NOT include claims the prose does not state or strongly imply.
- **Validation:** Call `argdown parse` (or `validate`) via MCP on the facts fragment. Fix any syntax errors and retry once. Spot-check that every `source-quote` is a literal substring of the prose.

### Pass 2: Relations

- **Input:** Prose + Pass 1 facts.
- **Goal:** Identify support/attack/undercut edges that the prose states or strongly implies.
- **Output shape:** `[#A] --> [#B]`, `[#C] --x [#D]`, etc. Each relation line may carry `{ source-line, source-quote }` provenance.
- **Arrow taxonomy:** Use the 7-arrow vocabulary — `-->` (support), `--x` (attack/rebut), `-.->` (undercut), `-.-` (undermine), `~>` (concession), `?>` (qualification), `<->` (equivalence). Pick the arrow that matches the prose's actual semantics; default to `-->` when ambiguous.
- **Grounding rule:** Only emit relations the prose asserts or strongly implies. The LLM does NOT add background-knowledge relations (e.g., do not infer "X attacks Y" just because the LLM knows X and Y contradict in general knowledge).
- **Dangling-reference rule:** Every relation references IDs that exist in Pass 1. If a relation requires a fact that was not extracted, split or add it (with provenance) in this pass — then re-validate Pass 1.
- **Validation:** Call `argdown parse` on the combined Pass 1 + Pass 2 fragment. Retry once on syntax errors. Internal check: every relation should be defensible by a sentence or two in the prose.

### Pass 3: Arguments + structured blocks

- **Input:** Prose + Pass 1 facts + Pass 2 relations.
- **Goal:** Extract argument structures the prose states or strongly implies. NOT synthesize new arguments.
- **Output shape:**
  - `([#conclusion]) -> [#premise1], [#premise2]. { source-line: N, source-quote: "…" }` for each extracted argument.
  - Structured blocks (`:::evidence`, `:::position`) where the prose makes the relevant distinction explicit (e.g., "according to X, Y" → `:::position` wrapping the position claim).
  - Frontmatter at the top of the assembled doc: `===` block with `title`, `source` (the prose's title/URL if available), `extracted-from: line-range`.
- **Grounded-arguments rule (load-bearing):** Every emitted argument MUST correspond to a statement or strong implication in the prose. The LLM walks each argument and asks "where in the prose is this argued?" — if it cannot point to a specific span, the argument does not go in the output. **Silence is valid output** — if the prose does not argue anything beyond facts and relations, omit the arguments section entirely.
- **Operational definition of "strongly implies":** an argument is strongly implied when the prose EITHER (a) uses inference language to connect the premises to the conclusion — words like "therefore", "because", "since", "thus", "follows from", "implies", "entails", "consequently", "as a result", "so", "hence", "given that" — OR (b) places the premises and conclusion visibly adjacent in the same paragraph with no contradicting framing. "Strongly implies" is NOT satisfied by mere thematic relevance, by the LLM's background knowledge of how the topic works, or by inferring a missing premise to make the conclusion true.
- **Structured-block rule:** Use `:::evidence` only when the prose provides a clear evidence/claim distinction; use `:::position` only when a position is attributed to a specific source ("Smith argues that…"). Do NOT add blocks just to make the output look richer.
- **Validation:**
  1. Parse the combined doc via MCP `parse`. Retry once on syntax errors.
  2. Render Mermaid via MCP `render_mermaid`. The LLM inspects the resulting `flowchart TD` against the prose.
  3. **Sanity-check rubric** — refine Pass 3's output (not the facts or relations) if any of these fail:
     - **Completeness:** Does the Mermaid include every argument the prose makes? Missing arguments → refine.
     - **Fidelity:** Does every Mermaid edge correspond to a stated/implied relation in the prose? Spurious edges → refine.
     - **Provenance:** Does every argument have `source-line` + `source-quote` that match the prose verbatim? Missing or mismatched → refine.
  4. **Refinement budget:** Up to 2 refinement rounds (rewrite Pass 3's argument lines; do not touch Pass 1 / Pass 2 unless they are independently broken). After 2 rounds, deliver the best version with a one-line note: `Note: extraction is best-effort; some arguments may not be fully grounded — review against source.`

## 6. Provenance schema

Every fact and argument carries two attributes:

```argdown
[#claim-id] Claim text. { source-line: 42, source-quote: "Verbatim prose span." }
([#conclusion]) -> [#premise-1], [#premise-2]. { source-line: 67-68, source-quote: "Verbatim prose span spanning the argument." }
```

**Attribute conventions:**

- **`source-line`** — number attribute, 1-indexed (matches LSP / Monaco / VS Code conventions). For a span of multiple lines, use a range: `source-line: 42-45`. For a discontiguous claim, use a flow-sequence: `source-line: [42, 67]`.
- **`source-quote`** — string attribute, **MUST be a verbatim substring of the input prose** (whitespace and punctuation included). This is the audit anchor — the user can confirm each claim by searching the prose for the quote.
- **Quoting inside the quote** — escape with `\"`, or wrap the argdown attribute in single quotes: `source-quote: 'He said "argdown is great".'`.
- **Multi-line spans** — when a claim is developed across lines, set `source-line` to the start (or range) and let `source-quote` span the full block. Preserve line breaks inside the quoted string with `\n`.
- **Discontiguous spans** — when a claim is assembled from non-adjacent parts of the prose, use a flow-sequence for `source-line` and concatenate the quotes in order inside `source-quote` with `\n--\n` as the separator.
- **Order of attributes inside `{}`** — `source-line` first, `source-quote` second. Deterministic ordering keeps diffs clean across runs.

**Validation contract:** the skill MUST, before delivery, programmatically verify that every `source-quote` is a literal substring of the input prose (case-sensitive, whitespace-sensitive). Any fact or argument that fails this check is rewritten with corrected provenance or dropped — never silently delivered with a bad quote.

## 7. Validation & error handling

| Situation | Skill behavior |
| --- | --- |
| **argdown-2 MCP server unavailable** | Detect at skill load (`mcp__argdown__*` tools missing). Tell the user once: "Install argdown-2's MCP server to enable validation; proceeding in unvalidated mode." Skip the parse/render steps. Output is still delivered inline but with a `<!-- unvalidated -->` comment in the frontmatter. |
| **Prose < 50 words** | Likely no claims to extract. Skip the pipeline, reply: "This passage is too short to contain argumentative claims; nothing to extract." Do not produce empty argdown. |
| **Prose > 10,000 words** | Risk of context overflow. Chunk the prose on paragraph boundaries (≥ 500 words each), process each chunk through the full pipeline, then concatenate the argdown fragments with a `<!-- chunk N of M -->` separator in the frontmatter. Re-validate the assembled doc. |
| **No claims detected** (recipe, log output, list of facts without argument) | Reply: "No argumentative claims detected in this prose; argdown-2 is for structured arguments. If you intended a different extraction, please clarify." Do not produce empty argdown. |
| **Contradictory prose** (claims attack each other) | **Do not try to resolve the contradiction.** Emit both sides as facts with a `--x` relation. Preserve the disagreement; that is the structure of the source. |
| **Parse keeps failing** | After 2 parse-retry rounds in any pass, surface the parser errors to the user verbatim alongside the current best-effort output. Mark with `<!-- parse-errors -->`. |
| **Sanity-check keeps failing** | After 2 Pass-3 refinement rounds, deliver the current Pass-3 output with the warning note (`Note: extraction is best-effort…`) and a bullet list of the unverified arguments. |
| **Provenance mismatch detected post-hoc** | If the programmatic substring check fails on a delivered fact/argument, rewrite the quote from the prose and re-emit. If that fails, drop the fact/argument and note the drop in the chat reply. |

**User-visible error format:** when any of the above triggers, the chat reply is **plain prose** (no argdown code block), with the issue explained and a suggested remediation. The argdown code block is only present on successful extraction.

## 8. Testing approach

**Fixtures** — at `skills/prose-to-argdown/fixtures/` (inside the repo):

| Fixture | What it stresses |
| --- | --- |
| `lead-essay.argdown` | A 300-word op-ed on climate policy. Tests complete pipeline; expects ≥ 6 facts, ≥ 4 relations, ≥ 2 arguments. |
| `research-abstract.argdown` | A 150-word paper abstract with explicit "we argue that X because Y" structure. Tests argument extraction. |
| `position-disagreement.argdown` | Two voices arguing against each other. Tests `--x` relations and multi-source `:::position` blocks. |
| `no-claims.txt` | A recipe. Tests the "no claims detected" early-exit. |
| `multi-paragraph.txt` | 1,500-word essay with section breaks. Tests chunking and frontmatter range. |
| `ambiguous-prose.txt` | Prose with no clear arguments but related facts. Tests the "facts only, no arguments" path. |
| `legacy-syntax.txt` | Prose that uses `:—` (legacy). Tests the parser's hard-error handling. |

**Assertions** — each fixture has a `expected.argdown` golden file and an `assertions.json`:

- **Parseability:** `argdown validate` on the produced doc returns 0 errors.
- **Provenance integrity:** every `source-quote` is a verbatim substring of the input prose.
- **Atomicity:** no fact contains a semicolon that suggests two merged claims.
- **Grounded-arguments:** every emitted `([#X]) -> [#Y].` corresponds to a sentence in the prose that uses inference language ("therefore", "because", "follows from", "implies") OR has its premise/conclusion visibly adjacent in a single paragraph.
- **Hallucination guard:** fact count is within ±2 of the count derived by a human reading the same prose.

**Automated check script** — `scripts/check-prose-to-argdown.cjs` at the skill root: runs each fixture through the skill (via a test harness that mocks the LLM with a recorded response), then validates the assertions. Mutation testing (Stryker) does NOT apply — there is no parser to mutate.

**Manual smoke test** — `MANUAL.md` with 3 sample prose passages and the expected output. Run after every skill revision.

**Coverage target** — 80%+ of skill behaviors exercised by fixtures (the assertions, not Stryker line coverage).

## 9. Assembly & delivery format

**Assembly order** (top to bottom in the final code block):

1. **Frontmatter** (`=== ... ===` block) — `title`, `source` (prose's title/URL if user provided), `extracted-from: lines X-Y` (or chunk list), `validated: <date>` if validation ran.
2. **Facts** — all `[#id] claim { source-line, source-quote }` lines from Pass 1.
3. **Relations** — all `[#A] --> [#B] { source-line, source-quote }` lines from Pass 2.
4. **Arguments** — all `([#X]) -> [#Y], [#Z]. { source-line, source-quote }` lines from Pass 3 (may be empty if prose does not argue).
5. **Structured blocks** — `:::evidence { [#ev-id] … } :::` and `:::position { [#pos-id] … } :::` groups, with their own provenance.
6. **Trailing comment** — `<!-- extracted by prose-to-argdown; review source-quote attributes against source prose -->`.

**Delivery wrapper** in chat reply:

````
Extracted N facts, M relations, and K arguments from <word count> words of prose.

```argdown
=== … ===
[#id-1] …
…
```
````

Then a one-line footer: *"Review the `source-quote` attributes against the source to verify each claim is grounded."*

**What the reply does NOT contain:**

- The internal reasoning traces from each pass
- The MCP `parse` / `render_mermaid` tool outputs
- The refinement history
- The Mermaid diagram itself (the user can render it with `argdown render` if they want it; the skill does not embed it unless the user explicitly asks)

**When validation degrades or fails** (Section 7 cases), the code block is omitted and the reply is a plain-prose explanation per the user-visible error format.

## 10. Open questions / deferred

- **Strict inference rules** — ASPIC+ undercut-doesn't-defeat semantics. Out of scope; future cycle on the solver side.
- **Multi-language support** — non-English prose. Deferred; v1 is English-only.
- **Programmatic SDK** — `import { extractClaims } from 'prose-to-argdown'` for non-conversational use. Deferred; the skill is conversational v1.
- **Auto-detection of input type** — currently the user specifies "this is an essay / abstract / etc." A future cycle could auto-classify the prose and dispatch to type-specific heuristics.
- **Cross-document extraction** — synthesize claims across multiple prose inputs into one argdown. Deferred; v1 is one chunk of prose → one argdown doc.
- **Citation graph extraction** — when prose cites other works, build a citation network in argdown form. Deferred; v1 extracts only the claims within the prose itself.
- **Output format alternatives** — Markdown summary, JSON AST, Mermaid diagram embedded. v1 is the argdown code block only.

## 11. Distribution & host packaging

The skill ships inside the `argdown-2` repo with three layers of host-specific packaging. The snowball SKILL.md is the source of truth; the pi extension and Claude plugin are thin adapters.

**Layer 1 — Source of truth (snowball skill loader):**

```
skills/prose-to-argdown/
├── SKILL.md             # source of truth for skill body
├── README.md            # human-facing docs
├── MANUAL.md            # smoke-test instructions
└── fixtures/            # 7 fixtures with input/expected/assertions
```

Project-local placement (`skills/prose-to-argdown/`) is portable to any snowball-compatible loader (Claude Code, Copilot CLI, Aider, Gemini CLI, VTCode). Snowball discovers skills at project-local `skills/<name>/SKILL.md` automatically.

**Layer 2 — Pi-coding-agent extension:**

```
.pi/extensions/prose-to-argdown.ts
```

Per [pi's extension docs](https://github.com/earendil-works/pi-coding-agent/blob/main/docs/extensions.md), project-local `.pi/extensions/*.ts` files are auto-discovered after the project is trusted. The extension registers:

- A `/prose-to-argdown <path>` slash command that reads the file, injects the SKILL.md content as a `before_agent_start` system-prompt augmentation, and lets the agent run the skill pipeline.
- A `prose_to_argdown` custom tool the LLM can call with `{prose: string, source?: string}`; the tool validates output via the argdown-2 MCP server before returning.
- An event subscription on `session_start` that surfaces a one-line status banner if argdown-2's MCP server is not registered (degraded-mode warning).

**Layer 3 — Claude Code plugin:**

```
.claude-plugin/
└── plugin.json          # manifest (name, version, description, author, license)
commands/
└── prose-to-argdown.md  # slash command body — instructs Claude to load the skill
```

Per Claude's plugin format (mirroring `codexkins-mono/grfp`'s `.claude-plugin/plugin.json` pattern), the plugin manifest advertises the plugin and `commands/prose-to-argdown.md` provides the slash-command body. Claude Code discovers both automatically.

**Why three layers:** each host has its own packaging format. The SKILL.md is portable across all of them; pi gets a TypeScript adapter because pi's extension system is the richest; Claude Code gets a manifest + slash command because that's its packaging shape. Future hosts (Cursor, Aider, Gemini CLI) can ship their own adapters without re-writing the SKILL.md.

**CI / release:** the existing `.github/workflows/release.yml` (which builds and packs on every push to `main`) will include the new files automatically. No release-process changes required. Fixtures and scripts live under `skills/prose-to-argdown/` and are version-controlled alongside the rest of the repo.

## 12. SKILL.md sketch (target file)

For reference, the implementation plan will produce a SKILL.md at `skills/prose-to-argdown/SKILL.md` (inside the `argdown-2` repo) with the following high-level structure:

```
# prose-to-argdown

[YAML frontmatter — Section 3]

## When to use this skill
[Trigger logic from Section 3]

## Inputs
[Prose chunk from user, optional metadata]

## Pipeline
[Three passes from Section 4]

### Pass 1: Facts
[Section 5, Pass 1]

### Pass 2: Relations
[Section 5, Pass 2]

### Pass 3: Arguments
[Section 5, Pass 3, including grounded-arguments invariant and sanity-check rubric]

## Provenance
[Section 6]

## Validation
[Section 7]

## Output
[Section 9, assembly + delivery wrapper]

## Edge cases
[Section 7, table of edge cases]

## Testing
[Section 8]
```