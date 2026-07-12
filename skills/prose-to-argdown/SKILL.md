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

