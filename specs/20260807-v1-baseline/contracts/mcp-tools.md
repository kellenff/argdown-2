# MCP Tools Contract

**Date**: 2026-08-07
**Branch**: `20260807-v1-baseline`
**Spec anchor**: FR-007, FR-008, FR-010
**Constitution anchor**: Principle IV (End-to-End MCP Coverage), Principle V (Builder-as-Authoring)

## Surface

The stdio MCP server (`argdown-2-mcp`) exposes exactly 14 builder
tools. Tool names are byte-identical between source run
(`deno task mcp`), the host compiled binary, and the four release
binaries.

## Tool registry (canonical order)

| # | Name | Kind |
|---|---|---|
| 1 | `create_document` | mutating |
| 2 | `add_statement` | mutating |
| 3 | `update_statement` | mutating |
| 4 | `add_argument` | mutating |
| 5 | `add_inference` | mutating |
| 6 | `add_relation` | mutating |
| 7 | `add_solver` | mutating |
| 8 | `set_import` | mutating |
| 9 | `remove_import` | mutating |
| 10 | `remove_element` | mutating |
| 11 | `remove_relation` | mutating |
| 12 | `list_elements` | read-only |
| 13 | `validate` | read-only |
| 14 | `solve` | read-only |

Adding a tool: additive, non-breaking.
Removing or renaming a tool: **breaking**, requires major version
bump + `CHANGELOG.md` migration entry + deprecation bridge.

## Document references

Every tool that takes a document accepts **exactly one** of:

| Ref | Form | Semantics |
|---|---|---|
| `path` | Absolute filesystem path to a `.edn` file | Atomic write via temp + rename; the file is created if missing. |
| `source` | Full document text | Returns updated text in the response; caller persists. |

**Both or neither → `mcp/invalid-ref` refusal.** The document on
disk (if path mode) is unchanged.

## Mutation response shape

### Success

```json
{
  "ok": true,
  "warnings": [],
  "diff": { /* structured diff vs prior state */ },
  "path": "/abs/path/to/doc.edn",
  "source": null
}
```

Exactly one of `path` or `source` is populated in the echo,
matching the request.

### Builder refusal

```json
{
  "ok": false,
  "refused": {
    "code": "builder/duplicate-id",
    "message": "Statement id :a is already present in scope :root"
  },
  "warnings": [],
  "diff": null
}
```

The `code` is one of the `BuilderCode` values (see library-api.md).

### Load / IO failure

```json
{
  "ok": false,
  "errors": [
    {
      "code": "semantic/cross-reference-break",
      "message": "Endpoint :to references non-existent id :ghost",
      "path": ["elements", 3, "to"]
    }
  ]
}
```

The document on disk is unchanged.

## `parentId` scoping

Every mutating tool accepts an optional `parentId`:

| `parentId` | Scope |
|---|---|
| absent (default) | Document root component. |
| present | Immediate child solver component under the document root. |

`parentId` MUST resolve to an immediate child solver component under
the root; non-existent or non-immediate IDs are refused with
`builder/missing-id` or equivalent.

## Per-tool contracts

### `create_document`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` | string | one of | Absolute filesystem path. |
| `source` | string | one of | Empty or starter document text. |
| `solver` | string | optional | Solver tag; default `grounded`. |

Returns the canonical empty document on success.

### `add_statement`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | See ref contract. |
| `id` | string | yes | Unique within parent scope. |
| `text` | string | optional | Prose text. |
| `parentId` | string | optional | Defaults to root. |

Refused with `builder/duplicate-id` if `:id` already exists in scope.

### `update_statement`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | See ref contract. |
| `id` | string | yes | Must reference an existing statement. |
| `text` | string | optional | New prose text. |
| `parentId` | string | optional | Scope; defaults to root. |

Refused with `builder/missing-id` if `:id` does not exist.

### `add_argument`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | |
| `id` | string | yes | Unique within parent scope. |
| `description` | string | optional | Human-readable description. |
| `parentId` | string | optional | Scope; defaults to root. |

Refused with `builder/duplicate-id` if `:id` already exists.

### `add_inference`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | |
| `id` | string | yes | Unique within parent scope. |
| `argument` | string | yes | Parent argument `:id`. |
| `premises` | string[] | yes | Statement `:id`s (or prose resolved by `apply`). |
| `conclusion` | string | yes | Statement `:id` (or prose). |
| `parentId` | string | optional | Scope; defaults to root. |

Refused with `builder/missing-id` if any premise / conclusion /
argument ID does not exist.

### `add_relation`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | |
| `id` | string | yes | Unique within parent scope. |
| `kind` | string | yes | One of `attack`, `support`, `contradiction`, `undercut`. |
| `from` | string | yes | Endpoint `:id`. |
| `to` | string | yes | Endpoint `:id`. |
| `parentId` | string | optional | Scope; defaults to root. |

Refused with:
- `builder/duplicate-id` if `:id` exists.
- `builder/missing-id` if `from`/`to` not found.
- `builder/unsupported-relation-kind` if the parent solver does
  not consume this kind (e.g. `support` under `grounded`).
- `builder/unsupported-relation-kind` for `undercut` (no current
  solver consumes it).

### `add_solver`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | |
| `id` | string | yes | Unique within parent scope. |
| `solver` | string | optional | Default `grounded`. |
| `parentId` | string | optional | Defaults to root. |

Refused with `builder/unsupported-solver` if `solver` is not in
`SOLVER_TAGS`.

### `set_import`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | |
| `childId` | string | yes | Immediate child solver `:id` under root. |
| `threshold` | number | yes | In `[0, 1]`. |
| `parentId` | string | optional | Defaults to root. |

Refused with `builder/invalid-projection-bounds` if `threshold`
out of `[0, 1]`.

### `remove_import`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | |
| `childId` | string | yes | Immediate child solver `:id`. |
| `parentId` | string | optional | Defaults to root. |

### `remove_element`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | |
| `id` | string | yes | The element `:id` to remove (statement, argument, inference, child solver). |
| `parentId` | string | optional | Scope; defaults to root. |

Refused with `builder/missing-id` if `:id` not found.

### `remove_relation`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | |
| `id` | string | yes | Relation `:id`. |
| `parentId` | string | optional | Scope; defaults to root. |

Refused with `builder/missing-id` if relation `:id` not found.

### `list_elements`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | |
| `parentId` | string | optional | Defaults to root. |

Returns the list of statements, arguments, inferences, relations,
and child solver components in the scope.

### `validate`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | |

Returns semantic diagnostics; never mutates.

### `solve`

| Param | Type | Required | Notes |
|---|---|---|---|
| `path` or `source` | string | yes | |

Returns per-component `native` / `aggregate` / `boundary` /
`children` / `warnings`. Never mutates.

## Atomic write (path mode)

Path-mode mutations write to `.${Date.now()}.argdown-2.tmp` then
`rename` to the target. Mid-write crash leaves the original file
unchanged.

The temp file's parent directory MUST exist and be writable; if
the temp write fails, the tool returns `mcp/invalid-ref` /
`McpIoError.Write` and the original file is unchanged.

## Soft warnings

Some tools may surface **soft warnings** that do not refuse the
mutation:

- `builder/unresolved-ref`: a reference points to a soft-resolvable
  ID (e.g. prose that the builder slugified).
- Other domain warnings as defined per tool.

Soft warnings are surfaced in the `warnings` array of the success
response; the mutation is still applied.

## Stability

- Tool names: **frozen** (renames require major version + deprecation
  bridge; per FR-007 / constitution Principle IV).
- Tool params: **additive** (new optional params OK).
- Response shape: **frozen** (new optional fields OK; new required
  fields or shape changes are breaking; per FR-010 / constitution
  Principle V).
- `parentId` semantics: **frozen** (constitution Principle V UX
  contract).
