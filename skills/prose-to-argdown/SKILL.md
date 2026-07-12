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

