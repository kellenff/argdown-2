---
name: build-graph
description: Build an argdown-2 grounded argument graph via MCP tools (create_document, statements, arguments, inferences, relations). Use when authoring or extending an EDN argument document.
---

# Build graph

Use the **argdown-2** MCP builder tools only. **Never hand-edit EDN** files (no Write/Edit of `*.edn`). Document state lives in the MCP session.

For freeform prose → graph extraction, use **prose-to-argdown-2** first. For
collaborative sharpening / research-backed expansion, use **interactive-argument**.
This skill covers the mutation mechanics once claims are identified.

## Flow

1. `create_document` — empty grounded document (if starting fresh)
2. `add_statement` / `update_statement` — claims with ids
3. `add_argument` / `add_inference` — arguments and premise/conclusion structure
4. `add_relation` — assign a stable relation id, kind, source, and target
5. `add_solver` / `set_import` — nest child solvers and configure boundary imports
6. Prefer `list_elements` to inspect current graph state before further edits

## Rules

- Do **not** Write or Edit `*.edn` by hand. Prefer builder MCP tools for every mutation.
- Use optional `parentId` to mutate nested solver components (defaults to the document root).
- Relation kinds must be consumed by the target solver (`support` only under bipolar/evidential; `undercut` is currently rejected everywhere).
- Use `remove_element` / `remove_relation` / `remove_import` by id instead of deleting text from files.
- After structural changes, suggest validating before solving (see validate-debug).
