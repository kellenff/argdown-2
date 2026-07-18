# MCP Builder Server Design

**Date:** 2026-07-18
**Status:** Approved
**Scope:** Add an MCP stdio server in `@casualtheorics/argdown-2` that exposes builder-pattern tools for constructing Argdown 1.x-shaped EDN documents from host-LLM prose fields, plus strict `validate` and `solve`.

---

## 1. Context and goals

The EDN reset (`docs/snowball/specs/2026-07-17-edn-canonical-representation-design.md`) removed the previous CLI and MCP surface. The public library API is intentionally minimal: `load`, `validate`, and `solve`. Agents authoring theories today must hand-write namespaced EDN tags — a poor fit for how LLMs naturally propose claims and relations in prose.

This cycle adds an MCP server in the **same package** so a host LLM can build documents incrementally through tools that accept semi-structured prose fields, while the server remains deterministic (no server-side model).

**Goals:**

- Expose builder-shaped MCP tools for the full Argdown 1.x-shaped ontology (statements, arguments with inferences, support/attack/contradiction/undercut).
- Accept host-supplied prose fields; resolve references by keyword id first, then unique statement/argument text.
- Keep the server stateless: each call passes a file path or full document text; path mutations write in place.
- Allow soft intermediate documents (unresolved refs warn but still apply when tag shape is valid); keep strict `validate` / `solve` as the hard gates.
- Leave the published JS API as `load` / `validate` / `solve`; builder and EDN writer stay package-internal.

**Non-goals:**

- Server-side LLM interpretation of free-form instructions.
- In-process session state or multi-document session registry.
- Exporting `DocumentBuilder` or `stringify` from the public package API in v1.
- Restoring Mermaid rendering, the old custom `.argdown` parser, or advanced solvers.
- Live Cursor-host end-to-end tests in CI.

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Packaging | Same npm package; MCP bin/entrypoint added |
| Public JS API | Unchanged: `load`, `validate`, `solve` only |
| Interpreter | Host LLM only; server deterministic |
| Document carriage | Each tool takes `{ path }` or `{ text }` |
| Path mutations | Edit in place (atomic write) |
| Text mutations | Return full updated EDN in the tool result |
| Builder location | Package-internal `src/builder/` (not MCP-only spaghetti; not public yet) |
| Builder purity | `(doc, edit) → { document, warnings, refused?, diff }` — no hidden session |
| Soft vs strict | Soft apply + warnings in builder; strict behavior only in `validate` / `solve` |
| Ref resolution | Id preferred; unique text fallback; ambiguous/missing → warning |
| Ontology (v1) | Statements, arguments, inferences, support/attack/contradiction/undercut |
| Read-only tools | `validate` and `solve` included |
| EDN writer | Internal, separate from builder; used by MCP I/O |
| Approach rejected | EDN round-trip surgery without a builder; public builder export |

---

## 3. Architecture

Three layers inside one package:

1. **Core (unchanged contract)** — EDN read, Zod decode, strict semantic validate, grounded reduce/solve.
2. **`src/builder/` (package-internal)** — pure edits on a candidate document; soft ref resolution; structural diffs.
3. **`src/mcp/`** — tool registration, path|text I/O, in-place writes, JSON results. Owns commit semantics.

```text
Host LLM
  └─ MCP tools (path | text)
       ├─ mutate → builder.apply → edn-write → file | text out
       └─ validate / solve → core API
```

The EDN writer normalizes a candidate document to a string. It is not exported from `src/index.ts` in v1. Promoting builder modules later is a deliberate public-API change, not an accident of file placement under `mcp/`.

---

## 4. Components

### 4.1 Builder (`src/builder/`)

- `apply(doc, edit)` — pure; referentially transparent over the input document.
- Edit kinds: create empty grounded document; add/update/remove statement; add/update argument; add/remove inference; add/remove relation (`support` | `attack` | `contradiction` | `undercut`).
- `resolveRef(doc, idOrText)` — keyword id first; else unique match on statement or argument text; ambiguous or missing yields a warning. An edit is refused only when a valid tagged shape cannot be formed (e.g. duplicate id, remove of unknown id, undercut target that cannot be interpreted as an inference reference at all).
- Result shape: `{ document, warnings[], refused?, diff }`.
- `diff` is **structural** (what nodes/edges changed), not a textual EDN patch — so agents verify intent without depending on writer formatting.

### 4.2 EDN writer

- Candidate/wire document → canonical EDN string (solver root + tagged element vector).
- Round-trip with `load` must succeed for strictly valid documents.
- Soft documents may serialize as tagged EDN that still fails strict `validate`.

### 4.3 MCP I/O

- Shared document argument: `{ path: string } | { text: string }` (exactly one).
- **Path:** read → apply → atomic write to the same path (temp file + rename); result omits full body unless needed for errors.
- **Text:** read → apply → include full updated EDN in the result; no disk write.

### 4.4 MCP tools (v1)

| Tool | Role |
|---|---|
| `create_document` | Bootstrap `#casualtheorics.argdown2.solver/grounded []` |
| `add_statement` / `update_statement` | Statement nodes (id + prose `text`, optional tags/metadata) |
| `add_argument` | Argument node (id + prose description, optional tags/metadata) |
| `add_inference` | Inference under an argument (premises/conclusion as id-or-prose refs) |
| `add_relation` | Relation with `kind` + `from`/`to` as id-or-prose |
| `remove_element` | Remove a statement/argument/inference by id, or a relation by `kind` + resolved `from`/`to` |
| `list_elements` | Compact inventory for the host LLM |
| `validate` | Strict core validation |
| `solve` | Strict load + grounded solve |

Tool names are exactly as listed (no package prefix).

---

## 5. Data flow

### Mutating tool (path)

1. Read file as UTF-8.
2. Soft-parse to candidate document: EDN read + structural (Zod/tag) decode into builder/candidate types. Skip the strict semantic identity/reference pass.
3. `apply(doc, edit)` → candidate + warnings + diff, or `refused` with no write.
4. If not refused: stringify → atomic write to the same path.
5. Return JSON: `{ ok, warnings, diff, createdIds?, path }`.

### Mutating tool (text)

Same pipeline; step 5 includes `text` (full updated EDN) instead of writing.

### `validate`

Call core `load` (or read EDN + `validate`). Return `{ ok, errors? }` with semantic paths. No writes.

### `solve`

`load` must succeed; then `solve`. Return labels and reduction warnings. Fail closed if invalid. No writes.

### Typical host loop

`create_document` → repeated `add_*` (warnings acceptable) → `validate` until clean → `solve`.

---

## 6. Error handling

| Kind | When | Effect |
|---|---|---|
| I/O | Missing path, unreadable/unwritable file | MCP transport `isError`; no document change |
| Parse / tag shape | Not EDN, wrong root tag, malformed element maps | Refuse mutate; no write |
| Soft warning | Unresolved or ambiguous ref-by-text | Apply edit; return `warnings[]` |
| Strict validate | Identity/reference graph broken | `validate` / `solve` return `ok: false`; earlier soft writes may exist |
| Refuse edit | Duplicate id, remove missing id, etc. | No write; `refused` + reason |

**Conventions:**

- Prefer structured JSON in tool `content` (`ok`, `warnings`, `errors`, `diff`, `refused`) over opaque strings.
- Business-logic outcomes (refuse, soft warnings) are normal results, not transport errors.
- Transport `isError` is reserved for I/O and unexpected throws.
- Path writes are atomic so a failed stringify never truncates an existing file.

---

## 7. Testing

- **Builder unit tests** — pure `apply` goldens: id vs text lookup, ambiguity warning, duplicate-id refuse, nested inference + undercut, soft doc that fails strict `validate`.
- **EDN writer tests** — round-trip valid fixtures through write → `load`; assert stable tag/field shape.
- **MCP tests** — in-memory transport; temp files for path mode; assert in-place write, no write on refuse, `validate` / `solve` payloads.
- **Fixtures** — small hand-crafted EDN corpus under `src/builder/fixtures/` (one concern each).

**Out of scope for v1:** mutation testing of MCP wiring; live host e2e in CI (manual smoke only).

---

## 8. Packaging and entrypoint

- Add `@modelcontextprotocol/sdk` as a runtime dependency.
- Expose bin `argdown-2-mcp` that starts the stdio server (`src/mcp/server.ts` or equivalent).
- Document a Cursor MCP config snippet in the README.
- `knip` / export surface: builder and writer must not appear in the public `exports` map.

---

## 9. Relationship to prior non-goals

The EDN canonical design listed “EDN writer” and CLI/MCP as non-goals for the *library contract* reset. This cycle reintroduces an **internal** writer and an MCP entrypoint without expanding the published JS API. That is intentional: agent authoring is new demand; the library-facing contract stays minimal until a non-MCP consumer justifies exporting the builder.

---

## 10. Implementation sketch (non-normative file layout)

```text
src/builder/
  apply.ts
  resolve-ref.ts
  types.ts
  fixtures/
  *.test.ts
src/edn-write.ts          # or src/builder/write.ts
src/mcp/
  server.ts
  tools.ts
  io.ts
  *.test.ts
```

Exact file split may follow change vectors (resolver vs apply vs diff) without adding unused folders.

---

## 11. Success criteria

- An MCP host can create a grounded document, add the censorship-tutorial-shaped ontology via prose fields and ids, `validate` cleanly, and `solve` with grounded labels.
- Path mode persists between tool calls via the file on disk; text mode never touches disk.
- Strict `validate` / `solve` behavior matches the existing library tests for the same EDN.
- Public `import '@casualtheorics/argdown-2'` still exports only the documented library API.

