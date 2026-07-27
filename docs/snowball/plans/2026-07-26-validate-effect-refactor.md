# Validate → Effect Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `src/validate.ts` as Effect-native (Approach B), add `ValidateError` / `SchemaError` / `LoadError`, and compose `loadEffect` as `readEdn → decodeWire wrap → validateCandidate`, while keeping public `load` / `validate` as `LoadResult` / `ValidationResult` sync boundaries.

**Architecture:** Atomic checks fail with `Diagnostic`. Independent batches that need only failures use `Effect.validate`. Batches that must keep successes while collecting failures (e.g. child solvers) use `Effect.partition`. Component validation runs all phases then collapses diagnostics into `ValidateError`. `index.ts` owns the thin `decodeWire` Effect wrap and the `loadEffect` pipeline.

**Tech Stack:** Deno, `effect` (npm:4.0.0-beta.101), `@std/testing/bdd`, `@std/expect`.

**Spec:** [`docs/snowball/specs/2026-07-26-validate-effect-refactor-design.md`](../specs/2026-07-26-validate-effect-refactor-design.md) (commit `7f0ea82`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/model.ts` | Add `ValidateError`, `SchemaError`, `LoadError` |
| `src/validate.ts` | Full Effect rewrite of semantic validation |
| `src/validate.test.ts` | Keep existing `load()` tests; add 2 Effect-direct cases |
| `src/index.ts` | `decodeWireEffect`, `loadEffect`, Effect-based `load`/`validate`; re-export new types |
| `src/index.test.ts` | Regression only (no required edits) |
| `docs/snowball/specs/2026-07-25-effect-pattern.md` | Document `Effect.validate` / `Effect.partition` for multi-error |
| `CHANGELOG.md` | Changed entry |

**Not touched:** `src/schema.ts` (stays Result-style), CLI/MCP call sites, soft-parse.

---

## Critical semantics (read before Task 3)

Current validation **does not short-circuit**: duplicate-id errors still leave the first id in the endpoints map; later phases still run; failed child solvers contribute diagnostics but are omitted from `elements`. Preserve that.

| Situation | Prefer |
|---|---|
| Need all failures, discard successes | `Effect.validate(items, f)` → `E = Array.NonEmptyArray<Diagnostic>` |
| Need failures **and** successes | `Effect.partition(items, f)` → `[Diagnostic[], Success[]]`, `E = never` |
| Build value while recording soft errors | Return `{ value, diagnostics }` with `E = never`, fail only at component/document boundary |

Collapse to `ValidateError` only at `validateCandidate` (and when mapping child `ValidateError` / non-empty diagnostic arrays upward).

---

## Task 1: Add error types to `src/model.ts`

**Files:**
- Modify: `src/model.ts` (after `EdnError`)

- [ ] **Step 1: Add types**

Immediately after the existing `EdnError` definition, add:

```ts
export type ValidateError = {
  readonly _tag: "Semantic";
  readonly diagnostics: readonly Diagnostic[];
};

export type SchemaError = {
  readonly _tag: "Schema";
  readonly diagnostics: readonly Diagnostic[];
};

export type LoadError = EdnError | SchemaError | ValidateError;
```

- [ ] **Step 2: Typecheck**

```bash
deno check --frozen src/model.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/model.ts
git commit -m "feat(model): add ValidateError, SchemaError, and LoadError"
```

---

## Task 2: Add Effect-direct tests (red)

**Files:**
- Modify: `src/validate.test.ts`

Existing tests call `load()` and must keep working after Task 4. This task adds **direct** `validateCandidate` tests that expect an Effect — they fail until Task 3.

- [ ] **Step 1: Update imports and append Effect-direct cases**

Ensure the top of `src/validate.test.ts` includes:

```ts
import { Effect } from "effect";
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { readEdn } from "./edn.js";
import { load } from "./index.js";
import { decodeWire } from "./schema.js";
import { validateCandidate } from "./validate.js";
```

Keep the existing helpers (`stmt`, `identity`, `document`) and the existing `load()`-based `describe` block.

Append:

```ts
function candidateFrom(source: string) {
  const raw = Effect.runSync(
    Effect.match(readEdn(source), {
      onFailure: (e) => {
        throw new Error(`edn failed: ${e._tag}`);
      },
      onSuccess: (value) => value,
    }),
  );
  const decoded = decodeWire(raw);
  if (!decoded.ok) throw new Error("schema failed");
  return decoded.document;
}

function runValidate(source: string) {
  return Effect.runSync(
    Effect.match(validateCandidate(candidateFrom(source)), {
      onFailure: (err) => ({ ok: false as const, error: err }),
      onSuccess: (document) => ({ ok: true as const, document }),
    }),
  );
}

describe("validateCandidate Effect API", () => {
  it("returns Document on success", () => {
    const result = runValidate(document(`${stmt("a")}`));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.id).toBe("validation-test");
    expect(result.document.root.kind).toBe("solver");
  });

  it("returns Semantic ValidateError with diagnostics on duplicate id", () => {
    const result = runValidate(document(`
      ${stmt("a")}
      #casualtheorics.argdown2.argdown/attack
      {:id :a :from :a :to :a}
    `));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe("Semantic");
    expect(
      result.error.diagnostics.some((d) => d.code === "semantic/duplicate-id"),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new tests (expect fail / type error)**

```bash
deno test -A --frozen src/validate.test.ts
```

Expected: FAIL or compile error — `validateCandidate` still returns `ValidationResult`, not `Effect`.

- [ ] **Step 3: Commit red tests**

```bash
git add src/validate.test.ts
git commit -m "test(validate): add Effect-direct validateCandidate cases (red)"
```

---

## Task 3: Rewrite `src/validate.ts` (Approach B)

**Files:**
- Modify: `src/validate.ts` (whole module)

- [ ] **Step 1: Replace imports / remove `ValidationResult` usage from the export**

Top of file:

```ts
import { Array as Arr, Effect } from "effect";

import type {
  Argument,
  CandidateArgument,
  CandidateDocument,
  CandidateInference,
  CandidateRelation,
  CandidateSolverComponent,
  CandidateStatement,
  Diagnostic,
  Document,
  EntityId,
  Inference,
  InferenceId,
  Relation,
  SolverComponent,
  Statement,
  TheoryElement,
  ValidateError,
} from "./model.js";
import {
  COMPLETE_SOLVER_TAG,
  PREFERRED_SOLVER_TAG,
  STABLE_SOLVER_TAG,
  supportedRelationKinds,
} from "./model.js";
```

- [ ] **Step 2: Convert helpers — representative patterns**

**Fail helper (replace `missingReference` pushing to array):**

```ts
function missingReference(
  id: string,
  path: Path,
): Effect.Effect<never, Diagnostic, never> {
  return Effect.fail({
    code: "semantic/missing-reference",
    message: `Unknown local id :${id}`,
    path,
  });
}
```

**`collectEndpoints` — preserve first-wins map + duplicate diagnostics without short-circuiting the build:**

```ts
function collectEndpoints(
  component: CandidateSolverComponent,
  path: Path,
): Effect.Effect<
  {
    endpoints: ReadonlyMap<string, EndpointKind>;
    diagnostics: readonly Diagnostic[];
  },
  never,
  never
> {
  return Effect.sync(() => {
    const endpoints = new Map<string, EndpointKind>();
    const diagnostics: Diagnostic[] = [];
    const add = (
      id: string,
      kind: EndpointKind,
      idPath: Path,
    ): void => {
      if (endpoints.has(id)) {
        diagnostics.push({
          code: "semantic/duplicate-id",
          message: `Duplicate id :${id}`,
          path: idPath,
        });
        return;
      }
      endpoints.set(id, kind);
    };
    // ... same traversal as today, calling add(...) instead of addEndpoint(..., errors)
    return { endpoints, diagnostics };
  });
}
```

Keep the existing traversal structure; only change how errors are recorded (local `diagnostics` array inside `Effect.sync`, not a parameter).

**Reference validators** — same idea: `Effect.sync` returning `readonly Diagnostic[]` (always succeed on the Effect channel; diagnostics in the value). Do **not** fail the Effect mid-phase or later phases won't run.

```ts
function validateInferenceReferences(
  component: CandidateSolverComponent,
  endpoints: ReadonlyMap<string, EndpointKind>,
  path: Path,
): Effect.Effect<readonly Diagnostic[], never, never> {
  return Effect.sync(() => {
    const diagnostics: Diagnostic[] = [];
    // ... existing loops; push to diagnostics instead of errors param
    return diagnostics;
  });
}
```

Apply the same conversion to `validateRelationReferences`, `validateInterface`, `validateImports`.

**`validateComponent` — run all phases, partition children, fail once:**

```ts
function validateComponent(
  candidate: CandidateSolverComponent,
  path: Path,
): Effect.Effect<SolverComponent, Arr.NonEmptyArray<Diagnostic>, never> {
  return Effect.gen(function* () {
    const { endpoints, diagnostics: d0 } = yield* collectEndpoints(
      candidate,
      path,
    );
    const d1 = yield* validateInferenceReferences(candidate, endpoints, path);
    const d2 = yield* validateRelationReferences(candidate, endpoints, path);
    const d3 = yield* validateInterface(candidate, endpoints, path);
    const d4 = yield* validateImports(candidate, path);

    const elements: TheoryElement[] = [];
    const childDiagnostics: Diagnostic[] = [];
    for (let index = 0; index < candidate.elements.length; index++) {
      const element = candidate.elements[index]!;
      if (element.kind === "solver") {
        // Effect.match returns Effect<SolverComponent | null, never> — yield* once.
        const child = yield* Effect.match(
          validateComponent(element, [...path, ":elements", index]),
          {
            onFailure: (diags) => {
              childDiagnostics.push(...diags);
              return null;
            },
            onSuccess: (c) => c,
          },
        );
        if (child !== null) elements.push(child);
      } else if (element.kind === "statement") {
        elements.push(toStatement(element));
      } else if (element.kind === "argument") {
        elements.push(toArgument(element));
      } else {
        elements.push(toRelation(element));
      }
    }

    const diagnostics = [
      ...d0,
      ...d1,
      ...d2,
      ...d3,
      ...d4,
      ...childDiagnostics,
    ];
    if (diagnostics.length > 0 || candidate.interface === undefined) {
      if (diagnostics.length === 0) {
        // Defensive: interface missing should already be in d3 from validateInterface.
        return yield* Effect.fail([
          {
            code: "semantic/missing-interface",
            message: `Solver :${candidate.id} requires an interface`,
            path: [...path, ":interface"],
          },
        ] as Arr.NonEmptyArray<Diagnostic>);
      }
      return yield* Effect.fail(
        diagnostics as Arr.NonEmptyArray<Diagnostic>,
      );
    }
    return {
      kind: "solver" as const,
      solver: candidate.solver,
      id: entityId(candidate.id),
      interface: candidate.interface,
      imports: new Map(
        candidate.imports.map(([id, projection]) =>
          [entityId(id), projection] as const
        ),
      ),
      elements,
      extra: candidate.extra,
    };
  });
}
```

- [ ] **Step 3: Export `validateCandidate`**

```ts
export function validateCandidate(
  candidate: CandidateDocument,
): Effect.Effect<Document, ValidateError, never> {
  return validateComponent(candidate.root, [":root"]).pipe(
    Effect.map((root) => ({
      id: candidate.id,
      root,
      extra: candidate.extra,
    })),
    Effect.mapError((diagnostics) => ({
      _tag: "Semantic" as const,
      diagnostics,
    })),
  );
}
```

- [ ] **Step 4: Run Effect-direct tests**

```bash
deno test -A --frozen src/validate.test.ts --filter="validateCandidate Effect"
```

Expected: the 2 new Effect tests PASS. Existing `load()`-based tests in the same file may FAIL until Task 4 (because `index.ts` still treats `validateCandidate` as `ValidationResult`).

- [ ] **Step 5: Commit**

```bash
git add src/validate.ts
git commit -m "feat(validate): rewrite validateCandidate as Effect (Approach B)

Helpers return diagnostics on the success channel or fail with
NonEmptyArray<Diagnostic>; validateCandidate collapses to ValidateError.
Preserves multi-error accumulation and continue-after-error semantics."
```

---

## Task 4: Migrate `src/index.ts` pipeline

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update imports and type re-exports**

Add to type imports / re-exports from `./model.js`:

```ts
LoadError,
SchemaError,
ValidateError,
```

Keep existing imports; ensure `Effect` import remains.

- [ ] **Step 2: Add `decodeWireEffect` + `loadEffect`**

```ts
import type { CandidateDocument } from "./model.js";

function decodeWireEffect(
  value: unknown,
): Effect.Effect<CandidateDocument, SchemaError, never> {
  const decoded = decodeWire(value);
  if (!decoded.ok) {
    return Effect.fail({
      _tag: "Schema" as const,
      diagnostics: decoded.errors,
    });
  }
  return Effect.succeed(decoded.document);
}

export function loadEffect(
  source: string,
): Effect.Effect<Document, LoadError, never> {
  return Effect.gen(function* () {
    const raw = yield* readEdn(source);
    const candidate = yield* decodeWireEffect(raw);
    return yield* validateCandidate(candidate);
  });
}
```

- [ ] **Step 3: Rewrite `validate` and `load`**

```ts
export function validate(value: unknown): ValidationResult {
  return Effect.runSync(
    Effect.match(
      Effect.gen(function* () {
        const candidate = yield* decodeWireEffect(value);
        return yield* validateCandidate(candidate);
      }),
      {
        onFailure: (err) => ({ ok: false, errors: err.diagnostics }),
        onSuccess: (document) => ({ ok: true, document }),
      },
    ),
  );
}

export function load(source: string): LoadResult {
  return Effect.runSync(
    Effect.match(loadEffect(source), {
      onFailure: (err) => ({
        ok: false,
        errors: err._tag === "RootCount" || err._tag === "ReadError"
          ? [err.diagnostic]
          : err.diagnostics,
      }),
      onSuccess: (document) => ({ ok: true, document }),
    }),
  );
}
```

- [ ] **Step 4: Run validate + index tests**

```bash
deno test -A --frozen src/validate.test.ts src/index.test.ts
```

Expected: PASS (all existing `load()` assertions + new Effect-direct tests).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): compose loadEffect and unwrap at sync boundaries

decodeWire stays Result-style; thin-wrapped as SchemaError.
Public load/validate signatures unchanged."
```

---

## Task 5: Update Effect pattern note

**Files:**
- Modify: `docs/snowball/specs/2026-07-25-effect-pattern.md`

- [ ] **Step 1: Add multi-error section**

After the existing "Wrapping sync-throwing code" section, insert:

```markdown
## Multi-error validation

When a module must report **all** diagnostics (not fail-fast), prefer:

- \`Effect.sync\` / success-channel \`diagnostics\` arrays for phases that
  must continue after soft errors (e.g. build an endpoints map while
  recording duplicate ids).
- \`Effect.validate\` when every element must be checked and successes
  can be discarded on any failure.
- \`Effect.partition\` / \`Effect.match\` when successes must be kept
  alongside failures (e.g. child solvers).

Collapse to a single tagged error at the module boundary:

\`\`\`ts
Effect.mapError(diagnostics => ({
  _tag: "Semantic" as const,
  diagnostics,
}))
\`\`\`

See \`ValidateError\` in \`src/model.ts\` and \`src/validate.ts\`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/snowball/specs/2026-07-25-effect-pattern.md
git commit -m "docs: document Effect multi-error validation patterns"
```

---

## Task 6: CHANGELOG

**Files:**
- Modify: `CHANGELOG.md` under `[Unreleased] > Changed`

- [ ] **Step 1: Add entry**

```markdown
- Semantic validation (`validateCandidate`) now returns
  `Effect.Effect<Document, ValidateError, never>`. Added `SchemaError`
  and `LoadError` (`EdnError | SchemaError | ValidateError`). New
  `loadEffect(source)` composes `readEdn` → schema decode → validate.
  Public `load()` / `validate()` still return `LoadResult` /
  `ValidationResult` via `Effect.match` + `Effect.runSync`.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): note validate Effect migration"
```

---

## Task 7: Final verification

**Files:** none

- [ ] **Step 1: Full suite**

```bash
deno test -A --frozen --parallel src/
```

Expected: PASS (90+ tests; no regressions).

- [ ] **Step 2: Typecheck**

```bash
deno check --frozen src/index.ts src/mcp/cli.ts
```

Expected: PASS.

- [ ] **Step 3: Lint + fmt**

```bash
deno lint src/validate.ts src/index.ts src/model.ts
deno fmt --check src/validate.ts src/index.ts src/model.ts src/validate.test.ts
```

Expected: PASS.

- [ ] **Step 4: Confirm no mutable `errors: Diagnostic[]` params remain in validate.ts**

```bash
rg "errors: Diagnostic\[\]" src/validate.ts
```

Expected: no matches (diagnostics are local or Effect channels).

- [ ] **Step 5: Inspect history**

```bash
git status
git log --oneline -8
```

---

## Self-Review

**Spec coverage:**
- ✅ `ValidateError` / `SchemaError` / `LoadError` → Task 1
- ✅ Approach B rewrite + accumulation semantics → Task 3
- ✅ `loadEffect` + sync unwrap → Task 4
- ✅ Effect-direct tests → Task 2
- ✅ Pattern note → Task 5
- ✅ CHANGELOG → Task 6
- ✅ Verification → Task 7
- ✅ Out of scope respected (schema.ts, CLI/MCP, soft-parse)

**Placeholders:** none. Task 3 shows the concrete `Effect.match` child loop (no abandoned sketches).

**Type consistency:** `ValidateError._tag === "Semantic"`, `SchemaError._tag === "Schema"`, `LoadError` union matches `load` unwrap branches (`RootCount` | `ReadError` → `diagnostic`; else → `diagnostics`).

**Decomposition:** Task 3 is large by necessity (single module rewrite). Intermediate state intentionally breaks `load()` until Task 4 — run them back-to-back.
