---
name: interpret-solve
description: Solve an argdown-2 grounded document and explain labels / acceptance. Use when the user wants grounded Dung outcomes from the MCP session graph.
---

# Interpret solve results

## Rules

- **Never hand-edit EDN.** Solving reads MCP session state built by builder tools, not hand-written files.
- Prefer `validate` before `solve` when the graph may be incomplete or recently edited.

## Flow

1. Optional: `validate` — stop and repair (validate-debug) if diagnostics block confidence
2. `solve` — grounded labels
3. Explain accepted / rejected / undecided (or equivalent labels returned by the tool) in plain language
4. If the user wants changes, return to build-graph / validate-debug via MCP tools — still no hand-edited EDN
