---
name: interpret-solve
description: Solve an argdown-2 document and explain labels / acceptance. Use when the user wants grounded Dung outcomes (or bipolar/evidential support reductions) from the MCP session graph.
---

# Interpret solve results

## Rules

- **Never hand-edit EDN.** Solving reads MCP session state built by builder tools, not hand-written files.
- Prefer `validate` before `solve` when the graph may be incomplete or recently edited.
- The document root solver tag selects semantics: `grounded` (pure attack), `bipolar` (deductive support), or `evidential` (necessary support). Multi-extension tags return `extensions` instead of `labels`.

## Flow

1. Optional: `validate` — stop and repair (validate-debug) if diagnostics block confidence
2. `solve` — labels or extensions per the document's solver tag
3. Explain accepted / rejected / undecided (or extension members) in plain language; note when support was reduced (`bipolar` / `evidential`) vs omitted (`grounded`)
4. If the user wants changes, return to build-graph / validate-debug via MCP tools — still no hand-edited EDN
