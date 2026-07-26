# Delete Unused `ReadResult` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused private `ReadResult` type left over from the EDN reader Effect refactor, and keep the Effect pattern note + CHANGELOG accurate.

**Architecture:** Pure deletion + doc sync. `ReadResult` is defined only in `src/model.ts` and is not re-exported from `src/index.ts`. Consumers already use `LoadResult` / `SoftParseResult` / `ValidationResult`. No runtime behavior change.

**Tech Stack:** Deno, TypeScript.

**Spec:** [`docs/snowball/specs/2026-07-26-delete-read-result-design.md`](../specs/2026-07-26-delete-read-result-design.md) (commit `d7866c1`).

---

## File Structure

| File | Change |
|---|---|
| `src/model.ts` | Delete `ReadResult` type alias |
| `docs/snowball/specs/2026-07-25-effect-pattern.md` | Replace stale "Don't" bullet about keeping `ReadResult` |
| `CHANGELOG.md` | Add `Removed` entry under `[Unreleased]` |

**Not touched:** `src/index.ts`, `src/edn.ts`, consumers, historical design/plan docs.

---

## Task 1: Delete `ReadResult` from `src/model.ts`

**Files:**
- Modify: `src/model.ts:221-223`

- [ ] **Step 1: Confirm it is unused under `src/`**

Run:

```bash
rg "ReadResult" src/
```

Expected: only the definition in `src/model.ts` (no imports/usages).

- [ ] **Step 2: Delete the type**

In `src/model.ts`, remove:

```ts
export type ReadResult =
  | { ok: true; value: unknown }
  | { ok: false; errors: readonly Diagnostic[] };
```

Leave the surrounding `DungFramework` and `ValidationResult` types untouched. Keep a single blank line between them.

- [ ] **Step 3: Verify types still check**

Run:

```bash
deno check --frozen src/index.ts src/mcp/cli.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/model.ts
git commit -m "refactor(model): remove unused ReadResult type

Private leftover from the pre-Effect readEdn signature. Not
re-exported from the package entrypoint."
```

---

## Task 2: Update Effect pattern note

**Files:**
- Modify: `docs/snowball/specs/2026-07-25-effect-pattern.md` (the final "Don't" bullet)

- [ ] **Step 1: Replace the stale bullet**

Find:

```markdown
- Don't expose `ReadResult` from new modules — let the call site
  unwrap. `ReadResult` stays as a boundary type until all consumers
  migrate.
```

Replace with:

```markdown
- Don't invent a new ok/errors boundary type for Effect modules —
  unwrap with `Effect.match` + `Effect.runSync` into the call site's
  existing result type (`LoadResult`, `SoftParseResult`, etc.), or
  keep the Effect until the outermost sync boundary. The old
  `ReadResult` type was removed after the EDN reader migration.
```

- [ ] **Step 2: Commit**

```bash
git add docs/snowball/specs/2026-07-25-effect-pattern.md
git commit -m "docs: update Effect pattern note after ReadResult removal"
```

---

## Task 3: CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md` (under `[Unreleased] > Removed`)

- [ ] **Step 1: Add the entry**

Under `## [Unreleased] > ### Removed`, add (after the existing Cursor-plugin bullet is fine):

```markdown
- `ReadResult` type removed from `src/model.ts`. It was an internal
  boundary type for the pre-Effect `readEdn` signature and is unused
  after the EDN reader Effect refactor. Not a public API break —
  `ReadResult` was never re-exported from the package entrypoint.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): note ReadResult removal"
```

---

## Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm no `ReadResult` under `src/`**

```bash
rg "ReadResult" src/
```

Expected: no output.

- [ ] **Step 2: Type check**

```bash
deno check --frozen src/index.ts src/mcp/cli.ts
```

Expected: PASS.

- [ ] **Step 3: Full test suite**

```bash
deno test -A --frozen --parallel src/
```

Expected: PASS (90 passed / 0 failed, same as pre-change).

- [ ] **Step 4: Lint the touched source file**

```bash
deno lint src/model.ts
```

Expected: PASS.

- [ ] **Step 5: Inspect history**

```bash
git status
git log --oneline -5
```

Expected: clean working tree (modulo pre-existing `.rag/` hint). Last commits are Tasks 1–3.

---

## Self-Review

**Spec coverage:**
- ✅ Delete `ReadResult` from `model.ts` → Task 1
- ✅ Update Effect pattern note → Task 2
- ✅ CHANGELOG `Removed` entry → Task 3
- ✅ Verification commands → Task 4

**Placeholders:** none.

**Type consistency:** only deletion; no new types introduced. `ValidationResult` / `LoadResult` remain.

**Decomposition:** 4 tiny tasks, each independently committable. No split needed.
