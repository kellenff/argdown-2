# Schema → Effect + Unified Parse Pipelines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `decodeWire` as Effect-native (Approach B), expose `parseCandidate` / `validate` / `load` as Effect compositions, and delete `DecodeResult` / `SoftParseResult` / `LoadResult` / `ValidationResult` / `loadEffect` / `decodeWireEffect` / `softParse`.

**Architecture:** Schema keeps accumulate-then-fail control flow inside `Effect.sync` / `Effect.gen` (same soft-error pattern as `validate.ts`), collapsing to `SchemaError` at the `decodeWire` boundary—no public Result type and no thin Result↔Effect shim. `parseCandidate` = `readEdn → decodeWire`; `validate` = `decodeWire → validateCandidate`; `load` = `parseCandidate → validateCandidate`. Sync unwrap only at CLI/MCP/test edges via `Effect.runSync(Effect.match(...))`.

**Tech Stack:** Deno, `effect` (npm:4.0.0-beta.101), `@std/testing/bdd`, `@std/expect`.

**Spec:** [`docs/snowball/specs/2026-07-26-schema-effect-refactor-design.md`](../specs/2026-07-26-schema-effect-refactor-design.md) (commit `590efab`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/schema.ts` | Approach B: `decodeWire` → `Effect<CandidateDocument, SchemaError>`; delete `DecodeResult` |
| `src/schema.test.ts` | Effect-direct assertions via local `runDecode` |
| `src/builder/parse-candidate.ts` | **Create:** `parseCandidate` composition |
| `src/builder/parse-candidate.test.ts` | **Create:** replace soft-parse tests |
| `src/builder/soft-parse.ts` | **Delete** |
| `src/builder/soft-parse.test.ts` | **Delete** |
| `src/index.ts` | Effect `load` / `validate`; re-export `parseCandidate`; drop shim + Result re-exports |
| `src/model.ts` | Delete `LoadResult` / `ValidationResult` |
| `src/cli/load.ts` | Unwrap `load` Effect → `LoadReport` |
| `src/mcp/io.ts` | Unwrap `parseCandidate` → `LoadDocResult` |
| `src/mcp/tools.ts` | Unwrap `load` Effect |
| `src/test-support.ts` | **Create:** shared `runLoad` / `diagnosticsFromLoadError` for tests |
| Test files using `load` / `softParse` / `validate` | Switch to helpers / Effect.match |
| `docs/snowball/specs/2026-07-25-effect-pattern.md` | Compositions + drop Result-boundary guidance |
| `CHANGELOG.md` | Changed / Removed entries |

---

## Critical semantics (read before Task 2)

Schema today **accumulates** field/element diagnostics then fails; early gates (invalid EDN value, duplicate map/set keys, missing document tag) **fail immediately** with a diagnostics array. Preserve both.

| Situation | Prefer |
|---|---|
| Early structural gate | `Effect.fail({ _tag: "Schema", diagnostics })` |
| Field/element decode that pushes and continues | Keep `Diagnostic[]` mutation **inside** `Effect.sync` / private sync helpers called from `Effect.gen` (same as `collectEndpoints` in `validate.ts`) |
| Non-empty errors at end of decode | `Effect.fail({ _tag: "Schema", diagnostics })` |
| Success | `Effect.succeed(candidate)` |

**Do not** keep a module-level `DecodeResult` type or a public Result `decodeWire`. Mutable arrays inside `Effect.sync` are fine; a Result↔Effect wrapper function is not.

`parseCandidate` must **never** call `validateCandidate`.

---

## Shared helpers (use in later tasks)

**LoadError → diagnostics** (CLI + tests):

```ts
import type { Diagnostic, LoadError } from "./model.js";

export function diagnosticsFromLoadError(
  err: LoadError,
): readonly Diagnostic[] {
  return err._tag === "RootCount" || err._tag === "ReadError"
    ? [err.diagnostic]
    : err.diagnostics;
}
```

**Test unwrap for `load`:**

```ts
import { Effect } from "effect";
import { load } from "./index.js";
import { diagnosticsFromLoadError } from "./test-support.js";

export function runLoad(source: string) {
  return Effect.runSync(
    Effect.match(load(source), {
      onFailure: (err) => ({
        ok: false as const,
        errors: diagnosticsFromLoadError(err),
      }),
      onSuccess: (document) => ({ ok: true as const, document }),
    }),
  );
}
```

Put both in `src/test-support.ts`. Production CLI may inline the same mapping or import `diagnosticsFromLoadError` from a tiny `src/load-error.ts` if preferred—**do not** reintroduce `LoadResult`. For this plan: put `diagnosticsFromLoadError` in `src/test-support.ts` for tests, and **duplicate the three-line mapping inline in `cli/load.ts` / `mcp/tools.ts`** (YAGNI on a shared prod helper unless duplication hurts).

---

## Task 1: Red — Effect-direct `decodeWire` tests

**Files:**
- Modify: `src/schema.test.ts`

- [ ] **Step 1: Rewrite `schema.test.ts` to expect Effects**

Replace the file contents with:

```ts
import { ednParseMulti } from "edn-parser-js";
import { Effect } from "effect";
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { decodeWire } from "./schema.js";

const raw = (source: string): unknown => ednParseMulti(source)[0];
const identity = (ref = "a"): string =>
  `:interface {:aggregate
    #casualtheorics.argdown2.aggregate/identity
    {:inputs [{:ref :${ref}}]}}`;
const document = (elements: string, interfaceBody = identity()): string =>
  `#casualtheorics.argdown2/document
   {:id :schema-test
    :root #casualtheorics.argdown2.solver/grounded
    {:id :root ${interfaceBody} :elements [${elements}]}}`;

function runDecode(value: unknown) {
  return Effect.runSync(
    Effect.match(decodeWire(value), {
      onFailure: (err) => ({ ok: false as const, error: err }),
      onSuccess: (document) => ({ ok: true as const, document }),
    }),
  );
}

describe("first-class wire schema", () => {
  it("decodes statement defaults and preserves unknown fields", () => {
    const result = runDecode(raw(document(`
      #casualtheorics.argdown2.argdown/statement
      {:id :a :future/value 42}
    `)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const statement = result.document.root.elements[0];
    expect(statement).toMatchObject({
      kind: "statement",
      id: "a",
      tags: [],
    });
    expect(statement?.extra).toHaveLength(1);
  });

  it("decodes arguments and identified relations", () => {
    const result = runDecode(raw(document(`
      #casualtheorics.argdown2.argdown/statement {:id :a}
      #casualtheorics.argdown2.argdown/argument
      {:id :arg
       :inferences [
        #casualtheorics.argdown2.argdown/inference
        {:id :inf :premises [:a] :conclusion :a}]}
      #casualtheorics.argdown2.argdown/attack
      {:id :attack-a-arg :from :a :to :arg}
    `)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.root.elements[1]).toMatchObject({
      kind: "argument",
      id: "arg",
      inferences: [{ id: "inf" }],
    });
    expect(result.document.root.elements[2]).toMatchObject({
      kind: "attack",
      id: "attack-a-arg",
    });
  });

  it("requires a document tag and relation id", () => {
    const missingTag = runDecode(raw(
      "#casualtheorics.argdown2.solver/grounded []",
    ));
    expect(missingTag.ok).toBe(false);
    if (missingTag.ok) return;
    expect(missingTag.error._tag).toBe("Schema");
    expect(missingTag.error.diagnostics).toMatchObject([
      { code: "schema/missing-document-tag" },
    ]);

    const result = runDecode(raw(document(`
      #casualtheorics.argdown2.argdown/statement {:id :a}
      #casualtheorics.argdown2.argdown/attack {:from :a :to :a}
    `)));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe("Schema");
    expect(
      result.error.diagnostics.some((error) =>
        error.code === "schema/missing-required"
      ),
    ).toBe(true);
  });

  it("requires identity aggregates to have exactly one input", () => {
    const result = runDecode(raw(document(
      "#casualtheorics.argdown2.argdown/statement {:id :a}",
      `:interface {:aggregate
       #casualtheorics.argdown2.aggregate/identity
       {:inputs []}}`,
    )));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe("Schema");
    expect(result.error.diagnostics[0]?.code).toBe("schema/invalid-field");
  });

  it("rejects duplicate EDN map keys before decoding", () => {
    const result = runDecode(raw(document(
      "#casualtheorics.argdown2.argdown/statement {:id :a :id :b}",
    )));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe("Schema");
    expect(result.error.diagnostics[0]?.code).toBe("schema/duplicate-map-key");
  });
});
```

- [ ] **Step 2: Run tests (expect fail)**

```bash
deno test -A --frozen src/schema.test.ts
```

Expected: FAIL or compile error — `decodeWire` still returns `DecodeResult`, not `Effect`.

- [ ] **Step 3: Commit red tests**

```bash
git add src/schema.test.ts
git commit -m "test(schema): expect decodeWire Effect API (red)"
```

---

## Task 2: Green — rewrite `src/schema.ts` (Approach B)

**Files:**
- Modify: `src/schema.ts`

- [ ] **Step 1: Update imports**

Add at top (after existing imports):

```ts
import { Effect } from "effect";
import type { SchemaError } from "./model.js";
```

(`SchemaError` can join the existing `./model.js` type import list instead of a second import.)

- [ ] **Step 2: Delete `DecodeResult`**

Remove:

```ts
type DecodeResult =
  | { ok: true; document: CandidateDocument }
  | { ok: false; errors: readonly Diagnostic[] };
```

- [ ] **Step 3: Add collapse helper**

Near other private helpers (before `decodeWire`):

```ts
function schemaFail(
  diagnostics: readonly Diagnostic[],
): Effect.Effect<never, SchemaError, never> {
  return Effect.fail({ _tag: "Schema" as const, diagnostics });
}
```

- [ ] **Step 4: Rewrite `decodeWire` as Effect**

Replace the exported function with:

```ts
export function decodeWire(
  value: unknown,
): Effect.Effect<CandidateDocument, SchemaError, never> {
  return Effect.gen(function* () {
    const wire = ednValueSchema.safeParse(value);
    if (!wire.success) {
      return yield* schemaFail([{
        code: "schema/invalid-edn-value",
        message: "Invalid EDN value",
      }]);
    }
    const validatedWireValue = wire.data as EDN;
    const duplicateErrors = validateCollectionUniqueness(validatedWireValue);
    if (duplicateErrors.length > 0) {
      return yield* schemaFail(duplicateErrors);
    }

    const root = taggedSchema.safeParse(validatedWireValue);
    if (!root.success) {
      return yield* schemaFail([{
        code: "schema/missing-document-tag",
        message: `Expected #${DOCUMENT_TAG}`,
      }]);
    }
    const rootName = fullName(root.data.tag);
    if (
      root.data.tag.ns !== DOCUMENT_NAMESPACE ||
      root.data.tag.symbol !== "document"
    ) {
      return yield* schemaFail([{
        code: "schema/missing-document-tag",
        message: `Expected #${DOCUMENT_TAG}; received #${rootName}`,
      }]);
    }

    const decoded = yield* Effect.sync(() => {
      const errors: Diagnostic[] = [];
      const fields = expectMap(root.data.value, documentKeys, [], errors);
      if (fields === undefined) {
        return { ok: false as const, errors };
      }
      const id = requiredKeyword(fields, "id", [], errors);
      let component: CandidateSolverComponent | undefined;
      if (!fields.known.has("root")) {
        pushMissing(errors, [], "root");
      } else {
        const tagged = taggedSchema.safeParse(fields.known.get("root"));
        if (!tagged.success) {
          pushInvalid(errors, [], "root", "Expected tagged solver component");
        } else {
          component = decodeSolverComponent(tagged.data, [":root"], errors);
        }
      }
      if (id === undefined || component === undefined || errors.length > 0) {
        return { ok: false as const, errors };
      }
      return {
        ok: true as const,
        document: { id, root: component, extra: fields.extra },
      };
    });

    if (!decoded.ok) {
      return yield* schemaFail(decoded.errors);
    }
    return decoded.document;
  });
}
```

Leave all private decode helpers (`decodeStatement`, `expectMap`, …) that take `errors: Diagnostic[]` **unchanged** for this task. They remain sync mutators called from the `Effect.sync` block and from each other—the Effect boundary is `decodeWire`.

- [ ] **Step 5: Run schema tests**

```bash
deno test -A --frozen src/schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/schema.ts src/schema.test.ts
git commit -m "feat(schema): decodeWire returns Effect with SchemaError

Approach B: Effect.gen + Effect.sync accumulate-then-fail; delete DecodeResult."
```

---

## Task 3: `parseCandidate` module (replace soft-parse)

**Files:**
- Create: `src/builder/parse-candidate.ts`
- Create: `src/builder/parse-candidate.test.ts`
- Delete: `src/builder/soft-parse.ts`
- Delete: `src/builder/soft-parse.test.ts`
- Modify: `src/edn-write.test.ts` (softParse → parseCandidate)
- Modify: `src/mcp/io.ts` (will fully unwrap in Task 5; here only switch import if needed—prefer finishing MCP in Task 5)

Do **not** leave a `softParse` alias.

- [ ] **Step 1: Create `src/builder/parse-candidate.ts`**

```ts
import { Effect } from "effect";

import { readEdn } from "../edn.js";
import type { CandidateDocument, EdnError, SchemaError } from "../model.js";
import { decodeWire } from "../schema.js";

export type ParseCandidateError = EdnError | SchemaError;

export function parseCandidate(
  source: string,
): Effect.Effect<CandidateDocument, ParseCandidateError, never> {
  return Effect.gen(function* () {
    const raw = yield* readEdn(source);
    return yield* decodeWire(raw);
  });
}
```

- [ ] **Step 2: Create `src/builder/parse-candidate.test.ts`**

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { writeEdn } from "../edn-write.js";
import { parseCandidate } from "./parse-candidate.js";
import { runLoad } from "../test-support.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/two-statements-attack.edn",
);

function runParseCandidate(source: string) {
  return Effect.runSync(
    Effect.match(parseCandidate(source), {
      onFailure: (err) => ({ ok: false as const, error: err }),
      onSuccess: (document) => ({ ok: true as const, document }),
    }),
  );
}

describe("parseCandidate", () => {
  it("decodes fixture without semantic validate", () => {
    const source = readFileSync(fixture, "utf8");
    const parsed = runParseCandidate(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.root.elements).toHaveLength(3);
  });

  it("round-trips fixture through writeEdn then load", () => {
    const source = readFileSync(fixture, "utf8");
    const parsed = runParseCandidate(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const written = writeEdn(parsed.document);
    expect(runLoad(written).ok).toBe(true);
  });

  it("fails for empty input", () => {
    const parsed = runParseCandidate("");
    expect(parsed.ok).toBe(false);
  });
});
```

**Note:** `runLoad` does not exist until Task 4. For this task’s Step 2, temporarily keep the round-trip assertion using the **current** sync `load` if Task 4 is not done yet—**or** implement Task 4’s `test-support.ts` + Effect `load` before running this file. Preferred order: **implement Task 4’s `test-support.ts` stub that still wraps today’s Result `load` is forbidden** (load will flip in Task 4). So either:

- Commit Task 3 files without running the round-trip test until Task 4, **or**
- Combine: create `parse-candidate.ts` + tests that only use `runParseCandidate` in this task; move the round-trip `runLoad` assertion into Task 4/6.

**Use this adjusted test for Task 3 (no `runLoad` yet):**

```ts
describe("parseCandidate", () => {
  it("decodes fixture without semantic validate", () => {
    const source = readFileSync(fixture, "utf8");
    const parsed = runParseCandidate(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.root.elements).toHaveLength(3);
  });

  it("fails for empty input", () => {
    const parsed = runParseCandidate("");
    expect(parsed.ok).toBe(false);
  });
});
```

Round-trip coverage returns in Task 6 when updating `edn-write.test.ts`.

- [ ] **Step 3: Run parse-candidate tests**

```bash
deno test -A --frozen src/builder/parse-candidate.test.ts
```

Expected: PASS.

- [ ] **Step 4: Delete soft-parse files**

```bash
git rm src/builder/soft-parse.ts src/builder/soft-parse.test.ts
```

Do **not** update MCP/edn-write yet if they still import `softParse`—those break until Task 5/6. If the suite is run in full, expect those failures; that is OK until those tasks. Prefer committing Task 3 with known broken importers only if you immediately continue to Task 4–6 in the same session.

Safer: **leave soft-parse.ts as a one-line deprecated re-export for one commit is NOT allowed** (spec: no alias). Instead complete Tasks 3–6 in one agent session without a green full suite between 3 and 6, **or** update all `softParse` importers in the same commit as the delete.

**This plan requires Task 3 commit to include importer updates for softParse → parseCandidate unwrap** (minimal):

In `src/mcp/io.ts`, replace softParse usage with:

```ts
import { Effect } from "effect";
import { parseCandidate } from "../builder/parse-candidate.js";

// inside loadDocumentRef, for each parse site:
const parsed = Effect.runSync(
  Effect.match(parseCandidate(source), {
    onFailure: (err) => ({
      ok: false as const,
      errors: err._tag === "Schema" || err._tag === "ReadError" ||
          err._tag === "RootCount"
        ? (err._tag === "Schema" ? err.diagnostics : [err.diagnostic])
        : [],
    }),
    onSuccess: (document) => ({ ok: true as const, document }),
  }),
);
if (!parsed.ok) return parsed;
```

Cleaner failure mapping:

```ts
onFailure: (err) => ({
  ok: false as const,
  errors: err._tag === "Schema" ? err.diagnostics : [err.diagnostic],
}),
```

In `src/edn-write.test.ts`, replace softParse with `runParseCandidate` local helper (copy from parse-candidate.test) or import Effect.match inline; assert `parsed.ok` on the local union.

- [ ] **Step 5: Commit**

```bash
git add src/builder/parse-candidate.ts src/builder/parse-candidate.test.ts \
  src/mcp/io.ts src/edn-write.test.ts
git add -u src/builder/soft-parse.ts src/builder/soft-parse.test.ts
git commit -m "feat(builder): parseCandidate Effect composition replaces softParse"
```

---

## Task 4: Public `load` / `validate` Effects + delete Result types

**Files:**
- Create: `src/test-support.ts`
- Modify: `src/index.ts`
- Modify: `src/model.ts`
- Modify: `src/validate.test.ts` (`candidateFrom` uses Effect `decodeWire`)

- [ ] **Step 1: Create `src/test-support.ts`**

```ts
import { Effect } from "effect";

import { load } from "./index.js";
import type { Diagnostic, Document, LoadError } from "./model.js";

export function diagnosticsFromLoadError(
  err: LoadError,
): readonly Diagnostic[] {
  return err._tag === "RootCount" || err._tag === "ReadError"
    ? [err.diagnostic]
    : err.diagnostics;
}

export function runLoad(source: string):
  | { ok: true; document: Document }
  | { ok: false; errors: readonly Diagnostic[] } {
  return Effect.runSync(
    Effect.match(load(source), {
      onFailure: (err) => ({
        ok: false as const,
        errors: diagnosticsFromLoadError(err),
      }),
      onSuccess: (document) => ({ ok: true as const, document }),
    }),
  );
}
```

- [ ] **Step 2: Rewrite `src/index.ts` compositions**

Replace decode/load/validate section with:

```ts
import { evaluateComponent } from "./component-eval.js";
import { readEdn } from "./edn.js";
import type {
  ComponentSolveResult,
  Document,
  LoadError,
  SchemaError,
  ValidateError,
} from "./model.js";
import { parseCandidate } from "./builder/parse-candidate.js";
import { decodeWire } from "./schema.js";
import { validateCandidate } from "./validate.js";

import { Effect } from "effect";

// ... keep existing export type { ... } block but REMOVE LoadResult, ValidationResult
// ... keep existing export { TAGS... } block

export { parseCandidate } from "./builder/parse-candidate.js";
export type { ParseCandidateError } from "./builder/parse-candidate.js";

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

export function solve(document: Document): ComponentSolveResult {
  return evaluateComponent(document.root);
}
```

Remove `decodeWireEffect`, `loadEffect`, unused `CandidateDocument` import if any, and Result re-exports.

Ensure `export type { ... }` still exports `LoadError`, `SchemaError`, `ValidateError`, `EdnError` (add `EdnError` if missing).

- [ ] **Step 3: Delete Result types from `src/model.ts`**

Remove:

```ts
export type ValidationResult =
  | { ok: true; document: Document }
  | { ok: false; errors: readonly Diagnostic[] };

export type LoadResult = ValidationResult;
```

- [ ] **Step 4: Fix `candidateFrom` in `src/validate.test.ts`**

Replace schema unwrap:

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
  return Effect.runSync(
    Effect.match(decodeWire(raw), {
      onFailure: (e) => {
        throw new Error(`schema failed: ${e._tag}`);
      },
      onSuccess: (document) => document,
    }),
  );
}
```

Change existing `load(...)` calls in this file to `runLoad(...)` (import from `./test-support.js`).

- [ ] **Step 5: Typecheck entrypoints**

```bash
deno check --frozen src/index.ts src/builder/parse-candidate.ts src/test-support.ts
```

Expected: PASS for these files. Other tests/CLI may still fail to typecheck until Tasks 5–6.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/model.ts src/test-support.ts src/validate.test.ts
git commit -m "feat(api): load and validate return Effects; drop LoadResult

parseCandidate → validateCandidate composition; remove loadEffect shim."
```

---

## Task 5: CLI + MCP sync boundaries

**Files:**
- Modify: `src/cli/load.ts`
- Modify: `src/mcp/tools.ts`
- Verify: `src/mcp/io.ts` (updated in Task 3)

- [ ] **Step 1: Update `src/cli/load.ts`**

```ts
import { Effect } from "effect";

import type { Document, LoadError } from "../model.js";
import { load } from "../index.js";
import { writeDiagnostic, writeStderr } from "./output.js";

export interface Diagnostic {
  code: string;
  message: string;
}

export type LoadReport =
  | { ok: true; document: Document; diagnostics: readonly Diagnostic[] }
  | { ok: false; document: undefined; diagnostics: readonly Diagnostic[] };

function diagnosticsFromLoadError(err: LoadError): readonly { code: string; message: string }[] {
  const list = err._tag === "RootCount" || err._tag === "ReadError"
    ? [err.diagnostic]
    : err.diagnostics;
  return list;
}

export function loadAndReport(
  source: string,
  options: { quiet: boolean },
): LoadReport {
  const result = Effect.runSync(
    Effect.match(load(source), {
      onFailure: (err) => ({ ok: false as const, err }),
      onSuccess: (document) => ({ ok: true as const, document }),
    }),
  );

  const diagnostics: Diagnostic[] = result.ok
    ? []
    : diagnosticsFromLoadError(result.err).map((e) => ({
      code: e.code.startsWith("edn/") ? e.code : `edn/${e.code}`,
      message: e.message,
    }));

  for (const d of diagnostics) {
    if (!options.quiet) writeNewline(writeDiagnostic(d));
  }

  if (result.ok) {
    return { ok: true, document: result.document, diagnostics };
  }
  return { ok: false, document: undefined, diagnostics };
}
```

- [ ] **Step 2: Update `src/mcp/tools.ts` load sites**

Near `runValidate` / `runSolve`, replace:

```ts
const result = load(sourceResult.source);
if (!result.ok) {
  return jsonResult({ ok: false, errors: result.errors });
}
```

with:

```ts
const result = Effect.runSync(
  Effect.match(load(sourceResult.source), {
    onFailure: (err) => ({
      ok: false as const,
      errors: err._tag === "RootCount" || err._tag === "ReadError"
        ? [err.diagnostic]
        : err.diagnostics,
    }),
    onSuccess: (document) => ({ ok: true as const, document }),
  }),
);
if (!result.ok) {
  return jsonResult({ ok: false, errors: result.errors });
}
```

Add `import { Effect } from "effect";` if missing. Apply the same pattern at **both** `runValidate` and `runSolve` (and any other `load(` in that file).

- [ ] **Step 3: Check CLI + MCP**

```bash
deno check --frozen src/cli/load.ts src/mcp/io.ts src/mcp/tools.ts src/mcp/cli.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/cli/load.ts src/mcp/tools.ts src/mcp/io.ts
git commit -m "refactor(cli,mcp): unwrap load/parseCandidate Effects at edges"
```

---

## Task 6: Migrate remaining tests to `runLoad` / Effect.match

**Files:**
- Modify: `src/index.test.ts`
- Modify: `src/solvers.test.ts`
- Modify: `src/parity.test.ts`
- Modify: `src/nested-solvers.test.ts`
- Modify: `src/first-class-components.test.ts`
- Modify: `src/edn-write.test.ts`
- Modify: `src/builder/parse-candidate.test.ts` (add round-trip with `runLoad`)

- [ ] **Step 1: Pattern for each test file**

1. `import { runLoad } from "./test-support.js";` (adjust relative path).
2. Replace `load(x)` assertions that used `.ok` / `.errors` / `.document` with `runLoad(x)`.
3. For `solve(loaded.document)`, keep using `runLoad` then `solve`.
4. For `validate(raw)` in `index.test.ts`:

```ts
import { Effect } from "effect";
import { load, solve, validate } from "./index.js";

const validated = Effect.runSync(
  Effect.match(validate(raw), {
    onFailure: () => ({ ok: false as const }),
    onSuccess: () => ({ ok: true as const }),
  }),
);
expect(validated.ok).toBe(true);
```

5. Replace `toMatchObject({ ok: false, errors: [...] })` on `load(...)` with the same on `runLoad(...)`.

- [ ] **Step 2: Restore parseCandidate round-trip test**

In `parse-candidate.test.ts`, add:

```ts
import { runLoad } from "../test-support.js";

it("round-trips fixture through writeEdn then load", () => {
  const source = readFileSync(fixture, "utf8");
  const parsed = runParseCandidate(source);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const written = writeEdn(parsed.document);
  expect(runLoad(written).ok).toBe(true);
});
```

- [ ] **Step 3: Run full suite**

```bash
deno test -A --frozen --parallel src/
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/index.test.ts src/solvers.test.ts src/parity.test.ts \
  src/nested-solvers.test.ts src/first-class-components.test.ts \
  src/edn-write.test.ts src/builder/parse-candidate.test.ts src/validate.test.ts
git commit -m "test: unwrap load/validate/parseCandidate via Effect.match helpers"
```

---

## Task 7: Docs + CHANGELOG + verification grep

**Files:**
- Modify: `docs/snowball/specs/2026-07-25-effect-pattern.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update effect-pattern note**

Rewrite the **Sync boundary** section to say: prefer keeping `Effect`
until the outermost edge (CLI, MCP tool handler, or test); unwrap with
`Effect.runSync(Effect.match(...))` into a **local** shape
(`LoadReport`, `LoadDocResult`, or a test-only union); do **not** add
new shared `ok`/`errors` Result types for Effect modules.

Add a **Parse compositions** section documenting:

- `parseCandidate(source)` = `readEdn → decodeWire` → `Effect<CandidateDocument, EdnError | SchemaError>`
- `validate(value)` = `decodeWire → validateCandidate` → `Effect<Document, SchemaError | ValidateError>`
- `load(source)` = `parseCandidate → validateCandidate` → `Effect<Document, LoadError>`
- `parseCandidate` never runs semantic validation

Remove bullets that tell readers to unwrap into `LoadResult` /
`SoftParseResult`. Update the **Don't** section similarly.

- [ ] **Step 2: CHANGELOG**

Under `[Unreleased]` → **Changed**:

```markdown
- Schema decode (`decodeWire`) returns
  `Effect.Effect<CandidateDocument, SchemaError, never>`. Public
  `load` / `validate` return Effects. Soft-parse renamed to
  `parseCandidate` (`readEdn → decodeWire`). `load` composes
  `parseCandidate → validateCandidate`. Call sites unwrap with
  `Effect.match` + `Effect.runSync`.
```

Under **Removed**:

```markdown
- `LoadResult`, `ValidationResult`, `SoftParseResult`, and the
  `loadEffect` / `decodeWireEffect` / `softParse` names. Use the
  Effect compositions instead.
```

- [ ] **Step 3: Grep for leftovers**

```bash
rg -n 'SoftParseResult|LoadResult|ValidationResult|DecodeResult|loadEffect|decodeWireEffect|softParse' src/
```

Expected: no matches in `src/`.

- [ ] **Step 4: Final verification**

```bash
deno check --frozen src/index.ts src/mcp/cli.ts src/cli/main.ts
deno test -A --frozen --parallel src/
deno lint src/schema.ts src/index.ts src/model.ts src/builder/parse-candidate.ts src/cli/load.ts src/mcp/io.ts src/test-support.ts
deno fmt --check src/schema.ts src/index.ts src/model.ts src/builder/parse-candidate.ts src/test-support.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add docs/snowball/specs/2026-07-25-effect-pattern.md CHANGELOG.md
git commit -m "docs: record Effect parse compositions and Result API removal"
```

---

## Self-review checklist

| Spec requirement | Task |
|---|---|
| Approach B `decodeWire` → `SchemaError` | 1–2 |
| Delete `DecodeResult` | 2 |
| `parseCandidate` = readEdn → decodeWire | 3 |
| Rename/delete soft-parse | 3 |
| `validate` / `load` Effect compositions | 4 |
| Delete `LoadResult` / `ValidationResult` / `SoftParseResult` | 3–4 |
| Remove `loadEffect` / `decodeWireEffect` | 4 |
| CLI/MCP unwrap | 5 |
| Tests Effect.match | 6 |
| Pattern note + CHANGELOG | 7 |
| Soft-parse stays validate-free | 3 (`parseCandidate` only) |

No TBD/placeholder steps. Types consistent: `ParseCandidateError`, `SchemaError`, `LoadError`.

---

## Execution Handoff

Plan saved to `docs/snowball/plans/2026-07-26-schema-effect-refactor.md`.
