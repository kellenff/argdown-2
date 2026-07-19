---
name: build-graph
description: Build an argdown-2 grounded argument graph via MCP tools (create_document, statements, arguments, inferences, relations). Use when authoring or extending an EDN argument document.
---

# Build graph

Use the **argdown-2** MCP builder tools only. **Never hand-edit EDN** files (no Write/Edit of `*.edn`). Document state lives in the MCP session.

## Flow

1. `create_document` — empty grounded document (if starting fresh)
2. `add_statement` / `update_statement` — claims with ids
3. `add_argument` / `add_inference` — arguments and premise/conclusion structure
4. `add_relation` — `support`, `attack`, `contradiction`, or `undercut`
5. Prefer `list_elements` to inspect current graph state before further edits

## Rules

- Do **not** Write or Edit `*.edn` by hand. Prefer builder MCP tools for every mutation.
- Use `remove_element` / `remove_relation` instead of deleting text from files.
- After structural changes, suggest validating before solving (see validate-debug).
