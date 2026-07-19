---
name: validate-debug
description: Validate an argdown-2 MCP document and repair semantic diagnostics using builder tools. Use when validate fails or the graph needs debugging.
---

# Validate and debug

Call MCP `validate` on the current document. Interpret diagnostics and fix problems **only** through builder MCP tools.

## Rules

- **Never hand-edit EDN.** Do not Write/Edit `*.edn` to “fix” validation errors.
- Repair with `update_statement`, `add_*`, `remove_element`, `remove_relation`, etc.
- Re-run `validate` after each repair batch until clean (or until remaining issues are intentional).

## Flow

1. `list_elements` if you need orientation
2. `validate` — read semantic path diagnostics
3. Mutate via MCP tools only
4. `validate` again
