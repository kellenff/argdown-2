---
name: prose-to-argdown
description: Use when the user provides a block of argumentative or research/technical prose (an essay, op-ed, position paper, paper section, technical report, book chapter excerpt) and asks to "extract the claims", "map the argument", "turn this into argdown", "structure this", "what is this arguing", or similar. Distills the prose into a full argdown-2 document with strict provenance — `source-line` and `source-quote` on every fact and argument — grounded in what the prose actually states or strongly implies. Does not invent arguments, premises, or relations that go beyond the source. Validates the output by parsing and rendering through argdown-2's MCP server before delivering inline. Trigger when the prose argues a case; do not trigger for recipes, code, logs, lists, or text without claims.
---

# prose-to-argdown

This skill distills argumentative or research/technical prose into a full argdown-2 document with strict provenance. Every fact and argument in the output is grounded in the source prose — nothing is synthesized from background knowledge.

## When to use this skill

Use this skill when the user provides prose and asks to:
- "extract the claims"
- "map the argument"
- "turn this into argdown"
- "structure this"
- "what is this arguing"

The prose must be argumentative (essay, op-ed, review, polemic, position paper) or research/technical (paper section, technical report, book chapter excerpt).

Do NOT use this skill for:
- Recipes, code, log output
- Shopping lists, calendar entries, JSON blobs
- Prose that does not make a case (informational, descriptive, narrative)
- Short passages (< 50 words) — likely no claims to extract
- Long prose (> 10,000 words) — chunking required, see Edge cases

## Inputs

The user provides:
1. A block of prose (pasted in chat, or as a file path the agent can read)
2. (Optional) metadata: title, source URL, or other context

Read the prose once. Then process it through the three-pass pipeline below.

## Pipeline

Three reasoning passes, each validated independently. The skill body walks the LLM through these stages; validation is via MCP calls to argdown-2's tools.

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
- Read-only on prose: each pass is read-only on the source prose. Never modify or paraphrase the source.
- Each pass emits a complete argdown-2 fragment for that layer, parseable in isolation.
- Pass 3's render + sanity-check is the load-bearing correctness step.
- **Grounded-arguments invariant:** the LLM MAY NOT add `([#X]) -> [#Y].` constructions beyond what the prose states or strongly implies. If the prose does NOT argue anything → emit facts and relations only, no arguments section. Silence is a valid output.
- Pass 2 may need to split a Pass 1 fact into two if a relation reveals two claims packed into one. If so, update Pass 1 and re-validate from there.

## Pass 1: Facts

**Goal:** identify every atomic claim in the prose.

**Output shape:**

```argdown
[#id] Claim text. { source-line: N, source-quote: "Verbatim prose span." }
```

**Instructions:**

1. Read the entire prose once. Identify each atomic claim — a single proposition that can be true or false.
2. If a sentence makes two claims, split them into two facts.
3. Assign each fact a stable, semantic ID: lowercase, hyphenated, descriptive. Examples: `co2-emissions-cause`, `evidence-from-ipcc`, `policy-failure-claim`.
4. The `claim text` should preserve the prose's terminology where possible. Minor grammar smoothing is OK, but no semantic paraphrase.
5. Set `source-line` to the line number (1-indexed) where the claim appears.
   - Single line: `source-line: 42`
   - Range: `source-line: "42-45"`
   - Discontiguous: `source-line: [42, 67]`
6. Set `source-quote` to a verbatim substring of the prose that anchors the claim. This is the audit anchor.
7. Do NOT include claims the prose does not state or strongly imply. Background-knowledge claims are out of scope.

**Validation:**

- Call `mcp__argdown__validate(source)` on the facts fragment (wrap facts in a minimal `Document` shell if needed).
- Fix any syntax errors and retry once.
- Spot-check that every `source-quote` is a literal substring of the prose (use string search).

## Pass 2: Relations

**Input:** the prose + the validated facts from Pass 1.

**Goal:** identify support/attack/undercut edges that the prose states or strongly implies.

**Output shape:**

```argdown
[#A] --> [#B] { source-line: N, source-quote: "Verbatim prose span." }
[#C] --x [#D] { source-line: N, source-quote: "Verbatim prose span." }
```

**Arrow taxonomy:**

- `-->` support: A supports B
- `--x` attack: A rebuts B (attacks the conclusion)
- `-.->` undercut: A attacks B's inference rule
- `-.-` undermine: A attacks a premise of B
- `~>` concession: A concedes to B but doesn't support
- `?>` qualification: A qualifies B with conditions
- `<->` equivalence: A and B are equivalent

Pick the arrow that matches the prose's actual semantics. When ambiguous, default to `-->`.

**Instructions:**

1. Re-read the prose, focusing on transition words and relational language: "supports", "because", "however", "despite", "even though", "but", "nevertheless", "consequently", "follows from".
2. For each relational statement, identify the source fact and target fact.
3. Only emit relations the prose asserts or strongly implies. The LLM does NOT add background-knowledge relations (e.g., do not infer "X attacks Y" just because the LLM knows X and Y contradict in general knowledge).
4. Every relation must reference IDs that exist in Pass 1. If a relation requires a fact that wasn't extracted, split or add it (with provenance) in this pass, then re-validate Pass 1.
5. Add `source-line` and `source-quote` provenance to each relation.

**Validation:**

- Call `mcp__argdown__validate(source)` on the combined Pass 1 + Pass 2 fragment.
- Retry once on syntax errors.
- Internal check: every relation should be defensible by a sentence or two in the prose.

## Pass 3: Arguments + structured blocks

**Input:** the prose + validated facts from Pass 1 + validated relations from Pass 2.

**Goal:** extract argument structures the prose states or strongly implies. NOT synthesize new arguments.

**Output shape:**

```argdown
([#conclusion]) -> [#premise-1], [#premise-2]. { source-line: N, source-quote: "Verbatim prose span." }
```

**Structured blocks:**

- `:::evidence` — wraps evidence used to support a claim. Use only when the prose provides a clear evidence/claim distinction.
- `:::position` — wraps a position attributed to a specific source. Use only when the prose attributes a position ("Smith argues that…", "According to Jones, …").

Do NOT add blocks just to make the output look richer.

**Grounded-arguments rule (load-bearing):**

Every emitted argument MUST correspond to a statement or strong implication in the prose. Walk each argument and ask "where in the prose is this argued?" — if you cannot point to a specific span, the argument does not go in the output.

**Silence is valid output** — if the prose does not argue anything beyond facts and relations, omit the arguments section entirely.

**Operational definition of "strongly implies":** an argument is strongly implied when the prose EITHER (a) uses inference language to connect the premises to the conclusion — words like "therefore", "because", "since", "thus", "follows from", "implies", "entails", "consequently", "as a result", "so", "hence", "given that" — OR (b) places the premises and conclusion visibly adjacent in the same paragraph with no contradicting framing.

"Strongly implies" is NOT satisfied by mere thematic relevance, by the LLM's background knowledge of how the topic works, or by inferring a missing premise to make the conclusion true.

**Validation:**

1. Call `mcp__argdown__validate(source)` on the combined doc. Retry once on syntax errors.
2. Call `mcp__argdown__render_mermaid(document)` to get the Mermaid `flowchart TD`.
3. Inspect the Mermaid against the prose using this rubric:
   - **Completeness:** does the Mermaid include every argument the prose makes? Missing arguments → refine.
   - **Fidelity:** does every Mermaid edge correspond to a stated/implied relation in the prose? Spurious edges → refine.
   - **Provenance:** does every argument have `source-line` + `source-quote` that match the prose verbatim? Missing or mismatched → refine.
4. Refine Pass 3's output (NOT Pass 1/2 unless they are independently broken) up to 2 rounds.
5. After 2 rounds, deliver the best version with a one-line note: `Note: extraction is best-effort; some arguments may not be fully grounded — review against source.`
## Provenance schema

Every fact and argument carries `source-line` and `source-quote` attributes. These are the audit anchors — the user can verify each claim by searching the prose for the quote.

**Attribute conventions:**

- `source-line` — number attribute, 1-indexed.
  - Single line: `source-line: 42`
  - Range: `source-line: "42-45"`
  - Discontiguous: `source-line: [42, 67]`

- `source-quote` — string attribute, MUST be a verbatim substring of the input prose.
  - Single line: `source-quote: "Verbatim text from prose."`
  - Multi-line: `source-quote: "Line one.\nLine two.\nLine three."`
  - Discontiguous: `source-quote: "First part.\n--\nSecond part."`

Quoting inside the quote: escape with `\"`, or wrap the attribute in single quotes:

```argdown
source-quote: 'He said "argdown is great".'
```

Attribute order inside `{}`: `source-line` first, `source-quote` second. Deterministic ordering keeps diffs clean.

**Validation contract:** before delivery, programmatically verify that every `source-quote` is a literal substring of the input prose (case-sensitive, whitespace-sensitive). Any fact or argument that fails this check is rewritten with corrected provenance or dropped — never silently delivered with a bad quote.

## Validation loop

The skill uses argdown-2's MCP server for validation. Tools used:

- `mcp__argdown__parse(source: string)` — returns `{ ok: boolean, errors?: ParseError[], ast?: Document, partial?: Document }`. Use this for detailed parse errors.
- `mcp__argdown__validate(source: string)` — returns `{ ok: boolean, errors?: ParseError[] }`. Quick check that the source is parseable.
- `mcp__argdown__render_mermaid(document)` — returns a Mermaid `flowchart TD` string. Use this for the Pass-3 sanity-check.

**Validation per pass:**

- Pass 1: `validate(facts_fragment)` after writing facts. Retry once on errors.
- Pass 2: `validate(facts_plus_relations_fragment)` after writing relations. Retry once on errors.
- Pass 3: `validate(full_doc)` + `render_mermaid(full_doc)` + LLM visual sanity-check. Up to 2 refinement rounds.

If the argdown-2 MCP server is unavailable at skill load, the skill proceeds in degraded mode without validation, with a one-time warning to the user. Output gets a `<!-- unvalidated -->` comment in the frontmatter.

## Argdown-2 grammar constraints (READ BEFORE WRITING)

These are argdown-2 grammar constraints surfaced during plan validation. They apply to ALL output (facts, relations, arguments, comments):

1. **Arguments support only `->` in conclusion position.** Rebuttal arguments are NOT a separate `([#X]) --x [#Y]` construction; use a `[#A] --x [#B]` relation instead. The argument syntax `([#conclusion]) -> [#premise-1], [#premise-2].` is the only supported form.

2. **Comments are `//` (line) or `/* */` (block), not `<!-- -->.** argdown-2's lexer rejects HTML-style comments. The trailing marker line uses `// extracted by prose-to-argdown; ...`.

3. **Five block-type keywords are reserved as fact-ID prefixes:** `evidence-`, `position-`, `stakeholder-`, `domain-`, `meta-`. Any fact ID starting with one of these prefixes (e.g., `[#evidence-clear]`, `[#position-x]`) is rejected by the lexer. Use alternative spellings: `facts-are-clear`, `the-position-held`, etc.

4. **Source-line ranges must use quoted strings.** `source-line: 1-2` (unquoted range) is rejected in relations and arguments. Use `source-line: "1-2"` (quoted string), or `source-line: [42, 67]` (flow sequence) for discontiguous spans.

5. **`%` in unquoted fact text is rejected by the lexer** (the `%` character is reserved). Source-quote strings (which are quoted) accept `%` fine. If the prose uses `%`, spell out "percent" in the fact text but keep the original `%` in the source-quote verbatim.

6. **Legacy `:—` syntax is a hard parse error** with migration hint. Never emit it; never include `:—` in any test fixture that the skill will validate.

If `argdown validate` rejects your output with any of these errors, fix the offending section and re-validate. Do not deliver invalid argdown.

## Edge cases

> **Note on HTML-comment markers:** The `<!-- unvalidated -->`, `<!-- chunk N of M -->`, and `<!-- parse-errors -->` markers described in this table are placed in the **chat-reply wrapper text** outside the argdown code block (or in frontmatter metadata) — not inside the argdown-2 document itself. Argdown-2's lexer does reject `<!-- -->` syntax. If a marker needs to appear inside the argdown content, use `//` argdown line-comment syntax instead.

| Situation | Skill behavior |
| --- | --- |
| **argdown-2 MCP server unavailable** | Warn user once. Proceed without validation. Add `<!-- unvalidated -->` to frontmatter. |
| **Prose < 50 words** | Reply: "This passage is too short to contain argumentative claims; nothing to extract." Do not produce empty argdown. |
| **Prose > 10,000 words** | Chunk on paragraph boundaries (≥ 500 words each), process each, concatenate with `<!-- chunk N of M -->` separator. Re-validate. |
| **No claims detected** (recipe, log, list) | Reply: "No argumentative claims detected in this prose; argdown-2 is for structured arguments. If you intended a different extraction, please clarify." Do not produce empty argdown. |
| **Contradictory prose** | Emit both sides as facts with a `--x` relation. Preserve the disagreement; do not resolve. |
| **Parse keeps failing** | After 2 parse-retry rounds, surface the parser errors verbatim. Mark with `<!-- parse-errors -->`. |
| **Sanity-check keeps failing** | After 2 Pass-3 refinement rounds, deliver best-effort with the warning note + list of unverified arguments. |
| **Provenance mismatch** | Rewrite the quote from the prose and re-emit. If that fails, drop the fact/argument. |

**User-visible error format:** when any of the above triggers, the chat reply is plain prose (no argdown code block), with the issue explained and a suggested remediation. The argdown code block is only present on successful extraction.

## Output assembly

Assembly order (top to bottom in the final code block):

1. **Frontmatter** (`=== ... ===`) — `title`, `source` (prose's title/URL if user provided), `extracted-from: lines X-Y` (or chunk list), `validated: <date>`.
2. **Facts** — all `[#id] claim { source-line, source-quote }` lines from Pass 1.
3. **Relations** — all `[#A] --> [#B] { source-line, source-quote }` lines from Pass 2.
4. **Arguments** — all `([#X]) -> [#Y], [#Z]. { source-line, source-quote }` lines from Pass 3.
5. **Structured blocks** — `:::evidence { … } :::` and `:::position { … } :::` groups.
6. **Trailing comment** — `// extracted by prose-to-argdown; review source-quote attributes against source prose` (argdown-2 line-comment syntax).

Delivery wrapper in chat reply:

```
Extracted N facts, M relations, and K arguments from <word count> words of prose.

```argdown
=== … ===
[#id-1] …
…
```

Review the `source-quote` attributes against the source to verify each claim is grounded.
```

**What the reply does NOT contain:**

- Internal reasoning traces
- MCP tool outputs (parse errors, Mermaid strings)
- Refinement history

## Self-verification (before delivery)

Before delivering the code block, run this checklist. If any check fails after the retry budgets are exhausted, deliver best-effort with the appropriate warning.

1. **Parseable:** call `mcp__argdown__validate(source)` on the full assembled doc. Must return `ok: true`.
2. **Provenance integrity:** for every fact and argument, verify `source-quote` is a verbatim substring of the input prose. If any fails, fix the quote by re-extracting from the prose, or drop the fact/argument.
3. **Grounded arguments:** walk each emitted argument. For each, point to a specific span in the prose. If you cannot, drop the argument.
4. **No invented facts/relations:** every fact should be in the prose; every relation should be stated or strongly implied. If any fails, drop.
5. **Frontmatter present:** the doc starts with a `===` block containing at least `title` and `extracted-from`.
6. **Trailing comment present:** the doc ends with `// extracted by prose-to-argdown; review source-quote attributes against source prose`.

If all six checks pass, deliver the code block in the chat reply with the wrapper described in `## Output assembly`. If any check fails after the retry budgets are exhausted, deliver the current best-effort output with a one-line note about which checks failed.
