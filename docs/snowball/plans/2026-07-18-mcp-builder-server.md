# MCP Builder Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-package MCP stdio server (`argdown-2-mcp`) with pure builder tools that construct Argdown 1.x-shaped EDN documents from host-LLM prose fields (path or text I/O, soft apply + warnings), plus strict `validate` and `solve`.

**Architecture:** Package-internal `src/builder/` owns pure `(doc, edit) → { document, warnings, refused?, diff }` over `CandidateDocument`. Internal `src/edn-write.ts` serializes candidates to EDN. `src/mcp/` owns path|text I/O, atomic writes, tool registration, and the bin entrypoint. Public `src/index.ts` exports stay `load` / `validate` / `solve` only.

**Tech Stack:** TypeScript 5.4 (ESM, NodeNext), Vitest 3, Zod 4 (already in repo), `@modelcontextprotocol/sdk` ^1.29.0 (same family as the deleted pre-reset MCP), Yarn 4 PnP, Node ≥18.

**Spec:** `docs/snowball/specs/2026-07-18-mcp-builder-server-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/builder/types.ts` | new | Edit / warning / diff / apply-result types |
| `src/builder/resolve-ref.ts` | new | Id-then-unique-text ref resolution |
| `src/builder/apply.ts` | new | Pure `apply(doc, edit)` + `emptyDocument()` |
| `src/builder/soft-parse.ts` | new | `readEdn` + `decodeWire` → candidate (no semantic validate) |
| `src/builder/fixtures/*.edn` | new | Small golden inputs for writer/builder tests |
| `src/builder/resolve-ref.test.ts` | new | Ref resolution tests |
| `src/builder/apply.test.ts` | new | Apply / soft-warning / refuse tests |
| `src/edn-write.ts` | new | `CandidateDocument` → EDN string |
| `src/edn-write.test.ts` | new | Round-trip write → `load` |
| `src/mcp/io.ts` | new | Path|text load/save + atomic write |
| `src/mcp/tools.ts` | new | Tool handlers (shared by server) |
| `src/mcp/server.ts` | new | `buildServer()` + stdio `run()` |
| `src/mcp/cli.ts` | new | Bin entry (`argdown-2-mcp`) |
| `src/mcp/server.test.ts` | new | InMemoryTransport MCP tests |
| `package.json` | modify | MCP dep, bin, script |
| `README.md` | modify | MCP config snippet + tool overview |

**Dependency direction (one-way):**

```
mcp/cli → mcp/server → mcp/tools → mcp/io → builder/soft-parse → edn + schema
                              ↓                ↓
                         builder/apply    edn-write
                              ↓
                         builder/resolve-ref
                              ↓
                           model types

index.ts  ──▶  load/validate/solve only (no builder/mcp re-exports)
```

**Milestone note:** Tasks 1–6 deliver a usable builder+writer without MCP (library-internal). Tasks 7–10 add MCP, packaging, and docs. Prefer committing at each task boundary.

---

### Task 1: Builder types + empty document

**Files:**
- Create: `src/builder/types.ts`
- Create: `src/builder/apply.ts` (stub: `emptyDocument` only)
- Create: `src/builder/apply.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/builder/apply.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { emptyDocument } from './apply.js';
import { GROUNDED_SOLVER_TAG } from '../model.js';

describe('emptyDocument', () => {
  it('returns a grounded candidate with no elements', () => {
    expect(emptyDocument()).toEqual({
      solver: GROUNDED_SOLVER_TAG,
      elements: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test src/builder/apply.test.ts
```

Expected: FAIL — cannot resolve `./apply.js` or `emptyDocument` is not exported.

- [ ] **Step 3: Add types + minimal implementation**

Create `src/builder/types.ts`:

```ts
import type { CandidateDocument, CandidateElement, RelationKind } from '../model.js';

export type BuilderWarning = {
  code: string;
  message: string;
};

export type RefResolution =
  | { ok: true; id: string; via: 'id' | 'text' }
  | { ok: false; reason: 'missing' | 'ambiguous'; message: string };

export type DiffOp =
  | { op: 'add'; kind: CandidateElement['kind'] | 'inference'; id: string }
  | { op: 'update'; kind: CandidateElement['kind'] | 'inference'; id: string }
  | { op: 'remove'; kind: CandidateElement['kind'] | 'inference' | 'relation'; id: string }
  | {
      op: 'add-relation';
      kind: RelationKind;
      from: string;
      to: string;
    }
  | {
      op: 'remove-relation';
      kind: RelationKind;
      from: string;
      to: string;
    };

export type ApplyResult = {
  document: CandidateDocument;
  warnings: readonly BuilderWarning[];
  refused?: BuilderWarning;
  diff: readonly DiffOp[];
};

export type DocumentEdit =
  | { type: 'add_statement'; id: string; text?: string; tags?: readonly string[] }
  | {
      type: 'update_statement';
      id: string;
      text?: string;
      tags?: readonly string[];
    }
  | {
      type: 'add_argument';
      id: string;
      description?: string;
      tags?: readonly string[];
    }
  | {
      type: 'add_inference';
      argumentId: string;
      id: string;
      premises: readonly string[];
      conclusion: string;
      rules?: readonly string[];
    }
  | {
      type: 'add_relation';
      kind: RelationKind;
      from: string;
      to: string;
    }
  | { type: 'remove_element'; id: string }
  | {
      type: 'remove_relation';
      kind: RelationKind;
      from: string;
      to: string;
    };
```

Create `src/builder/apply.ts`:

```ts
import { GROUNDED_SOLVER_TAG, type CandidateDocument } from '../model.js';

export function emptyDocument(): CandidateDocument {
  return { solver: GROUNDED_SOLVER_TAG, elements: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
yarn test src/builder/apply.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/builder/types.ts src/builder/apply.ts src/builder/apply.test.ts
git commit -m "feat(builder): add empty grounded candidate document"
```

---

### Task 2: Reference resolution (id, then unique text)

**Files:**
- Create: `src/builder/resolve-ref.ts`
- Create: `src/builder/resolve-ref.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/builder/resolve-ref.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { emptyDocument } from './apply.js';
import { resolveRef } from './resolve-ref.js';
import type { CandidateDocument } from '../model.js';

function docWithStatements(): CandidateDocument {
  return {
    ...emptyDocument(),
    elements: [
      {
        kind: 'statement',
        id: 'a',
        text: 'Alpha claim',
        tags: [],
        extra: [],
      },
      {
        kind: 'statement',
        id: 'b',
        text: 'Beta claim',
        tags: [],
        extra: [],
      },
      {
        kind: 'statement',
        id: 'c',
        text: 'Alpha claim',
        tags: [],
        extra: [],
      },
      {
        kind: 'argument',
        id: 'arg1',
        description: 'Arg one',
        tags: [],
        inferences: [],
        extra: [],
      },
    ],
  };
}

describe('resolveRef', () => {
  it('resolves by id first', () => {
    const r = resolveRef(docWithStatements(), 'a');
    expect(r).toEqual({ ok: true, id: 'a', via: 'id' });
  });

  it('resolves by unique statement text', () => {
    const r = resolveRef(docWithStatements(), 'Beta claim');
    expect(r).toEqual({ ok: true, id: 'b', via: 'text' });
  });

  it('resolves by unique argument description', () => {
    const r = resolveRef(docWithStatements(), 'Arg one');
    expect(r).toEqual({ ok: true, id: 'arg1', via: 'text' });
  });

  it('returns ambiguous when text matches multiple', () => {
    const r = resolveRef(docWithStatements(), 'Alpha claim');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ambiguous');
  });

  it('returns missing when nothing matches', () => {
    const r = resolveRef(docWithStatements(), 'nope');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('missing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test src/builder/resolve-ref.test.ts
```

Expected: FAIL — `resolve-ref.js` missing.

- [ ] **Step 3: Implement `resolveRef`**

Create `src/builder/resolve-ref.ts`:

```ts
import type { CandidateDocument } from '../model.js';

import type { RefResolution } from './types.js';

function stripKeywordColon(raw: string): string {
  return raw.startsWith(':') ? raw.slice(1) : raw;
}

export function resolveRef(doc: CandidateDocument, idOrText: string): RefResolution {
  const needle = stripKeywordColon(idOrText.trim());
  if (needle.length === 0) {
    return { ok: false, reason: 'missing', message: 'Empty reference' };
  }

  for (const el of doc.elements) {
    if (el.kind === 'statement' || el.kind === 'argument') {
      if (el.id === needle) return { ok: true, id: el.id, via: 'id' };
    }
  }

  const textHits: string[] = [];
  for (const el of doc.elements) {
    if (el.kind === 'statement' && el.text === needle) textHits.push(el.id);
    if (el.kind === 'argument' && el.description === needle) textHits.push(el.id);
  }
  if (textHits.length === 1) {
    const id = textHits[0];
    if (id === undefined) {
      return { ok: false, reason: 'missing', message: `No entity matches "${needle}"` };
    }
    return { ok: true, id, via: 'text' };
  }
  if (textHits.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous',
      message: `Ambiguous text "${needle}" matches ids: ${textHits.join(', ')}`,
    };
  }
  return { ok: false, reason: 'missing', message: `No entity matches "${needle}"` };
}

/** Resolve an inference id (id-only; text lookup is not used for inferences). */
export function resolveInferenceRef(
  doc: CandidateDocument,
  idOrText: string,
): RefResolution {
  const needle = stripKeywordColon(idOrText.trim());
  for (const el of doc.elements) {
    if (el.kind !== 'argument') continue;
    for (const inf of el.inferences) {
      if (inf.id === needle) return { ok: true, id: inf.id, via: 'id' };
    }
  }
  return {
    ok: false,
    reason: 'missing',
    message: `No inference matches "${needle}"`,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
yarn test src/builder/resolve-ref.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/builder/resolve-ref.ts src/builder/resolve-ref.test.ts
git commit -m "feat(builder): resolve refs by id then unique text"
```

---

### Task 3: `apply` — statements, arguments, inferences

**Files:**
- Modify: `src/builder/apply.ts`
- Modify: `src/builder/apply.test.ts`
- Modify: `src/builder/types.ts` (only if needed)

- [ ] **Step 1: Write failing tests for statement/argument/inference edits**

Append to `src/builder/apply.test.ts`:

```ts
import { apply } from './apply.js';

describe('apply statements and arguments', () => {
  it('adds a statement', () => {
    const result = apply(emptyDocument(), {
      type: 'add_statement',
      id: 'censorship',
      text: 'Censorship is not wrong in principle.',
    });
    expect(result.refused).toBeUndefined();
    expect(result.document.elements).toHaveLength(1);
    expect(result.document.elements[0]).toMatchObject({
      kind: 'statement',
      id: 'censorship',
      text: 'Censorship is not wrong in principle.',
    });
    expect(result.diff).toContainEqual({
      op: 'add',
      kind: 'statement',
      id: 'censorship',
    });
  });

  it('refuses duplicate statement id', () => {
    const once = apply(emptyDocument(), {
      type: 'add_statement',
      id: 'a',
      text: 'one',
    });
    const twice = apply(once.document, {
      type: 'add_statement',
      id: 'a',
      text: 'two',
    });
    expect(twice.refused?.code).toBe('builder/duplicate-id');
    expect(twice.document).toEqual(once.document);
    expect(twice.diff).toEqual([]);
  });

  it('updates statement text', () => {
    const base = apply(emptyDocument(), {
      type: 'add_statement',
      id: 'a',
      text: 'old',
    });
    const updated = apply(base.document, {
      type: 'update_statement',
      id: 'a',
      text: 'new',
    });
    expect(updated.refused).toBeUndefined();
    expect(updated.document.elements[0]).toMatchObject({ text: 'new' });
  });

  it('adds argument and inference; soft-warns unresolved premise text', () => {
    const withArg = apply(emptyDocument(), {
      type: 'add_argument',
      id: 'freedom',
      description: 'Freedom argument',
    });
    const withInf = apply(withArg.document, {
      type: 'add_inference',
      argumentId: 'freedom',
      id: 'freedom-main',
      premises: ['Absolute freedom is a right'],
      conclusion: 'Censorship is wrong',
    });
    expect(withInf.refused).toBeUndefined();
    expect(withInf.warnings.length).toBeGreaterThan(0);
    const arg = withInf.document.elements.find((e) => e.kind === 'argument');
    expect(arg && arg.kind === 'argument' && arg.inferences[0]?.premises[0]).toBe(
      'Absolute freedom is a right',
    );
  });

  it('resolves premise refs to ids when statements exist', () => {
    let doc = emptyDocument();
    doc = apply(doc, {
      type: 'add_statement',
      id: 'p1',
      text: 'Premise one',
    }).document;
    doc = apply(doc, {
      type: 'add_statement',
      id: 'c1',
      text: 'Conclusion one',
    }).document;
    doc = apply(doc, {
      type: 'add_argument',
      id: 'arg',
      description: 'A',
    }).document;
    const result = apply(doc, {
      type: 'add_inference',
      argumentId: 'arg',
      id: 'inf1',
      premises: ['Premise one'],
      conclusion: 'Conclusion one',
    });
    expect(result.warnings).toEqual([]);
    const arg = result.document.elements.find((e) => e.kind === 'argument');
    expect(arg && arg.kind === 'argument' && arg.inferences[0]).toMatchObject({
      premises: ['p1'],
      conclusion: 'c1',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test src/builder/apply.test.ts
```

Expected: FAIL — `apply` not exported.

- [ ] **Step 3: Implement `apply` for these edit kinds**

Replace `src/builder/apply.ts` with an implementation that:

1. Exports `emptyDocument` and `apply(doc, edit): ApplyResult`.
2. Never mutates the input `doc` (copy `elements` arrays).
3. For `add_statement` / `add_argument`: refuse if any statement/argument/inference id already equals `id` (scan all entity + inference ids).
4. For `update_statement`: refuse if id missing; otherwise replace that element.
5. For `add_inference`: find argument by `argumentId` (id only); refuse if missing or duplicate inference id; for each premise and conclusion call `resolveRef` — on success store resolved id; on failure store the raw stripped string and push a `builder/unresolved-ref` warning.
6. Strip leading `:` from ids on input.
7. Default `tags: []`, `extra: []`, `rules: []`, `inferences: []`.

Keep relation/remove handlers for Task 4 (may `refused` with `builder/unsupported-edit` temporarily, or omit from switch until Task 4 — prefer implementing only the types tested here and using a exhaustive `never` check with a refuse fallback).

Sketch of the public signature:

```ts
import type { CandidateDocument } from '../model.js';
import type { ApplyResult, DocumentEdit } from './types.js';

export function emptyDocument(): CandidateDocument { /* ... */ }

export function apply(doc: CandidateDocument, edit: DocumentEdit): ApplyResult {
  // switch (edit.type) { ... }
}
```

Helper: `allIds(doc): Set<string>` collecting statement ids, argument ids, and inference ids.

- [ ] **Step 4: Run tests**

```bash
yarn test src/builder/apply.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/builder/apply.ts src/builder/apply.test.ts src/builder/types.ts
git commit -m "feat(builder): apply statement, argument, and inference edits"
```

---

### Task 4: `apply` — relations, remove, soft undercut

**Files:**
- Modify: `src/builder/apply.ts`
- Modify: `src/builder/apply.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
describe('apply relations and remove', () => {
  it('adds attack with resolved ids and warns on missing endpoint', () => {
    let doc = emptyDocument();
    doc = apply(doc, {
      type: 'add_statement',
      id: 'a',
      text: 'A',
    }).document;
    const withWarn = apply(doc, {
      type: 'add_relation',
      kind: 'attack',
      from: 'a',
      to: 'missing-target',
    });
    expect(withWarn.refused).toBeUndefined();
    expect(withWarn.warnings.some((w) => w.code === 'builder/unresolved-ref')).toBe(
      true,
    );
    expect(withWarn.document.elements.some((e) => e.kind === 'attack')).toBe(true);
  });

  it('adds undercut to inference id', () => {
    let doc = emptyDocument();
    doc = apply(doc, { type: 'add_statement', id: 'p', text: 'P' }).document;
    doc = apply(doc, { type: 'add_statement', id: 'c', text: 'C' }).document;
    doc = apply(doc, {
      type: 'add_argument',
      id: 'arg',
      description: 'Arg',
    }).document;
    doc = apply(doc, {
      type: 'add_inference',
      argumentId: 'arg',
      id: 'inf1',
      premises: ['p'],
      conclusion: 'c',
    }).document;
    doc = apply(doc, {
      type: 'add_statement',
      id: 'attacker',
      text: 'Attacker',
    }).document;
    const result = apply(doc, {
      type: 'add_relation',
      kind: 'undercut',
      from: 'attacker',
      to: 'inf1',
    });
    expect(result.refused).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.document.elements.at(-1)).toMatchObject({
      kind: 'undercut',
      from: 'attacker',
      to: 'inf1',
    });
  });

  it('removes statement by id', () => {
    const base = apply(emptyDocument(), {
      type: 'add_statement',
      id: 'a',
      text: 'A',
    });
    const removed = apply(base.document, { type: 'remove_element', id: 'a' });
    expect(removed.document.elements).toEqual([]);
  });

  it('removes relation by kind+from+to', () => {
    let doc = emptyDocument();
    doc = apply(doc, { type: 'add_statement', id: 'a', text: 'A' }).document;
    doc = apply(doc, { type: 'add_statement', id: 'b', text: 'B' }).document;
    doc = apply(doc, {
      type: 'add_relation',
      kind: 'attack',
      from: 'a',
      to: 'b',
    }).document;
    const removed = apply(doc, {
      type: 'remove_relation',
      kind: 'attack',
      from: 'a',
      to: 'b',
    });
    expect(removed.document.elements.every((e) => e.kind !== 'attack')).toBe(true);
  });

  it('refuses remove of unknown id', () => {
    const result = apply(emptyDocument(), {
      type: 'remove_element',
      id: 'nope',
    });
    expect(result.refused?.code).toBe('builder/missing-id');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL** on unimplemented relation/remove branches.

- [ ] **Step 3: Implement**

For `add_relation`:
- Resolve `from` with `resolveRef` (entity).
- Resolve `to` with `resolveInferenceRef` when `kind === 'undercut'`, else `resolveRef`.
- On failed resolve: keep raw stripped string, push warning; still add relation (soft).
- On success: store resolved ids.
- `extra: []`.

For `remove_element`: remove statement/argument with matching id, or inference with matching id (from inside its argument). Refuse if nothing matched.

For `remove_relation`: resolve from/to the same way as add; remove first matching relation with same kind+from+to; refuse if none.

- [ ] **Step 4: Run tests — expect PASS**

```bash
yarn test src/builder/
```

- [ ] **Step 5: Commit**

```bash
git add src/builder/apply.ts src/builder/apply.test.ts
git commit -m "feat(builder): apply relations and removals with soft refs"
```

---

### Task 5: EDN writer + round-trip fixture

**Files:**
- Create: `src/edn-write.ts`
- Create: `src/edn-write.test.ts`
- Create: `src/builder/fixtures/two-statements-attack.edn`

- [ ] **Step 1: Add fixture**

Create `src/builder/fixtures/two-statements-attack.edn`:

```edn
#casualtheorics.argdown2.solver/grounded
[
  #casualtheorics.argdown2.argdown/statement
  {:id :a
   :text "Alpha"}

  #casualtheorics.argdown2.argdown/statement
  {:id :b
   :text "Beta"}

  #casualtheorics.argdown2.argdown/attack
  {:from :a :to :b}
]
```

- [ ] **Step 2: Write failing writer tests**

Create `src/edn-write.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { apply, emptyDocument } from './builder/apply.js';
import { writeEdn } from './edn-write.js';
import { load } from './index.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'builder/fixtures');

describe('writeEdn', () => {
  it('round-trips a builder-built attack document through load', () => {
    let doc = emptyDocument();
    doc = apply(doc, { type: 'add_statement', id: 'a', text: 'Alpha' }).document;
    doc = apply(doc, { type: 'add_statement', id: 'b', text: 'Beta' }).document;
    doc = apply(doc, {
      type: 'add_relation',
      kind: 'attack',
      from: 'a',
      to: 'b',
    }).document;
    const edn = writeEdn(doc);
    const loaded = load(edn);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.document.elements).toHaveLength(3);
  });

  it('round-trips the hand fixture through decode-equivalent load', () => {
    const source = readFileSync(join(fixtureDir, 'two-statements-attack.edn'), 'utf8');
    const loaded = load(source);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const written = writeEdn({
      solver: loaded.document.solver,
      elements: loaded.document.elements.map((el) => {
        // GroundedDocument brands ids; writer accepts CandidateDocument — cast via JSON clone of plain fields
        return JSON.parse(JSON.stringify(el)) as (typeof loaded.document.elements)[number];
      }) as unknown as import('./model.js').CandidateDocument['elements'],
      // simpler: soft-parse path in next task; for now rebuild candidate from load is awkward.
    } as import('./model.js').CandidateDocument);
    // Prefer: use softParse once Task 6 exists. For this task, only test builder→write→load above,
    // and assert fixture load alone:
    expect(loaded.document.solver).toBe('casualtheorics.argdown2.solver/grounded');
  });
});
```

**Simplify the second test** to only `load(fixture)` asserting `ok` until Task 6 adds `softParse`. Delete the broken `writeEdn` cast block — keep only:

```ts
  it('loads the hand fixture', () => {
    const source = readFileSync(join(fixtureDir, 'two-statements-attack.edn'), 'utf8');
    expect(load(source).ok).toBe(true);
  });
```

- [ ] **Step 3: Run — expect FAIL** on missing `writeEdn`.

- [ ] **Step 4: Implement `writeEdn`**

Create `src/edn-write.ts` that prints:

- Root: `#casualtheorics.argdown2.solver/grounded` then a vector.
- Statements: `#casualtheorics.argdown2.argdown/statement {:id :… :text "…" :tags #{…}?}`
- Arguments with nested inference tags.
- Relations: `#…/attack|support|contradiction|undercut {:from :… :to :…}`

Rules:
- Keyword ids: print as `:id` (no namespace).
- Strings: EDN-escape `"` and `\`.
- Tags: `#{:tag1 :tag2}` when non-empty; omit `:tags` when empty.
- Omit `:metadata` when undefined; when present and value is a plain `Record<string, string>`, print `{:k "v"}` keywords; when value is an EDN wire object from `decodeWire`, use recursive `printWire`.
- Implement `printWire(value: unknown): string` covering null, boolean, number, string, arrays (vectors), `{keyword}`, `{map}`, `{set}`, `{list}`, `{tag}`, `{symbol}`, `{char}`, `{meta}`.
- For `extra` entries on elements: if non-empty, merge into the map as additional printed pairs via `printWire` on each key/value (preserve round-trip for soft-parsed docs).

Also export a helper used by MCP later:

```ts
export function writeEdn(doc: CandidateDocument): string
```

- [ ] **Step 5: Run tests**

```bash
yarn test src/edn-write.test.ts src/builder/
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/edn-write.ts src/edn-write.test.ts src/builder/fixtures/two-statements-attack.edn
git commit -m "feat: add CandidateDocument EDN writer"
```

---

### Task 6: Soft-parse (EDN → candidate without semantic validate)

**Files:**
- Create: `src/builder/soft-parse.ts`
- Create: `src/builder/soft-parse.test.ts`
- Modify: `src/edn-write.test.ts` (add softParse → write → load round-trip)

- [ ] **Step 1: Write failing tests**

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { softParse } from './soft-parse.js';
import { writeEdn } from '../edn-write.js';
import { load } from '../index.js';

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/two-statements-attack.edn',
);

describe('softParse', () => {
  it('decodes fixture without semantic validate', () => {
    const source = readFileSync(fixture, 'utf8');
    const parsed = softParse(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.elements).toHaveLength(3);
  });

  it('round-trips fixture through writeEdn then load', () => {
    const source = readFileSync(fixture, 'utf8');
    const parsed = softParse(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const written = writeEdn(parsed.document);
    expect(load(written).ok).toBe(true);
  });

  it('returns errors for empty input', () => {
    const parsed = softParse('');
    expect(parsed.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
import { readEdn } from '../edn.js';
import type { CandidateDocument, Diagnostic } from '../model.js';
import { decodeWire } from '../schema.js';

export type SoftParseResult =
  | { ok: true; document: CandidateDocument }
  | { ok: false; errors: readonly Diagnostic[] };

export function softParse(source: string): SoftParseResult {
  const read = readEdn(source);
  if (!read.ok) return read;
  return decodeWire(read.value);
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
yarn test src/builder/soft-parse.test.ts src/edn-write.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/builder/soft-parse.ts src/builder/soft-parse.test.ts src/edn-write.test.ts
git commit -m "feat(builder): soft-parse EDN to candidate without semantic validate"
```

---

### Task 7: MCP I/O (path | text)

**Files:**
- Create: `src/mcp/io.ts`
- Create: `src/mcp/io.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { emptyDocument } from '../builder/apply.js';
import { writeEdn } from '../edn-write.js';
import { loadDocumentRef, saveDocumentRef, type DocumentRef } from './io.js';

describe('mcp io', () => {
  it('loads and saves path refs in place', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-mcp-'));
    const path = join(dir, 'doc.edn');
    await writeFile(path, writeEdn(emptyDocument()), 'utf8');
    const loaded = await loadDocumentRef({ path });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const next = {
      ...loaded.document,
      elements: [
        {
          kind: 'statement' as const,
          id: 'a',
          text: 'A',
          tags: [],
          extra: [],
        },
      ],
    };
    const saved = await saveDocumentRef({ path }, next);
    expect(saved.ok).toBe(true);
    const body = await readFile(path, 'utf8');
    expect(body).toContain(':a');
  });

  it('loads text refs and save returns text without disk', async () => {
    const ref: DocumentRef = { text: writeEdn(emptyDocument()) };
    const loaded = await loadDocumentRef(ref);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const saved = await saveDocumentRef(ref, loaded.document);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect('text' in saved && saved.text).toContain('grounded');
  });

  it('errors when both path and text provided', async () => {
    const result = await loadDocumentRef({ path: 'x', text: 'y' } as DocumentRef);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/mcp/io.ts`**

```ts
import { rename, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { softParse } from '../builder/soft-parse.js';
import type { CandidateDocument, Diagnostic } from '../model.js';
import { writeEdn } from '../edn-write.js';

export type DocumentRef =
  | { path: string; text?: undefined }
  | { text: string; path?: undefined };

export type LoadDocResult =
  | { ok: true; document: CandidateDocument; ref: DocumentRef }
  | { ok: false; errors: readonly Diagnostic[]; isError?: boolean };

export type SaveDocResult =
  | { ok: true; path: string }
  | { ok: true; text: string }
  | { ok: false; errors: readonly Diagnostic[]; isError?: boolean };

function isPathRef(ref: DocumentRef): ref is { path: string } {
  return typeof (ref as { path?: string }).path === 'string'
    && (ref as { text?: string }).text === undefined;
}

function isTextRef(ref: DocumentRef): ref is { text: string } {
  return typeof (ref as { text?: string }).text === 'string'
    && (ref as { path?: string }).path === undefined;
}

export async function loadDocumentRef(ref: DocumentRef): Promise<LoadDocResult> {
  if (isPathRef(ref)) {
    try {
      const source = await readFile(ref.path, 'utf8');
      const parsed = softParse(source);
      if (!parsed.ok) return parsed;
      return { ok: true, document: parsed.document, ref };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        isError: true,
        errors: [{ code: 'mcp/io-error', message }],
      };
    }
  }
  if (isTextRef(ref)) {
    const parsed = softParse(ref.text);
    if (!parsed.ok) return parsed;
    return { ok: true, document: parsed.document, ref };
  }
  return {
    ok: false,
    isError: true,
    errors: [
      {
        code: 'mcp/invalid-ref',
        message: 'Provide exactly one of path or text',
      },
    ],
  };
}

export async function saveDocumentRef(
  ref: DocumentRef,
  document: CandidateDocument,
): Promise<SaveDocResult> {
  const edn = writeEdn(document);
  if (isTextRef(ref)) return { ok: true, text: edn };
  if (!isPathRef(ref)) {
    return {
      ok: false,
      isError: true,
      errors: [
        {
          code: 'mcp/invalid-ref',
          message: 'Provide exactly one of path or text',
        },
      ],
    };
  }
  try {
    const tmp = join(dirname(ref.path), `.${Date.now()}.argdown-2.tmp`);
    await writeFile(tmp, edn, 'utf8');
    await rename(tmp, ref.path);
    return { ok: true, path: ref.path };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      isError: true,
      errors: [{ code: 'mcp/io-error', message }],
    };
  }
}

/** Create a new empty file for path refs, or return empty EDN text. */
export async function createDocumentRef(ref: DocumentRef): Promise<SaveDocResult> {
  const { emptyDocument } = await import('../builder/apply.js');
  return saveDocumentRef(ref, emptyDocument());
}
```

Prefer static import of `emptyDocument` instead of dynamic import in the final code.

- [ ] **Step 4: Run — expect PASS**

```bash
yarn test src/mcp/io.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/mcp/io.ts src/mcp/io.test.ts
git commit -m "feat(mcp): path and text document I/O with atomic writes"
```

---

### Task 8: MCP tool handlers

**Files:**
- Create: `src/mcp/tools.ts`
- Create: `src/mcp/tools.test.ts` (unit-test handlers without transport)

- [ ] **Step 1: Write failing handler tests**

Test `runCreateDocument`, `runAddStatement`, `runValidate`, `runSolve` as plain async functions returning `{ content, isError? }` shapes — no MCP SDK yet.

Example:

```ts
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  runAddRelation,
  runAddStatement,
  runCreateDocument,
  runSolve,
  runValidate,
} from './tools.js';

function parseBody(res: { content: { type: string; text: string }[] }) {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

describe('mcp tool handlers', () => {
  it('create + add_statement + validate + solve on a path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-mcp-'));
    const path = join(dir, 'doc.edn');
    const created = await runCreateDocument({ path });
    expect(parseBody(created).ok).toBe(true);
    await runAddStatement({ path, id: 'a', text: 'A' });
    await runAddStatement({ path, id: 'b', text: 'B' });
    await runAddRelation({ path, kind: 'attack', from: 'a', to: 'b' });
    const validated = await runValidate({ path });
    expect(parseBody(validated).ok).toBe(true);
    const solved = await runSolve({ path });
    const body = parseBody(solved);
    expect(body.ok).toBe(true);
    expect(body.labels).toMatchObject({ a: 'in', b: 'out' });
    const disk = await readFile(path, 'utf8');
    expect(disk).toContain(':a');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement handlers in `src/mcp/tools.ts`**

Shared helpers:

```ts
function jsonResult(body: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(body) }],
    ...(isError ? { isError: true } : {}),
  };
}
```

Each mutating tool:
1. `loadDocumentRef`
2. `apply(doc, edit)`
3. if `refused` → `jsonResult({ ok: false, refused, warnings, diff: [] })` without save
4. else `saveDocumentRef` → `jsonResult({ ok: true, warnings, diff, path? , text? })`

`runValidate` / `runSolve`: read source from path or use text; call `load` / `solve` from `../index.js`; map `labels` Map → `Record<string, string>`.

Also implement: `runAddArgument`, `runAddInference`, `runUpdateStatement`, `runRemoveElement`, `runRemoveRelation`, `runListElements`.

`runListElements` returns `{ ok, elements: [{ kind, id, text?, description? }] }` (relations as `{ kind, from, to }`).

`create_document` with path: write empty file (create parent not required). With text: return empty EDN in `text`.

- [ ] **Step 4: Run — expect PASS**

```bash
yarn test src/mcp/tools.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools.ts src/mcp/tools.test.ts
git commit -m "feat(mcp): implement builder and validate/solve tool handlers"
```

---

### Task 9: MCP server + SDK dependency + bin

**Files:**
- Modify: `package.json`
- Create: `src/mcp/server.ts`
- Create: `src/mcp/cli.ts`
- Create: `src/mcp/server.test.ts`

- [ ] **Step 1: Add dependency**

```bash
yarn add @modelcontextprotocol/sdk@^1.29.0
```

Expected: dependency listed under `dependencies` (runtime — the bin needs it).

- [ ] **Step 2: Write failing registration test**

Create `src/mcp/server.test.ts` following the deleted `mcp.test.ts` pattern:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildServer } from './server.js';

const TOOL_NAMES = [
  'add_argument',
  'add_inference',
  'add_relation',
  'add_statement',
  'create_document',
  'list_elements',
  'remove_element',
  'remove_relation',
  'solve',
  'update_statement',
  'validate',
].sort();

let client: Client;
let server: ReturnType<typeof buildServer>;

beforeEach(async () => {
  server = buildServer();
  client = new Client({ name: 'argdown-2-mcp-test', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
});

afterEach(async () => {
  await Promise.allSettled([client.close(), server.close()]);
});

describe('argdown-2 mcp registration', () => {
  it('lists the builder tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOL_NAMES);
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (missing server / SDK resolve)

- [ ] **Step 4: Implement `buildServer`**

Create `src/mcp/server.ts`:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import * as tools from './tools.js';

const docRefSchema = {
  path: z.string().optional().describe('Filesystem path to an .edn document'),
  text: z.string().optional().describe('Full EDN document text'),
};

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'argdown-2', version: '0.2.0-alpha1' },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'create_document',
    {
      title: 'Create document',
      description: 'Create an empty grounded argdown-2 EDN document (path or text).',
      inputSchema: docRefSchema,
    },
    async (args) => tools.runCreateDocument(args),
  );

  server.registerTool(
    'add_statement',
    {
      title: 'Add statement',
      description: 'Add a statement (id + prose text).',
      inputSchema: {
        ...docRefSchema,
        id: z.string(),
        text: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async (args) => tools.runAddStatement(args),
  );

  server.registerTool(
    'update_statement',
    {
      title: 'Update statement',
      description: 'Update an existing statement by id.',
      inputSchema: {
        ...docRefSchema,
        id: z.string(),
        text: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async (args) => tools.runUpdateStatement(args),
  );

  server.registerTool(
    'add_argument',
    {
      title: 'Add argument',
      description: 'Add an argument (id + prose description).',
      inputSchema: {
        ...docRefSchema,
        id: z.string(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async (args) => tools.runAddArgument(args),
  );

  server.registerTool(
    'add_inference',
    {
      title: 'Add inference',
      description: 'Add an inference under an argument; premises/conclusion are id-or-prose refs.',
      inputSchema: {
        ...docRefSchema,
        argumentId: z.string(),
        id: z.string(),
        premises: z.array(z.string()),
        conclusion: z.string(),
        rules: z.array(z.string()).optional(),
      },
    },
    async (args) => tools.runAddInference(args),
  );

  server.registerTool(
    'add_relation',
    {
      title: 'Add relation',
      description: 'Add support|attack|contradiction|undercut (from/to are id-or-prose refs).',
      inputSchema: {
        ...docRefSchema,
        kind: z.enum(['support', 'attack', 'contradiction', 'undercut']),
        from: z.string(),
        to: z.string(),
      },
    },
    async (args) => tools.runAddRelation(args),
  );

  server.registerTool(
    'remove_element',
    {
      title: 'Remove element',
      description: 'Remove a statement, argument, or inference by id.',
      inputSchema: { ...docRefSchema, id: z.string() },
    },
    async (args) => tools.runRemoveElement(args),
  );

  server.registerTool(
    'remove_relation',
    {
      title: 'Remove relation',
      description: 'Remove a relation by kind + from + to (id-or-prose refs).',
      inputSchema: {
        ...docRefSchema,
        kind: z.enum(['support', 'attack', 'contradiction', 'undercut']),
        from: z.string(),
        to: z.string(),
      },
    },
    async (args) => tools.runRemoveRelation(args),
  );

  server.registerTool(
    'list_elements',
    {
      title: 'List elements',
      description: 'List statements, arguments, inferences, and relations in the document.',
      inputSchema: docRefSchema,
    },
    async (args) => tools.runListElements(args),
  );

  server.registerTool(
    'validate',
    {
      title: 'Validate',
      description: 'Strict-load the document and return semantic diagnostics.',
      inputSchema: docRefSchema,
    },
    async (args) => tools.runValidate(args),
  );

  server.registerTool(
    'solve',
    {
      title: 'Solve',
      description: 'Strict-load and compute grounded labels.',
      inputSchema: docRefSchema,
    },
    async (args) => tools.runSolve(args),
  );

  return server;
}

export async function run(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>((resolve) => {
    server.server.onclose = () => resolve();
    process.on('SIGINT', () => {
      void server.close();
    });
    process.on('SIGTERM', () => {
      void server.close();
    });
  });
}
```

Register **all** tools listed in `TOOL_NAMES`. Keep handlers thin — only map zod args into `tools.run*`.

Create `src/mcp/cli.ts`:

```ts
import { run } from './server.js';

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 5: Wire `package.json`**

Add:

```json
"bin": {
  "argdown-2-mcp": "./dist/mcp/cli.js"
},
```

Add script:

```json
"mcp": "node ./dist/mcp/cli.js"
```

Ensure `files` still includes `dist`. After `yarn build`, `dist/mcp/cli.js` must exist with a shebang if required — Node bins often need:

```ts
#!/usr/bin/env node
```

at the top of `cli.ts` (TypeScript emits it if present).

- [ ] **Step 6: Build and test**

```bash
yarn build
yarn test src/mcp/server.test.ts
yarn typecheck
yarn knip
```

Expected: tests PASS; knip clean (mcp/cli is used via bin — if knip flags it, add knip entry/bin configuration per knip docs for this repo).

If knip complains about unused `@modelcontextprotocol/sdk` or entry files, update knip config or `package.json` knip section minimally so the bin entry is recognized.

- [ ] **Step 7: Commit**

```bash
git add package.json yarn.lock src/mcp/server.ts src/mcp/cli.ts src/mcp/server.test.ts
git commit -m "feat(mcp): add stdio server, bin, and registration tests"
```

---

### Task 10: README + end-to-end handler smoke for censorship shape

**Files:**
- Modify: `README.md`
- Modify: `src/mcp/tools.test.ts` (optional longer smoke)

- [ ] **Step 1: Extend tools test with a mini censorship build**

Add a test that, via handlers only:

1. `create_document` (text mode)
2. Add statements `censorship`, `absolute-freedom` with prose texts from the example
3. Add `attack` / `support` using mix of ids and text refs
4. `validate` → ok
5. `solve` → returns labels map

Use text mode end-to-end (thread returned `text` into the next call).

- [ ] **Step 2: Run tests**

```bash
yarn test src/mcp/
```

Expected: PASS.

- [ ] **Step 3: Update README**

After the Quick start section, add:

```markdown
## MCP server

Build documents from an MCP host (e.g. Cursor) using prose-friendly builder tools:

```bash
yarn build
yarn mcp
# or: npx argdown-2-mcp   # after link/publish
```

Example Cursor MCP config:

```json
{
  "mcpServers": {
    "argdown-2": {
      "command": "node",
      "args": ["/absolute/path/to/argdown-2/dist/mcp/cli.js"]
    }
  }
}
```

Tools: `create_document`, `add_statement`, `update_statement`, `add_argument`, `add_inference`, `add_relation`, `remove_element`, `remove_relation`, `list_elements`, `validate`, `solve`.

Each mutating tool takes exactly one of `path` or `text`. Path mode writes in place; text mode returns the full updated EDN. Intermediate documents may warn on unresolved refs; call `validate` before `solve`.
```

Adjust wording to match README tone. Do **not** claim the old custom-language MCP is back.

- [ ] **Step 4: Final gates**

```bash
yarn lint
yarn format
yarn typecheck
yarn test
yarn build
yarn knip
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add README.md src/mcp/tools.test.ts
git commit -m "docs: document argdown-2 MCP builder server"
```

---

## Self-review checklist (author)

| Spec requirement | Task |
|---|---|
| Same package, bin `argdown-2-mcp` | 9 |
| Public API unchanged | 9 (no index exports) + knip |
| Host LLM prose fields, deterministic server | 3–4, 8 |
| Path \| text; path in-place atomic | 7 |
| Soft apply + warnings; refuse shape/id errors | 3–4 |
| Id then unique text refs | 2 |
| Full 1.x ontology mutations | 3–4, 8 |
| `validate` + `solve` | 8–9 |
| Internal builder + writer | 1–6 |
| Tests: builder, writer, MCP in-memory | 1–6, 9–10 |
| README config | 10 |

---

## Execution notes

- Prefer **subagent-driven-development** with review between tasks.
- If scope pressure appears mid-flight, ship through Task 6 as an internal milestone before MCP wiring (Tasks 7–10).
- Do not export builder/writer from `src/index.ts`.

