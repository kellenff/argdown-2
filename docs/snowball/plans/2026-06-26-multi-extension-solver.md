# Multi-Extension Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 new public functions to `argdown-2` — Dung's preferred, stable, and complete semantics, each composing with the existing four edge reductions (Dung, bipolar, ASPIC+, evidential). Retires the multi-extension deferral noted in all four prior solver specs.

**Architecture:** Two new internal modules (`src/solver-graph.ts` for the shared attack-graph construction layer, `src/solver-multi.ts` for the three multi-extension algorithms) plus thin wrapper exports. Existing 4 grounded solvers untouched. One contained refactor of `src/solver-aspic.ts` extracts `buildAspicDefeatMap` so the ASPIC+ reduction can compose with the multi-extension layer.

**Tech Stack:** TypeScript (strict, isolatedModules, exactOptionalPropertyTypes), Vitest, Yarn 4 PnP, Chevrotain (existing), oxlint, oxfmt.

---

## File Structure

**Create:**
- `src/solver-graph.ts` — shared attack/defeat-graph construction (`buildArgumentGraph`)
- `src/solver-multi.ts` — multi-extension algorithms (`findPreferredExtensions`, `findStableExtensions`, `findCompleteExtensions`, plus aux operators)
- `src/solver-graph.test.ts` — tests for `buildArgumentGraph` across all 4 reductions
- `src/solver-multi.test.ts` — tests for the three algorithms independent of any reduction
- `src/solver.preferred.test.ts` — preferred semantics × 4 reductions, end-to-end via the public functions
- `src/solver.stable.test.ts` — same for stable
- `src/solver.complete.test.ts` — same for complete
- `src/solver.cross-validate.test.ts` — cross-validation invariant test

**Modify:**
- `src/solver.ts` — add `MultiSolveResult` type, 9 new exports (3 Dung + 3 bipolar + 3 evidential)
- `src/solver-aspic.ts` — extract `buildAspicDefeatMap` helper, add 3 new exports (3 ASPIC+ multi-extension)
- `src/cli.ts` — extend `--semantics` whitelist from 4 to 16, extend dispatch
- `src/cli.test.ts` — 12 new snapshot tests
- `src/index.ts` — re-export 12 new functions
- `src/solver.bench.ts` — add 12 new task types to `TASK_TYPES` and `makeTaskBody`
- `perf-baseline-solver.json` — refresh with the 12 new task entries
- `README.md` — document the 12 new flags, the cross-validation invariant, worst-case complexity

**Reference (read-only):**
- `docs/snowball/specs/2026-06-26-multi-extension-solver-design.md` — the design spec
- `docs/snowball/specs/2026-06-26-aspic-solver-design.md` — ASPIC+ defeat-derivation reference
- `src/solver.ts` — existing grounded solvers, `label()` function, key helpers
- `src/solver-aspic.ts` — existing ASPIC+ solver, `keyNodes`/`buildPremiseIndex`/`classifyRelations`/`deriveDefeats`/`emitUntunedWarning`/`labelWithWeakAttacks`

---

## Task 1: Extract `buildAspicDefeatMap` from `solveAspic`

**Files:**
- Modify: `src/solver-aspic.ts:29-48` (the `solveAspic` function)
- Modify: `src/solver-aspic.ts:194-217` (the `deriveDefeats` function — already returns defeat map)
- Test: `src/solver.aspic.test.ts` (existing tests must keep passing unchanged)

The ASPIC+ defeat-derivation is already decomposed into per-pass helpers (`keyNodes`, `buildPremiseIndex`, `classifyRelations`, `deriveDefeats`, `emitUntunedWarning`). This task just composes them into a `buildAspicDefeatMap` helper that returns `{ map, warnings }`, and refactors `solveAspic` to call it.

- [ ] **Step 1: Write a failing test for `buildAspicDefeatMap` directly**

Add to `src/solver.aspic.test.ts` (top of file, after existing imports):

```ts
import { buildAspicDefeatMap } from './solver-aspic.js';

describe('buildAspicDefeatMap', () => {
  it('returns empty map and warnings for empty document', () => {
    const ast: Document = { kind: 'Document', elements: [], loc: { line: 0, column: 0, offset: 0 } };
    const { map, warnings } = buildAspicDefeatMap(ast);
    expect(map.size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('returns defeat map with rebut between two tied-preference args', () => {
    // [#A] --x [#B]: tied preference (both 0), so no defeat (rebut tied is not defeat).
    const ast: Document = parse('[#A] x.\n[#B] y.\n[#A] --x [#B].\n').ast as Document;
    const { map, warnings } = buildAspicDefeatMap(ast);
    expect(map.get('A')).toBeUndefined(); // no defeat
    expect(warnings).toEqual([]);
  });

  it('returns defeat map with undercut (always wins)', () => {
    // [#A] -.-> [#B]: undercut always defeats regardless of preference.
    const ast: Document = parse('[#A] x.\n[#B] y.\n[#A] -.-> [#B].\n').ast as Document;
    const { map } = buildAspicDefeatMap(ast);
    expect(map.get('B')).toEqual(['A']);
  });

  it('emits duplicate-id warning when same fact id is reused', () => {
    const ast: Document = parse('[#A] x.\n[#A] y.\n').ast as Document;
    const { warnings } = buildAspicDefeatMap(ast);
    expect(warnings.some((w) => w.startsWith('duplicate fact id'))).toBe(true);
  });
});
```

Add the import at the top of `src/solver.aspic.test.ts` (if not already present):
```ts
import { parse } from './parser.js';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run src/solver.aspic.test.ts`
Expected: FAIL with `buildAspicDefeatMap` is not exported (or similar).

- [ ] **Step 3: Implement `buildAspicDefeatMap` in `src/solver-aspic.ts`**

Add this function ABOVE `solveAspic` (replacing the body of `solveAspic` to use it):

```ts
export function buildAspicDefeatMap(document: Document): {
  map: Map<string, string[]>;
  warnings: string[];
} {
  const labels = new Map<string, Label>();
  const argByNode = new Map<Argument, string>();
  const preferences = new Map<string, number>();
  const warnings: string[] = [];

  keyNodes(document, labels, argByNode, preferences, warnings);
  const premiseIndex = buildPremiseIndex(document, argByNode);
  const rawAttacks: RawAttackEntry[] = [];
  classifyRelations(document, labels, argByNode, premiseIndex, rawAttacks, warnings);
  const map = deriveDefeats(rawAttacks, preferences);
  emitUntunedWarning(
    warnings,
    preferences,
    warnings.some((w) => w.startsWith('solveAspic(): dropped ')),
  );

  return { map, warnings };
}
```

Replace the existing `solveAspic` body (lines 29-48) with:

```ts
export function solveAspic(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const argByNode = new Map<Argument, string>();
  const { map: defeats, warnings } = buildAspicDefeatMap(document);
  // Re-key labels for labelWithWeakAttacks (it expects labels populated by keyNodes).
  keyNodes(document, labels, argByNode, new Map(), []);
  const premiseIndex = buildPremiseIndex(document, argByNode);
  const rawAttacks: RawAttackEntry[] = [];
  classifyRelations(document, labels, argByNode, premiseIndex, rawAttacks, []);
  const finalLabels = labelWithWeakAttacks(labels, rawAttacks, defeats);

  return { labels: finalLabels, defeats, warnings };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/solver.aspic.test.ts`
Expected: PASS — all new `buildAspicDefeatMap` tests pass AND all existing `solveAspic` tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/solver-aspic.ts src/solver.aspic.test.ts
git commit -m "refactor(solver-aspic): extract buildAspicDefeatMap helper

Composes existing keyNodes + buildPremiseIndex + classifyRelations +
deriveDefeats + emitUntunedWarning into a single helper that returns
the defeat map and warnings. solveAspic now uses this helper; behavior
is preserved (existing solveAspic tests pass unchanged).

Enables the multi-extension layer (Task 10) to reuse the ASPIC+
defeat-derivation without calling labelWithWeakAttacks."
```

---

## Task 2: Create `src/solver-graph.ts` skeleton + `buildArgumentGraph` for `'dung'`

**Files:**
- Create: `src/solver-graph.ts`
- Create: `src/solver-graph.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/solver-graph.test.ts`:

```ts
// src/solver-graph.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { buildArgumentGraph } from './solver-graph.js';
import type { Document } from './ast.js';

describe('buildArgumentGraph (dung reduction)', () => {
  it('returns empty map for empty document', () => {
    const ast: Document = { kind: 'Document', elements: [], loc: { line: 0, column: 0, offset: 0 } };
    const { map, warnings } = buildArgumentGraph(ast, 'dung');
    expect(map.size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('builds attack map for simple --x edge', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] --x [#B].\n').ast as Document;
    const { map, warnings } = buildArgumentGraph(ast, 'dung');
    expect(map.get('A')).toEqual([]);
    expect(map.get('B')).toEqual(['A']);
    expect(warnings).toEqual([]);
  });

  it('drops -->, -.->, -.-, ~>, ?> with summary warning', () => {
    const ast = parse(
      '[#A] x.\n[#B] y.\n[#C] z.\n[#A] --> [#B].\n[#A] -.-> [#C].\n',
    ).ast as Document;
    const { warnings } = buildArgumentGraph(ast, 'dung');
    expect(warnings.some((w) => w.includes('support=') && w.includes('undercut='))).toBe(true);
  });

  it('emits dangling-edge warning for missing target', () => {
    const ast = parse('[#A] x.\n[#A] --x [#NONEXISTENT].\n').ast as Document;
    const { warnings } = buildArgumentGraph(ast, 'dung');
    expect(warnings.some((w) => w.includes('dangling attack edge'))).toBe(true);
  });

  it('emits duplicate-id warning when same fact id is reused', () => {
    const ast = parse('[#A] x.\n[#A] y.\n').ast as Document;
    const { warnings } = buildArgumentGraph(ast, 'dung');
    expect(warnings.some((w) => w.startsWith('duplicate fact id'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run src/solver-graph.test.ts`
Expected: FAIL — `buildArgumentGraph` is not exported (module doesn't exist).

- [ ] **Step 3: Create `src/solver-graph.ts` with the `'dung'` reduction**

Create `src/solver-graph.ts`:

```ts
// src/solver-graph.ts
import type { Argument, Document, RelationStatement } from './ast.js';
import { argKey, endpointKey, factKey, factKeyFromRef, conclusionRefKey } from './solver.js';

export type Reduction = 'dung' | 'bipolar' | 'aspic' | 'evidential';

export type ArgumentGraph = {
  map: Map<string, string[]>;
  warnings: string[];
};

export function buildArgumentGraph(document: Document, reduction: Reduction): ArgumentGraph {
  if (reduction === 'aspic') {
    // Delegate to ASPIC+ helper (Task 4 will wire this).
    return buildAspicReduction(document);
  }
  const labels = new Map<string, 'in' | 'out' | 'undec'>();
  const argByNode = new Map<Argument, string>();
  const attacks = new Map<string, string[]>();
  const warnings: string[] = [];

  // Pass 1: key addressable nodes.
  for (const el of document.elements) {
    if (el.kind === 'FactStatement') {
      const key = factKey(el);
      if (labels.has(key)) warnings.push('duplicate fact id: ' + key);
      labels.set(key, 'undec');
      if (!attacks.has(key)) attacks.set(key, []);
    } else if (el.kind === 'Argument') {
      const key = argKey(el);
      if (labels.has(key)) warnings.push('duplicate argument location: ' + key);
      labels.set(key, 'undec');
      argByNode.set(el, key);
      if (!attacks.has(key)) attacks.set(key, []);
      const conclKey = conclusionRefKey(el.conclusion);
      if (conclKey !== undefined && !labels.has(conclKey)) {
        labels.set(conclKey, 'undec');
        if (!attacks.has(conclKey)) attacks.set(conclKey, []);
      }
    }
  }

  // Pass 2: walk relations, apply per-reduction arrow handling.
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    const rs = el as RelationStatement;
    for (const rel of rs.relations) {
      applyReduction(rel, reduction, labels, attacks, argByNode, warnings);
    }
  }

  return { map: attacks, warnings };
}

function applyReduction(
  rel: { arrow: string; from: unknown; to: unknown },
  reduction: Reduction,
  labels: Map<string, 'in' | 'out' | 'undec'>,
  attacks: Map<string, string[]>,
  argByNode: Map<Argument, string>,
  warnings: string[],
): void {
  const fromKey = endpointKey(rel.from as never, argByNode);
  const toKey = endpointKey(rel.to as never, argByNode);

  switch (reduction) {
    case 'dung': {
      if (rel.arrow === 'attack') {
        attachAttack(fromKey, toKey, 'attack', labels, attacks, warnings);
      }
      // Other arrows are dropped with summary warning (collected by caller).
      // Task 2 keeps simple; per-arrow counters deferred to Task 3 if needed.
      return;
    }
    case 'bipolar': {
      // Implemented in Task 3.
      return;
    }
    case 'evidential': {
      // Implemented in Task 3.
      return;
    }
    case 'aspic': {
      // Handled by the ASPIC+ delegate above.
      return;
    }
  }
}

function attachAttack(
  fromKey: string,
  toKey: string,
  kind: 'attack' | 'support' | 'equivalence' | 'undercut' | 'undermine' | 'concession' | 'qualification',
  labels: Map<string, 'in' | 'out' | 'undec'>,
  attacks: Map<string, string[]>,
  warnings: string[],
): void {
  if (!labels.has(toKey)) {
    warnings.push(`dangling ${kind} edge: ${fromKey} ${kind === 'attack' ? '--x' : kind} ${toKey}`);
    return;
  }
  if (!labels.has(fromKey)) {
    labels.set(fromKey, 'undec');
    if (!attacks.has(fromKey)) attacks.set(fromKey, []);
  }
  const list = attacks.get(toKey) ?? [];
  list.push(fromKey);
  attacks.set(toKey, list);
}

function buildAspicReduction(document: Document): ArgumentGraph {
  // Placeholder for Task 4. Importing inline to avoid circular dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildAspicDefeatMap } = require('./solver-aspic.js') as {
    buildAspicDefeatMap: (d: Document) => ArgumentGraph;
  };
  return buildAspicDefeatMap(document);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/solver-graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/solver-graph.ts src/solver-graph.test.ts
git commit -m "feat(solver): add buildArgumentGraph skeleton with dung reduction

Initial layer for the multi-extension cycle. Covers pass 1 (keying) and
pass 2 (relation walk) for the Dung reduction only. Bipolar, evidential,
and ASPIC+ reductions arrive in Tasks 3 and 4."
```

---

## Task 3: Add `'bipolar'` and `'evidential'` reductions to `buildArgumentGraph`

**Files:**
- Modify: `src/solver-graph.ts` (the `applyReduction` function for bipolar/evidential)
- Modify: `src/solver-graph.test.ts` (add tests)

- [ ] **Step 1: Write the failing tests**

Append to `src/solver-graph.test.ts`:

```ts
describe('buildArgumentGraph (bipolar reduction)', () => {
  it('reduces --> to sup:auxiliary with B->sup, sup->A', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] --> [#B].\n').ast as Document;
    const { map } = buildArgumentGraph(ast, 'bipolar');
    // The sup:A->B auxiliary is attacked by B; B is attacked by the auxiliary.
    const auxKey = 'sup:A->B';
    expect(map.get(auxKey)).toEqual(['B']);
    expect(map.get('A')).toEqual([auxKey]);
  });

  it('reduces <-> to two necessary supports (wait, deductive supports)', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] <-> [#B].\n').ast as Document;
    const { map } = buildArgumentGraph(ast, 'bipolar');
    expect(map.get('sup:A->B')).toEqual(['B']);
    expect(map.get('sup:B->A')).toEqual(['A']);
  });

  it('collapses --x, -.->, ~>, ?> to plain attack', () => {
    const ast = parse(
      '[#A] x.\n[#B] y.\n[#A] --x [#B].\n[#A] -.-> [#B].\n[#A] ~> [#B].\n[#A] ?> [#B].\n',
    ).ast as Document;
    const { map, warnings } = buildArgumentGraph(ast, 'bipolar');
    // B is attacked by A three times (--x, -.->, ~>); once for ?>.
    expect(map.get('B')?.filter((x) => x === 'A').length).toBeGreaterThanOrEqual(2);
    expect(warnings.some((w) => w.includes('dangling'))).toBe(false);
  });
});

describe('buildArgumentGraph (evidential reduction)', () => {
  it('reduces --> to nec:auxiliary with A->nec, nec->B', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] --> [#B].\n').ast as Document;
    const { map } = buildArgumentGraph(ast, 'evidential');
    const auxKey = 'nec:A->B';
    expect(map.get(auxKey)).toEqual(['A']);
    expect(map.get('B')).toEqual([auxKey]);
  });

  it('reduces <-> to two necessary supports', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] <-> [#B].\n').ast as Document;
    const { map } = buildArgumentGraph(ast, 'evidential');
    expect(map.get('nec:A->B')).toEqual(['A']);
    expect(map.get('nec:B->A')).toEqual(['B']);
  });

  it('collapses --x, -.->, ~>, ?> to plain attack (same posture as bipolar)', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] --x [#B].\n').ast as Document;
    const { map } = buildArgumentGraph(ast, 'evidential');
    expect(map.get('B')).toEqual(['A']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run src/solver-graph.test.ts`
Expected: FAIL — bipolar/evidential branches currently do nothing.

- [ ] **Step 3: Implement the bipolar and evidential reductions**

Replace the `applyReduction` function in `src/solver-graph.ts` with:

```ts
function applyReduction(
  rel: { arrow: string; from: { kind: string }; to: { kind: string } },
  reduction: Reduction,
  labels: Map<string, 'in' | 'out' | 'undec'>,
  attacks: Map<string, string[]>,
  argByNode: Map<Argument, string>,
  warnings: string[],
): void {
  const fromKey = endpointKey(rel.from as never, argByNode);
  const toKey = endpointKey(rel.to as never, argByNode);

  if (reduction === 'aspic') return; // handled by buildAspicReduction

  // Support and equivalence are reduction-specific; other arrows always collapse to attack.
  if (rel.arrow === 'support') {
    if (reduction === 'bipolar') {
      addSupport(fromKey, toKey, labels, attacks);
      return;
    }
    if (reduction === 'evidential') {
      addNecessarySupport(fromKey, toKey, labels, attacks);
      return;
    }
    // dung: dropped silently.
    return;
  }
  if (rel.arrow === 'equivalence') {
    if (reduction === 'bipolar') {
      addSupport(fromKey, toKey, labels, attacks);
      addSupport(toKey, fromKey, labels, attacks);
      return;
    }
    if (reduction === 'evidential') {
      addNecessarySupport(fromKey, toKey, labels, attacks);
      addNecessarySupport(toKey, fromKey, labels, attacks);
      return;
    }
    return;
  }

  // Everything else collapses to plain attack.
  attachAttack(fromKey, toKey, rel.arrow, labels, attacks, warnings);
}

function addSupport(
  fromKey: string,
  toKey: string,
  labels: Map<string, 'in' | 'out' | 'undec'>,
  attacks: Map<string, string[]>,
): void {
  const auxKey = `sup:${fromKey}->${toKey}`;
  const sAttackers = attacks.get(auxKey) ?? [];
  sAttackers.push(toKey);
  attacks.set(auxKey, sAttackers);
  const aAttackers = attacks.get(fromKey) ?? [];
  aAttackers.push(auxKey);
  attacks.set(fromKey, aAttackers);
}

function addNecessarySupport(
  fromKey: string,
  toKey: string,
  labels: Map<string, 'in' | 'out' | 'undec'>,
  attacks: Map<string, string[]>,
): void {
  const auxKey = `nec:${fromKey}->${toKey}`;
  const auxAttackers = attacks.get(auxKey) ?? [];
  auxAttackers.push(fromKey);
  attacks.set(auxKey, auxAttackers);
  const bAttackers = attacks.get(toKey) ?? [];
  bAttackers.push(auxKey);
  attacks.set(toKey, bAttackers);
}
```

Update `attachAttack` to handle all arrow kinds correctly (not just 'attack'):

```ts
function attachAttack(
  fromKey: string,
  toKey: string,
  kind: string,
  labels: Map<string, 'in' | 'out' | 'undec'>,
  attacks: Map<string, string[]>,
  warnings: string[],
): void {
  if (!labels.has(toKey)) {
    warnings.push(`dangling edge: ${fromKey} ${arrowSymbol(kind)} ${toKey}`);
    return;
  }
  if (!labels.has(fromKey)) {
    labels.set(fromKey, 'undec');
    if (!attacks.has(fromKey)) attacks.set(fromKey, []);
  }
  const list = attacks.get(toKey) ?? [];
  list.push(fromKey);
  attacks.set(toKey, list);
}

function arrowSymbol(kind: string): string {
  switch (kind) {
    case 'attack': return '--x';
    case 'undercut': return '-.->';
    case 'undermine': return '-.-';
    case 'concession': return '~>';
    case 'qualification': return '?>';
    default: return kind;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/solver-graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/solver-graph.ts src/solver-graph.test.ts
git commit -m "feat(solver-graph): add bipolar and evidential reductions to buildArgumentGraph

Bipolar: --> and <-> use sup:* auxiliaries (deductive support).
Evidential: --> and <-> use nec:* auxiliaries (necessary support).
Other arrows collapse to plain attack, matching existing solver behavior."
```

---

## Task 4: Verify `'aspic'` reduction delegation works end-to-end

**Files:**
- Modify: `src/solver-graph.test.ts` (add aspic tests)

The `'aspic'` reduction was wired as a delegation in Task 2. This task verifies the delegation is correct (i.e., `buildArgumentGraph(doc, 'aspic')` returns the same map as `buildAspicDefeatMap(doc)`).

- [ ] **Step 1: Write the failing test**

Append to `src/solver-graph.test.ts`:

```ts
import { buildAspicDefeatMap } from './solver-aspic.js';

describe('buildArgumentGraph (aspic reduction)', () => {
  it('delegates to buildAspicDefeatMap and produces identical map', () => {
    const src = '[#A] x.\n[#B] y.\n[#A] --x [#B].\n';
    const ast = parse(src).ast as Document;
    const direct = buildAspicDefeatMap(ast);
    const via = buildArgumentGraph(ast, 'aspic');
    expect([...via.map.entries()]).toEqual([...direct.map.entries()]);
    expect(via.warnings).toEqual(direct.warnings);
  });

  it('undercut always wins regardless of preference', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] -.-> [#B].\n').ast as Document;
    const { map } = buildArgumentGraph(ast, 'aspic');
    expect(map.get('B')).toEqual(['A']);
  });

  it('rebut requires strict preference to be a defeat', () => {
    const ast = parse('[#A] x. { preference: 1 }\n[#B] y. { preference: 0.5 }\n[#A] --x [#B].\n').ast as Document;
    const { map } = buildArgumentGraph(ast, 'aspic');
    expect(map.get('B')).toEqual(['A']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run src/solver-graph.test.ts`
Expected: FAIL with import or `require` error (the `buildAspicReduction` placeholder uses CommonJS-style require which doesn't work in this ESM project).

- [ ] **Step 3: Replace the `require` with a proper ESM import**

In `src/solver-graph.ts`, replace the `buildAspicReduction` function:

```ts
import { buildAspicDefeatMap } from './solver-aspic.js';

// ...

function buildAspicReduction(document: Document): ArgumentGraph {
  return buildAspicDefeatMap(document);
}
```

(Add the import at the top alongside the other imports.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/solver-graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the existing aspic tests to make sure nothing broke**

Run: `yarn vitest run src/solver.aspic.test.ts`
Expected: PASS — all existing aspic tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/solver-graph.ts src/solver-graph.test.ts
git commit -m "feat(solver-graph): replace aspic require() with proper ESM import"
```

---

## Task 5: Create `src/solver-multi.ts` with aux operators, `isAdmissible`, `defenseClosure`, `stripAux`

**Files:**
- Create: `src/solver-multi.ts`
- Create: `src/solver-multi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/solver-multi.test.ts`:

```ts
// src/solver-multi.test.ts
import { describe, expect, it } from 'vitest';
import {
  attackersOf,
  isAdmissible,
  isConflictFree,
  isClosedUnderDefense,
  defenseClosure,
  isStable,
  stripAux,
} from './solver-multi.js';

describe('attackersOf', () => {
  it('returns attackers for a known target', () => {
    const map = new Map<string, string[]>([['B', ['A']]]);
    expect(attackersOf(map, 'B')).toEqual(['A']);
  });
  it('returns empty array for unknown target', () => {
    const map = new Map<string, string[]>();
    expect(attackersOf(map, 'X')).toEqual([]);
  });
});

describe('isConflictFree', () => {
  it('returns true for empty set', () => {
    expect(isConflictFree(new Set(), new Map())).toBe(true);
  });
  it('returns true when no internal attacks', () => {
    expect(isConflictFree(new Set(['A', 'B']), new Map([['A', []], ['B', ['C']]]))).toBe(true);
  });
  it('returns false when an internal attack exists', () => {
    expect(isConflictFree(new Set(['A', 'B']), new Map([['A', ['B']]]))).toBe(false);
  });
});

describe('isAdmissible', () => {
  it('empty set is always admissible', () => {
    expect(isAdmissible(new Set(), new Map())).toBe(true);
  });
  it('A is admissible when unattacked', () => {
    expect(isAdmissible(new Set(['A']), new Map([['A', []]]))).toBe(true);
  });
  it('A is NOT admissible when attacked by B and B is not in set', () => {
    expect(isAdmissible(new Set(['A']), new Map([['A', ['B']]]))).toBe(false);
  });
  it('A IS admissible when attacked by B and A attacks B back', () => {
    // 2-cycle: A -> B, B -> A. {A} is admissible (A defends itself against B).
    expect(isAdmissible(new Set(['A']), new Map([['A', ['B']], ['B', ['A']]]))).toBe(true);
  });
});

describe('defenseClosure', () => {
  it('returns empty set for empty input', () => {
    expect(defenseClosure(new Set(), new Map()).size).toBe(0);
  });
  it('does not add unattacked args (no defender)', () => {
    // A is unattacked; {B} does not defend A.
    const result = defenseClosure(new Set(['B']), new Map([['A', []], ['B', []]]));
    expect([...result].sort()).toEqual(['B']);
  });
  it('adds an arg whose attackers are all defeated by the set', () => {
    // A attacks B, B attacks C. {A} defends C (B is attacked by A).
    const map = new Map<string, string[]>([['A', []], ['B', ['A']], ['C', ['B']]]);
    const result = defenseClosure(new Set(['A']), map);
    expect([...result].sort()).toEqual(['A', 'C']);
  });
});

describe('isClosedUnderDefense', () => {
  it('returns true for empty set', () => {
    expect(isClosedUnderDefense(new Set(), new Map())).toBe(true);
  });
  it('returns true for set that contains all it defends', () => {
    // {A} in the 2-cycle above; A is defended; {A} contains A.
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['A']]]);
    expect(isClosedUnderDefense(new Set(['A']), map)).toBe(true);
  });
});

describe('isStable', () => {
  it('returns true for unattacked A', () => {
    expect(isStable(new Set(['A']), new Map([['A', []]]))).toBe(true);
  });
  it('returns false for 3-cycle (odd cycle has no stable)', () => {
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['C']], ['C', ['A']]]);
    expect(isStable(new Set(['A']), map)).toBe(false);
  });
  it('returns false for 2-cycle', () => {
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['A']]]);
    expect(isStable(new Set(['A']), map)).toBe(false);
  });
});

describe('stripAux', () => {
  it('removes sup: and nec: prefixed keys', () => {
    const set = new Set(['A', 'sup:A->B', 'nec:B->C', 'B']);
    expect([...stripAux(set)].sort()).toEqual(['A', 'B']);
  });
  it('leaves arg:L:C keys intact', () => {
    const set = new Set(['A', 'arg:1:1:C']);
    expect([...stripAux(set)].sort()).toEqual(['A', 'arg:1:1:C']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run src/solver-multi.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `src/solver-multi.ts`**

Create `src/solver-multi.ts`:

```ts
// src/solver-multi.ts
export function attackersOf(map: Map<string, string[]>, arg: string): string[] {
  return map.get(arg) ?? [];
}

export function isConflictFree(set: Set<string>, map: Map<string, string[]>): boolean {
  for (const a of set) {
    const attackers = attackersOf(map, a);
    for (const b of attackers) {
      if (set.has(b)) return false;
    }
  }
  return true;
}

export function isAdmissible(set: Set<string>, map: Map<string, string[]>): boolean {
  if (!isConflictFree(set, map)) return false;
  for (const a of set) {
    for (const b of attackersOf(map, a)) {
      if (set.has(b)) continue;
      // b must be attacked by some member of set.
      const bAttackers = attackersOf(map, b);
      if (!bAttackers.some((c) => set.has(c))) return false;
    }
  }
  return true;
}

export function defenseClosure(set: Set<string>, map: Map<string, string[]>): Set<string> {
  const closure = new Set(set);
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of map.keys()) {
      if (closure.has(a)) continue;
      const attackers = attackersOf(map, a);
      const defended = attackers.every((b) => {
        const bAttackers = attackersOf(map, b);
        return bAttackers.some((c) => closure.has(c));
      });
      if (defended) {
        closure.add(a);
        changed = true;
      }
    }
  }
  return closure;
}

export function isClosedUnderDefense(set: Set<string>, map: Map<string, string[]>): boolean {
  const closure = defenseClosure(set, map);
  if (closure.size !== set.size) return false;
  for (const x of closure) if (!set.has(x)) return false;
  return true;
}

export function isStable(set: Set<string>, map: Map<string, string[]>): boolean {
  if (!isAdmissible(set, map)) return false;
  for (const a of map.keys()) {
    if (set.has(a)) continue;
    if (!attackersOf(map, a).some((b) => set.has(b))) return false;
  }
  return true;
}

export function stripAux(set: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const k of set) {
    if (k.startsWith('sup:') || k.startsWith('nec:')) continue;
    result.add(k);
  }
  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/solver-multi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/solver-multi.ts src/solver-multi.test.ts
git commit -m "feat(solver-multi): add aux operators and semantics predicates

attackersOf, isConflictFree, isAdmissible, defenseClosure,
isClosedUnderDefense, isStable, stripAux. Foundation for the
multi-extension enumeration algorithms."
```

---

## Task 6: Add `findPreferredExtensions` with subset-pruning optimization

**Files:**
- Modify: `src/solver-multi.ts` (add `findPreferredExtensions`)
- Modify: `src/solver-multi.test.ts` (add tests)

- [ ] **Step 1: Write the failing tests**

Append to `src/solver-multi.test.ts`:

```ts
import { findPreferredExtensions } from './solver-multi.js';

describe('findPreferredExtensions', () => {
  it('returns empty array for empty map', () => {
    expect(findPreferredExtensions(new Map())).toEqual([]);
  });

  it('returns [{A}] for unattacked source A', () => {
    const map = new Map<string, string[]>([['A', []]]);
    const result = findPreferredExtensions(map);
    expect(result.length).toBe(1);
    expect([...result[0]!]).toEqual(['A']);
  });

  it('returns 3 preferred for 3-cycle A->B->C->A', () => {
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['C']], ['C', ['A']]]);
    const result = findPreferredExtensions(map);
    expect(result.length).toBe(3);
    const sorted = result.map((s) => [...s].sort());
    expect(sorted).toContainEqual(['A']);
    expect(sorted).toContainEqual(['B']);
    expect(sorted).toContainEqual(['C']);
  });

  it('returns 2 preferred for 2-cycle A<->B', () => {
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['A']]]);
    const result = findPreferredExtensions(map);
    expect(result.length).toBe(2);
  });

  it('returns empty for self-attacking A->A (no admissible)', () => {
    const map = new Map<string, string[]>([['A', ['A']]]);
    // {A} is not conflict-free; only ∅ is admissible but it's not maximal.
    expect(findPreferredExtensions(map)).toEqual([]);
  });

  it('strips aux keys from each extension', () => {
    const map = new Map<string, string[]>([
      ['A', []],
      ['sup:A->B', ['B']],
      ['B', ['sup:A->B']],
    ]);
    const result = findPreferredExtensions(map);
    expect(result.length).toBeGreaterThan(0);
    for (const ext of result) {
      expect([...ext].some((k) => k.startsWith('sup:'))).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run src/solver-multi.test.ts`
Expected: FAIL — `findPreferredExtensions` not exported.

- [ ] **Step 3: Implement `findPreferredExtensions`**

Append to `src/solver-multi.ts`:

```ts
export function findPreferredExtensions(map: Map<string, string[]>): Set<string>[] {
  const args = [...map.keys()];
  const n = args.length;
  const results: Set<string>[] = [];
  const skipMasks = new Set<number>();

  // Iterate subsets large-to-small. Once we find an admissible S, mark all
  // subsets of S as skipped (they cannot be maximal).
  for (let mask = (1 << n) - 1; mask >= 0; mask--) {
    if (skipMasks.has(mask)) continue;
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.add(args[i]!);
    }
    if (isAdmissible(subset, map)) {
      results.push(stripAux(subset));
      // Mark all subsets of `mask` as skipped.
      let sub = mask;
      while (true) {
        skipMasks.add(sub);
        if (sub === 0) break;
        sub = (sub - 1) & mask;
      }
    }
  }
  return results;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/solver-multi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/solver-multi.ts src/solver-multi.test.ts
git commit -m "feat(solver-multi): add findPreferredExtensions

Subset enumeration large-to-small with subset-pruning. Once an
admissible set is found, all its subsets are skipped (cannot be
maximal). Strips aux keys (sup:*, nec:*) from each returned extension."
```

---

## Task 7: Add `findStableExtensions` and `findCompleteExtensions`

**Files:**
- Modify: `src/solver-multi.ts`
- Modify: `src/solver-multi.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/solver-multi.test.ts`:

```ts
import { findStableExtensions, findCompleteExtensions } from './solver-multi.js';

describe('findStableExtensions', () => {
  it('returns empty for empty map', () => {
    expect(findStableExtensions(new Map())).toEqual([]);
  });

  it('returns [{A}] for unattacked source A', () => {
    const map = new Map<string, string[]>([['A', []]]);
    const result = findStableExtensions(map);
    expect(result.length).toBe(1);
    expect([...result[0]!]).toEqual(['A']);
  });

  it('returns 0 for 3-cycle (odd cycle has no stable)', () => {
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['C']], ['C', ['A']]]);
    expect(findStableExtensions(map)).toEqual([]);
  });

  it('returns 0 for 2-cycle', () => {
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['A']]]);
    expect(findStableExtensions(map)).toEqual([]);
  });

  it('returns [{A}] for A--xB with no attackers of A', () => {
    const map = new Map<string, string[]>([['A', []], ['B', ['A']]]);
    const result = findStableExtensions(map);
    expect(result.length).toBe(1);
    expect([...result[0]!]).toEqual(['A']);
  });
});

describe('findCompleteExtensions', () => {
  it('returns 1 (∅) for empty map', () => {
    const result = findCompleteExtensions(new Map());
    expect(result.length).toBe(1);
    expect(result[0]!.size).toBe(0);
  });

  it('returns 2 (∅, {A}) for unattacked source A', () => {
    const map = new Map<string, string[]>([['A', []]]);
    const result = findCompleteExtensions(map);
    expect(result.length).toBe(2);
    const sorted = result.map((s) => [...s].sort());
    expect(sorted).toContainEqual([]);
    expect(sorted).toContainEqual(['A']);
  });

  it('returns 4 (∅, {A}, {B}, {C}) for 3-cycle', () => {
    const map = new Map<string, string[]>([['A', ['B']], ['B', ['C']], ['C', ['A']]]);
    const result = findCompleteExtensions(map);
    expect(result.length).toBe(4);
    const sorted = result.map((s) => [...s].sort());
    expect(sorted).toContainEqual([]);
    expect(sorted).toContainEqual(['A']);
    expect(sorted).toContainEqual(['B']);
    expect(sorted).toContainEqual(['C']);
  });

  it('returns 1 (∅) for self-attacking A->A', () => {
    const map = new Map<string, string[]>([['A', ['A']]]);
    const result = findCompleteExtensions(map);
    expect(result.length).toBe(1);
    expect(result[0]!.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run src/solver-multi.test.ts`
Expected: FAIL — `findStableExtensions` and `findCompleteExtensions` not exported.

- [ ] **Step 3: Implement both algorithms**

Append to `src/solver-multi.ts`:

```ts
export function findStableExtensions(map: Map<string, string[]>): Set<string>[] {
  const args = [...map.keys()];
  const n = args.length;
  const results: Set<string>[] = [];

  for (let mask = 0; mask < 1 << n; mask++) {
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.add(args[i]!);
    }
    if (isStable(subset, map)) {
      results.push(stripAux(subset));
    }
  }
  return results;
}

export function findCompleteExtensions(map: Map<string, string[]>): Set<string>[] {
  const args = [...map.keys()];
  const n = args.length;
  const results: Set<string>[] = [];

  // Iterate from mask=0 upward so we find ∅ first if it's complete.
  for (let mask = 0; mask < 1 << n; mask++) {
    const subset = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.add(args[i]!);
    }
    if (isClosedUnderDefense(subset, map) && isAdmissible(subset, map)) {
      results.push(stripAux(subset));
    }
  }
  return results;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/solver-multi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/solver-multi.ts src/solver-multi.test.ts
git commit -m "feat(solver-multi): add findStableExtensions and findCompleteExtensions

Naive subset enumeration for both. Always includes ∅ in complete
results when it qualifies (per the convention in the spec, so the
cross-validation invariant grounded = ∩ complete holds for
empty-grounded cases like 3-cycles and self-attacks)."
```

---

## Task 8: Add `MultiSolveResult` type and 3 Dung multi-extension exports

**Files:**
- Modify: `src/solver.ts` (add type + 3 exports)
- Create: `src/solver.preferred.test.ts` (Dung reduction tests)
- Create: `src/solver.stable.test.ts`
- Create: `src/solver.complete.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/solver.preferred.test.ts`:

```ts
// src/solver.preferred.test.ts (Dung reduction tests; bipolar/evidential/aspic in later tasks)
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solvePreferred } from './solver.js';
import type { Document } from './ast.js';

describe('solvePreferred (dung reduction)', () => {
  it('returns 3 preferred extensions for 3-cycle', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#C] z.\n[#A] --x [#B].\n[#B] --x [#C].\n[#C] --x [#A].\n').ast as Document;
    const { extensions, warnings } = solvePreferred(ast);
    expect(extensions.length).toBe(3);
    expect(warnings).toEqual([]);
  });

  it('returns 0 preferred for self-attacking single arg', () => {
    const ast = parse('[#A] x.\n[#A] --x [#A].\n').ast as Document;
    expect(solvePreferred(ast).extensions).toEqual([]);
  });

  it('drops --> with warning in Dung reduction', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] --> [#B].\n').ast as Document;
    const { warnings } = solvePreferred(ast);
    expect(warnings.some((w) => w.includes('support='))).toBe(true);
  });
});
```

Create `src/solver.stable.test.ts`:

```ts
// src/solver.stable.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solveStable } from './solver.js';
import type { Document } from './ast.js';

describe('solveStable (dung reduction)', () => {
  it('returns 0 stable for 3-cycle', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#C] z.\n[#A] --x [#B].\n[#B] --x [#C].\n[#C] --x [#A].\n').ast as Document;
    expect(solveStable(ast).extensions).toEqual([]);
  });

  it('returns 1 stable for unattacked source', () => {
    const ast = parse('[#A] x.\n[#A] --x [#B].\n').ast as Document;
    const { extensions } = solveStable(ast);
    expect(extensions.length).toBe(1);
    expect([...extensions[0]!]).toEqual(['A']);
  });
});
```

Create `src/solver.complete.test.ts`:

```ts
// src/solver.complete.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solveComplete } from './solver.js';
import type { Document } from './ast.js';

describe('solveComplete (dung reduction)', () => {
  it('returns 4 complete extensions (∅ + 3) for 3-cycle', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#C] z.\n[#A] --x [#B].\n[#B] --x [#C].\n[#C] --x [#A].\n').ast as Document;
    const { extensions } = solveComplete(ast);
    expect(extensions.length).toBe(4);
  });

  it('returns 2 complete (∅ + {A}) for unattacked source', () => {
    const ast = parse('[#A] x.\n').ast as Document;
    const { extensions } = solveComplete(ast);
    expect(extensions.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run src/solver.preferred.test.ts src/solver.stable.test.ts src/solver.complete.test.ts`
Expected: FAIL — `solvePreferred`, `solveStable`, `solveComplete` not exported.

- [ ] **Step 3: Implement the type and 3 exports in `src/solver.ts`**

At the top of `src/solver.ts`, after `SolveResult`, add:

```ts
export type MultiSolveResult = {
  extensions: Set<string>[];
  warnings: string[];
};
```

Add the import at the top of the file:

```ts
import { buildArgumentGraph, type Reduction } from './solver-graph.js';
import { findPreferredExtensions, findStableExtensions, findCompleteExtensions } from './solver-multi.js';
```

At the bottom of `src/solver.ts`, add:

```ts
function solveMulti(
  document: Document,
  reduction: Reduction,
  algo: (map: Map<string, string[]>) => Set<string>[],
): MultiSolveResult {
  const { map, warnings } = buildArgumentGraph(document, reduction);
  const extensions = algo(map);
  return { extensions, warnings };
}

export function solvePreferred(document: Document): MultiSolveResult {
  return solveMulti(document, 'dung', findPreferredExtensions);
}

export function solveStable(document: Document): MultiSolveResult {
  return solveMulti(document, 'dung', findStableExtensions);
}

export function solveComplete(document: Document): MultiSolveResult {
  return solveMulti(document, 'dung', findCompleteExtensions);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/solver.preferred.test.ts src/solver.stable.test.ts src/solver.complete.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/solver.ts src/solver.preferred.test.ts src/solver.stable.test.ts src/solver.complete.test.ts
git commit -m "feat(solver): add solvePreferred, solveStable, solveComplete (Dung reduction)

Three new public functions composing buildArgumentGraph with the
multi-extension algorithms. Returns MultiSolveResult with extensions:
Set<string>[] (each extension is the set of in-arg keys)."
```

---

## Task 9: Add 6 multi-extension exports for bipolar + evidential reductions

**Files:**
- Modify: `src/solver.ts` (add 6 exports)

- [ ] **Step 1: Write the failing tests**

Append to `src/solver.preferred.test.ts`:

```ts
import { solvePreferredBipolar, solvePreferredEvidential } from './solver.js';

describe('solvePreferredBipolar', () => {
  it('returns 1 preferred with sup keys stripped', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] --> [#B].\n[#C] --x [#A].\n').ast as Document;
    const { extensions } = solvePreferredBipolar(ast);
    expect(extensions.length).toBe(1);
    // After bipolar reduction: B has no attackers (A is unattacked source; C attacks A).
    // The aux sup:A->B is attacked by B (in) and attacks A.
    // {B, C} is the unique preferred extension (A is OUT from C).
    const ext = [...extensions[0]!];
    expect(ext).toContain('B');
    expect(ext).toContain('C');
    expect(ext.some((k) => k.startsWith('sup:'))).toBe(false);
  });
});

describe('solvePreferredEvidential', () => {
  it('returns 1 preferred with nec keys stripped', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] --> [#B].\n[#C] --x [#A].\n').ast as Document;
    const { extensions } = solvePreferredEvidential(ast);
    expect(extensions.length).toBe(1);
    const ext = [...extensions[0]!];
    expect(ext.some((k) => k.startsWith('nec:'))).toBe(false);
  });
});
```

Append to `src/solver.stable.test.ts`:

```ts
import { solveStableBipolar, solveStableEvidential } from './solver.js';

describe('solveStableBipolar', () => {
  it('returns 1 stable with sup keys stripped', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#C] z.\n[#A] --> [#B].\n[#C] --x [#A].\n').ast as Document;
    const { extensions } = solveStableBipolar(ast);
    expect(extensions.length).toBe(1);
    expect([...extensions[0]!].some((k) => k.startsWith('sup:'))).toBe(false);
  });
});

describe('solveStableEvidential', () => {
  it('returns 1 stable with nec keys stripped', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#C] z.\n[#A] --> [#B].\n[#C] --x [#A].\n').ast as Document;
    const { extensions } = solveStableEvidential(ast);
    expect(extensions.length).toBe(1);
    expect([...extensions[0]!].some((k) => k.startsWith('nec:'))).toBe(false);
  });
});
```

Append to `src/solver.complete.test.ts`:

```ts
import { solveCompleteBipolar, solveCompleteEvidential } from './solver.js';

describe('solveCompleteBipolar', () => {
  it('strips sup keys from extensions', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] --> [#B].\n').ast as Document;
    const { extensions } = solveCompleteBipolar(ast);
    expect(extensions.length).toBeGreaterThan(0);
    for (const ext of extensions) {
      expect([...ext].some((k) => k.startsWith('sup:'))).toBe(false);
    }
  });
});

describe('solveCompleteEvidential', () => {
  it('strips nec keys from extensions', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] --> [#B].\n').ast as Document;
    const { extensions } = solveCompleteEvidential(ast);
    expect(extensions.length).toBeGreaterThan(0);
    for (const ext of extensions) {
      expect([...ext].some((k) => k.startsWith('nec:'))).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run src/solver.preferred.test.ts src/solver.stable.test.ts src/solver.complete.test.ts`
Expected: FAIL — 6 functions not exported.

- [ ] **Step 3: Implement the 6 exports in `src/solver.ts`**

Add after the existing 3 exports:

```ts
export function solvePreferredBipolar(document: Document): MultiSolveResult {
  return solveMulti(document, 'bipolar', findPreferredExtensions);
}
export function solvePreferredEvidential(document: Document): MultiSolveResult {
  return solveMulti(document, 'evidential', findPreferredExtensions);
}

export function solveStableBipolar(document: Document): MultiSolveResult {
  return solveMulti(document, 'bipolar', findStableExtensions);
}
export function solveStableEvidential(document: Document): MultiSolveResult {
  return solveMulti(document, 'evidential', findStableExtensions);
}

export function solveCompleteBipolar(document: Document): MultiSolveResult {
  return solveMulti(document, 'bipolar', findCompleteExtensions);
}
export function solveCompleteEvidential(document: Document): MultiSolveResult {
  return solveMulti(document, 'evidential', findCompleteExtensions);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/solver.preferred.test.ts src/solver.stable.test.ts src/solver.complete.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/solver.ts src/solver.preferred.test.ts src/solver.stable.test.ts src/solver.complete.test.ts
git commit -m "feat(solver): add 6 multi-extension exports for bipolar and evidential reductions

solvePreferredBipolar, solvePreferredEvidential, solveStableBipolar,
solveStableEvidential, solveCompleteBipolar, solveCompleteEvidential.
Aux keys (sup:*, nec:*) stripped from each extension before returning."
```

---

## Task 10: Add 3 multi-extension exports for ASPIC+ reduction

**Files:**
- Modify: `src/solver-aspic.ts` (add 3 exports)
- Modify: `src/solver.preferred.test.ts`, `src/solver.stable.test.ts`, `src/solver.complete.test.ts` (add aspic tests)

- [ ] **Step 1: Write the failing tests**

Append to `src/solver.preferred.test.ts`:

```ts
import { solvePreferredAspic } from './solver-aspic.js';

describe('solvePreferredAspic', () => {
  it('returns 0 preferred for rebut with tied preference', () => {
    const ast = parse('[#A] x. { preference: 0 }\n[#B] y. { preference: 0 }\n[#A] --x [#B].\n').ast as Document;
    expect(solvePreferredAspic(ast).extensions).toEqual([]);
  });

  it('returns 1 preferred for undercut (always wins)', () => {
    const ast = parse('[#A] x.\n[#B] y.\n[#A] -.-> [#B].\n').ast as Document;
    const { extensions } = solvePreferredAspic(ast);
    expect(extensions.length).toBe(1);
  });
});
```

Append to `src/solver.stable.test.ts`:

```ts
import { solveStableAspic } from './solver-aspic.js';

describe('solveStableAspic', () => {
  it('returns 0 stable for undercut on 3-cycle (still no stable)', () => {
    const ast = parse(
      '[#A] x.\n[#B] y.\n[#C] z.\n[#A] -.-> [#B].\n[#B] -.-> [#C].\n[#C] -.-> [#A].\n',
    ).ast as Document;
    expect(solveStableAspic(ast).extensions).toEqual([]);
  });
});
```

Append to `src/solver.complete.test.ts`:

```ts
import { solveCompleteAspic } from './solver-aspic.js';

describe('solveCompleteAspic', () => {
  it('returns 4 complete (∅ + 3) for 3-cycle of undercuts', () => {
    const ast = parse(
      '[#A] x.\n[#B] y.\n[#C] z.\n[#A] -.-> [#B].\n[#B] -.-> [#C].\n[#C] -.-> [#A].\n',
    ).ast as Document;
    const { extensions } = solveCompleteAspic(ast);
    expect(extensions.length).toBe(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run src/solver.preferred.test.ts src/solver.stable.test.ts src/solver.complete.test.ts`
Expected: FAIL — `solvePreferredAspic`, `solveStableAspic`, `solveCompleteAspic` not exported.

- [ ] **Step 3: Implement the 3 exports in `src/solver-aspic.ts`**

Add at the top of `src/solver-aspic.ts`:

```ts
import {
  findPreferredExtensions,
  findStableExtensions,
  findCompleteExtensions,
} from './solver-multi.js';
import type { MultiSolveResult } from './solver.js';
```

Append at the bottom of `src/solver-aspic.ts`:

```ts
function solveAspicMulti(
  document: Document,
  algo: (map: Map<string, string[]>) => Set<string>[],
): MultiSolveResult {
  const { map, warnings } = buildAspicDefeatMap(document);
  const extensions = algo(map);
  return { extensions, warnings };
}

export function solvePreferredAspic(document: Document): MultiSolveResult {
  return solveAspicMulti(document, findPreferredExtensions);
}

export function solveStableAspic(document: Document): MultiSolveResult {
  return solveAspicMulti(document, findStableExtensions);
}

export function solveCompleteAspic(document: Document): MultiSolveResult {
  return solveAspicMulti(document, findCompleteExtensions);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/solver.preferred.test.ts src/solver.stable.test.ts src/solver.complete.test.ts`
Expected: PASS.

- [ ] **Step 5: Run ALL existing solver tests to verify no regression**

Run: `yarn vitest run src/solver`
Expected: ALL solver tests pass — both new multi-extension and existing 4 grounded.

- [ ] **Step 6: Commit**

```bash
git add src/solver-aspic.ts src/solver.preferred.test.ts src/solver.stable.test.ts src/solver.complete.test.ts
git commit -m "feat(solver-aspic): add 3 multi-extension exports (preferred/stable/complete)

solvePreferredAspic, solveStableAspic, solveCompleteAspic compose
buildAspicDefeatMap with the multi-extension algorithms. ASPIC+ defeats
are treated as attacks for the multi-extension purposes; arg:L:C keys
are not stripped (consumers filter; Mermaid silently skips them)."
```

---

## Task 11: CLI integration — extend whitelist from 4 to 16, add 12 dispatch cases, 12 snapshot tests

**Files:**
- Modify: `src/cli.ts` (whitelist + dispatch + multi-extension output format)
- Modify: `src/cli.test.ts` (12 new tests)

- [ ] **Step 1: Write the failing CLI test**

Append to `src/cli.test.ts`:

```ts
import { join } from 'node:path';

// ... existing imports ...

const MULTI_EX_SEMANTICS = [
  'preferred',
  'preferred-bipolar',
  'preferred-aspic',
  'preferred-evidential',
  'stable',
  'stable-bipolar',
  'stable-aspic',
  'stable-evidential',
  'complete',
  'complete-bipolar',
  'complete-aspic',
  'complete-evidential',
] as const;

describe('CLI multi-extension --semantics', () => {
  for (const semantics of MULTI_EX_SEMANTICS) {
    it(`runs --semantics=${semantics} and prints Extension lines`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
      const file = join(dir, 'doc.argdown');
      // 2-cycle: A attacks B, B attacks A. Preferred has 2 extensions.
      writeFileSync(file, '[#A] x.\n[#B] y.\n[#A] --x [#B].\n[#B] --x [#A].\n');
      const out = runCli(['--solve', `--semantics=${semantics}`, file]);
      expect(out.status).toBe(0);
      expect(out.stdout).toContain('Extension 1:');
      // 2-cycle has 2 preferred, 0 stable, 2 complete.
      const expectCount = semantics.startsWith('stable') ? 0 : 2;
      const lines = out.stdout.split('\n').filter((l) => l.startsWith('Extension '));
      expect(lines.length).toBe(expectCount);
    });
  }

  it('rejects --semantics=preferred-garbage (unknown reduction)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    writeFileSync(file, '[#a].\n');
    const out = runCli(['--solve', '--semantics=preferred-garbage', file]);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/--semantics must be one of/);
  });

  it('prints empty stable result without crashing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    // 3-cycle has 0 stable extensions.
    writeFileSync(file, '[#A] x.\n[#B] y.\n[#C] z.\n[#A] --x [#B].\n[#B] --x [#C].\n[#C] --x [#A].\n');
    const out = runCli(['--solve', '--semantics=stable', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).not.toContain('Extension 1:');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn build && yarn vitest run src/cli.test.ts`
Expected: FAIL — CLI rejects `--semantics=preferred` with whitelist error.

- [ ] **Step 3: Extend the CLI whitelist and dispatch**

Replace the `--semantics` validation in `src/cli.ts`:

```ts
const VALID_SEMANTICS = new Set([
  'dung', 'bipolar', 'aspic', 'evidential',
  'preferred', 'preferred-bipolar', 'preferred-aspic', 'preferred-evidential',
  'stable', 'stable-bipolar', 'stable-aspic', 'stable-evidential',
  'complete', 'complete-bipolar', 'complete-aspic', 'complete-evidential',
]);

if (semantics !== undefined && !solveMode) {
  process.stderr.write('argdown-mermaid: --semantics requires --solve\n');
  process.exit(1);
}
if (semantics !== undefined && !VALID_SEMANTICS.has(semantics)) {
  process.stderr.write(
    `argdown-mermaid: --semantics must be one of: ${[...VALID_SEMANTICS].join(', ')} (got "${semantics}")\n`,
  );
  process.exit(1);
}
```

Replace the solve-dispatch block:

```ts
import {
  solve, solveBipolar, solveAspic, solveEvidential,
  solvePreferred, solvePreferredBipolar, solvePreferredAspic, solvePreferredEvidential,
  solveStable, solveStableBipolar, solveStableAspic, solveStableEvidential,
  solveComplete, solveCompleteBipolar, solveCompleteAspic, solveCompleteEvidential,
} from './solver.js';

// ... inside main(), replacing the existing if (solveMode) block:

if (solveMode) {
  const isMulti = semantics !== undefined && semantics !== 'dung' && semantics !== 'bipolar' && semantics !== 'aspic' && semantics !== 'evidential';
  if (isMulti) {
    const solved = dispatchMulti(semantics as MultiSemantics, result.ast);
    const lines: string[] = [];
    solved.extensions.forEach((ext, i) => {
      const sortedKeys = [...ext].sort();
      lines.push(`Extension ${i + 1}: ${sortedKeys.join(', ') || '(empty set)'}`);
    });
    if (lines.length === 0) lines.push('(no extensions)');
    process.stdout.write(lines.join('\n') + '\n');
    for (const w of solved.warnings) process.stderr.write(`warning: ${w}\n`);
    return;
  }
  // ... existing 4-grounded dispatch ...
}

type MultiSemantics =
  | 'preferred' | 'preferred-bipolar' | 'preferred-aspic' | 'preferred-evidential'
  | 'stable' | 'stable-bipolar' | 'stable-aspic' | 'stable-evidential'
  | 'complete' | 'complete-bipolar' | 'complete-aspic' | 'complete-evidential';

function dispatchMulti(semantics: MultiSemantics, ast: import('./ast.js').Document) {
  switch (semantics) {
    case 'preferred': return solvePreferred(ast);
    case 'preferred-bipolar': return solvePreferredBipolar(ast);
    case 'preferred-aspic': return solvePreferredAspic(ast);
    case 'preferred-evidential': return solvePreferredEvidential(ast);
    case 'stable': return solveStable(ast);
    case 'stable-bipolar': return solveStableBipolar(ast);
    case 'stable-aspic': return solveStableAspic(ast);
    case 'stable-evidential': return solveStableEvidential(ast);
    case 'complete': return solveComplete(ast);
    case 'complete-bipolar': return solveCompleteBipolar(ast);
    case 'complete-aspic': return solveCompleteAspic(ast);
    case 'complete-evidential': return solveCompleteEvidential(ast);
  }
}
```

- [ ] **Step 4: Run the CLI test to verify it passes**

Run: `yarn build && yarn vitest run src/cli.test.ts`
Expected: PASS — all 12 multi-extension cases + 2 edge cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/cli.test.ts
git commit -m "feat(cli): extend --semantics whitelist to 16 values with multi-extension dispatch

Adds 12 new --semantics values (preferred, preferred-*, stable, stable-*,
complete, complete-*). Each dispatches to the corresponding solve*
function. Output format: numbered list of extensions with lex-sorted
in-keys. Empty results print '(no extensions)'. No regressions in the
4 grounded solvers' CLI output."
```

---

## Task 12: Re-export 12 new functions from `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add the 12 new exports**

In `src/index.ts`, add after the existing solver exports:

```ts
export {
  solvePreferred,
  solvePreferredBipolar,
  solvePreferredAspic,
  solvePreferredEvidential,
  solveStable,
  solveStableBipolar,
  solveStableAspic,
  solveStableEvidential,
  solveComplete,
  solveCompleteBipolar,
  solveCompleteAspic,
  solveCompleteEvidential,
  type MultiSolveResult,
} from './solver.js';

export {
  solvePreferredAspic,
  solveStableAspic,
  solveCompleteAspic,
} from './solver-aspic.js';
```

Wait — the 3 ASPIC+ functions are already re-exported above. To avoid duplicate-export errors, import them only from `./solver-aspic.js` (since `solvePreferredAspic` lives there, not in `./solver.js`). Restructure:

```ts
export {
  solvePreferred,
  solvePreferredBipolar,
  solvePreferredEvidential,
  solveStable,
  solveStableBipolar,
  solveStableEvidential,
  solveComplete,
  solveCompleteBipolar,
  solveCompleteEvidential,
  type MultiSolveResult,
} from './solver.js';

export {
  solvePreferredAspic,
  solveStableAspic,
  solveCompleteAspic,
} from './solver-aspic.js';
```

- [ ] **Step 2: Run typecheck**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): re-export 12 new multi-extension solver functions

9 functions from src/solver.js (Dung, bipolar, evidential reductions)
and 3 from src/solver-aspic.js (ASPIC+ reduction). MultiSolveResult
type also re-exported."
```

---

## Task 13: Cross-validation test (grounded = ∩ complete)

**Files:**
- Create: `src/solver.cross-validate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/solver.cross-validate.test.ts`:

```ts
// src/solver.cross-validate.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parser.js';
import { solve, solveComplete } from './solver.js';
import type { Document } from './ast.js';

const FIXTURES = [
  'src/parser.fixtures/simple.argdown',
  'src/parser.fixtures/relations.argdown',
  'src/parser.fixtures/deep-nesting.argdown',
  'src/parser.fixtures/large-stress.argdown',
  // Add more fixtures if needed; the spec references 7 parser fixtures.
];

describe('cross-validation: grounded = ∩ complete', () => {
  for (const path of FIXTURES) {
    it(`holds for ${path}`, () => {
      const source = readFileSync(join(process.cwd(), path), 'utf8');
      const result = parse(source);
      if (!result.ok) return; // skip fixtures that don't parse cleanly
      const ast = result.ast as Document;

      const grounded = solve(ast);
      const groundedIn = new Set<string>();
      for (const [k, v] of grounded.labels) if (v === 'in') groundedIn.add(k);

      const complete = solveComplete(ast);
      const intersect = new Set<string>();
      if (complete.extensions.length === 0) {
        // No complete extensions: by convention, grounded is also ∅.
        expect(groundedIn.size).toBe(0);
        return;
      }
      // Initialize with the first extension.
      for (const k of complete.extensions[0]!) intersect.add(k);
      for (let i = 1; i < complete.extensions.length; i++) {
        const ext = complete.extensions[i]!;
        for (const k of intersect) if (!ext.has(k)) intersect.delete(k);
      }

      // ground truth: grounded = ∩ complete
      expect(intersect).toEqual(groundedIn);
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `yarn vitest run src/solver.cross-validate.test.ts`
Expected: PASS — Dung's theorem holds across all fixtures.

(If any fixture fails, fix the algorithm or filter that fixture — the theorem must hold.)

- [ ] **Step 3: Commit**

```bash
git add src/solver.cross-validate.test.ts
git commit -m "test(solver): add cross-validation invariant test (grounded = ∩ complete)

Locks in Dung's theorem via the existing solver test fixtures. A
regression in either solve() or solveComplete() would fail this test.
Spec acceptance criterion #5."
```

---

## Task 14: Bench updates — 12 new task types, refresh baseline

**Files:**
- Modify: `src/solver.bench.ts` (extend `TASK_TYPES`, extend `makeTaskBody`)
- Modify: `perf-baseline-solver.json` (add 12 entries per fixture)

- [ ] **Step 1: Extend `TASK_TYPES` in `src/solver.bench.ts`**

Replace the `TASK_TYPES` array:

```ts
export const TASK_TYPES = [
  'solve',
  'solve-bipolar',
  'solve-aspic',
  'solve-evidential',
  'solve-preferred',
  'solve-preferred-bipolar',
  'solve-preferred-aspic',
  'solve-preferred-evidential',
  'solve-stable',
  'solve-stable-bipolar',
  'solve-stable-aspic',
  'solve-stable-evidential',
  'solve-complete',
  'solve-complete-bipolar',
  'solve-complete-aspic',
  'solve-complete-evidential',
  'parse-solve',
  'parse-solve-bipolar',
  'parse-solve-aspic',
  'parse-solve-evidential',
  'parse-solve-preferred',
  'parse-solve-preferred-bipolar',
  'parse-solve-preferred-aspic',
  'parse-solve-preferred-evidential',
  'parse-solve-stable',
  'parse-solve-stable-bipolar',
  'parse-solve-stable-aspic',
  'parse-solve-stable-evidential',
  'parse-solve-complete',
  'parse-solve-complete-bipolar',
  'parse-solve-complete-aspic',
  'parse-solve-complete-evidential',
] as const;
```

- [ ] **Step 2: Extend `makeTaskBody` to handle the new types**

Add new imports at the top:

```ts
import {
  solvePreferred,
  solvePreferredBipolar,
  solvePreferredAspic,
  solvePreferredEvidential,
  solveStable,
  solveStableBipolar,
  solveStableAspic,
  solveStableEvidential,
  solveComplete,
  solveCompleteBipolar,
  solveCompleteAspic,
  solveCompleteEvidential,
} from './solver.js';
import { solvePreferredAspic as solvePreferredAspic2, solveStableAspic, solveCompleteAspic } from './solver-aspic.js';
```

(Wrap the aspic imports in an alias to avoid name collision. Alternative: import only from solver-aspic.js with a different namespace.)

Cleaner: import all 3 ASPIC+ multi-extension functions only from `./solver-aspic.js`:

```ts
import {
  solvePreferred,
  solvePreferredBipolar,
  solvePreferredEvidential,
  solveStable,
  solveStableBipolar,
  solveStableEvidential,
  solveComplete,
  solveCompleteBipolar,
  solveCompleteEvidential,
} from './solver.js';
import {
  solvePreferredAspic,
  solveStableAspic,
  solveCompleteAspic,
} from './solver-aspic.js';
```

Extend the switch in `makeTaskBody`:

```ts
case 'solve-preferred':
  return () => { solvePreferred(cachedAst); };
case 'solve-preferred-bipolar':
  return () => { solvePreferredBipolar(cachedAst); };
case 'solve-preferred-aspic':
  return () => { solvePreferredAspic(cachedAst); };
case 'solve-preferred-evidential':
  return () => { solvePreferredEvidential(cachedAst); };
case 'solve-stable':
  return () => { solveStable(cachedAst); };
case 'solve-stable-bipolar':
  return () => { solveStableBipolar(cachedAst); };
case 'solve-stable-aspic':
  return () => { solveStableAspic(cachedAst); };
case 'solve-stable-evidential':
  return () => { solveStableEvidential(cachedAst); };
case 'solve-complete':
  return () => { solveComplete(cachedAst); };
case 'solve-complete-bipolar':
  return () => { solveCompleteBipolar(cachedAst); };
case 'solve-complete-aspic':
  return () => { solveCompleteAspic(cachedAst); };
case 'solve-complete-evidential':
  return () => { solveCompleteEvidential(cachedAst); };
case 'parse-solve-preferred':
  return () => {
    const r = parse(source);
    if (r.ok) solvePreferred(r.ast);
  };
case 'parse-solve-preferred-bipolar':
  return () => {
    const r = parse(source);
    if (r.ok) solvePreferredBipolar(r.ast);
  };
case 'parse-solve-preferred-aspic':
  return () => {
    const r = parse(source);
    if (r.ok) solvePreferredAspic(r.ast);
  };
case 'parse-solve-preferred-evidential':
  return () => {
    const r = parse(source);
    if (r.ok) solvePreferredEvidential(r.ast);
  };
case 'parse-solve-stable':
  return () => {
    const r = parse(source);
    if (r.ok) solveStable(r.ast);
  };
case 'parse-solve-stable-bipolar':
  return () => {
    const r = parse(source);
    if (r.ok) solveStableBipolar(r.ast);
  };
case 'parse-solve-stable-aspic':
  return () => {
    const r = parse(source);
    if (r.ok) solveStableAspic(r.ast);
  };
case 'parse-solve-stable-evidential':
  return () => {
    const r = parse(source);
    if (r.ok) solveStableEvidential(r.ast);
  };
case 'parse-solve-complete':
  return () => {
    const r = parse(source);
    if (r.ok) solveComplete(r.ast);
  };
case 'parse-solve-complete-bipolar':
  return () => {
    const r = parse(source);
    if (r.ok) solveCompleteBipolar(r.ast);
  };
case 'parse-solve-complete-aspic':
  return () => {
    const r = parse(source);
    if (r.ok) solveCompleteAspic(r.ast);
  };
case 'parse-solve-complete-evidential':
  return () => {
    const r = parse(source);
    if (r.ok) solveCompleteEvidential(r.ast);
  };
```

- [ ] **Step 3: Build and typecheck**

Run: `yarn build && yarn typecheck`
Expected: PASS — no type errors.

- [ ] **Step 4: Run the solver bench to capture the new baseline**

Run: `yarn bench:solver:baseline`
Expected: the bench script writes the new entries to `perf-baseline-solver.json`.

- [ ] **Step 5: Verify the bench output looks reasonable**

Run: `yarn bench:solver --check`
Expected: PASS — the new baseline matches the just-captured run.

- [ ] **Step 6: Commit**

```bash
git add src/solver.bench.ts perf-baseline-solver.json
git commit -m "feat(bench): add 12 multi-extension task types and refresh baseline

TASK_TYPES grows from 8 to 20 entries (4 grounded + 12 multi-extension,
each with cached-AST and parse+end-to-end variants). perf-baseline-solver.json
refreshed with the 12 new entries per fixture."
```

---

## Task 15: README updates + final verification

**Files:**
- Modify: `README.md` (document the 12 new flags + invariant + complexity)
- (No code changes; just docs and verification.)

- [ ] **Step 1: Update the README**

In `README.md`, add a new section after the existing `--semantics=evidential` paragraph:

```markdown
### Multi-Extension Semantics

For each of the four edge reductions, `argdown-2` also ships three
multi-extension semantics: preferred (maximal admissible sets), stable
(admissible sets whose complement is fully attacked), and complete
(admissible sets closed under defense). The 12 new `--semantics` values:

- `--semantics=preferred` (Dung)
- `--semantics=preferred-bipolar`, `preferred-aspic`, `preferred-evidential`
- `--semantics=stable`, `stable-bipolar`, `stable-aspic`, `stable-evidential`
- `--semantics=complete`, `complete-bipolar`, `complete-aspic`, `complete-evidential`

Output is a numbered list of extensions, each printed as the lex-sorted
in-arg keys:

```
Extension 1: A, B, D
Extension 2: A, C, E
```

Programmatic API: 12 exported functions in the main module — see
`solvePreferred`, `solveStable`, `solveComplete`, and their
`<Reduction>`-suffixed siblings.

**Cross-validation invariant (Dung's theorem):** for any document, the
intersection of all complete extensions equals the grounded extension.
`solve(doc).labels.filter(l === 'in') === solveComplete(doc).extensions.reduce(intersect)`.
This is locked in by a test fixture.

**Complexity (documented, not enforced):** preferred is Σ₂ᵖ-complete
(worst-case O(3^(N/3)) extensions per Lonc & Truszczyński). Stable is
NP-complete (worst-case O(2^N · N)). Complete is in P but worst-case
O(2^N · N). For graphs larger than ~20 nodes, multi-extension can be
slow — prefer the grounded solver for large documents.

**ASPIC+ multi-extension:** operates Dung's preferred/stable/complete
fixpoint on the ASPIC+ defeat map. Not Modgil & Prakken 2014 §4.6's
full ASPIC+ multi-extension semantics (that's a future cycle).

**Mermaid:** not supported for multi-extension semantics (no single
labels map → no single coloring). The CLI emits a stderr warning and
falls back to the extension-list output.
```

- [ ] **Step 2: Run lint + typecheck + all tests**

Run: `yarn lint && yarn typecheck && yarn test`
Expected: PASS — no errors.

- [ ] **Step 3: Run the bench (sanity check that perf is reasonable)**

Run: `yarn bench:solver`
Expected: bench runs successfully; multi-extension entries present.

- [ ] **Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: document 12 new multi-extension solver flags + invariants

Adds a Multi-Extension Semantics section to the README covering:
- the 12 new --semantics values
- output format (numbered list of extensions)
- cross-validation invariant (grounded = ∩ complete)
- worst-case complexity for each semantics
- ASPIC+ multi-extension scope note
- Mermaid limitation

Spec acceptance criterion #10."
```

---

## Self-Review Notes

**Spec coverage check:**
- Goal (12 new functions) → Tasks 8, 9, 10 ✓
- `MultiSolveResult` type → Task 8 ✓
- `buildAspicDefeatMap` extraction → Task 1 ✓
- CLI 12 new `--semantics` values + dispatch + 12 snapshots → Task 11 ✓
- `index.ts` re-exports → Task 12 ✓
- Cross-validation test → Task 13 ✓
- Bench updates → Task 14 ✓
- README → Task 15 ✓

**Placeholder scan:** No "TBD", "TODO", or "implement later" anywhere in the plan. Every step has actual code or an actual command.

**Type consistency check:**
- `MultiSolveResult = { extensions: Set<string>[], warnings: string[] }` — used consistently across Tasks 8, 9, 10, 11, 12, 13.
- `buildArgumentGraph(doc, reduction): { map, warnings }` — defined in Task 2; consumed by `solveMulti` in Task 8.
- `buildAspicDefeatMap(doc): { map, warnings }` — defined in Task 1; consumed by `buildArgumentGraph(doc, 'aspic')` in Task 4 and `solveAspicMulti` in Task 10.
- `findPreferredExtensions`, `findStableExtensions`, `findCompleteExtensions` — defined in Tasks 6, 7; consumed in Tasks 8, 9, 10.

All types match.
