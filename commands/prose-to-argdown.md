# /prose-to-argdown

Distill the user's prose into a full argdown-2 document.

The user has pasted or referenced a block of argumentative or research/technical prose. Apply the three-pass pipeline defined in `skills/prose-to-argdown/SKILL.md`:

1. **Facts pass** — extract atomic claims with `source-line` and `source-quote` provenance.
2. **Relations pass** — identify support/attack/undercut edges (grounded in the prose).
3. **Arguments pass** — extract stated/implied argument structures. **Grounded-arguments invariant:** arguments only emitted when the prose states or strongly implies them. Silence is valid output.

Validate each pass by calling `mcp__argdown__validate` (via the registered argdown-2 MCP server). On Pass 3, also call `mcp__argdown__render_mermaid` and inspect the resulting diagram against the prose (completeness, fidelity, provenance). Refine up to 2 rounds on mismatch.

**Constraints:**

- Every fact and argument carries `source-line: N` and `source-quote: "verbatim span"`. `source-quote` MUST be a verbatim substring of the input prose.
- argdown-2 supports only `->` in argument position; rebuttals are captured as `--x` relations.
- Avoid fact IDs starting with `evidence-`, `position-`, `stakeholder-`, `domain-`, `meta-` (these are reserved block-type prefixes in argdown-2's grammar).
- Avoid unquoted `%`, `:—`, `<!-- -->`-style HTML comments in the output (use `//` line comments instead).
- Source-line ranges use quoted strings: `source-line: "1-2"`, not `source-line: 1-2`.

Deliver the result as a fenced ` ```argdown ` code block in your chat reply, prefaced with "Extracted N facts, M relations, and K arguments from <words> words of prose."

If the prose is too short (< 50 words), has no argumentative claims (recipe, log, list), or has fewer than 50 words of actual argument structure, reply with a plain-prose explanation — no argdown code block.
