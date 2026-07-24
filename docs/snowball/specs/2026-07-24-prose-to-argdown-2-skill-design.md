# `prose-to-argdown-2` Skill Design

**Date:** 2026-07-24
**Status:** Approved
**Scope:** A host-LLM skill that distills freeform argumentative or research/technical
prose into an argdown-2 EDN argument graph **exclusively via MCP builder tools**.
Canonical location: `plugins/argdown-2/skills/prose-to-argdown-2/SKILL.md`
(shared by Claude Code marketplace plugin and Pi package).

Supersedes the 2026-07-11 `prose-to-argdown` design, which targeted the retired
custom `.argdown` surface syntax and Mermaid validation loop.

---

## 1. Context and goals

`argdown-2` (`0.2.0-alpha4`) is an EDN-only library + stdio MCP server. Agents
must never hand-edit `*.edn`. The public authoring path is the 14 MCP tools
(`create_document`, `add_statement`, `add_argument`, `add_inference`,
`add_relation`, nested solvers, `validate`, `solve`, …). Three skills already
cover graph mutation (`build-graph`), repair (`validate-debug`), and label
interpretation (`interpret-solve`).

What is missing is the **interpretation layer**: given freeform prose, decide
*which* statements, inferences, and dialectical relations the prose actually
asserts, then drive the builder tools. The MCP design explicitly expects the
host LLM to supply prose fields; this skill is that host procedure.

**Goals**

- One skill at `plugins/argdown-2/skills/prose-to-argdown-2/SKILL.md`.
- Trigger on requests to extract claims, map an argument, turn prose into
  argdown-2 / EDN, or structure argumentative / research prose.
- Three-pass pipeline: Statements → Relations → Arguments/Inferences.
- Strict grounding: emit only what the prose states or strongly implies.
- Strict provenance ledger (outside EDN): every emitted node carries
  `source-line` + verbatim `source-quote` verified against the input.
- Build the document only through MCP tools; never Write/Edit `*.edn`.
- Choose a solver that can consume the emitted relation kinds.
- Validate via MCP `validate`, then optionally `solve` and hand off to
  `interpret-solve` for label explanation.
- Ship fixture packs that document expected extraction shape (counts, relation
  kinds, grounding rules) for manual / agent smoke testing.

**Non-goals**

- Restoring custom `.argdown` syntax, Mermaid rendering, or HTML-style comments.
- Extending MCP tools with `metadata` fields in this cycle (schema already allows
  `:metadata` in EDN, but builder tools do not expose it).
- Resolving contradictions in the source; preserve them as `attack` /
  `contradiction`.
- Inventing missing premises from world knowledge.
- Multi-language extraction (English-only v1).
- A programmatic SDK (`extractClaims(...)`).
- Separate Pi/Claude slash-command adapters beyond the shared skill tree
  (plugin discovery already loads skills from `plugins/argdown-2/skills/`).

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Skill name / path | `prose-to-argdown-2` under `plugins/argdown-2/skills/` |
| Authoring surface | MCP builder tools only; no hand-edited EDN |
| Pipeline | Pass 1 statements → Pass 2 relations → Pass 3 arguments+inferences |
| Provenance | Parallel ledger in the chat reply (id → line + quote); not EDN metadata |
| Solver selection | `grounded` if only attack/contradiction; `bipolar` if support edges needed; never emit `undercut` (no consumer) |
| Relation kinds | `support`, `attack`, `contradiction` only (map old arrows onto these) |
| Grounded arguments | `add_argument` + `add_inference` only when prose uses inference language or adjacent premise/conclusion |
| Silence | Facts-only / relations-only graphs are valid |
| Validation | MCP `validate` after each pass batch; repair via `validate-debug` patterns |
| Delivery | Summary counts + provenance table + optional `solve` labels; EDN lives in MCP session / path |
| Short prose | < 50 words → refuse extraction |
| Long prose | > 10k words → chunk ≥ 500 words on paragraph boundaries; one document, chunk markers in provenance only |
| No claims | Recipes / logs / lists → plain refusal, no empty document |
| Packaging | Same skill tree as existing three skills; update `SKILLS` arrays in tests |
| Legal filings | First-class: separate fact / holding / authority / relief; verbatim cites; signal→relation map; no invented doctrine |

---

## 3. Relation mapping (legacy → EDN)

| Prose / legacy arrow | EDN `kind` | Notes |
|---|---|---|
| supports / because / therefore (premise→claim) | `support` | Requires bipolar or evidential root |
| rebuts / however / but (claim vs claim) | `attack` | Default dialectical conflict |
| A asserts ¬B / mutual exclusive theses | `contradiction` | Prefer when prose frames mutual exclusion |
| undercuts the inference rule | *(omit or rewrite as attack on a stated rule-premise)* | No current solver consumes `undercut` |
| undermine premise | `attack` targeting the premise statement | |
| concession / qualification / equivalence | omit or encode as tagged statements | Not first-class relation kinds |

---

## 4. Solver selection rule

Before Pass 2 commits relations:

1. Inventory planned relation kinds.
2. If any `support` → `create_document` with
   `solver: "casualtheorics.argdown2.solver/bipolar"` (default support
   semantics for prose extraction). Use `evidential` only when the user asks
   for necessary-support / evidential labeling.
3. If only `attack` / `contradiction` → grounded (default).
4. Never call `add_relation` with a kind the chosen solver rejects.
5. If Pass 2 discovers support after a grounded create, recreate with bipolar
   (new `create_document`) and rebuild — do not hand-patch EDN.

---

## 5. Provenance contract

MCP builder tools accept `id`, `text`/`description`, and `tags` — not
`source-line` / `source-quote`. Provenance is therefore a **skill-owned
ledger** delivered in the chat reply:

```
| id | kind | source-line | source-quote |
|----|------|-------------|--------------|
| co2-primary-cause | statement | 2 | "human CO2 emissions are the primary driver…" |
```

Rules:

- `source-quote` MUST be a verbatim substring of the input (case- and
  whitespace-sensitive).
- Verify every quote with string search before delivery.
- On mismatch: rewrite quote from prose or drop the node via
  `remove_element` / `remove_relation`.
- Optional: tag statements with `pro` / `con` when the prose attributes a
  side; do not overload tags with provenance strings.

---

## 6. Pipeline (host LLM)

```
Prose
  → Pass 1: atomic statements via add_statement
  → validate
  → Pass 2: relations via add_relation (solver-compatible kinds)
  → validate
  → Pass 3: add_argument + add_inference when grounded in prose
  → validate
  → optional solve + interpret-solve
  → deliver counts + provenance ledger + label summary
```

Composition with sibling skills:

- Structural mutations follow `build-graph`.
- Diagnostics follow `validate-debug`.
- Label explanation follows `interpret-solve`.

---

## 7. Testing

- Shape tests: skill exists; forbids hand-editing EDN; mentions MCP + three
  passes + provenance + solver selection; registered in Claude/Pi `SKILLS`.
- Fixtures under the skill directory: `input.txt` + `assertions.json`
  (expected min/max statement counts, allowed relation kinds, must-have /
  must-not-have ids or inference language flags). Legal fixtures
  (`legal-opinion-terry`, `legal-brief-terry`) assert verbatim authorities and
  fact/holding separation. No golden EDN files — agents rebuild via MCP.
- Manual smoke: run skill on `lead-essay`, `research-abstract`, and legal
  Terry fixtures against `deno task mcp`.

---

## 8. Packaging

No new host adapters. Claude marketplace and Pi package already point at
`plugins/argdown-2/skills/`. Update:

- `src/claude-plugin.test.ts` `SKILLS` array
- `src/pi-package.test.ts` `SKILLS` array
- Add `src/prose-to-argdown-2-skill.test.ts` for content invariants
