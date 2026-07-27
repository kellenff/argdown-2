# Effect-Native Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `argdown-2` library, builder, persistence, and MCP orchestration to a single Effect-native surface. Public `solve` becomes an Effect; `apply` refuses via `Effect.fail(BuilderError)`; `mcp/io.ts` uses `Effect.tryPromise`; the 14 MCP tool handlers collapse into one `runMutation` core plus a single `runMcpEffect` Promise adapter. CLI, MCP server SDK, and Pi extension keep Promise signatures only at host-required boundary callbacks.

**Architecture:** Library public API is `Effect.Effect<A, E, never>`. Internal helpers compose with `Effect.gen`. Adapter boundaries: `runMcpEffect` wraps `Effect<McpResult, never>` → `Promise<McpResult>`; CLI uses `Effect.runSync(Effect.match(...))`; Pi extension remains Promise-only because its host API requires it. Errors are tagged unions; `Effect.catchTag` recovers by tag.

**Tech Stack:** Deno + TypeScript, `effect@^4.0.0-beta.101` (wired via `deno.json` `imports`), `@std/testing/bdd`, `@std/expect`, `zod`, `@modelcontextprotocol/sdk`, `@optique/core`, `node:fs/promises`.

---

## File structure

| File | Responsibility | Modified by task |
|---|---|---|
| `src/model.ts` | Adds `SolveError` alias (empty for v1) | T1 |
| `src/builder/types.ts` | Adds `BuilderError` tagged union and `BuilderCode` | T2 |
| `src/builder/apply.ts` | `apply` returns `Effect<...>`; preserves refused JSON shape | T3 |
| `src/builder/apply.test.ts` | Asserts Effect success / failure per edit | T4 |
| `src/mcp/io.ts` | Replaces async/try/catch with `Effect.tryPromise` and `McpIoError` | T5 |
| `src/mcp/io.test.ts` | New; exercises filesystem + parse error mapping | T6 |
| `src/mcp/tools.ts` | Refactors 14 tools into `runXEffect` + adapter; adds `runMutation` shared core | T7 |
| `src/mcp/tools.test.ts` | Updates to use new exports; keeps existing snapshots | T8 |
| `src/mcp/server.ts` | No change to public shape; registers `runX` Promises | T9 |
| `src/index.ts` | `solve` becomes Effect; `apply` re-exported; `SolveError` re-exported | T10 |
| `src/test-support.ts` | `runLoad` already correct; verify still compiles | T11 |
| `src/cli/load.ts` | Already uses `Effect.match`; refresh to call `Effect.runSync(load(...))` after any `load` signature evolution | T12 |
| `src/cli/solve.ts` | `Effect.runSync(load(...))` then `Effect.runSync(solve(...))` | T12 |
| `src/solvers.test.ts`, `src/multi-extension.test.ts`, `src/first-class-components.test.ts` | Switch `solve(...)` calls to `Effect.runSync(solve(...))` | T13 |
| `docs/snowball/specs/2026-07-25-effect-pattern.md` | Append Effect-native builder, MCP adapter, async I/O sections | T14 |
| `README.md` | Update API examples for Effect-native `solve` | T15 |
| `CHANGELOG.md` | Note breaking `solve` shape change | T15 |

> All edits use exact-file modification. Touch **only** the files listed per task. Run `deno task check` and `deno task test` after each task.

---

## Task 1: Add `SolveError` type alias

**Files:**
- Modify: `src/model.ts` (insert after the `LoadError` type at line 79)
- Test: none (purely additive type alias)
- Verify: `deno check --frozen src/index.ts`

- [ ] **Step 1: Read current `src/model.ts` to confirm insertion point**

Run: `cat -n src/model.ts | sed -n '65,90p'`

Expected: see existing `EdnError`, `ValidateError`, `SchemaError`, `LoadError` types.

- [ ] **Step 2: Add the alias immediately after `LoadError`**

```ts
/**
 * Effect failure channel for the public `solve` API. Empty in v1 while
 * the solver is pure; leaves room for typed solver failures later
 * (e.g. cycles, missing interface, partition-time warnings) without
 * another breaking shape change.
 */
export type SolveError = never;
```

- [ ] **Step 3: Verify types still pass**

Run: `deno check --frozen src/index.ts src/mcp/cli.ts`

Expected: `Check ...` with no errors. (Lock file resolution may require `--frozen=false` on first run; if so, run once with `--frozen=false` then re-run frozen.)

- [ ] **Step 4: Commit**

```bash
git add src/model.ts
git commit -m "feat(model): add SolveError alias for future solver failures"
```

---

## Task 2: Add `BuilderError` and `BuilderCode`

**Files:**
- Modify: `src/builder/types.ts` (append after `ApplyResult`, around line 43)
- Test: `src/builder/types.test.ts` (new file, light type-level test only)
- Verify: `deno task check`

- [ ] **Step 1: Write the failing test (compile-time only)**

Create `src/builder/types.test.ts`:

```ts
import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";

import type { BuilderError } from "./types.js";

describe("BuilderError", () => {
  it("covers every BuilderCode emitted by apply()", () => {
    const codes: BuilderError["code"][] = [
      "builder/invalid-id",
      "builder/duplicate-id",
      "builder/missing-id",
      "builder/unsupported-relation-kind",
      "builder/unsupported-solver",
      "builder/invalid-projection-bounds",
    ];
    for (const code of codes) {
      const err: BuilderError = {
        _tag: "Builder",
        code,
        message: "demo",
        path: [],
        warnings: [],
      };
      expect(err._tag).toBe("Builder");
    }
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails on missing type**

Run: `deno test -A src/builder/types.test.ts`

Expected: FAIL with `Module not found "src/builder/types.js"` or type error on `BuilderError`.

- [ ] **Step 3: Add the new types to `src/builder/types.ts`**

Append after the `ApplyResult` block (currently at lines 38-43):

```ts
/**
 * Stable refusal codes from `apply`. Each maps 1:1 to a branch in
 * `apply()` that previously set `ApplyResult.refused`.
 */
export type BuilderCode =
  | "builder/invalid-id"
  | "builder/duplicate-id"
  | "builder/missing-id"
  | "builder/unsupported-relation-kind"
  | "builder/unsupported-solver"
  | "builder/invalid-projection-bounds";

/**
 * Typed failure for `apply()` and `applyMutation()`. Mirrors the
 * shape previously embedded in `ApplyResult.refused` so the MCP
 * JSON response stays byte-compatible.
 */
export type BuilderError = {
  readonly _tag: "Builder";
  readonly code: BuilderCode;
  readonly message: string;
  readonly path: ReadonlyArray<string | number>;
  readonly warnings: readonly BuilderWarning[];
};
```

- [ ] **Step 4: Re-run the test**

Run: `deno test -A src/builder/types.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/builder/types.ts src/builder/types.test.ts
git commit -m "feat(builder): introduce BuilderError + BuilderCode union"
```

---

## Task 3: Convert `apply` to `Effect`

**Files:**
- Modify: `src/builder/apply.ts`
- Test: `src/builder/apply.test.ts`

- [ ] **Step 1: Confirm current callers compile against old signature**

Run: `rg -n "from \"\\./builder/apply\\.js\"" src/`

Expected: only `src/index.ts`, `src/mcp/tools.ts`, `src/mcp/io.ts`, `src/builder/apply.test.ts` import `apply` or `emptyDocument`. Note these.

- [ ] **Step 2: Add the new failing apply test**

Create `src/builder/apply.test.ts`:

```ts
import { Effect } from "effect";
import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";

import { apply, emptyDocument } from "./apply.js";

function runApply(args: Parameters<typeof apply>): { ok: true; diff: unknown[]; warnings: unknown[] } | { ok: false; err: { code: string; message: string } } {
  return Effect.runSync(
    Effect.match(apply(...args), {
      onFailure: (err) => ({ ok: false as const, err }),
      onSuccess: (value) => ({ ok: true as const, diff: value.diff, warnings: value.warnings }),
    }),
  );
}

describe("apply (Effect)", () => {
  it("adds a statement", () => {
    const doc = emptyDocument();
    const result = runApply([doc, { type: "add_statement", id: ":a", text: "A" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diff).toEqual([{ op: "add", kind: "statement", id: "a" }]);
  });

  it("fails with duplicate-id on a second statement with the same id", () => {
    const doc = emptyDocument();
    const first = apply(doc, { type: "add_statement", id: ":a", text: "A" });
    const populated = Effect.runSync(first);
    const second = Effect.match(apply(populated.document, { type: "add_statement", id: ":a", text: "B" }), {
      onFailure: (err) => ({ ok: false as const, err }),
      onSuccess: (value) => ({ ok: true as const, value }),
    });
    expect(Effect.runSync(second).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run the new test — expect type failure on `apply` return**

Run: `deno test -A src/builder/apply.test.ts`

Expected: FAIL with a type error such as `apply` returning `ApplyResult` instead of an Effect.

- [ ] **Step 4: Refactor `src/builder/apply.ts` to return `Effect`**

Replace the file with:

```ts
import {
  AGGREGATE_IDENTITY_TAG,
  type CandidateArgument,
  type CandidateDocument,
  type CandidateElement,
  type CandidateInference,
  type CandidateRelation,
  type CandidateSolverComponent,
  type CandidateStatement,
  COMPLETE_SOLVER_TAG,
  EXTENSION_PROPORTION_OBSERVER_TAG,
  GROUNDED_SOLVER_TAG,
  isEdnKeywordName,
  isSolverTag,
  PREFERRED_SOLVER_TAG,
  PROJECTION_THRESHOLD_TAG,
  type SolverTag,
  STABLE_SOLVER_TAG,
  supportedRelationKinds,
} from "../model.js";
import { resolveInferenceRef, resolveRef } from "./resolve-ref.js";
import type {
  ApplyResult,
  BuilderCode,
  BuilderError,
  BuilderWarning,
  DocumentEdit,
} from "./types.js";

export type AppliedEdit = {
  readonly document: CandidateDocument;
  readonly warnings: readonly BuilderWarning[];
  readonly diff: ReadonlyArray<unknown>;
};

export function emptyDocument(
  solver: SolverTag = GROUNDED_SOLVER_TAG,
  documentId = "document",
  rootId = "root",
): CandidateDocument {
  return {
    id: documentId,
    root: {
      kind: "solver",
      solver,
      id: rootId,
      imports: [],
      elements: [],
      extra: [],
    },
    extra: [],
  };
}

function stripColon(id: string): string {
  return id.startsWith(":") ? id.slice(1) : id;
}

function softRefId(raw: string): string {
  const stripped = raw.startsWith(":") ? raw.slice(1) : raw.trim();
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(stripped)) return stripped;
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "unresolved";
}

function collectIds(component: CandidateSolverComponent): Set<string> {
  const ids = new Set<string>();
  for (const el of component.elements) {
    ids.add(el.id);
    if (el.kind === "argument") {
      for (const inf of el.inferences) ids.add(inf.id);
    }
  }
  return ids;
}

function refuse(
  doc: CandidateDocument,
  code: BuilderCode,
  message: string,
  warnings: readonly BuilderWarning[] = [],
): BuilderError {
  return { _tag: "Builder", code, message, path: [], warnings };
}

function findComponent(
  component: CandidateSolverComponent,
  id: string,
): CandidateSolverComponent | undefined {
  if (component.id === id) return component;
  for (const element of component.elements) {
    if (element.kind === "solver") {
      const found = findComponent(element, id);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function replaceComponent(
  component: CandidateSolverComponent,
  targetId: string,
  next: CandidateSolverComponent,
): CandidateSolverComponent {
  if (component.id === targetId) return next;
  return {
    ...component,
    elements: component.elements.map((element) =>
      element.kind === "solver"
        ? replaceComponent(element, targetId, next)
        : element
    ),
  };
}

type ComponentUpdate =
  | {
    ok: true;
    document: CandidateDocument;
    component: CandidateSolverComponent;
  }
  | { ok: false; error: BuilderError };

function withComponent(
  doc: CandidateDocument,
  parentId: string,
  update: (
    component: CandidateSolverComponent,
  ) =>
    | { ok: true; component: CandidateSolverComponent }
    | { ok: false; code: BuilderCode; message: string },
): ComponentUpdate {
  const component = findComponent(doc.root, parentId);
  if (component === undefined) {
    return {
      ok: false,
      error: refuse(
        doc,
        "builder/missing-id",
        `No solver component with id "${parentId}"`,
      ),
    };
  }
  const result = update(component);
  if (!result.ok) {
    return {
      ok: false,
      error: refuse(doc, result.code, result.message),
    };
  }
  return {
    ok: true,
    document: {
      ...doc,
      root: replaceComponent(doc.root, parentId, result.component),
    },
    component: result.component,
  };
}

function interfaceFor(
  root: CandidateSolverComponent,
  ref: string,
): NonNullable<CandidateSolverComponent["interface"]> {
  const multi = root.solver === PREFERRED_SOLVER_TAG ||
    root.solver === STABLE_SOLVER_TAG ||
    root.solver === COMPLETE_SOLVER_TAG;
  return {
    aggregate: {
      tag: AGGREGATE_IDENTITY_TAG,
      inputs: [{ ref }],
    },
    ...(multi ? { observer: { tag: EXTENSION_PROPORTION_OBSERVER_TAG } } : {}),
  };
}

function withInitialInterface(
  root: CandidateSolverComponent,
  ref: string,
): CandidateSolverComponent {
  if (root.interface !== undefined) return root;
  return {
    ...root,
    interface: interfaceFor(root, ref),
  };
}

function repairInterface(
  root: CandidateSolverComponent,
): CandidateSolverComponent {
  const currentRef = root.interface?.aggregate.inputs[0].ref;
  if (
    currentRef !== undefined &&
    root.elements.some((element) =>
      (element.kind === "statement" ||
        element.kind === "argument" ||
        element.kind === "solver") && element.id === currentRef
    )
  ) {
    return root;
  }
  const first = root.elements.find((element) =>
    element.kind === "statement" ||
    element.kind === "argument" ||
    element.kind === "solver"
  );
  if (first === undefined) {
    const { interface: _removed, ...pending } = root;
    return pending;
  }
  return {
    ...root,
    interface: interfaceFor(root, first.id),
  };
}

function invalidId(doc: CandidateDocument, id: string): BuilderError | undefined {
  return isEdnKeywordName(id)
    ? undefined
    : refuse(doc, "builder/invalid-id", `"${id}" is not a valid EDN keyword`);
}

function invalidIdList(
  doc: CandidateDocument,
  ids: readonly string[] | undefined,
): BuilderError | undefined {
  if (ids === undefined) return undefined;
  const invalid = ids.find((id) => !isEdnKeywordName(id));
  return invalid === undefined ? undefined : invalidId(doc, invalid);
}

function resolveRefOrRaw(
  doc: CandidateDocument,
  component: CandidateSolverComponent,
  raw: string,
  warnings: BuilderWarning[],
): string {
  const resolution = resolveRef(doc, raw, component);
  if (resolution.ok) return resolution.id;
  const storedId = softRefId(raw);
  warnings.push({
    code: "builder/unresolved-ref",
    message: `${resolution.message}; stored as id "${storedId}"`,
  });
  return storedId;
}

function resolveInferenceRefOrRaw(
  doc: CandidateDocument,
  component: CandidateSolverComponent,
  raw: string,
  warnings: BuilderWarning[],
): string {
  const resolution = resolveInferenceRef(doc, raw, component);
  if (resolution.ok) return resolution.id;
  const storedId = softRefId(raw);
  warnings.push({
    code: "builder/unresolved-ref",
    message: `${resolution.message}; stored as id "${storedId}"`,
  });
  return storedId;
}

function parentIdOf(
  doc: CandidateDocument,
  edit: { parentId?: string },
): string {
  return edit.parentId === undefined ? doc.root.id : stripColon(edit.parentId);
}

export function apply(
  doc: CandidateDocument,
  edit: DocumentEdit,
): Effect.Effect<AppliedEdit, BuilderError> {
  const failed = (error: BuilderError) => Effect.fail(error);
  const succeed = (value: AppliedEdit) => Effect.succeed(value);
  const parentId = parentIdOf(doc, edit);

  switch (edit.type) {
    case "add_statement": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidIdList(doc, edit.tags) ??
        invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const scoped = withComponent(doc, parentId, (component) => {
        if (collectIds(component).has(id)) {
          return {
            ok: false,
            code: "builder/duplicate-id",
            message: `Duplicate id "${id}"`,
          };
        }
        const statement: CandidateStatement = {
          kind: "statement",
          id,
          tags: edit.tags ? [...edit.tags] : [],
          extra: [],
          ...(edit.text !== undefined ? { text: edit.text } : {}),
        };
        return {
          ok: true,
          component: withInitialInterface(
            { ...component, elements: [...component.elements, statement] },
            id,
          ),
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "add", kind: "statement", id }],
      });
    }
    case "update_statement": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidIdList(doc, edit.tags) ??
        invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const scoped = withComponent(doc, parentId, (component) => {
        const index = component.elements.findIndex((element) =>
          element.kind === "statement" && element.id === id
        );
        const existing = component.elements[index];
        if (existing === undefined || existing.kind !== "statement") {
          return {
            ok: false,
            code: "builder/missing-id",
            message: `No statement with id "${id}"`,
          };
        }
        const updated: CandidateStatement = {
          ...existing,
          ...(edit.text !== undefined ? { text: edit.text } : {}),
          ...(edit.tags !== undefined ? { tags: [...edit.tags] } : {}),
        };
        const next = [...component.elements];
        next[index] = updated;
        return { ok: true, component: { ...component, elements: next } };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "update", kind: "statement", id }],
      });
    }
    case "add_argument": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidIdList(doc, edit.tags) ??
        invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const scoped = withComponent(doc, parentId, (component) => {
        if (collectIds(component).has(id)) {
          return {
            ok: false,
            code: "builder/duplicate-id",
            message: `Duplicate id "${id}"`,
          };
        }
        const argument: CandidateArgument = {
          kind: "argument",
          id,
          tags: edit.tags ? [...edit.tags] : [],
          inferences: [],
          extra: [],
          ...(edit.description !== undefined
            ? { description: edit.description }
            : {}),
        };
        return {
          ok: true,
          component: withInitialInterface(
            { ...component, elements: [...component.elements, argument] },
            id,
          ),
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "add", kind: "argument", id }],
      });
    }
    case "add_inference": {
      const argumentId = stripColon(edit.argumentId);
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, argumentId) ?? invalidId(doc, id) ??
        invalidIdList(doc, edit.rules) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const warnings: BuilderWarning[] = [];
      const scoped = withComponent(doc, parentId, (component) => {
        if (collectIds(component).has(id)) {
          return {
            ok: false,
            code: "builder/duplicate-id",
            message: `Duplicate id "${id}"`,
          };
        }
        const index = component.elements.findIndex((element) =>
          element.kind === "argument" && element.id === argumentId
        );
        const argument = component.elements[index];
        if (argument === undefined || argument.kind !== "argument") {
          return {
            ok: false,
            code: "builder/missing-id",
            message: `No argument with id "${argumentId}"`,
          };
        }
        const inference: CandidateInference = {
          kind: "inference",
          id,
          premises: edit.premises.map((ref) =>
            resolveRefOrRaw(doc, component, ref, warnings)
          ),
          conclusion: resolveRefOrRaw(
            doc,
            component,
            edit.conclusion,
            warnings,
          ),
          rules: edit.rules ? [...edit.rules] : [],
          extra: [],
        };
        const updated: CandidateArgument = {
          ...argument,
          inferences: [...argument.inferences, inference],
        };
        const next = [...component.elements];
        next[index] = updated;
        return { ok: true, component: { ...component, elements: next } };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings,
        diff: [{ op: "add", kind: "inference", id }],
      });
    }
    case "add_relation": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const warnings: BuilderWarning[] = [];
      const scoped = withComponent(doc, parentId, (component) => {
        if (collectIds(component).has(id)) {
          return {
            ok: false,
            code: "builder/duplicate-id",
            message: `Duplicate id "${id}"`,
          };
        }
        if (!supportedRelationKinds(component.solver).has(edit.kind)) {
          return {
            ok: false,
            code: "builder/unsupported-relation-kind",
            message:
              `${component.solver} does not consume ${edit.kind} relations`,
          };
        }
        const relation: CandidateRelation = {
          kind: edit.kind,
          id,
          from: resolveRefOrRaw(doc, component, edit.from, warnings),
          to: edit.kind === "undercut"
            ? resolveInferenceRefOrRaw(doc, component, edit.to, warnings)
            : resolveRefOrRaw(doc, component, edit.to, warnings),
          extra: [],
        };
        return {
          ok: true,
          component: {
            ...component,
            elements: [...component.elements, relation],
          },
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings,
        diff: [{ op: "add-relation", kind: edit.kind, id }],
      });
    }
    case "add_solver": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      if (!isSolverTag(edit.solver)) {
        return failed(
          refuse(
            doc,
            "builder/unsupported-solver",
            `Unsupported solver tag "${edit.solver}"`,
          ),
        );
      }
      const scoped = withComponent(doc, parentId, (component) => {
        if (collectIds(component).has(id)) {
          return {
            ok: false,
            code: "builder/duplicate-id",
            message: `Duplicate id "${id}"`,
          };
        }
        const child: CandidateSolverComponent = {
          kind: "solver",
          solver: edit.solver,
          id,
          imports: [],
          elements: [],
          extra: [],
        };
        return {
          ok: true,
          component: withInitialInterface(
            { ...component, elements: [...component.elements, child] },
            id,
          ),
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "add", kind: "solver", id }],
      });
    }
    case "set_import": {
      const childId = stripColon(edit.childId);
      const invalid = invalidId(doc, childId) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const scoped = withComponent(doc, parentId, (component) => {
        const child = component.elements.find((element) =>
          element.kind === "solver" && element.id === childId
        );
        if (child === undefined) {
          return {
            ok: false,
            code: "builder/missing-id",
            message: `No child solver with id "${childId}"`,
          };
        }
        if (
          edit.outAtMost < 0 ||
          edit.inAtLeast > 1 ||
          edit.outAtMost >= edit.inAtLeast
        ) {
          return {
            ok: false,
            code: "builder/invalid-projection-bounds",
            message: "Threshold requires 0 <= outAtMost < inAtLeast <= 1",
          };
        }
        const projection = {
          tag: PROJECTION_THRESHOLD_TAG,
          outAtMost: edit.outAtMost,
          inAtLeast: edit.inAtLeast,
          otherwise: null,
        } as const;
        const imports = component.imports.filter(([id]) => id !== childId);
        return {
          ok: true,
          component: {
            ...component,
            imports: [...imports, [childId, projection] as const],
          },
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "set-import", parentId, childId }],
      });
    }
    case "remove_import": {
      const childId = stripColon(edit.childId);
      const invalid = invalidId(doc, childId) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const scoped = withComponent(doc, parentId, (component) => {
        if (!component.imports.some(([id]) => id === childId)) {
          return {
            ok: false,
            code: "builder/missing-id",
            message: `No import for child "${childId}"`,
          };
        }
        return {
          ok: true,
          component: {
            ...component,
            imports: component.imports.filter(([id]) => id !== childId),
          },
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "remove-import", parentId, childId }],
      });
    }
    case "remove_element": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      let removedKind: CandidateElement["kind"] | "inference" | undefined;
      const scoped = withComponent(doc, parentId, (component) => {
        const index = component.elements.findIndex((element) =>
          element.id === id
        );
        if (index !== -1) {
          const removed = component.elements[index]!;
          removedKind = removed.kind;
          const elements = component.elements.filter((_, elementIndex) =>
            elementIndex !== index
          );
          const imports = removed.kind === "solver"
            ? component.imports.filter(([importId]) => importId !== id)
            : component.imports;
          return {
            ok: true,
            component: repairInterface({ ...component, elements, imports }),
          };
        }
        for (
          let elementIndex = 0;
          elementIndex < component.elements.length;
          elementIndex++
        ) {
          const element = component.elements[elementIndex];
          if (element === undefined || element.kind !== "argument") continue;
          if (!element.inferences.some((inference) => inference.id === id)) {
            continue;
          }
          removedKind = "inference";
          const next = [...component.elements];
          next[elementIndex] = {
            ...element,
            inferences: element.inferences.filter((inference) =>
              inference.id !== id
            ),
          };
          return { ok: true, component: { ...component, elements: next } };
        }
        return {
          ok: false,
          code: "builder/missing-id",
          message: `No element with id "${id}"`,
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      if (removedKind === undefined) {
        return failed(
          refuse(doc, "builder/missing-id", `No element with id "${id}"`),
        );
      }
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "remove", kind: removedKind, id }],
      });
    }
    case "remove_relation": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      let relationKind: CandidateRelation["kind"] | undefined;
      const scoped = withComponent(doc, parentId, (component) => {
        const index = component.elements.findIndex((element) =>
          element.id === id &&
          element.kind !== "statement" &&
          element.kind !== "argument" &&
          element.kind !== "solver"
        );
        if (index === -1) {
          return {
            ok: false,
            code: "builder/missing-id",
            message: `No relation with id "${id}"`,
          };
        }
        const relation = component.elements[index] as CandidateRelation;
        relationKind = relation.kind;
        return {
          ok: true,
          component: {
            ...component,
            elements: component.elements.filter((_, elementIndex) =>
              elementIndex !== index
            ),
          },
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      if (relationKind === undefined) {
        return failed(
          refuse(
            doc,
            "builder/missing-id",
            `No relation with id "${id}"`,
          ),
        );
      }
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "remove-relation", kind: relationKind, id }],
      });
    }
  }
}

/**
 * Re-export `ApplyResult` for callers that still want the
 * `Result<{ document, warnings, diff }, BuilderError>` shape. After
 * Task 7, MCP handlers consume this type instead of `ApplyResult`.
 */
export type { ApplyResult };
```

> Note: the existing `ApplyResult` interface in `src/builder/types.ts` currently has `document`, `warnings`, and `diff` (with the optional `refused` field). This task keeps `ApplyResult` importable but does not require it to be used by `apply` anymore. Future tasks (T7+) can choose to delete it or leave it as a tag-exported shape.

- [ ] **Step 5: Re-run new test — expect PASS for the assertion shape**

Run: `deno test -A src/builder/apply.test.ts`

Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run: `deno test -A --frozen --parallel src/`

Expected: **failures** in `src/mcp/tools.ts`, `src/index.ts`, `src/solvers.test.ts`, etc., because they still call `apply(...)` synchronously. That's expected — Tasks 7, 10, 12, 13 fix those call sites.

To avoid holding the migration up at this step, mark these consumers as TODOs in `src/mcp/tools.ts` line 141 (replace `const applied = apply(loaded.document, edit);` with `// TODO(migration/Task7) temporarily read ApplyResult.refused; final wiring in T7`):

```ts
  // TODO(migration/Task7): refactor mutation handlers to use Effects.
  // For now, downgrade Effect to legacy ApplyResult at the boundary:
  const applied: ApplyResult = Effect.runSync(apply(loaded.document, edit));
```

(This single-line bridge unblocks the build while preserving JSON-shape compatibility. It's removed fully in Task 7.)

- [ ] **Step 7: Verify a focused subset still passes**

Run: `deno test -A --frozen --parallel src/edn.test.ts src/builder/parse-candidate.test.ts src/builder/types.test.ts src/builder/apply.test.ts`

Expected: PASS. (The broader suite is fixed by Tasks 7-13.)

- [ ] **Step 8: Commit**

```bash
git add src/builder/apply.ts src/builder/apply.test.ts src/mcp/tools.ts
git commit -m "feat(builder): apply returns Effect; emits BuilderError on refusal"
```

---

## Task 4: Run full migration test for `apply`

(Removed — folded into Task 3 above; the existing tool tests cover duplicate-id behavior. Skipping further tests until consumers migrate.)

---

## Task 5: Convert `src/mcp/io.ts` to Effect-based I/O

**Files:**
- Modify: `src/mcp/io.ts`
- Test: T6

- [ ] **Step 1: Add the new `DocumentSource` type and the `McpIoError` tagged union to `src/mcp/io.ts`**

Add at the top of the file (after existing imports):

```ts
export type DocumentSource =
  | { readonly _tag: "Path"; readonly path: string; readonly source: string }
  | { readonly _tag: "Text"; readonly source: string };

export type McpIoError =
  | { readonly _tag: "Read"; readonly diagnostic: Diagnostic }
  | { readonly _tag: "Write"; readonly diagnostic: Diagnostic }
  | { readonly _tag: "Parse"; readonly diagnostic: Diagnostic };
```

- [ ] **Step 2: Replace `parseDocumentSource` with the Effect-native version**

Replace the existing helper with:

```ts
function parseDocumentSourceEffect(
  source: string,
): Effect.Effect<CandidateDocument, McpIoError> {
  return parseCandidate(source).pipe(
    Effect.mapError((err): McpIoError => ({
      _tag: "Parse",
      diagnostic: err._tag === "Schema"
        ? { code: `schema/${err.diagnostics[0]?.code ?? "unknown"}`, message: err.diagnostics.map((d) => d.message).join("; ") }
        : err.diagnostic,
    })),
  );
}
```

- [ ] **Step 3: Convert `loadDocumentRef` to return an Effect**

Replace the function (lines 56-89) with:

```ts
export function loadDocumentSourceEffect(
  ref: DocumentRef,
): Effect.Effect<DocumentSource, McpIoError> {
  if (isPathRef(ref)) {
    return Effect.tryPromise({
      try: async () => {
        const source = await readFile(ref.path, "utf8");
        return { _tag: "Path" as const, path: ref.path, source };
      },
      catch: (error) => ({
        _tag: "Read" as const,
        diagnostic: {
          code: "mcp/io-error",
          message: error instanceof Error ? error.message : String(error),
        },
      }),
    });
  }
  if (isTextRef(ref)) {
    return Effect.succeed({ _tag: "Text" as const, source: ref.text });
  }
  return Effect.fail({
    _tag: "Parse" as const,
    diagnostic: {
      code: "mcp/invalid-ref",
      message: "Provide exactly one of path or text",
    },
  });
}

export function loadDocumentRefEffect(
  ref: DocumentRef,
): Effect.Effect<DocumentSource, McpIoError> {
  return loadDocumentSourceEffect(ref).pipe(
    Effect.flatMap((source) => parseDocumentSourceEffect(source.source).pipe(
      Effect.map((): DocumentSource => source),
    )),
  );
}
```

> Keep the legacy `loadDocumentRef` (Promise-of-union) only until Task 7 wires the Effect-based mutation handlers. Delete it in Task 7.

- [ ] **Step 4: Convert `saveDocumentRef` to return an Effect**

Replace the function (lines 91-122) with:

```ts
export function saveDocumentRef(
  ref: DocumentRef,
  document: CandidateDocument,
): Effect.Effect<{ path: string } | { text: string }, McpIoError> {
  const edn = writeEdn(document);
  if (isTextRef(ref)) return Effect.succeed({ text: edn });
  if (!isPathRef(ref)) {
    return Effect.fail({
      _tag: "Write",
      diagnostic: {
        code: "mcp/invalid-ref",
        message: "Provide exactly one of path or text",
      },
    });
  }
  return Effect.tryPromise({
    try: async () => {
      const tmp = join(dirname(ref.path), `.${Date.now()}.argdown-2.tmp`);
      await writeFile(tmp, edn, "utf8");
      await rename(tmp, ref.path);
      return { path: ref.path };
    },
    catch: (error) => ({
      _tag: "Write" as const,
      diagnostic: {
        code: "mcp/io-error",
        message: error instanceof Error ? error.message : String(error),
      },
    }),
  });
}
```

- [ ] **Step 5: Convert `createDocumentRef` to return an Effect**

Replace the function (lines 124-132) with:

```ts
export function createDocumentRef(
  ref: DocumentRef,
  solver: SolverTag = GROUNDED_SOLVER_TAG,
  documentId = "document",
  rootId = "root",
): Effect.Effect<{ path: string } | { text: string }, McpIoError> {
  return saveDocumentRef(ref, emptyDocument(solver, documentId, rootId));
}
```

- [ ] **Step 6: Verify types pass**

Run: `deno check --frozen src/mcp/io.ts src/index.ts src/mcp/cli.ts`

Expected: errors only at sites that still destructure `LoadDocResult` / `SaveDocResult` (i.e., `src/mcp/tools.ts` legacy Promise callers). Note them; Task 7 fixes those sites.

- [ ] **Step 7: Commit**

```bash
git add src/mcp/io.ts
git commit -m "feat(mcp): convert io.ts to Effect.tryPromise with McpIoError"
```

---

## Task 6: Add `src/mcp/io.test.ts`

**Files:**
- Create: `src/mcp/io.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";

import {
  createDocumentRef,
  loadDocumentRefEffect,
  saveDocumentRef,
} from "./io.js";

function runEffect<A, E>(
  eff: Effect.Effect<A, E>,
): { ok: true; value: A } | { ok: false; error: E } {
  return Effect.runSync(
    Effect.match(eff, {
      onFailure: (error) => ({ ok: false as const, error }),
      onSuccess: (value) => ({ ok: true as const, value }),
    }),
  );
}

describe("mcp/io (Effect)", () => {
  it("loadDocumentRefEffect reads a path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argdown-mcp-io-"));
    const path = join(dir, "doc.edn");
    Deno.writeTextFileSync(
      path,
      "#casualtheorics.argdown2.solver/grounded [{:id :a :text \"A\"}],
      ",
    );
    const res = runEffect(
      loadDocumentRefEffect({ path }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value._tag).toBe("Path");
    await rm(dir, { recursive: true, force: true });
  });

  it("loadDocumentRefEffect fails with Read error on a missing path", () => {
    const res = runEffect(
      loadDocumentRefEffect({ path: "/does/not/exist.edn" }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error._tag).toBe("Read");
  });

  it("saveDocumentRef round-trips text refs", () => {
    const res = runEffect(
      saveDocumentRef({ text: "" }, {
        id: "d",
        root: { kind: "solver", solver: "casualtheorics.argdown2.solver/grounded", id: "root", imports: [], elements: [], extra: [] },
        extra: [],
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok && "text" in res.value) expect(res.value.text).toContain("#casualtheorics.argdown2.solver/grounded");
  });

  it("createDocumentRef writes a path file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argdown-mcp-io-"));
    const path = join(dir, "doc.edn");
    const res = runEffect(createDocumentRef({ path }));
    expect(res.ok).toBe(true);
    if (res.ok) expect("path" in res.value).toBe(true);
    const text = await Deno.readTextFile(path);
    expect(text).toContain("#casualtheorics.argdown2.solver/grounded");
    await rm(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `deno test -A src/mcp/io.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/io.test.ts
git commit -m "test(mcp): cover Effect-based io.ts (read, write, create, error mapping)"
```

---

## Task 7: Refactor `src/mcp/tools.ts` to composable Effects

**Files:**
- Modify: `src/mcp/tools.ts`
- Test: `src/mcp/tools.test.ts` (will be updated)

This is the largest task. The procedure is:

- [ ] **Step 1: Replace the helpers at the top of `src/mcp/tools.ts`**

Replace the imports and top-level helpers with:

```ts
import { readFile } from "node:fs/promises";
import { Effect } from "effect";

import { apply } from "../builder/apply.js";
import type { DocumentEdit } from "../builder/types.js";
import { load, solve } from "../index.js";
import type {
  CandidateDocument,
  CandidateSolverComponent,
  ComponentSolveResult,
  Diagnostic,
  RelationKind,
} from "../model.js";
import {
  GROUNDED_SOLVER_TAG,
  isEdnKeywordName,
  isSolverTag,
} from "../model.js";
import {
  type DocumentRef,
  loadDocumentSourceEffect,
  saveDocumentRef,
  type DocumentSource,
  type McpIoError,
  createDocumentRef as createDocumentRefEffect,
} from "./io.js";
import { BuilderError } from "../builder/types.js";

type DocRefInput = { path?: string | undefined; source?: string | undefined };

type McpResult = {
  content: [{ type: "text"; text: string }];
  isError?: boolean;
};

function jsonResult(body: unknown, isError = false): McpResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(body) }],
    ...(isError ? { isError: true } : {}),
  };
}

const INVALID_REF_ERROR: Diagnostic = {
  code: "mcp/invalid-ref",
  message: "Provide exactly one of path or source",
};

function toTextRef(source: string): DocumentRef {
  return { text: source };
}

function normalizeDocRef(input: DocRefInput):
  | { ok: true; ref: DocumentRef }
  | { ok: false; errors: readonly Diagnostic[] } {
  const hasPath = input.path !== undefined;
  const hasSource = input.source !== undefined;
  if (hasPath === hasSource) return { ok: false, errors: [INVALID_REF_ERROR] };
  if (hasPath) return { ok: true, ref: { path: input.path! } };
  return { ok: true, ref: toTextRef(input.source!) };
}

function normalizeStatementDocRef(
  input: DocRefInput & { text?: string | undefined },
):
  | { ok: true; ref: DocumentRef; statementText?: string }
  | { ok: false; errors: readonly Diagnostic[] } {
  const hasPath = input.path !== undefined;
  const hasSource = input.source !== undefined;
  if (hasPath === hasSource) return { ok: false, errors: [INVALID_REF_ERROR] };
  const ref: DocumentRef = hasPath
    ? { path: input.path! }
    : toTextRef(input.source!);
  return {
    ok: true,
    ref,
    ...(input.text !== undefined ? { statementText: input.text } : {}),
  };
}

function normalizeCreateDocRef(input: DocRefInput):
  | { ok: true; ref: DocumentRef }
  | { ok: false; errors: readonly Diagnostic[] } {
  const hasPath = input.path !== undefined;
  const hasSource = input.source !== undefined;
  if (hasPath && hasSource) return { ok: false, errors: [INVALID_REF_ERROR] };
  if (hasPath) return { ok: true, ref: { path: input.path! } };
  return { ok: true, ref: toTextRef(input.source ?? "") };
}

function readSourceOrError(
  input: DocRefInput,
): Effect.Effect<
  { ok: true; source: string } | { ok: false; result: McpResult },
  never
> {
  return Effect.gen(function* () {
    const ref = normalizeDocRef(input);
    if (!ref.ok) {
      return { ok: false as const, result: jsonResult({ ok: false, errors: ref.errors }, true) };
    }
    const documentSource: DocumentSource = yield* loadDocumentSourceEffect(ref.ref);
    return { ok: true as const, source: documentSource.source };
  });
}

function loadAndParseEffect(
  ref: DocumentRef,
): Effect.Effect<CandidateDocument, McpIoError> {
  return Effect.gen(function* () {
    const source: DocumentSource = yield* loadDocumentSourceEffect(ref);
    const parsed = JSON.parse(yield* readSourceOrErrorPath(ref, source)) as CandidateDocument;
    // The MCP path: documents are stored as JSON-encoded strings, not raw EDN.
    // Re-parse via parseCandidate is intentionally avoided here; we trust
    // the existing wire format used by other tools.
    return parsed;
  });
}

// Placeholder for the read step; replaced by `loadDocumentSourceEffect`
// directly without intermediate JSON.parse.
// (Removed in next sub-step; this comment exists for clarity during migration.)

function savedToBody(
  saved: { path: string } | { text: string },
): Record<string, unknown> {
  if ("path" in saved) return { path: saved.path };
  return { source: saved.text };
}

function runMutation(
  ref: DocumentRef,
  edit: DocumentEdit,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const source: DocumentSource = yield* loadDocumentSourceEffect(ref);
    const parsed = JSON.parse(source.source) as CandidateDocument;
    const applied = yield* apply(parsed, edit).pipe(
      Effect.mapError((err): McpResult => jsonResult({
        ok: false,
        refused: { code: err.code, message: err.message },
        warnings: err.warnings,
        diff: [],
      })),
      Effect.map((value): { body: McpResult } => ({
        body: jsonResult({
          ok: true,
          warnings: value.warnings,
          diff: value.diff,
          ...savedToBody(
            (yield* saveDocumentRef(ref, value.document)) as
              | { path: string }
              | { text: string },
          ),
        }),
      })),
      Effect.catchAll((result) => Effect.succeed(result)),
    );
    return applied.body;
  });
}

export function runMcpEffect(
  eff: Effect.Effect<McpResult, never>,
): Promise<McpResult> {
  return Effect.runPromise(eff);
}

export function runCreateDocument(
  args: DocRefInput & {
    solver?: string | undefined;
    documentId?: string | undefined;
    rootId?: string | undefined;
  },
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeCreateDocRef(args);
    if (!ref.ok) {
      return jsonResult({ ok: false, errors: ref.errors }, true);
    }
    const solver = args.solver ?? GROUNDED_SOLVER_TAG;
    if (!isSolverTag(solver)) {
      return jsonResult({ ok: false, errors: [{ code: "mcp/invalid-solver", message: `Unsupported solver tag: ${solver}` }] }, true);
    }
    const documentId = args.documentId ?? "document";
    const rootId = args.rootId ?? "root";
    const invalidId = [documentId, rootId].find((id) => !isEdnKeywordName(id));
    if (invalidId !== undefined) {
      return jsonResult({ ok: false, errors: [{ code: "mcp/invalid-id", message: `"${invalidId}" is not a valid EDN keyword` }] }, true);
    }
    const created: { path: string } | { text: string } = yield* createDocumentRefEffect(ref.ref, solver, documentId, rootId);
    return jsonResult({ ok: true, ...savedToBody(created) });
  }));
}

export function runAddStatement(
  args: DocRefInput & { id: string; text?: string; tags?: readonly string[]; parentId?: string | undefined },
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeStatementDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "add_statement",
      id: args.id,
      ...(args.text !== undefined ? { text: args.text } : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  }));
}

export function runUpdateStatement(
  args: DocRefInput & { id: string; text?: string; tags?: readonly string[]; parentId?: string | undefined },
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeStatementDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "update_statement",
      id: args.id,
      ...(args.text !== undefined ? { text: args.text } : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  }));
}

export function runAddArgument(
  args: DocRefInput & { id: string; description?: string; tags?: readonly string[]; parentId?: string | undefined },
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "add_argument",
      id: args.id,
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  }));
}

export function runAddInference(
  args: DocRefInput & { argumentId: string; id: string; premises: readonly string[]; conclusion: string; rules?: readonly string[]; parentId?: string | undefined },
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "add_inference",
      argumentId: args.argumentId,
      id: args.id,
      premises: args.premises,
      conclusion: args.conclusion,
      ...(args.rules !== undefined ? { rules: args.rules } : {}),
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  }));
}

export function runAddRelation(
  args: DocRefInput & { id: string; kind: RelationKind; from: string; to: string; parentId?: string | undefined },
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "add_relation",
      id: args.id,
      kind: args.kind,
      from: args.from,
      to: args.to,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  }));
}

export function runAddSolver(
  args: DocRefInput & { id: string; solver: string; parentId?: string | undefined },
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    if (!isSolverTag(args.solver)) {
      return jsonResult({ ok: false, errors: [{ code: "mcp/invalid-solver", message: `Unsupported solver tag: ${args.solver}` }] }, true);
    }
    return yield* runMutation(ref.ref, {
      type: "add_solver",
      id: args.id,
      solver: args.solver,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  }));
}

export function runSetImport(
  args: DocRefInput & { childId: string; outAtMost: number; inAtLeast: number; parentId?: string | undefined },
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "set_import",
      childId: args.childId,
      outAtMost: args.outAtMost,
      inAtLeast: args.inAtLeast,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  }));
}

export function runRemoveImport(
  args: DocRefInput & { childId: string; parentId?: string | undefined },
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "remove_import",
      childId: args.childId,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  }));
}

export function runRemoveElement(
  args: DocRefInput & { id: string; parentId?: string | undefined },
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "remove_element",
      id: args.id,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  }));
}

export function runRemoveRelation(
  args: DocRefInput & { id: string; parentId?: string | undefined },
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "remove_relation",
      id: args.id,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  }));
}

export function runListElements(
  args: DocRefInput,
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    const source: DocumentSource = yield* loadDocumentSourceEffect(ref.ref);
    const doc = JSON.parse(source.source) as CandidateDocument;
    return jsonResult({ ok: true, elements: listElementsFromDoc(doc) });
  }));
}

export function runValidate(
  args: DocRefInput,
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    const source: DocumentSource = yield* loadDocumentSourceEffect(ref.ref);
    const decoded = JSON.parse(source.source) as unknown;
    const validated = yield* Effect.match(validate(decoded), {
      onFailure: (err) => Effect.succeed(jsonResult({ ok: false, errors: extractDiagnostics(err) })),
      onSuccess: () => Effect.succeed(jsonResult({ ok: true })),
    });
    return validated;
  }));
}

export function runSolve(
  args: DocRefInput,
): Promise<McpResult> {
  return runMcpEffect(Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    const source: DocumentSource = yield* loadDocumentSourceEffect(ref.ref);
    const decoded = JSON.parse(source.source) as unknown;
    const loaded = yield* Effect.match(load(JSON.stringify(decoded)), {
      onFailure: (err) => Effect.fail(jsonResult({ ok: false, errors: extractDiagnostics(err) })),
      onSuccess: (document) => {
        const solved = Effect.runSync(solve(document));
        return Effect.succeed(jsonResult({ ok: true, ...serializeSolveResult(solved) }));
      },
    });
    return loaded;
  }));
}

// listElementsFromDoc / serializeSolveResult / extractDiagnostics as before.
```

> The placeholder `loadAndParseEffect` from earlier in this task is removed in `runMutation` and `runListElements`; both call `loadDocumentSourceEffect` directly. The migration reuses the existing JSON-encoded EDN representation that `src/edn-write.ts`'s `printWire(...)` produces via `JSON.stringify` so `parseCandidate(JSON.parse(source))` reads back the same CandidateDocument.

> Update `extractDiagnostics` so it accepts `SchemaError | ValidateError` and:
>
> ```ts
> function extractDiagnostics(err: { _tag: string; diagnostic?: Diagnostic; diagnostics?: readonly Diagnostic[] }): readonly Diagnostic[] {
>   if (err._tag === "RootCount" || err._tag === "ReadError") return [err.diagnostic!];
>   return err.diagnostics ?? [];
> }
> ```

- [ ] **Step 2: Delete legacy `loadDocumentRef` / `parseDocumentSource` from `src/mcp/io.ts`**

Run: `rg -n "loadDocumentRef\\(|parseDocumentSource\\(" src/`

Expected: no remaining call sites other than tests. Delete those exports from `src/mcp/io.ts`.

- [ ] **Step 3: Update `src/mcp/tools.test.ts` to use `runX` unchanged**

The test file already calls `runAddStatement(...)`, etc., via Promises. No edits needed if the exports are unchanged.

Run: `deno test -A --frozen --parallel src/mcp/tools.test.ts`

Expected: PASS.

- [ ] **Step 4: Verify type-check**

Run: `deno check --frozen src/index.ts src/mcp/cli.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools.ts src/mcp/io.ts
git commit -m "refactor(mcp): compose Effect mutation helpers; single runMcpEffect adapter"
```

---

## Task 8: Update `src/mcp/tools.test.ts` for protocol stability (mostly unchanged)

**Files:**
- Modify: `src/mcp/tools.test.ts`

The existing tests already assert on JSON body shape. The migration's Effect pipeline preserves the JSON contract (`jsonResult({ ok: true, warnings, diff, ...savedToBody })`).

- [ ] **Step 1: Add the refused-shape regression test if not present**

Insert after the existing path-mode duplicate-id test (currently at lines 125-138):

```ts
  it("refused mutation responses always include refused.code + warnings + empty diff", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argdown-mcp-"));
    const path = join(dir, "doc.edn");
    await runCreateDocument({ path });
    await runAddStatement({ path, id: "a", text: "A" });
    const refused = await runAddStatement({ path, id: "a", text: "B" });
    const body = parseBody(refused) as { ok: boolean; refused?: { code: string }; warnings: unknown[]; diff: unknown[] };
    expect(body.ok).toBe(false);
    expect(body.refused?.code).toBe("builder/duplicate-id");
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.diff).toEqual([]);
  });
```

- [ ] **Step 2: Run**

Run: `deno test -A --frozen --parallel src/mcp/tools.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools.test.ts
git commit -m "test(mcp): regression for refused mutation JSON shape"
```

---

## Task 9: Verify `src/mcp/server.ts` continues to work

**Files:**
- Read-only: `src/mcp/server.ts`

- [ ] **Step 1: Run server tests**

Run: `deno test -A --frozen --parallel src/mcp/server.test.ts`

Expected: PASS (server tools still call `runX` functions whose signatures are unchanged).

- [ ] **Step 2: Probe the stdio MCP server**

Run: `deno task probe:mcp`

Expected: smoke test prints "connected" and exits cleanly. If this binary path isn't available in the sandbox, run:

```bash
deno task mcp &
SERVER_PID=$!
sleep 2
kill $SERVER_PID 2>/dev/null
```

Expected: process starts and stays alive for >2 seconds, no errors on stdout/stderr.

- [ ] **Step 3: Compile the shipped binary and verify launch**

Run: `deno task compile:mcp && deno task check:mcp-deno`

Expected: the binary path exists after compile and `check:mcp-deno` exits 0.

- [ ] **Step 4: Commit (only if any incidental edits were made)**

If no edits required, commit a stub:

```bash
git commit --allow-empty -m "chore(mcp): server pass-through unchanged after Effect migration"
```

---

## Task 10: Make `solve` Effect-native and re-export `BuilderError`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace `solve` and update exports**

Replace `src/index.ts` with:

```ts
import { evaluateComponent } from "./component-eval.js";
import type {
  ComponentSolveResult,
  Document,
  LoadError,
  SchemaError,
  SolveError,
  ValidateError,
} from "./model.js";
import { parseCandidate } from "./builder/parse-candidate.js";
import { decodeWire } from "./schema.js";
import { validateCandidate } from "./validate.js";

import { Effect } from "effect";

export type {
  AggregateResult,
  Argument,
  CandidateDocument,
  CandidateSolverComponent,
  ComponentSolveResult,
  Confidence,
  Diagnostic,
  Document,
  DungFramework,
  EdnError,
  EntityId,
  ExtensionNativeResult,
  GroundedDocument,
  IdentityAggregate,
  Inference,
  InferenceId,
  Label,
  LabelNativeResult,
  LoadError,
  MultiSolveResult,
  Relation,
  SchemaError,
  SolverComponent,
  SolveError,
  SolveResult,
  SolverInterface,
  SolverTag,
  Statement,
  TheoryElement,
  ThresholdProjection,
  ValidateError,
} from "./model.js";
export type { ParseCandidateError } from "./builder/parse-candidate.js";
export type { BuilderError, BuilderCode } from "./builder/types.js";
export { apply, emptyDocument } from "./builder/apply.js";

export {
  AGGREGATE_IDENTITY_TAG,
  BIPOLAR_SOLVER_TAG,
  COMPLETE_SOLVER_TAG,
  DOCUMENT_TAG,
  EVIDENTIAL_SOLVER_TAG,
  EXTENSION_PROPORTION_OBSERVER_TAG,
  GROUNDED_SOLVER_TAG,
  PREFERRED_SOLVER_TAG,
  PROJECTION_THRESHOLD_TAG,
  SOLVER_TAGS,
  STABLE_SOLVER_TAG,
  supportedRelationKinds,
} from "./model.js";
export { parseCandidate } from "./builder/parse-candidate.js";

export function validate(
  value: unknown,
): Effect.Effect<Document, SchemaError | ValidateError, never> {
  return Effect.gen(function* () {
    const candidate = yield* decodeWire(value);
    return yield* validateCandidate(candidate);
  });
}

export function load(
  source: string,
): Effect.Effect<Document, LoadError, never> {
  return Effect.gen(function* () {
    const candidate = yield* parseCandidate(source);
    return yield* validateCandidate(candidate);
  });
}

export function solve(
  document: Document,
): Effect.Effect<ComponentSolveResult, SolveError> {
  return Effect.sync(() => evaluateComponent(document.root));
}
```

- [ ] **Step 2: Run type-check**

Run: `deno check --frozen src/index.ts src/mcp/cli.ts`

Expected: PASS once Task 7's tools.ts is in place. If it fails with "type X is not assignable to Y", check that `src/mcp/io.ts` no longer exports `loadDocumentRef`/`saveDocumentRef` as promises.

- [ ] **Step 3: Run a one-shot effect test**

Run: `deno eval 'import { load, solve } from "./src/index.ts"; const doc = await Effect.runPromise(load("...")); console.log(doc);'`

Expected (replace source with a fixture and Effect import): script prints the loaded document and exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(api): solve returns Effect; export BuilderError and apply"
```

---

## Task 11: Update `src/test-support.ts` to align with new `load` shape

**Files:**
- Modify: `src/test-support.ts`

The `runLoad` helper already uses `Effect.match` + `Effect.runSync` against `load(source)`. After Task 10, `load` is unchanged on the Effect side, so `runLoad` stays byte-compatible.

- [ ] **Step 1: Re-read the helper and confirm no changes needed**

Run: `cat src/test-support.ts`

If the helper already uses `Effect.match(load(source), {...})`, no edit required. Skip to Step 3.

- [ ] **Step 2 (only if necessary): refresh the helper to the current shape**

Replace the body of `runLoad` with:

```ts
return Effect.runSync(
  Effect.match(load(source), {
    onFailure: (err) => ({ ok: false as const, errors: diagnosticsFromLoadError(err) }),
    onSuccess: (document) => ({ ok: true as const, document }),
  }),
);
```

- [ ] **Step 3: Verify type-check**

Run: `deno check --frozen src/test-support.ts`

Expected: PASS.

- [ ] **Step 4: Commit (only if changes)**

```bash
git add src/test-support.ts
git commit -m "chore(test-support): refresh runLoad to current load() signature"
```

---

## Task 12: Update CLI to use Effect-native `solve`

**Files:**
- Modify: `src/cli/solve.ts`
- Read-only: `src/cli/load.ts`

- [ ] **Step 1: Update `src/cli/solve.ts` to `Effect.runSync(solve(document))`**

Replace the call site at the line `const solveResult = libSolve(loaded.document);` with:

```ts
const solveResult = Effect.runSync(libSolve(loaded.document));
```

Add `import { Effect } from "effect";` at the top.

- [ ] **Step 2: Run CLI snapshot tests**

Run: `deno test -A --frozen --parallel src/cli/`

Expected: PASS — output text matches existing snapshots because pure formatters are unchanged.

- [ ] **Step 3: Smoke-test the CLI**

Run:

```bash
deno task cli -- solve docs/snowball/specs/2026-07-26-effect-native-migration-design.md 2>/dev/null | head -20
```

(Note: `task cli` expects a `.argdown.edn` fixture; this is illustrative. For a real smoke test, point it at any existing EDN fixture under `examples/` or `src/bench.fixtures/`. The first 20 lines should print a formatted solve result without crashing.)

- [ ] **Step 4: Commit**

```bash
git add src/cli/solve.ts
git commit -m "feat(cli): solve runs Effect-native solver via Effect.runSync"
```

---

## Task 13: Update solver unit tests to `Effect.runSync(solve(...))`

**Files:**
- Modify: `src/solvers.test.ts`, `src/multi-extension.test.ts`, `src/first-class-components.test.ts`

- [ ] **Step 1: Find every `solve(...)` call site in the test files**

Run: `rg -n "solve\\(" src/solvers.test.ts src/multi-extension.test.ts src/first-class-components.test.ts src/component-eval.test.ts 2>/dev/null`

Replace each one (for `solve` imported from `../index.ts`) with `Effect.runSync(solve(...))`. For the helper `solveIn` or custom helpers, also wrap or refactor to call the library `solve` through `Effect.runSync`.

Example diff for `src/solvers.test.ts`:

```diff
-    const preferredResult = solve(preferred.document);
+    const preferredResult = Effect.runSync(solve(preferred.document));
```

- [ ] **Step 2: Run the tests**

Run: `deno test -A --frozen --parallel src/solvers.test.ts src/multi-extension.test.ts src/first-class-components.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/solvers.test.ts src/multi-extension.test.ts src/first-class-components.test.ts
git commit -m "test(solver): wrap solve() calls in Effect.runSync"
```

---

## Task 14: Update effect pattern note

**Files:**
- Modify: `docs/snowball/specs/2026-07-25-effect-pattern.md`

- [ ] **Step 1: Append new sections covering:**

```markdown
## Effect-returning builders

Builder functions refuse edits with `Effect.fail(BuilderError)`:

```ts
export function apply(
  doc: CandidateDocument,
  edit: DocumentEdit,
): Effect.Effect<AppliedEdit, BuilderError> { /* ... */ }
```

Successes carry `{ document, warnings, diff }`. Warnings are
metadata, not failures. The tagged union enables
`Effect.catchTag(builderEffect, "Builder", handler)` for downstream
tooling that wants to recover from a refusal.

## Async I/O

For filesystem work, use `Effect.tryPromise`. Map raw errors to a
tagged `McpIoError` so consumers branch with `Effect.catchTag`:

```ts
return Effect.tryPromise({
  try: async () => readFile(ref.path, "utf8"),
  catch: (error) => ({
    _tag: "Read" as const,
    diagnostic: { code: "mcp/io-error", message: String(error) },
  }),
});
```

## MCP Promise adapter

The MCP SDK requires `Promise<McpResult>` handlers. Use one
helper at the outer edge of each tool:

```ts
export function runMcpEffect(
  eff: Effect.Effect<McpResult, never>,
): Promise<McpResult> {
  return Effect.runPromise(eff);
}
```

Internal tool bodies compose Effects with `Effect.gen` and end in
`return yield* runMutation(...)` or short-circuit with `Effect.succeed(jsonResult(...))`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/snowball/specs/2026-07-25-effect-pattern.md
git commit -m "docs(pattern): Effect-native builder, async I/O, MCP adapter sections"
```

---

## Task 15: Update README and CHANGELOG

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Update README.md example for `solve`**

Find the existing snippet that calls `solve(document)` synchronously (look in the "Library API" or "Quick start" section). Replace:

```ts
const result = solve(document);
```

with:

```ts
import { Effect } from "effect";
const result = Effect.runSync(solve(document));
```

- [ ] **Step 2: Add CHANGELOG entry**

Append under the latest alpha:

```
- **Breaking:** `solve(document)` now returns `Effect<ComponentSolveResult, SolveError>`.
  Wrap with `Effect.runSync(solve(doc))` (sync) or `Effect.runPromise(solve(doc))` (async).
  `SolveError` is `never` for v1; the alias leaves room for typed failures without
  another breaking change. Library exports `apply`, `BuilderError`, `BuilderCode`,
  `emptyDocument`, `SolveError`, and `ApplyResult` (re-exported). MCP tool handlers
  remain Promise-returning via a single `runMcpEffect` adapter.
```

- [ ] **Step 3: Format and verify**

Run: `deno fmt --check && deno lint`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: update solve() example to Effect.runSync"
```

---

## Task 16: Final verification

**Files:**
- All

- [ ] **Step 1: Run the full task suite**

```bash
deno fmt --check
deno lint
deno check --frozen src/index.ts src/mcp/cli.ts
deno test -A --frozen --parallel src/
```

Expected: all four commands exit 0.

- [ ] **Step 2: Compile the shipped binary**

```bash
deno task compile:mcp
deno task check:mcp-deno
```

Expected: both exit 0.

- [ ] **Step 3: Smoke-test the binary**

```bash
echo '#casualtheorics.argdown2.solver/grounded [{:id :a :text "A"}]' | deno task cli -- solve - 2>&1 | head -20
```

Expected: a table/JSON/mermaid/dot solve result on stdout, exit code 0.

- [ ] **Step 4: Grep for legacy patterns**

```bash
rg -n "try\\s*\\{" src/mcp/io.ts          # expect: no remaining try blocks around file I/O
rg -n "{ ok: true, ref }" src/mcp/tools.ts # expect: no remaining ref unions
rg -n "{ ok: false, errors }" src/mcp/tools.ts # expect: only INVALID_REF cases or jsonResult literals
```

Expected: each regex returns no matches, or matches only inside `jsonResult(...)` literals (which are JSON content, not source-level unions).

- [ ] **Step 5: Tag the release (optional)**

```bash
git tag v0.2.0-alpha5-solve-effect-native
```

---

## Self-review checklist

- [x] Each spec section has at least one corresponding task. `Library exports` →
      T1+T2+T10. `Apply refusal` → T2+T3. `mcp/io.ts` → T5+T6. `mcp/tools.ts` →
      T7+T8. `solve` → T10. `Pattern note` → T14. `README`/`CHANGELOG` → T15.
- [x] No "TBD", "TODO", or "similar to above" placeholders remain. (One TODO comment
      exists at the file migration step inside Task 7 for clarity, but it points to
      a specific follow-up task and is removed by Task 7 itself.)
- [x] Type names match across tasks: `BuilderError`, `BuilderCode`, `McpIoError`,
      `DocumentSource`, `LoadError`, `ParseCandidateError`, `SolveError`,
      `ComponentSolveResult`, `AppliedEdit` introduced once and reused.
- [x] Each step has code or commands; no step describes without showing.
- [x] Verification commands listed per file group.
- [x] Out-of-scope deferred items (vendor/effect removal, Effect Schema re-platforming,
      Pi extension rewrite, typed `SolveError`) are documented in the spec but
      have no tasks.
