---
name: prose-to-argdown-2
description: >
  Use when the user provides freeform argumentative or research/technical prose
  (essay, op-ed, review, polemic, position paper, paper section, technical
  report, book excerpt) and asks to extract claims, map the argument, turn this
  into argdown / argdown-2 / EDN, structure this, or asks what the text is
  arguing. Distills the prose into an argdown-2 document via MCP builder tools
  only (never hand-edit EDN), with a strict provenance ledger and grounded
  inferences. Do not use for recipes, code, logs, lists, or prose without claims.
---

# prose-to-argdown-2

Distill freeform prose into an **argdown-2** EDN argument graph.

**Hard rules**

- **Never hand-edit EDN.** Do not Write or Edit `*.edn`. Every mutation goes
  through argdown-2 MCP tools (`create_document`, `add_statement`,
  `add_argument`, `add_inference`, `add_relation`, `update_statement`,
  `remove_element`, `remove_relation`, `list_elements`, `validate`, `solve`, …).
- **Grounded extraction only.** Emit statements, relations, and inferences the
  prose states or **strongly implies**. Do not invent premises, attacks, or
  conclusions from background knowledge.
- **Provenance is mandatory.** Keep a ledger of `source-line` + verbatim
  `source-quote` for every emitted node/edge. Quotes must be literal substrings
  of the input.
- Compose with sibling skills: structural tool use follows **build-graph**;
  repair follows **validate-debug**; label explanation follows **interpret-solve**.

## When to use

Use when the user pastes or points at prose and asks to:

- extract the claims / map the argument
- turn this into argdown, argdown-2, or EDN
- structure this / what is this arguing

**Do not use** for recipes, code, logs, shopping lists, calendars, JSON blobs,
purely descriptive narrative, passages under ~50 words, or when the user only
wants a prose summary (no graph).

## Inputs

1. Prose block (chat paste or readable file path)
2. Optional metadata: title, source URL, preferred solver (`grounded` |
   `bipolar` | `evidential`), output path for MCP `path` mode

Read the prose **once** end-to-end before Pass 1. Number lines 1-indexed for
provenance (split on `\n`; empty trailing line does not count as a claim line).

## Pipeline overview

```
Prose
  │
  ├─ Guards (length / no-claims / language)
  │
  ▼
Pass 0: Solver plan (grounded vs bipolar vs evidential)
  │
  ▼
create_document  ── MCP only
  │
  ▼
Pass 1: Statements     add_statement(+ tags) → validate
  │
  ▼
Pass 2: Relations      add_relation(kind)    → validate
  │
  ▼
Pass 3: Arguments      add_argument + add_inference → validate
  │
  ▼
Optional solve → interpret-solve
  │
  ▼
Deliver: counts + provenance ledger + labels (if solved)
```

Key invariants:

- Each pass is **read-only on the source prose**.
- Silence is valid: relations-only or statements-only graphs are fine when the
  prose does not argue.
- If Pass 2 needs a statement Pass 1 missed, `add_statement` with provenance,
  then continue — do not invent unsupported claims.
- If Pass 2 needs `support` but the document is grounded, **recreate** with
  bipolar (new `create_document`) and rebuild. Never patch EDN by hand.

## Pass 0: Solver plan

Inventory the dialectical moves you expect:

| Planned edges | Root solver |
|---|---|
| Only `attack` / `contradiction` | `casualtheorics.argdown2.solver/grounded` (default) |
| Any `support` | `casualtheorics.argdown2.solver/bipolar` |
| User asks for necessary-support / evidential labels | `casualtheorics.argdown2.solver/evidential` |

**Never emit `undercut`.** No current solver consumes it; rewrite as an
`attack` on an explicit rule/premise statement, or omit.

Then:

```
create_document
  path? | source: ""
  solver: <chosen tag>
  documentId?: from title slug
```

Prefer `path` when the user gave an output file; otherwise keep `source` mode
and thread the returned `source` string through subsequent calls.

## Pass 1: Statements

**Goal:** atomic propositions that can be true or false.

For each claim:

1. Split compound sentences (semicolons, “and” joining two full propositions).
2. Assign a stable semantic id: lowercase hyphenated
   (`co2-primary-cause`, not `claim_3`). Avoid reserved-looking prefixes that
   collide with role names if you later nest solvers.
3. `text` preserves the prose’s terminology; light grammar smoothing only — no
   semantic paraphrase.
4. Optional `tags`: `pro` / `con` when the prose attributes a side; speaker tags
   like `smith` / `jones` when useful. Do **not** stuff provenance into tags.
5. Record provenance: `source-line` (number, `"42-45"`, or `[42, 67]`) and
   `source-quote` (verbatim substring).

Call `add_statement` per claim. After the batch, `validate`. On failure, follow
**validate-debug** (MCP repairs only) and retry once.

**Not statements:** questions, imperatives without a claim, section headings,
citations alone, hedging without content (“some say…” without saying what).

## Pass 2: Relations

**Goal:** dialectical edges the prose states or strongly implies.

Allowed `kind` values (must be consumed by the Pass 0 solver):

| kind | Use when prose… |
|---|---|
| `support` | treats A as reason/evidence for B (because, therefore, thus, so, given that) |
| `attack` | treats A as rebutting or defeating B (however, but, despite, contest, refute) |
| `contradiction` | frames A and B as mutually exclusive theses |

Mapping tips:

- Rebuttal pairs → `attack` (or `contradiction` if framed as direct negation).
- Undermining a premise → `attack` with `to` = that premise id.
- Concession / qualification / vague “related to” → usually **omit** (no kind).
- Default when conflict is clear but polarity is fuzzy → `attack`.

For each edge:

```
add_relation
  id: <stable semantic id, e.g. stern-attacks-skeptics>
  kind: support | attack | contradiction
  from: <id or unique text>
  to:   <id or unique text>
```

Prefer keyword ids. Record provenance for every relation.

Validate after the batch. Internal check: every edge must be defensible by a
specific span in the prose. Drop edges that only “make sense” from world
knowledge.

## Pass 3: Arguments and inferences

**Goal:** explicit premise→conclusion structure **only when grounded**.

**Grounded-arguments rule (load-bearing):**

Emit `add_argument` + `add_inference` only when the prose either:

1. Uses inference language connecting premises to a conclusion — e.g.
   *therefore, because, since, thus, follows from, implies, entails,
   consequently, as a result, so, hence, given that, we argue that … because*; or
2. Places premises and conclusion visibly adjacent in the same paragraph with no
   contradicting framing.

**Not sufficient:** thematic relevance, your background knowledge of the topic,
or a missing premise you would need to “complete” the argument.

When grounded:

```
add_argument
  id: <semantic id>
  description: <short paraphrase of the inferential move; keep close to prose>
  tags?: [pro|con|…]

add_inference
  argumentId: <id>
  id: <id>-main   # or more specific
  premises: [<statement ids…>]
  conclusion: <statement id>
```

Premises and conclusion must already exist as statements (Pass 1) or be added
first with provenance.

**Silence is valid.** If the prose only asserts and rebuts without an explicit
inferential spine, skip Pass 3 entirely.

After the batch: `validate`. Optionally `list_elements` to sanity-check the
inventory against the prose (completeness / fidelity / provenance). Up to **2**
refinement rounds on Pass 3 only (unless Pass 1/2 are independently broken —
then repair those via MCP and re-validate).

## Provenance ledger

Builder tools do not accept `source-line` / `source-quote` fields. Keep a
skill-owned ledger and deliver it in the chat reply:

| id | kind | source-line | source-quote |
|----|------|-------------|--------------|
| co2-primary-cause | statement | 2 | "human CO2 emissions are the primary driver of current warming trends" |
| stern-attacks-skeptics | relation | 6 | "However, the Stern Review demonstrated…" |
| comprehensive-case | argument | 13 | "Therefore, a comprehensive approach…" |

Rules:

- `source-quote` is a **verbatim** substring (case- and whitespace-sensitive).
- Multi-line: join with `\n` in the ledger cell.
- Discontiguous: `source-line: [42, 67]`; quotes joined with `\n--\n`.
- Before delivery, programmatically / carefully verify every quote with search.
  On failure: fix the quote or `remove_element` / `remove_relation`.

## Validation and solve

Per pass batch:

1. `validate` on current `path` or `source`.
2. On errors: repair with builder tools (**validate-debug**), retry once.
3. After a clean final validate, optionally `solve`.
4. Explain labels / extensions with **interpret-solve** when the user wants
   outcomes — not only the graph.

If MCP is unavailable: stop. Do not hand-write EDN as a fallback. Tell the user
the argdown-2 MCP server must be connected.

## Edge cases

| Situation | Behavior |
|---|---|
| Prose < ~50 words | Refuse: too short; no document. |
| Prose > ~10,000 words | Chunk on paragraph boundaries (≥ ~500 words). One MCP document; process chunks sequentially; provenance notes `chunk N/M`. Re-validate the whole doc. |
| No argumentative claims (recipe, log, list) | Refuse in plain prose; do not `create_document`. |
| Contradictory voices | Emit both sides; relate with `attack` or `contradiction`. Do not resolve. |
| Support needed after grounded create | New `create_document` (bipolar) + rebuild via MCP. |
| Ambiguous prose (facts, no inference) | Statements ± relations only; empty Pass 3. |
| Parse / validate keeps failing | After retry budgets, surface MCP diagnostics and deliver best-effort with a warning; list dropped nodes. |
| Provenance mismatch | Rewrite quote or remove the node/edge. |
| User asks only for a Mermaid / `.argdown` dump | Explain EDN+MCP is canonical; offer `list_elements` + provenance instead of hand-authored legacy syntax. |

## Delivery format

Chat reply structure (no EDN dump required unless the user asks for `source`):

1. One-line summary: `Extracted N statements, M relations, K arguments (I inferences) from W words; solver=<tag>.`
2. Provenance ledger table (required).
3. If solved: brief IN / OUT / UNDEC (or extension) summary via interpret-solve norms.
4. Footer: *Review each source-quote against the prose; every node must be grounded.*

**Do not include** in the reply: internal pass scratchpads, raw MCP JSON, or
hand-written EDN “for convenience.”

If the user requests the document text, call `list_elements` and/or return the
threaded `source` from the last successful tool result — still never Write a
hand-built `.edn` file.

## Self-verification checklist

Before finishing:

1. **MCP-only:** no Write/Edit of `*.edn` occurred.
2. **Validate clean:** final `validate` returned ok (or warned best-effort).
3. **Provenance:** every emitted id has a verbatim `source-quote` hit in the prose.
4. **Grounded inferences:** every argument/inference points at an inference-language
   span or adjacent premise/conclusion paragraph; otherwise removed.
5. **No inventions:** every statement and relation is in the prose.
6. **Solver fit:** no `support` under grounded; no `undercut` anywhere.
7. **Ids:** stable, semantic, unique; relations have explicit local ids.

## Worked micro-example

Prose:

> We argue that attention is a soft index because patterns approximate nearest-neighbor retrieval. Jones disagrees: attention is merely a sequence mixer.

Pass 0: expect `support` + `attack` → bipolar.

Pass 1 statements: `attention-soft-index`, `patterns-approx-nn`, `attention-sequence-mixer`.

Pass 2: `support` patterns→attention-soft-index; `attack` mixer→soft-index (or contradiction if framed as exclusive).

Pass 3: argument `attention-as-index` with inference premises `[patterns-approx-nn]` conclusion `attention-soft-index` (anchored on “We argue that … because …”).

Then `validate` → optional `solve`.
