# EDN Canonical Representation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom Argdown language and AST with a strict, solver-rooted EDN library that validates Argdown 1.x-shaped data and computes formally correct grounded Dung labels.

**Architecture:** A patched `edn-parser-js` reader parses all top-level EDN forms into lossless wire values. Zod decodes recognized namespaced tags into candidate domain data; a separate resolver enforces identity and reference integrity before reducing the document to a Dung framework and applying grounded labeling. The public package exposes only `load`, `validate`, and `solve`.

**Tech Stack:** TypeScript 7, Node ESM, Yarn 4 PnP/patch protocol, `edn-parser-js` 2.0.2, Zod 4, Vitest, oxlint, oxfmt

---

## Scope and sequencing

This is one coherent breaking reset, but it has two implementation gates:

1. The strict EDN reader and new library pipeline must pass independently while the old implementation still exists.
2. Only after the new end-to-end API and parity fixture pass may the old parser, AST, CLI, renderer, and advanced solvers be deleted.

Do not preserve the current `solver.ts::label()` implementation. It reverses the formal complete-labeling quantifiers and labels a lone self-attacker OUT. The new kernel must implement:

- IN iff every attacker is OUT;
- OUT iff at least one attacker is IN;
- UNDEC otherwise.

## File structure

### Create

- `.yarn/patches/edn-parser-js-npm-2.0.2.patch` — fixes the package's extensionless ESM import.
- `src/model.ts` — domain, candidate, diagnostic, result, and Dung-framework types.
- `src/edn.ts` / `src/edn.test.ts` — strict reader adapter and characterization.
- `src/schema.ts` / `src/schema.test.ts` — Zod wire decoding and transformation.
- `src/validate.ts` / `src/validate.test.ts` — cross-element identity/reference resolution.
- `src/reduce-dung.ts` / `src/reduce-dung.test.ts` — pure-attack Dung reduction.
- `src/grounded.ts` / `src/grounded.test.ts` — correct grounded-labeling kernel.
- `src/index.test.ts` — public API and end-to-end tests.
- `examples/argdown1-censorship.edn` — canonical Argdown 1.x parity example.
- `examples/argdown1-censorship.mapping.md` — implicit-to-explicit relation mapping.
- `src/parity.test.ts` — parity assertions over the checked-in example.

### Rewrite or modify

- `src/index.ts`
- `package.json`
- `yarn.lock`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `README.md`
- `CHANGELOG.md`
- `docs/DESIGN.md`
- `docs/GRAMMAR.bnf`
- `.codebase-memory/adr.md`

### Delete after replacement tests pass

- Parser/AST: `src/ast.ts`, `src/tokens.ts`, `src/tokens.test.ts`, `src/parser.ts`, `src/parser-util.ts`, `src/parser-frontmatter.ts`, `src/parser-block.ts`, `src/parser-fact.ts`, `src/parser-relation.ts`, `src/parser-arg.ts`, `src/parser.test.ts`, `src/parser-arg.test.ts`, `src/parser.fuzz.test.ts`, `src/parser.mutate.ts`, `src/parser.mutate.test.ts`, `src/visitor.ts`, `src/visitor-arg.ts`, `src/visitor-block.ts`, `src/visitor-frontmatter.ts`, `src/visitor-walk.ts`.
- Formatting/rendering: `src/stringifier.ts`, `src/stringifier.test.ts`, `src/__snapshots__/stringifier.test.ts.snap`, `src/mermaid.ts`, `src/mermaid.test.ts`.
- CLI/MCP: `src/cli.ts`, `src/cli.test.ts`, `src/cli/ast.ts`, `src/cli/format.ts`, `src/cli/help.ts`, `src/cli/input.ts`, `src/cli/mcp.ts`, `src/cli/mcp.test.ts`, `src/cli/render.ts`, `src/cli/solve.ts`, `src/cli/validate.ts`.
- AST-coupled solvers: `src/solver.ts`, `src/solver.test.ts`, `src/solver-graph.ts`, `src/solver-graph.test.ts`, `src/solver-aspic.ts`, `src/solver.aspic.test.ts`, `src/solver-multi.ts`, `src/solver-multi.test.ts`, `src/solver-multi.equivalence.test.ts`, `src/solver-multi.grounded.test.ts`, `src/solver-multi.large.test.ts`, `src/solver-multi.residue.test.ts`, `src/solver-multi.tarjan.test.ts`, `src/solver.bipolar.test.ts`, `src/solver.evidential.test.ts`, `src/solver.preferred.test.ts`, `src/solver.stable.test.ts`, `src/solver.complete.test.ts`, `src/solver.cross-validate.test.ts`.
- Benchmarks/config: `src/parser.bench.ts`, `src/parser.bench.test.ts`, `src/solver.bench.ts`, `src/solver.bench.test.ts`, `perf-baseline.json`, `perf-baseline-solver.json`, `stryker.config.mjs`, `scripts/migrate-rule-to-arg.mjs`.
- Old examples/fixtures: `examples/lead.argdown` and every file under `src/parser.fixtures/`.

Historical files under `docs/snowball/` remain in place.

---

### Task 1: Lock the EDN dependency and strict reader

**Files:**
- Create: `.yarn/patches/edn-parser-js-npm-2.0.2.patch`
- Create: `src/model.ts`
- Create: `src/edn.ts`
- Test: `src/edn.test.ts`
- Modify: `package.json`
- Modify: `yarn.lock`

- [ ] **Step 1: Add the reader and update Zod through Yarn**

Run:

```bash
yarn add edn-parser-js@2.0.2 zod@latest
yarn add --dev typescript@latest
```

Expected: `package.json` contains `edn-parser-js: 2.0.2`; Zod resolves to 4.4.3 and TypeScript to 7.0.2 (the latest releases when this plan was written); `yarn.lock` changes. TypeScript is upgraded because Zod 4 officially supports TypeScript 5.5 and later, while the repository currently pins 5.4.

- [ ] **Step 2: Add the checked-in ESM patch**

Create `.yarn/patches/edn-parser-js-npm-2.0.2.patch`:

```diff
diff --git a/lib/index.js b/lib/index.js
index 3c8d9bc..33ce491 100644
--- a/lib/index.js
+++ b/lib/index.js
@@ -1,4 +1,4 @@
-import { parse } from './parser';
+import { parse } from './parser.js';
 export const ednParseMulti = (s) => {
     return parse(s);
 };
```

Add this root-level resolution to `package.json`:

```json
"resolutions": {
  "edn-parser-js@npm:2.0.2": "patch:edn-parser-js@npm%3A2.0.2#./.yarn/patches/edn-parser-js-npm-2.0.2.patch"
}
```

Run:

```bash
yarn install
```

Expected: Yarn records the patch locator in `yarn.lock`; importing `edn-parser-js` from Node ESM no longer throws `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Define the complete model contract**

Create `src/model.ts` with these exports:

```ts
export const GROUNDED_SOLVER_TAG = 'casualtheorics.argdown2.solver/grounded' as const;

declare const entityIdBrand: unique symbol;
declare const inferenceIdBrand: unique symbol;

export type EntityId = string & { readonly [entityIdBrand]: true };
export type InferenceId = string & { readonly [inferenceIdBrand]: true };
export type Label = 'in' | 'out' | 'undec';
export type DiagnosticPath = readonly (number | string)[];

export type Diagnostic = {
  code: string;
  message: string;
  path?: DiagnosticPath;
};

export type ExtraEntry = readonly [unknown, unknown];

export type CandidateInference = {
  kind: 'inference';
  id: string;
  premises: readonly string[];
  conclusion: string;
  rules: readonly string[];
  metadata?: unknown;
  extra: readonly ExtraEntry[];
};

export type CandidateStatement = {
  kind: 'statement';
  id: string;
  text?: string;
  tags: readonly string[];
  metadata?: unknown;
  extra: readonly ExtraEntry[];
};

export type CandidateArgument = {
  kind: 'argument';
  id: string;
  description?: string;
  tags: readonly string[];
  metadata?: unknown;
  inferences: readonly CandidateInference[];
  extra: readonly ExtraEntry[];
};

export type RelationKind = 'support' | 'attack' | 'contradiction' | 'undercut';

export type CandidateRelation = {
  kind: RelationKind;
  from: string;
  to: string;
  extra: readonly ExtraEntry[];
};

export type CandidateElement = CandidateArgument | CandidateRelation | CandidateStatement;

export type CandidateDocument = {
  solver: typeof GROUNDED_SOLVER_TAG;
  elements: readonly CandidateElement[];
};

export type Inference = Omit<CandidateInference, 'conclusion' | 'id' | 'premises'> & {
  id: InferenceId;
  premises: readonly EntityId[];
  conclusion: EntityId;
};

export type Statement = Omit<CandidateStatement, 'id'> & { id: EntityId };

export type Argument = Omit<CandidateArgument, 'id' | 'inferences'> & {
  id: EntityId;
  inferences: readonly Inference[];
};

export type NodeRelation = Omit<CandidateRelation, 'from' | 'kind' | 'to'> & {
  kind: 'attack' | 'contradiction' | 'support';
  from: EntityId;
  to: EntityId;
};

export type UndercutRelation = Omit<CandidateRelation, 'from' | 'kind' | 'to'> & {
  kind: 'undercut';
  from: EntityId;
  to: InferenceId;
};

export type Relation = NodeRelation | UndercutRelation;

export type TheoryElement = Argument | Relation | Statement;

export type GroundedDocument = {
  solver: typeof GROUNDED_SOLVER_TAG;
  elements: readonly TheoryElement[];
};

export type DungFramework = {
  nodes: ReadonlySet<EntityId>;
  attackersByTarget: ReadonlyMap<EntityId, ReadonlySet<EntityId>>;
};

export type ReadResult =
  | { ok: true; value: unknown }
  | { ok: false; errors: readonly Diagnostic[] };

export type ValidationResult =
  | { ok: true; document: GroundedDocument }
  | { ok: false; errors: readonly Diagnostic[] };

export type LoadResult = ValidationResult;

export type SolveResult = {
  solver: typeof GROUNDED_SOLVER_TAG;
  labels: ReadonlyMap<EntityId, Label>;
  warnings: readonly Diagnostic[];
};
```

- [ ] **Step 4: Write failing reader tests**

Create `src/edn.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { readEdn } from './edn.js';

describe('readEdn', () => {
  it('preserves namespaced tags, keyword ids, maps, sets, and vectors', () => {
    const result = readEdn(
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:id :a :tags #{:pro}}]',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      tag: { ns: 'casualtheorics.argdown2.solver', symbol: 'grounded' },
      value: [
        {
          tag: { ns: 'casualtheorics.argdown2.argdown', symbol: 'statement' },
          value: {
            map: [
              [{ keyword: 'id' }, { keyword: 'a' }],
              [{ keyword: 'tags' }, { set: [{ keyword: 'pro' }] }],
            ],
          },
        },
      ],
    });
  });

  it.each([
    ['unbalanced collection', '[1 2'],
    ['unterminated string', '"abc'],
    ['odd map arity', '{:id :x :orphan}'],
    ['orphan tag', '#example/tag'],
    ['invalid numeric token', '42.3.4'],
    ['unexpected trailing delimiter', '{:id :x})'],
  ])('returns edn/read-error for %s', (_name, source) => {
    const result = readEdn(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('edn/read-error');
  });

  it.each([
    ['zero roots', ''],
    ['multiple roots', '1 2'],
  ])('returns edn/root-count for %s', (_name, source) => {
    const result = readEdn(source);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: 'edn/root-count',
          message: 'Expected exactly one top-level EDN value',
        },
      ],
    });
  });
});
```

- [ ] **Step 5: Run the reader tests to verify RED**

Run:

```bash
yarn test src/edn.test.ts
```

Expected: FAIL because `src/edn.ts` and `readEdn` do not exist.

- [ ] **Step 6: Implement the reader adapter**

Create `src/edn.ts`:

```ts
import { ednParseMulti } from 'edn-parser-js';

import type { Diagnostic, ReadResult } from './model.js';

function rootCountFailure(): ReadResult {
  return {
    ok: false,
    errors: [
      {
        code: 'edn/root-count',
        message: 'Expected exactly one top-level EDN value',
      },
    ],
  };
}

function readFailure(error: unknown): ReadResult {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostic: Diagnostic = {
    code: 'edn/read-error',
    message,
  };
  return { ok: false, errors: [diagnostic] };
}

export function readEdn(source: string): ReadResult {
  try {
    const forms = ednParseMulti(source);
    if (forms.length !== 1) return rootCountFailure();
    const value = forms[0];
    if (value === undefined) return rootCountFailure();
    return { ok: true, value };
  } catch (error: unknown) {
    return readFailure(error);
  }
}
```

- [ ] **Step 7: Verify reader behavior and declarations**

Run:

```bash
yarn test src/edn.test.ts
yarn typecheck
```

Expected: reader tests PASS; typecheck PASS, proving the patched package root works under NodeNext.

- [ ] **Step 8: Commit**

```bash
git add .yarn/patches/edn-parser-js-npm-2.0.2.patch package.json yarn.lock src/model.ts src/edn.ts src/edn.test.ts
git commit -m "feat: add strict EDN reader"
```

---

### Task 2: Decode namespaced EDN tags with Zod

**Files:**
- Create: `src/schema.ts`
- Test: `src/schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `src/schema.test.ts`. Use `readEdn()` to produce real wire values rather than hand-building parser-specific objects:

```ts
import { describe, expect, it } from 'vitest';

import { readEdn } from './edn.js';
import { decodeWire } from './schema.js';

function readOne(source: string): unknown {
  const result = readEdn(source);
  if (!result.ok) throw new Error(result.errors[0]?.message ?? 'read failed');
  return result.value;
}

describe('decodeWire', () => {
  it('decodes statements, arguments, nested inferences, and relations', () => {
    const value = readOne(`
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/statement {:id :p :text "Premise" :custom 7}
        #casualtheorics.argdown2.argdown/statement {:id :c}
        #casualtheorics.argdown2.argdown/argument
          {:id :a
           :tags #{:pro}
           :inferences [
             #casualtheorics.argdown2.argdown/inference
               {:id :i :premises [:p] :conclusion :c :rules [:modus-ponens]}
           ]}
        #casualtheorics.argdown2.argdown/attack {:from :a :to :c}
      ]
    `);
    const result = decodeWire(value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.elements.map((element) => element.kind)).toEqual([
      'statement',
      'statement',
      'argument',
      'attack',
    ]);
    expect(result.document.elements[0]).toMatchObject({
      id: 'p',
      kind: 'statement',
      text: 'Premise',
    });
    expect(result.document.elements[0]?.extra).toHaveLength(1);
  });

  it.each([
    ['wrong root tag', '#other.solver/grounded []', 'edn/unsupported-tag'],
    ['bare root vector', '[]', 'schema/missing-root-tag'],
    [
      'unknown child tag',
      '#casualtheorics.argdown2.solver/grounded [#other/statement {:id :a}]',
      'edn/unsupported-tag',
    ],
    [
      'statement without id',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:text "x"}]',
      'schema/missing-required',
    ],
    [
      'empty inference premises',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/argument {:id :a :inferences [#casualtheorics.argdown2.argdown/inference {:id :i :premises [] :conclusion :c}]}]',
      'schema/invalid-field',
    ],
    [
      'relation without to',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/attack {:from :a}]',
      'schema/missing-required',
    ],
    [
      'statement text with the wrong type',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:id :a :text 1}]',
      'schema/invalid-field',
    ],
    [
      'tags encoded as a vector instead of a set',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:id :a :tags [:pro]}]',
      'schema/invalid-field',
    ],
  ])('rejects %s with a stable code', (_name, source, code) => {
    const result = decodeWire(readOne(source));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.code === code)).toBe(true);
  });

  it('preserves arbitrary EDN metadata and unknown entries', () => {
    const value = readOne(`
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/statement
          {:id :a :metadata {:nested [1 #{:x}]}
           [:rich :key] #custom/value {:x 1}}
      ]
    `);
    const result = decodeWire(value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.elements[0]?.extra).toHaveLength(1);
  });

  it.each([
    [
      'duplicate field',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:id :a :id :b}]',
      'schema/duplicate-map-key',
    ],
    [
      'duplicate nested metadata key',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:id :a :metadata {:x 1 :x 2}}]',
      'schema/duplicate-map-key',
    ],
    [
      'duplicate set value',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:id :a :tags #{:pro :pro}}]',
      'schema/duplicate-set-value',
    ],
  ])('rejects %s retained by the EDN reader', (_name, source, code) => {
    const result = decodeWire(readOne(source));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.code === code)).toBe(true);
  });
});
```

- [ ] **Step 2: Run schema tests to verify RED**

Run:

```bash
yarn test src/schema.test.ts
```

Expected: FAIL because `decodeWire` is missing.

- [ ] **Step 3: Implement wire schemas and decoder**

Create `src/schema.ts` with:

```ts
import type { EDN } from 'edn-parser-js';
import { z } from 'zod';

import {
  GROUNDED_SOLVER_TAG,
  type CandidateArgument,
  type CandidateDocument,
  type CandidateElement,
  type CandidateInference,
  type CandidateRelation,
  type CandidateStatement,
  type Diagnostic,
  type ExtraEntry,
  type RelationKind,
} from './model.js';

const ROOT_NAMESPACE = 'casualtheorics.argdown2.solver';
const THEORY_NAMESPACE = 'casualtheorics.argdown2.argdown';

const symbolSchema = z.strictObject({
  ns: z.string().optional(),
  symbol: z.string(),
});
const keywordSchema = z.strictObject({
  keyword: z.string(),
  ns: z.string().optional(),
});
const charSchema = z.strictObject({ char: z.string() });
let ednValueSchema: z.ZodType<EDN>;
const nestedEdnSchema = z.lazy(() => ednValueSchema);
const mapSchema = z.strictObject({
  map: z.array(z.tuple([nestedEdnSchema, nestedEdnSchema])),
});
const setSchema = z.strictObject({
  set: z.array(nestedEdnSchema),
});
const listSchema = z.strictObject({ list: z.array(nestedEdnSchema) });
const taggedSchema = z.strictObject({
  tag: symbolSchema,
  value: nestedEdnSchema,
});
const metadataSchema = z.strictObject({
  meta: z.array(z.tuple([nestedEdnSchema, nestedEdnSchema])),
  value: nestedEdnSchema,
});
ednValueSchema = z.union([
  z.number(),
  z.null(),
  z.boolean(),
  z.string(),
  symbolSchema,
  keywordSchema,
  charSchema,
  z.array(nestedEdnSchema),
  mapSchema,
  setSchema,
  listSchema,
  taggedSchema,
  metadataSchema,
]);

type DecodeResult =
  | { ok: true; document: CandidateDocument }
  | { ok: false; errors: readonly Diagnostic[] };

type Fields = {
  known: ReadonlyMap<string, unknown>;
  extra: readonly ExtraEntry[];
};

function fullName(value: { ns?: string; symbol: string }): string {
  return value.ns === undefined ? value.symbol : `${value.ns}/${value.symbol}`;
}

function keywordName(value: unknown): string | undefined {
  const parsed = keywordSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { keyword, ns } = parsed.data;
  return ns === undefined ? keyword : `${ns}/${keyword}`;
}

function fieldsOf(value: unknown, recognized: ReadonlySet<string>): Fields | undefined {
  const parsed = mapSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const known = new Map<string, unknown>();
  const extra: ExtraEntry[] = [];
  for (const [key, entryValue] of parsed.data.map) {
    const name = keywordName(key);
    if (name !== undefined && recognized.has(name)) known.set(name, entryValue);
    else extra.push([key, entryValue]);
  }
  return { known, extra };
}

function canonicalEdn(value: EDN): string {
  if (value === null) return 'nil';
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`;
  if (typeof value === 'number') return `number:${value}`;
  if (typeof value === 'boolean') return `boolean:${value}`;
  if (Array.isArray(value)) return `vector:[${value.map(canonicalEdn).join(',')}]`;
  if ('keyword' in value) return `keyword:${value.ns ?? ''}/${value.keyword}`;
  if ('symbol' in value) return `symbol:${value.ns ?? ''}/${value.symbol}`;
  if ('char' in value) return `char:${JSON.stringify(value.char)}`;
  if ('map' in value) {
    const pairs = value.map
      .map(([key, entryValue]) => `${canonicalEdn(key)}=>${canonicalEdn(entryValue)}`)
      .sort();
    return `map:{${pairs.join(',')}}`;
  }
  if ('set' in value) {
    return `set:{${value.set.map(canonicalEdn).sort().join(',')}}`;
  }
  if ('list' in value) return `list:(${value.list.map(canonicalEdn).join(',')})`;
  if ('tag' in value) {
    return `tag:${canonicalEdn(value.tag)}:${canonicalEdn(value.value)}`;
  }
  const metadata = value.meta
    .map(([key, entryValue]) => `${canonicalEdn(key)}=>${canonicalEdn(entryValue)}`)
    .sort();
  return `meta:{${metadata.join(',')}}:${canonicalEdn(value.value)}`;
}

function validateCollectionUniqueness(
  value: EDN,
  path: readonly (number | string)[] = [],
): Diagnostic[] {
  const errors: Diagnostic[] = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      errors.push(...validateCollectionUniqueness(entry, [...path, index]));
    });
  } else if (value !== null && typeof value === 'object' && 'map' in value) {
    const seen = new Set<string>();
    value.map.forEach(([key, entryValue], index) => {
      const canonicalKey = canonicalEdn(key);
      if (seen.has(canonicalKey)) {
        errors.push({
          code: 'schema/duplicate-map-key',
          message: 'EDN map keys must be unique',
          path: [...path, index],
        });
      }
      seen.add(canonicalKey);
      errors.push(...validateCollectionUniqueness(key, [...path, index, 'key']));
      errors.push(...validateCollectionUniqueness(entryValue, [...path, index, 'value']));
    });
  } else if (value !== null && typeof value === 'object' && 'set' in value) {
    const seen = new Set<string>();
    value.set.forEach((entry, index) => {
      const canonicalEntry = canonicalEdn(entry);
      if (seen.has(canonicalEntry)) {
        errors.push({
          code: 'schema/duplicate-set-value',
          message: 'EDN set values must be unique',
          path: [...path, index],
        });
      }
      seen.add(canonicalEntry);
      errors.push(...validateCollectionUniqueness(entry, [...path, index]));
    });
  } else if (value !== null && typeof value === 'object' && 'list' in value) {
    value.list.forEach((entry, index) => {
      errors.push(...validateCollectionUniqueness(entry, [...path, index]));
    });
  } else if (value !== null && typeof value === 'object' && 'tag' in value) {
    errors.push(...validateCollectionUniqueness(value.value, [...path, 'value']));
  } else if (value !== null && typeof value === 'object' && 'meta' in value) {
    errors.push(...validateCollectionUniqueness({ map: value.meta }, [...path, 'meta']));
    errors.push(...validateCollectionUniqueness(value.value, [...path, 'value']));
  }
  return errors;
}

function requiredKeyword(
  fields: Fields,
  name: string,
  path: readonly (number | string)[],
  errors: Diagnostic[],
): string | undefined {
  if (!fields.known.has(name)) {
    errors.push({
      code: 'schema/missing-required',
      message: `Missing required :${name}`,
      path: [...path, `:${name}`],
    });
    return undefined;
  }
  const value = keywordName(fields.known.get(name));
  if (value === undefined) {
    errors.push({
      code: 'schema/invalid-field',
      message: `Expected :${name} to be an EDN keyword`,
      path: [...path, `:${name}`],
    });
  }
  return value;
}

function optionalString(fields: Fields, name: string): string | undefined {
  const value = fields.known.get(name);
  return typeof value === 'string' ? value : undefined;
}

function keywordVector(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value.map(keywordName);
  return names.every((name) => name !== undefined) ? (names as string[]) : undefined;
}

function keywordSet(value: unknown): readonly string[] | undefined {
  const parsed = setSchema.safeParse(value);
  return parsed.success ? keywordVector(parsed.data.set) : undefined;
}
```

Add small per-tag decoders (each under 80 lines) that call `fieldsOf()`, validate every present optional field with Zod, accumulate errors, and return `undefined` when that element has any error. Apply these exact field sets and outputs:

| Tag | Recognized keys | Output |
|---|---|---|
| `statement` | `id`, `text`, `tags`, `metadata` | `CandidateStatement` |
| `argument` | `id`, `description`, `tags`, `metadata`, `inferences` | `CandidateArgument` |
| `inference` | `id`, `premises`, `conclusion`, `rules`, `metadata` | `CandidateInference` |
| all relations | `from`, `to` | `CandidateRelation` |

Use these exact defaults:

```ts
const defaultTags: readonly string[] = [];
const defaultRules: readonly string[] = [];
const defaultInferences: readonly CandidateInference[] = [];
```

For optional properties, omit the property when absent rather than assigning `undefined` (required by `exactOptionalPropertyTypes`). Accumulate every field error into one `Diagnostic[]`. Use these codes:

- `schema/missing-root-tag`
- `schema/invalid-edn-value`
- `schema/root-not-vector`
- `schema/expected-map`
- `schema/missing-required`
- `schema/invalid-field`
- `schema/duplicate-map-key`
- `schema/duplicate-set-value`
- `edn/unsupported-tag`

Before decoding semantic tags, recursively walk the Zod-validated EDN value. For every `{ map: ... }`, compare canonicalized keys and emit `schema/duplicate-map-key`; for every `{ set: ... }`, compare canonicalized members and emit `schema/duplicate-set-value`. Canonicalization must be structural: prefix primitive types, preserve vector/list order, sort canonical map pairs and set members, and include namespace plus name for symbols, keywords, and tags. This catches duplicates retained by `edn-parser-js` without reparsing source text.

Finish with this public decoder:

```ts
export function decodeWire(value: unknown): DecodeResult {
  const wire = ednValueSchema.safeParse(value);
  if (!wire.success) {
    return {
      ok: false,
      errors: [{ code: 'schema/invalid-edn-value', message: 'Invalid EDN wire value' }],
    };
  }
  const duplicateErrors = validateCollectionUniqueness(wire.data);
  if (duplicateErrors.length > 0) return { ok: false, errors: duplicateErrors };

  const root = taggedSchema.safeParse(wire.data);
  if (!root.success) {
    return {
      ok: false,
      errors: [{ code: 'schema/missing-root-tag', message: 'Expected a tagged solver root' }],
    };
  }
  const rootName = fullName(root.data.tag);
  if (rootName !== GROUNDED_SOLVER_TAG) {
    return {
      ok: false,
      errors: [{ code: 'edn/unsupported-tag', message: `Unsupported tag #${rootName}` }],
    };
  }
  if (!Array.isArray(root.data.value)) {
    return {
      ok: false,
      errors: [{ code: 'schema/root-not-vector', message: 'Grounded solver value must be a vector' }],
    };
  }

  const errors: Diagnostic[] = [];
  const elements: CandidateElement[] = [];
  root.data.value.forEach((entry, index) => {
    const decoded = decodeElement(entry, index, errors);
    if (decoded !== undefined) elements.push(decoded);
  });
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    document: { solver: GROUNDED_SOLVER_TAG, elements },
  };
}
```

`decodeElement()` must require namespace `THEORY_NAMESPACE`, dispatch the seven child symbols (`statement`, `argument`, `inference` only when nested, `support`, `attack`, `contradiction`, `undercut`), and report paths beginning with the root vector index.

- [ ] **Step 4: Run schema tests, formatting, and typecheck**

Run:

```bash
yarn test src/schema.test.ts
yarn format
yarn lint
yarn typecheck
```

Expected: all commands PASS; `src/schema.ts` remains under 400 nonblank lines.

- [ ] **Step 5: Commit**

```bash
git add src/schema.ts src/schema.test.ts
git commit -m "feat: decode tagged EDN documents"
```

---

### Task 3: Resolve identities and references

**Files:**
- Create: `src/validate.ts`
- Test: `src/validate.test.ts`

- [ ] **Step 1: Write failing semantic-validation tests**

Create `src/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { readEdn } from './edn.js';
import { decodeWire } from './schema.js';
import { validateCandidate } from './validate.js';

function candidate(source: string) {
  const read = readEdn(source);
  if (!read.ok) throw new Error('read failed');
  const decoded = decodeWire(read.value);
  if (!decoded.ok) throw new Error('decode failed');
  return decoded.document;
}

function codes(source: string): readonly string[] {
  const result = validateCandidate(candidate(source));
  return result.ok ? [] : result.errors.map((error) => error.code);
}

describe('validateCandidate', () => {
  it('accepts globally unique and fully resolved identities', () => {
    const result = validateCandidate(
      candidate(`
        #casualtheorics.argdown2.solver/grounded [
          #casualtheorics.argdown2.argdown/statement {:id :p}
          #casualtheorics.argdown2.argdown/statement {:id :c}
          #casualtheorics.argdown2.argdown/argument
            {:id :a :inferences [#casualtheorics.argdown2.argdown/inference
              {:id :i :premises [:p] :conclusion :c}]}
          #casualtheorics.argdown2.argdown/attack {:from :a :to :c}
          #casualtheorics.argdown2.argdown/undercut {:from :p :to :i}
        ]
      `),
    );
    expect(result.ok).toBe(true);
  });

  it('collects duplicate and dangling-reference errors in one pass', () => {
    const result = validateCandidate(
      candidate(`
        #casualtheorics.argdown2.solver/grounded [
          #casualtheorics.argdown2.argdown/statement {:id :same}
          #casualtheorics.argdown2.argdown/argument {:id :same}
          #casualtheorics.argdown2.argdown/attack {:from :missing-a :to :missing-b}
        ]
      `),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toEqual([
      'semantic/duplicate-id',
      'semantic/missing-reference',
      'semantic/missing-reference',
    ]);
  });

  it.each([
    [
      'attack endpoint cannot be an inference',
      '#casualtheorics.argdown2.argdown/attack {:from :i :to :s}',
    ],
    [
      'undercut target must be an inference',
      '#casualtheorics.argdown2.argdown/undercut {:from :s :to :s}',
    ],
  ])('rejects %s', (_name, relation) => {
    const source = `
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/statement {:id :s}
        #casualtheorics.argdown2.argdown/argument
          {:id :a :inferences [#casualtheorics.argdown2.argdown/inference
            {:id :i :premises [:s] :conclusion :s}]}
        ${relation}
      ]
    `;
    expect(codes(source)).toContain('semantic/invalid-endpoint');
  });

  it('requires inference premises and conclusions to reference statements', () => {
    const source = `
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/argument {:id :a}
        #casualtheorics.argdown2.argdown/argument
          {:id :b :inferences [#casualtheorics.argdown2.argdown/inference
            {:id :i :premises [:a] :conclusion :a}]}
      ]
    `;
    expect(codes(source)).toEqual([
      'semantic/invalid-reference-kind',
      'semantic/invalid-reference-kind',
    ]);
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
yarn test src/validate.test.ts
```

Expected: FAIL because `validateCandidate` is missing.

- [ ] **Step 3: Implement the resolver**

Create `src/validate.ts`. Implement these phases in order so diagnostic order is deterministic:

```ts
import type {
  Argument,
  CandidateArgument,
  CandidateDocument,
  CandidateElement,
  Diagnostic,
  EntityId,
  GroundedDocument,
  Inference,
  InferenceId,
  Relation,
  Statement,
  ValidationResult,
} from './model.js';

type Kind = 'argument' | 'inference' | 'statement';

function entityId(value: string): EntityId {
  return value as EntityId;
}

function inferenceId(value: string): InferenceId {
  return value as InferenceId;
}

function collectKinds(
  elements: readonly CandidateElement[],
  errors: Diagnostic[],
): ReadonlyMap<string, Kind> {
  const kinds = new Map<string, Kind>();
  const add = (id: string, kind: Kind, path: readonly (number | string)[]) => {
    if (kinds.has(id)) {
      errors.push({
        code: 'semantic/duplicate-id',
        message: `Duplicate id :${id}`,
        path,
      });
    } else {
      kinds.set(id, kind);
    }
  };
  elements.forEach((element, index) => {
    if (element.kind === 'statement' || element.kind === 'argument') {
      add(element.id, element.kind, [index, ':id']);
    }
    if (element.kind === 'argument') {
      element.inferences.forEach((inference, inferenceIndex) => {
        add(inference.id, 'inference', [index, ':inferences', inferenceIndex, ':id']);
      });
    }
  });
  return kinds;
}
```

Add focused helpers that:

1. report `semantic/missing-reference` when an ID is absent;
2. report `semantic/invalid-reference-kind` for non-statement premise/conclusion IDs;
3. report `semantic/invalid-endpoint` when support/attack/contradiction touches an inference, when undercut `:from` is not a statement/argument, or when undercut `:to` is not an inference;
4. transform strings to branded IDs only after all checks finish.

Finish with:

```ts
export function validateCandidate(candidate: CandidateDocument): ValidationResult {
  const errors: Diagnostic[] = [];
  const kinds = collectKinds(candidate.elements, errors);
  validateInferenceReferences(candidate.elements, kinds, errors);
  validateRelationReferences(candidate.elements, kinds, errors);
  if (errors.length > 0) return { ok: false, errors };

  const elements = candidate.elements.map(toValidatedElement);
  const document: GroundedDocument = {
    elements,
    solver: candidate.solver,
  };
  return { ok: true, document };
}
```

Keep `toValidatedElement()` exhaustive over all element kinds. It may use the two local brand constructors only because the preceding validation established each invariant.

- [ ] **Step 4: Verify semantic validation**

Run:

```bash
yarn test src/validate.test.ts
yarn lint
yarn typecheck
```

Expected: PASS with all errors collected and no partial document returned.

- [ ] **Step 5: Commit**

```bash
git add src/validate.ts src/validate.test.ts
git commit -m "feat: validate EDN graph references"
```

---

### Task 4: Reduce validated documents to Dung frameworks

**Files:**
- Create: `src/reduce-dung.ts`
- Test: `src/reduce-dung.test.ts`

- [ ] **Step 1: Write failing reduction tests**

Create `src/reduce-dung.test.ts` with a small validated-document builder and these assertions:

```ts
import { describe, expect, it } from 'vitest';

import type {
  EntityId,
  GroundedDocument,
  InferenceId,
  TheoryElement,
} from './model.js';
import { GROUNDED_SOLVER_TAG } from './model.js';
import { reduceToDung } from './reduce-dung.js';

const id = (value: string) => value as EntityId;
const inferenceId = (value: string) => value as InferenceId;
const statement = (value: string): TheoryElement => ({
  extra: [],
  id: id(value),
  kind: 'statement',
  tags: [],
});

function document(...elements: readonly TheoryElement[]): GroundedDocument {
  return { solver: GROUNDED_SOLVER_TAG, elements };
}

describe('reduceToDung', () => {
  it('includes statements and arguments but not inference ids as nodes', () => {
    const result = reduceToDung(
      document(
        statement('p'),
        statement('c'),
        {
          extra: [],
          id: id('a'),
          inferences: [
            {
              conclusion: id('c'),
              extra: [],
              id: inferenceId('i'),
              kind: 'inference',
              premises: [id('p')],
              rules: [],
            },
          ],
          kind: 'argument',
          tags: [],
        },
      ),
    );
    expect([...result.framework.nodes]).toEqual([id('p'), id('c'), id('a')]);
  });

  it('adds directed attacks and mutual contradiction attacks', () => {
    const result = reduceToDung(
      document(
        statement('a'),
        statement('b'),
        statement('c'),
        { extra: [], from: id('a'), kind: 'attack', to: id('b') },
        { extra: [], from: id('b'), kind: 'contradiction', to: id('c') },
      ),
    );
    expect(result.framework.attackersByTarget.get(id('b'))).toEqual(new Set([id('a'), id('c')]));
    expect(result.framework.attackersByTarget.get(id('c'))).toEqual(new Set([id('b')]));
  });

  it('omits support and undercut with one warning each', () => {
    const result = reduceToDung(
      document(
        statement('a'),
        statement('b'),
        { extra: [], from: id('a'), kind: 'support', to: id('b') },
        { extra: [], from: id('a'), kind: 'undercut', to: inferenceId('i') },
      ),
    );
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'reduce/support-omitted',
      'reduce/undercut-omitted',
    ]);
    expect(result.framework.attackersByTarget.get(id('b'))).toEqual(new Set());
  });

  it('is independent of theory element order', () => {
    const attack: TheoryElement = {
      extra: [],
      from: id('a'),
      kind: 'attack',
      to: id('b'),
    };
    const first = reduceToDung(document(statement('a'), statement('b'), attack));
    const second = reduceToDung(document(attack, statement('b'), statement('a')));
    expect(first.framework.nodes).toEqual(second.framework.nodes);
    expect(first.framework.attackersByTarget).toEqual(second.framework.attackersByTarget);
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
yarn test src/reduce-dung.test.ts
```

Expected: FAIL because `reduceToDung` is missing.

- [ ] **Step 3: Implement reduction**

Create `src/reduce-dung.ts`:

```ts
import type {
  Diagnostic,
  DungFramework,
  EntityId,
  GroundedDocument,
  Relation,
} from './model.js';

export type ReduceResult = {
  framework: DungFramework;
  warnings: readonly Diagnostic[];
};

function addAttack(
  attackersByTarget: Map<EntityId, Set<EntityId>>,
  from: EntityId,
  to: EntityId,
): void {
  const attackers = attackersByTarget.get(to);
  if (attackers !== undefined) attackers.add(from);
}

function omissionWarning(kind: 'support' | 'undercut', index: number): Diagnostic {
  return {
    code: `reduce/${kind}-omitted`,
    message: `${kind} is represented but omitted from grounded Dung reduction`,
    path: [index],
  };
}

function reduceRelation(
  relation: Relation,
  index: number,
  attackersByTarget: Map<EntityId, Set<EntityId>>,
  warnings: Diagnostic[],
): void {
  if (relation.kind === 'attack') {
    addAttack(attackersByTarget, relation.from, relation.to);
  } else if (relation.kind === 'contradiction') {
    addAttack(attackersByTarget, relation.from, relation.to);
    addAttack(attackersByTarget, relation.to, relation.from);
  } else {
    warnings.push(omissionWarning(relation.kind, index));
  }
}

export function reduceToDung(document: GroundedDocument): ReduceResult {
  const nodes = new Set<EntityId>();
  for (const element of document.elements) {
    if (element.kind === 'statement' || element.kind === 'argument') nodes.add(element.id);
  }

  const attackersByTarget = new Map<EntityId, Set<EntityId>>();
  for (const node of nodes) attackersByTarget.set(node, new Set());

  const warnings: Diagnostic[] = [];
  document.elements.forEach((element, index) => {
    if (
      element.kind === 'attack' ||
      element.kind === 'contradiction' ||
      element.kind === 'support' ||
      element.kind === 'undercut'
    ) {
      reduceRelation(element, index, attackersByTarget, warnings);
    }
  });
  return { framework: { attackersByTarget, nodes }, warnings };
}
```

- [ ] **Step 4: Verify reduction**

Run:

```bash
yarn test src/reduce-dung.test.ts
yarn lint
yarn typecheck
```

Expected: PASS; inference IDs are absent from nodes; support and undercut produce warnings only.

- [ ] **Step 5: Commit**

```bash
git add src/model.ts src/reduce-dung.ts src/reduce-dung.test.ts
git commit -m "feat: reduce EDN theories to Dung frameworks"
```

---

### Task 5: Implement formally correct grounded labeling

**Files:**
- Create: `src/grounded.ts`
- Test: `src/grounded.test.ts`

- [ ] **Step 1: Write failing mathematical tests**

Create `src/grounded.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { groundedLabels } from './grounded.js';
import type { DungFramework, EntityId, Label } from './model.js';

const id = (value: string) => value as EntityId;

function framework(
  nodes: readonly string[],
  edges: readonly (readonly [string, string])[],
): DungFramework {
  const nodeSet = new Set(nodes.map(id));
  const attackersByTarget = new Map<EntityId, Set<EntityId>>();
  for (const node of nodeSet) attackersByTarget.set(node, new Set());
  for (const [from, to] of edges) attackersByTarget.get(id(to))?.add(id(from));
  return { nodes: nodeSet, attackersByTarget };
}

function labelsOf(
  nodes: readonly string[],
  edges: readonly (readonly [string, string])[],
): Readonly<Record<string, Label>> {
  return Object.fromEntries(groundedLabels(framework(nodes, edges)));
}

describe('groundedLabels', () => {
  it('labels an empty framework with an empty map', () => {
    expect(groundedLabels(framework([], [])).size).toBe(0);
  });

  it('labels unattacked nodes IN and their targets OUT', () => {
    expect(labelsOf(['a', 'b'], [['a', 'b']])).toEqual({ a: 'in', b: 'out' });
  });

  it('labels a lone self-attacker UNDEC', () => {
    expect(labelsOf(['a'], [['a', 'a']])).toEqual({ a: 'undec' });
  });

  it('labels mutual and odd cycles UNDEC', () => {
    expect(labelsOf(['a', 'b'], [['a', 'b'], ['b', 'a']])).toEqual({
      a: 'undec',
      b: 'undec',
    });
    expect(labelsOf(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']])).toEqual({
      a: 'undec',
      b: 'undec',
      c: 'undec',
    });
  });

  it('labels OUT when any attacker is IN even if another attacker is OUT', () => {
    expect(
      labelsOf(
        ['a', 'b', 'c', 'd'],
        [
          ['a', 'b'],
          ['a', 'd'],
          ['a', 'c'],
          ['d', 'c'],
        ],
      ),
    ).toEqual({ a: 'in', b: 'out', c: 'out', d: 'out' });
  });

  it('labels a node IN only after all of its attackers become OUT', () => {
    expect(labelsOf(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']])).toEqual({
      a: 'in',
      b: 'out',
      c: 'in',
    });
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
yarn test src/grounded.test.ts
```

Expected: FAIL because `groundedLabels` is missing.

- [ ] **Step 3: Implement the fixpoint**

Create `src/grounded.ts`:

```ts
import type { DungFramework, EntityId, Label } from './model.js';

function allAttackersOut(
  node: EntityId,
  framework: DungFramework,
  labels: ReadonlyMap<EntityId, Label>,
): boolean {
  const attackers = framework.attackersByTarget.get(node) ?? new Set<EntityId>();
  return [...attackers].every((attacker) => labels.get(attacker) === 'out');
}

function markTargetsOut(
  newlyIn: ReadonlySet<EntityId>,
  framework: DungFramework,
  labels: Map<EntityId, Label>,
): void {
  for (const [target, attackers] of framework.attackersByTarget) {
    if (labels.get(target) !== 'undec') continue;
    if ([...attackers].some((attacker) => newlyIn.has(attacker))) {
      labels.set(target, 'out');
    }
  }
}

export function groundedLabels(framework: DungFramework): ReadonlyMap<EntityId, Label> {
  const labels = new Map<EntityId, Label>();
  for (const node of framework.nodes) labels.set(node, 'undec');

  while (true) {
    const newlyIn = new Set<EntityId>();
    for (const node of framework.nodes) {
      if (labels.get(node) === 'undec' && allAttackersOut(node, framework, labels)) {
        newlyIn.add(node);
      }
    }
    if (newlyIn.size === 0) return labels;
    for (const node of newlyIn) labels.set(node, 'in');
    markTargetsOut(newlyIn, framework, labels);
  }
}
```

- [ ] **Step 4: Verify the formal semantics**

Run:

```bash
yarn test src/grounded.test.ts
yarn lint
yarn typecheck
```

Expected: PASS. In particular, self-attack is UNDEC and the old diamond expectation (`b` and `c` IN despite attacker `a` IN) is not retained.

- [ ] **Step 5: Commit**

```bash
git add src/grounded.ts src/grounded.test.ts
git commit -m "fix: implement correct grounded Dung labeling"
```

---

### Task 6: Assemble the public library API

**Files:**
- Rewrite: `src/index.ts`
- Test: `src/index.test.ts`

- [ ] **Step 1: Write failing public API tests**

Create `src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { load, solve, validate } from './index.js';

const source = `
  #casualtheorics.argdown2.solver/grounded [
    #casualtheorics.argdown2.argdown/statement {:id :a}
    #casualtheorics.argdown2.argdown/statement {:id :b}
    #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
  ]
`;

describe('public API', () => {
  it('loads and solves a valid EDN document', () => {
    const loaded = load(source);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = solve(loaded.document);
    expect(Object.fromEntries(result.labels)).toEqual({ a: 'in', b: 'out' });
    expect(result.solver).toBe('casualtheorics.argdown2.solver/grounded');
    expect(result.warnings).toEqual([]);
  });

  it('returns reader diagnostics without throwing', () => {
    expect(load('{:broken')).toMatchObject({
      ok: false,
      errors: [{ code: 'edn/read-error' }],
    });
  });

  it('returns schema diagnostics without throwing', () => {
    expect(load('#other/solver []')).toMatchObject({
      ok: false,
      errors: [{ code: 'edn/unsupported-tag' }],
    });
  });

  it('returns semantic diagnostics without a partial document', () => {
    const result = load(`
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/attack {:from :a :to :missing}
      ]
    `);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toEqual([
      'semantic/missing-reference',
      'semantic/missing-reference',
    ]);
    expect('document' in result).toBe(false);
  });

  it('validates a pre-parsed raw EDN value', async () => {
    const { ednParseMulti } = await import('edn-parser-js');
    const raw = ednParseMulti(source)[0];
    expect(validate(raw).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
yarn test src/index.test.ts
```

Expected: FAIL because the old `index.ts` has no `load` or `validate`.

- [ ] **Step 3: Replace the public surface**

Rewrite `src/index.ts`:

```ts
import { readEdn } from './edn.js';
import { groundedLabels } from './grounded.js';
import type {
  GroundedDocument,
  LoadResult,
  SolveResult,
  ValidationResult,
} from './model.js';
import { reduceToDung } from './reduce-dung.js';
import { decodeWire } from './schema.js';
import { validateCandidate } from './validate.js';

export type {
  Argument,
  Diagnostic,
  DungFramework,
  EntityId,
  GroundedDocument,
  Inference,
  InferenceId,
  Label,
  LoadResult,
  Relation,
  SolveResult,
  Statement,
  TheoryElement,
  ValidationResult,
} from './model.js';

export function validate(value: unknown): ValidationResult {
  const decoded = decodeWire(value);
  return decoded.ok ? validateCandidate(decoded.document) : decoded;
}

export function load(source: string): LoadResult {
  const read = readEdn(source);
  return read.ok ? validate(read.value) : read;
}

export function solve(document: GroundedDocument): SolveResult {
  const reduced = reduceToDung(document);
  return {
    labels: groundedLabels(reduced.framework),
    solver: document.solver,
    warnings: reduced.warnings,
  };
}
```

- [ ] **Step 4: Verify the public pipeline**

Run:

```bash
yarn test src/index.test.ts
yarn test src/edn.test.ts src/schema.test.ts src/validate.test.ts src/reduce-dung.test.ts src/grounded.test.ts
yarn lint
yarn typecheck
yarn build
```

Expected: all new tests and gates PASS while the old source still compiles.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/index.test.ts
git commit -m "feat: expose EDN load validate and solve API"
```

---

### Task 7: Add Argdown 1.x parity example

**Files:**
- Create: `examples/argdown1-censorship.edn`
- Create: `examples/argdown1-censorship.mapping.md`
- Create: `src/parity.test.ts`

- [ ] **Step 1: Add the canonical EDN example**

Create `examples/argdown1-censorship.edn` using the official Argdown 1.x “A first example” entities:

```edn
#casualtheorics.argdown2.solver/grounded
[
  #casualtheorics.argdown2.argdown/statement
  {:id :censorship
   :text "Censorship is not wrong in principle."}

  #casualtheorics.argdown2.argdown/statement
  {:id :absolute-freedom
   :text "Freedom of speech is an absolute right."}

  #casualtheorics.argdown2.argdown/statement
  {:id :censorship-violates-freedom
   :text "Censorship violates freedom of speech."}

  #casualtheorics.argdown2.argdown/statement
  {:id :absolute-rights-rule
   :text "Whatever violates an absolute right is wrong in principle."}

  #casualtheorics.argdown2.argdown/statement
  {:id :censorship-wrong
   :text "Censorship is wrong in principle."}

  #casualtheorics.argdown2.argdown/argument
  {:id :freedom-of-speech
   :description "In a free society everyone must be free to express herself."
   :tags #{:con}
   :metadata {:source "C1a"}
   :inferences
   [#casualtheorics.argdown2.argdown/inference
    {:id :freedom-of-speech-main
     :premises [:absolute-freedom
                :censorship-violates-freedom
                :absolute-rights-rule]
     :conclusion :censorship-wrong
     :rules [:specification :modus-ponens]}]}

  #casualtheorics.argdown2.argdown/argument
  {:id :no-harm-trumps-freedom
   :description "Freedom of speech ceases to be a right when it causes harm."
   :tags #{:pro}
   :metadata {:source "P1a"}}

  #casualtheorics.argdown2.argdown/argument
  {:id :racial-hatred
   :description "Legislation against incitement to racial hatred is permissible."
   :tags #{:pro}
   :metadata {:source "P1b"}}

  #casualtheorics.argdown2.argdown/argument
  {:id :inclusive-debate
   :description "Censorship drives racists underground."
   :tags #{:con}
   :metadata {:source "C1b"}}

  #casualtheorics.argdown2.argdown/argument
  {:id :excessive-sex-violence
   :description "Screen violence contributes to similar behavior."
   :tags #{:pro}
   :metadata {:source "P2"}}

  #casualtheorics.argdown2.argdown/argument
  {:id :causal-link-questionable
   :description "The causal link between screen and real violence is inconclusive."
   :tags #{:con}
   :metadata {:source "C2"}}

  #casualtheorics.argdown2.argdown/support
  {:from :racial-hatred :to :censorship}

  #casualtheorics.argdown2.argdown/attack
  {:from :inclusive-debate :to :racial-hatred}

  #casualtheorics.argdown2.argdown/support
  {:from :excessive-sex-violence :to :censorship}

  #casualtheorics.argdown2.argdown/attack
  {:from :causal-link-questionable :to :excessive-sex-violence}

  #casualtheorics.argdown2.argdown/attack
  {:from :no-harm-trumps-freedom :to :absolute-freedom}

  #casualtheorics.argdown2.argdown/attack
  {:from :freedom-of-speech :to :censorship}

  #casualtheorics.argdown2.argdown/contradiction
  {:from :censorship-wrong :to :censorship}
]
```

- [ ] **Step 2: Document the parity mapping**

Create `examples/argdown1-censorship.mapping.md` with:

```markdown
# Argdown 1.x censorship mapping

Source: <https://argdown.org/guide/a-first-example.html>

- Statement and argument titles become stable EDN keyword IDs.
- Positional premise/conclusion lines become a tagged `:inferences` vector.
- The tutorial's implicit map relations are materialized as explicit tagged relations.
- The conclusion “Censorship is wrong in principle” contradicts the central statement.
- Grounded reduction keeps attack and contradiction (as two attacks), while support remains represented but produces an omission warning.
- Text is shortened only where the tutorial repeats long prose; IDs, dialectical direction, tags, sources, and the reconstructed inference are retained.
```

- [ ] **Step 3: Write parity tests**

Create `src/parity.test.ts`:

```ts
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { load, solve } from './index.js';
import type { EntityId } from './model.js';

const id = (value: string) => value as EntityId;

const source = readFileSync(
  new URL('../examples/argdown1-censorship.edn', import.meta.url),
  'utf8',
);

describe('Argdown 1.x censorship parity', () => {
  it('loads the canonical example', () => {
    expect(load(source).ok).toBe(true);
  });

  it('preserves the reconstructed argument and metadata', () => {
    const loaded = load(source);
    if (!loaded.ok) throw new Error('fixture did not load');
    const freedom = loaded.document.elements.find(
      (element) => element.kind === 'argument' && element.id === 'freedom-of-speech',
    );
    expect(freedom).toMatchObject({
      kind: 'argument',
      tags: ['con'],
      metadata: { map: [[{ keyword: 'source' }, 'C1a']] },
    });
    if (freedom?.kind !== 'argument') return;
    expect(freedom.inferences).toHaveLength(1);
    expect(freedom.inferences[0]?.rules).toEqual(['specification', 'modus-ponens']);
  });

  it('matches the pure-attack grounded labels', () => {
    const loaded = load(source);
    if (!loaded.ok) throw new Error('fixture did not load');
    const result = solve(loaded.document);
    expect(result.labels.get(id('inclusive-debate'))).toBe('in');
    expect(result.labels.get(id('racial-hatred'))).toBe('out');
    expect(result.labels.get(id('causal-link-questionable'))).toBe('in');
    expect(result.labels.get(id('excessive-sex-violence'))).toBe('out');
    expect(result.labels.get(id('no-harm-trumps-freedom'))).toBe('in');
    expect(result.labels.get(id('absolute-freedom'))).toBe('out');
    expect(result.labels.get(id('freedom-of-speech'))).toBe('in');
    expect(result.labels.get(id('censorship'))).toBe('out');
    expect(result.labels.get(id('censorship-wrong'))).toBe('in');
  });

  it('warns once for each represented support relation', () => {
    const loaded = load(source);
    if (!loaded.ok) throw new Error('fixture did not load');
    expect(solve(loaded.document).warnings.map((warning) => warning.code)).toEqual([
      'reduce/support-omitted',
      'reduce/support-omitted',
    ]);
  });
});
```

- [ ] **Step 4: Verify parity**

Run:

```bash
yarn test src/parity.test.ts
yarn lint
yarn typecheck
```

Expected: PASS with the listed labels and exactly two support warnings.

- [ ] **Step 5: Commit**

```bash
git add examples/argdown1-censorship.edn examples/argdown1-censorship.mapping.md src/parity.test.ts
git commit -m "test: add Argdown 1.x EDN parity example"
```

---

### Task 8: Remove the obsolete implementation and simplify packaging

**Files:**
- Delete: every path listed in “Delete after replacement tests pass”
- Modify: `package.json`
- Modify: `yarn.lock`

- [ ] **Step 1: Run the replacement suite before deletion**

Run:

```bash
yarn test src/edn.test.ts src/schema.test.ts src/validate.test.ts src/reduce-dung.test.ts src/grounded.test.ts src/index.test.ts src/parity.test.ts
```

Expected: all replacement tests PASS. Stop if any fail.

- [ ] **Step 2: Delete old source, tests, fixtures, benchmarks, and config**

Use `git rm` on the exact paths in the plan's deletion list. The following commands cover those tracked paths:

```bash
git rm src/ast.ts src/tokens.ts src/tokens.test.ts
git rm src/parser.ts src/parser-util.ts src/parser-frontmatter.ts src/parser-block.ts src/parser-fact.ts src/parser-relation.ts src/parser-arg.ts
git rm src/parser.test.ts src/parser-arg.test.ts src/parser.fuzz.test.ts src/parser.mutate.ts src/parser.mutate.test.ts
git rm src/visitor.ts src/visitor-arg.ts src/visitor-block.ts src/visitor-frontmatter.ts src/visitor-walk.ts
git rm src/stringifier.ts src/stringifier.test.ts src/__snapshots__/stringifier.test.ts.snap
git rm src/mermaid.ts src/mermaid.test.ts
git rm src/cli.ts src/cli.test.ts src/cli/ast.ts src/cli/format.ts src/cli/help.ts src/cli/input.ts src/cli/mcp.ts src/cli/mcp.test.ts src/cli/render.ts src/cli/solve.ts src/cli/validate.ts
git rm src/solver.ts src/solver.test.ts src/solver-graph.ts src/solver-graph.test.ts src/solver-aspic.ts src/solver.aspic.test.ts
git rm src/solver-multi.ts src/solver-multi.test.ts src/solver-multi.equivalence.test.ts src/solver-multi.grounded.test.ts src/solver-multi.large.test.ts src/solver-multi.residue.test.ts src/solver-multi.tarjan.test.ts
git rm src/solver.bipolar.test.ts src/solver.evidential.test.ts src/solver.preferred.test.ts src/solver.stable.test.ts src/solver.complete.test.ts src/solver.cross-validate.test.ts
git rm src/parser.bench.ts src/parser.bench.test.ts src/solver.bench.ts src/solver.bench.test.ts
git rm -r src/parser.fixtures
git rm examples/lead.argdown perf-baseline.json perf-baseline-solver.json stryker.config.mjs scripts/migrate-rule-to-arg.mjs
```

- [ ] **Step 3: Reduce `package.json` to the library-only surface**

Remove `bin`, `exports["./ast"]`, all benchmark/mutation scripts, Chevrotain, the MCP SDK, Tinybench, TSX, and Stryker dependencies. Keep this target shape:

```json
{
  "name": "@casualtheorics/argdown-2",
  "version": "0.1.0-alpha1",
  "private": true,
  "type": "module",
  "packageManager": "yarn@4.17.0",
  "engines": { "node": ">=18" },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "format": "oxfmt src",
    "format:check": "oxfmt --check src",
    "lint": "oxlint src",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "resolutions": {
    "edn-parser-js@npm:2.0.2": "patch:edn-parser-js@npm%3A2.0.2#./.yarn/patches/edn-parser-js-npm-2.0.2.patch"
  },
  "dependencies": {
    "edn-parser-js": "2.0.2",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "oxfmt": "^0.6.0",
    "oxlint": "^0.6.0",
    "typescript": "^7.0.2",
    "vitest": "^1.6.0"
  }
}
```

Run:

```bash
yarn install
```

Expected: obsolete packages disappear from `yarn.lock` and `.yarn/cache`; the patched EDN reader remains.

- [ ] **Step 4: Verify the reduced tree**

Run:

```bash
yarn lint
yarn format:check
yarn typecheck
yarn test
yarn build
```

Expected: all gates PASS with only the EDN/grounded test files active.

- [ ] **Step 5: Commit**

```bash
git add -A src examples package.json yarn.lock .yarn/patches perf-baseline.json perf-baseline-solver.json stryker.config.mjs scripts
git add .yarn/cache/edn-parser-js-*.zip .yarn/cache/zod-*.zip
git commit -m "refactor!: remove custom Argdown implementation"
```

---

### Task 9: Rewrite documentation, CI, and release metadata

**Files:**
- Rewrite: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `docs/DESIGN.md`
- Modify: `docs/GRAMMAR.bnf`
- Modify: `.codebase-memory/adr.md`

- [ ] **Step 1: Rewrite README around the EDN library**

Replace the current README with this complete content:

````markdown
# argdown-2

An EDN argumentation library for validated, solver-rooted theories and grounded Dung evaluation.

> `0.2.0-alpha1` is a breaking pre-1.0 reset. The former custom `.argdown` language and tooling are not supported.

## Quick start

```ts
import { load, solve } from '@casualtheorics/argdown-2';

const loaded = load(`
  #casualtheorics.argdown2.solver/grounded [
    #casualtheorics.argdown2.argdown/statement {:id :a}
    #casualtheorics.argdown2.argdown/statement {:id :b}
    #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
  ]
`);

if (!loaded.ok) {
  console.error(loaded.errors);
} else {
  console.log(solve(loaded.document).labels);
}
```

## Canonical EDN shape

One file contains one solver-tagged root whose value is a vector:

```edn
#casualtheorics.argdown2.solver/grounded
[
  #casualtheorics.argdown2.argdown/statement {:id :a}
  #casualtheorics.argdown2.argdown/statement {:id :b}
  #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
]
```

| Tag | Purpose |
|---|---|
| `#casualtheorics.argdown2.solver/grounded` | Select grounded evaluation for the document |
| `#casualtheorics.argdown2.argdown/statement` | Declare a statement node |
| `#casualtheorics.argdown2.argdown/argument` | Declare an argument and optional inferences |
| `#casualtheorics.argdown2.argdown/inference` | Link statement premises to a statement conclusion |
| `#casualtheorics.argdown2.argdown/support` | Represent support (omitted from v1 Dung reduction) |
| `#casualtheorics.argdown2.argdown/attack` | Add one directed Dung attack |
| `#casualtheorics.argdown2.argdown/contradiction` | Add attacks in both directions |
| `#casualtheorics.argdown2.argdown/undercut` | Target an inference (omitted from v1 reduction) |

IDs and references are EDN keywords. IDs are globally unique across statements, arguments, and inferences.

## Validation

`load(source)` performs three checks:

1. strict EDN parsing;
2. Zod validation of tagged values and fields;
3. identity, reference, and endpoint validation.

Failure returns `{ ok: false, errors }`. Diagnostics use semantic paths; malformed data never produces a partial document.

Use `validate(value)` when EDN has already been read with `edn-parser-js`.

## Grounded reduction

`solve(document)` labels every statement and argument `in`, `out`, or `undec`.

| Relation | Grounded Dung behavior |
|---|---|
| Attack | One directed attack |
| Contradiction | Directed attacks both ways |
| Support | Preserved in the document; omitted with a warning |
| Undercut | Preserved in the document; omitted with a warning |

Inferences are logical structure and are not Dung nodes.

## Argdown 1.x parity

[`examples/argdown1-censorship.edn`](examples/argdown1-censorship.edn) ports the official Argdown 1.x censorship tutorial. Its [mapping note](examples/argdown1-censorship.mapping.md) records relations that were implicit in the original syntax and are explicit in EDN.

## Breaking reset

This release removes the custom lexer/parser, source AST, formatter, CLI, MCP server, Mermaid renderer, and advanced solver surfaces. There is no compatibility shim or migration parser. Historical designs remain under `docs/snowball/`.

## Development

```bash
yarn lint
yarn format:check
yarn typecheck
yarn test
yarn build
```
````

Do not retain references to `parse`, `formatError`, `renderMermaid`, `stringify`, `./ast`, CLI commands, Chevrotain, Stryker, parser fixtures, or the old “public API is frozen” claim.

- [ ] **Step 2: Add the breaking changelog entry and bump the prerelease**

Set `package.json` version to `0.2.0-alpha1`.

Add before the old release in `CHANGELOG.md`:

```markdown
## [0.2.0-alpha1] - 2026-07-17

Breaking pre-1.0 reset.

### Added

- EDN-only canonical representation with namespaced solver and theory tags.
- `load`, `validate`, and `solve` library APIs.
- Zod structural validation and cross-reference validation.
- Formally correct grounded Dung labeling.
- Argdown 1.x censorship parity example.

### Removed

- Custom `.argdown` lexer, parser, source AST, stringifier, CLI, MCP server, and Mermaid renderer.
- Bipolar, ASPIC+, evidential, preferred, stable, and complete solver surfaces.
- Parser and solver benchmark/mutation infrastructure.

### Fixed

- Grounded labeling now applies the formal conditions: IN iff all attackers are OUT; OUT iff any attacker is IN. Self-attacks are UNDEC.
```

Replace the changelog's CLI installation block with library-tarball installation/import guidance.

- [ ] **Step 3: Mark old grammar documents as historical**

Add to the top of `docs/DESIGN.md`:

```markdown
> **Superseded:** This custom Argdown Extended design is historical. The current format is the EDN-only design in [`docs/snowball/specs/2026-07-17-edn-canonical-representation-design.md`](snowball/specs/2026-07-17-edn-canonical-representation-design.md).
```

Add as the first line of `docs/GRAMMAR.bnf`:

```ebnf
(* SUPERSEDED: historical custom grammar; current canonical representation is EDN. *)
```

- [ ] **Step 4: Update CI and release assumptions**

In `.github/workflows/ci.yml`:

- remove the fuzz/cross-validation timeout comment;
- change the test timeout from 30 to 10 minutes;
- change required tarball files to:

```bash
REQUIRED=("package/package.json" "package/README.md" "package/dist/index.js" "package/dist/index.d.ts")
```

In `.github/workflows/release.yml`, remove the fuzz/cross-validation timeout comment and change the timeout from 30 to 10 minutes.

- [ ] **Step 5: Refresh project ADR**

Replace stale parser/CLI/performance entries in `.codebase-memory/adr.md` with:

- EDN-only, solver-rooted data as the contract;
- strict `edn-parser-js` 2.0.2 with the checked-in ESM patch;
- Zod structural decoding followed by semantic reference validation;
- semantic paths rather than source locations;
- correct pure-attack grounded Dung reduction;
- library-only public surface;
- deferred advanced solver tags.

Retain the existing philosophy entries for conservative TypeScript, strict tooling, responsibility-based modules, and YAGNI.

- [ ] **Step 6: Verify docs and release metadata**

Run:

```bash
yarn format
yarn lint
yarn format:check
yarn typecheck
yarn test
yarn build
```

Expected: all gates PASS after the version and documentation reset.

- [ ] **Step 7: Commit**

```bash
git add README.md CHANGELOG.md package.json .github/workflows/ci.yml .github/workflows/release.yml docs/DESIGN.md docs/GRAMMAR.bnf .codebase-memory/adr.md src
git commit -m "docs!: publish EDN-only library contract"
```

---

### Task 10: Final verification and package audit

**Files:**
- Modify only files changed by `yarn format`, if any.

- [ ] **Step 1: Run the complete quality gate from a clean dependency state**

Run:

```bash
yarn install --immutable
yarn lint
yarn format:check
yarn typecheck
yarn test
yarn build
```

Expected: every command exits 0; all EDN reader, schema, semantic, reduction, grounded, API, and parity tests pass.

- [ ] **Step 2: Audit the package tarball**

Run:

```bash
npm pack --dry-run
```

Expected required entries:

- `package/package.json`
- `package/README.md`
- `package/dist/index.js`
- `package/dist/index.d.ts`

Expected absent entries:

- `package/dist/cli.js`
- `package/dist/ast.js`
- any `.argdown` source or parser benchmark.

- [ ] **Step 3: Verify the old runtime surface and dependencies are gone**

Run:

```bash
test -z "$(git ls-files 'src/*.argdown' 'src/parser.fixtures/**' 'examples/*.argdown')"
! rg '"bin"|"./ast"|chevrotain|@modelcontextprotocol/sdk|@stryker-mutator|tinybench' package.json
! rg "export .*parse|renderMermaid|stringify|solveBipolar|solveAspic|solvePreferred" src/index.ts
```

Expected: all three commands exit 0.

- [ ] **Step 4: Verify reader patch and strictness one final time**

Run:

```bash
yarn test src/edn.test.ts -t "odd map arity"
node -e "import('edn-parser-js').then(m => console.log(m.ednParseMulti('1 2').length))"
```

Expected: malformed odd map test PASS; Node prints `2`, proving the patched package root loads and all top-level forms are visible.

- [ ] **Step 5: Commit any formatter-only changes**

If `git status --short` shows formatting changes:

```bash
git add src README.md CHANGELOG.md docs
git commit -m "style: format EDN reset"
```

If the working tree is already clean, do not create an empty commit.

- [ ] **Step 6: Push and update the pull request**

```bash
git push -u origin cursor/edn-canonical-representation-5e3f
```

Update the draft pull request body with the implemented API, breaking removals, reader patch rationale, corrected grounded semantics, parity fixture, and verification commands.

---

## Acceptance checklist

- [ ] Every source document is standard EDN with exactly one solver root.
- [ ] All semantic tags use the `casualtheorics.argdown2.*` namespace.
- [ ] `edn-parser-js` strictly rejects the characterized malformed forms.
- [ ] The one-line ESM patch is checked in and exercised through the package root.
- [ ] Zod validates raw EDN shapes and preserves metadata/unknown entries.
- [ ] Duplicate IDs, dangling references, and endpoint-kind violations are collected before solving.
- [ ] Attack and contradiction reduce correctly; support and undercut warn.
- [ ] Grounded labels satisfy Caminada's formal IN/OUT conditions.
- [ ] A lone self-attacker is UNDEC.
- [ ] The official Argdown 1.x censorship example is represented in EDN and tested.
- [ ] Public exports are only the new API and semantic types.
- [ ] Custom syntax, CLI, renderer, advanced solvers, benchmarks, and obsolete dependencies are removed.
- [ ] README, changelog, historical-doc banners, CI, release workflow, and ADR match the new package.
- [ ] Full tests, lint, formatting, typecheck, build, and package audit pass.
