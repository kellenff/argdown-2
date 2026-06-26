# Bipolar Reduction Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `solveBipolar()` to `argdown-2` — Cayrol & Lagasquie-Schiex deductive-support reduction to Dung's grounded extension. Sibling to `solve()`. Unify the `SolveResult` type by removing `dropped`. Add `--semantics=bipolar` CLI flag.

**Architecture:** `src/solver.ts` gains a second exported function `solveBipolar()` that builds an augmented attack graph (with internal `sup:` auxiliaries), runs the same `label()` fixpoint used by `solve()`, and strips auxiliaries from the returned labels. The shared helpers (`factKeyFromRef`, `argKey`, `endpointKey`, `label`) stay module-private. CLI dispatches to one function or the other based on `--semantics`.

**Tech Stack:** TypeScript, vitest, Stryker (existing). Zero new runtime dependencies.

---

## File Structure

- `src/solver.ts` (modify) — `SolveResult` loses `dropped`; replace with single summary `warnings[]` entry. Add `solveBipolar()` with shared helpers.
- `src/solver.test.ts` (modify) — change all `solved.dropped.X` assertions to `warnings` assertions.
- `src/solver.bipolar.test.ts` (new) — vitest unit tests for `solveBipolar()`.
- `src/index.ts` (modify) — re-export `solveBipolar`.
- `src/cli.ts` (modify) — add `--semantics=bipolar` flag; drop the "Dropped:" line from `--solve` output.
- `src/cli.test.ts` (modify) — drop "Dropped:" assertion; add `--semantics=bipolar` snapshot.
- `src/mermaid.test.ts` (modify) — add a bipolar label-rendering test.
- `README.md` (modify) — add `--semantics=bipolar` example; update "Solver API" section.

---

## Task 1: Unify `SolveResult` — remove `dropped`, replace with summary warning

**Files:**
- Modify: `src/solver.ts`
- Modify: `src/solver.test.ts`
- Modify: `src/cli.ts`
- Modify: `src/cli.test.ts`

- [ ] **Step 1: Update the `SolveResult` type in `src/solver.ts`**

Replace the existing `SolveResult` type and the `solve()` function so that the per-arrow-kind `dropped` object disappears. Replace it with a single summary string pushed to `warnings[]` when any non-attack edge is seen.

In `src/solver.ts`, change the type definition to:

```ts
export type Label = 'in' | 'out' | 'undec';

export type SolveResult = {
  labels: Map<string, Label>;
  warnings: string[];
};
```

Then change the body of `solve()` so that the per-edge counters are accumulated locally and emitted as a single warning string at the end. The relevant block of `solve()` becomes:

```ts
export function solve(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];
  const dropped = {
    support: 0,
    undercut: 0,
    undermine: 0,
    concession: 0,
    qualification: 0,
    equivalence: 0,
  };

  // Pass 1: key addressable nodes.
  const argByNode = new Map<Argument, string>();
  const attacks = new Map<string, string[]>();
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

  // Pass 2: walk relations, count drops, attach attacks.
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    const rs = el as RelationStatement;
    for (const rel of rs.relations) {
      switch (rel.arrow) {
        case 'attack': {
          const fromKey = endpointKey(rel.from, argByNode);
          const toKey = endpointKey(rel.to, argByNode);
          if (!labels.has(toKey)) {
            warnings.push(`dangling attack edge: ${fromKey} --x ${toKey}`);
            continue;
          }
          if (!labels.has(fromKey)) {
            labels.set(fromKey, 'undec');
          }
          const list = attacks.get(toKey) ?? [];
          list.push(fromKey);
          attacks.set(toKey, list);
          break;
        }
        case 'support':
          dropped.support++;
          break;
        case 'undercut':
          dropped.undercut++;
          break;
        case 'undermine':
          dropped.undermine++;
          break;
        case 'concession':
          dropped.concession++;
          break;
        case 'qualification':
          dropped.qualification++;
          break;
        case 'equivalence':
          dropped.equivalence++;
          break;
      }
    }
  }

  const totalDropped =
    dropped.support +
    dropped.undercut +
    dropped.undermine +
    dropped.concession +
    dropped.qualification +
    dropped.equivalence;
  if (totalDropped > 0) {
    warnings.push(
      `solve(): dropped ${totalDropped} non-attack edge(s): ` +
        `support=${dropped.support}, undercut=${dropped.undercut}, ` +
        `undermine=${dropped.undermine}, concession=${dropped.concession}, ` +
        `qualification=${dropped.qualification}, equivalence=${dropped.equivalence}`,
    );
  }

  return { labels: label(attacks), warnings };
}
```

- [ ] **Step 2: Update `src/solver.test.ts` assertions**

For every test that asserts on `solved.dropped.X`, change to assert on the warnings summary. The existing tests have these patterns:

```ts
expect(solved.dropped.support).toBe(1);
expect(solved.dropped.undermine).toBe(1);
expect(solved.dropped.undercut).toBe(1);
expect(solved.dropped.concession).toBe(1);
expect(solved.dropped.qualification).toBe(1);
expect(solved.dropped.support).toBe(0);
```

Replace each with:

```ts
expect(solved.warnings.some((w) => w.includes('support=1'))).toBe(true);
expect(solved.warnings.some((w) => w.includes('undermine=1'))).toBe(true);
expect(solved.warnings.some((w) => w.includes('undercut=1'))).toBe(true);
expect(solved.warnings.some((w) => w.includes('concession=1'))).toBe(true);
expect(solved.warnings.some((w) => w.includes('qualification=1'))).toBe(true);
expect(solved.warnings.some((w) => w.includes('support=0'))).toBe(true);
```

Also update the public-API smoke test at the bottom of `solver.test.ts`. The "exposes SolveResult and Label as types" test currently constructs a `PublicSolveResult` with the `dropped` field. Change it to:

```ts
  it('exposes SolveResult and Label as types', () => {
    const label: PublicLabel = 'in';
    const result: PublicSolveResult = {
      labels: new Map([['x', label]]),
      warnings: [],
    };
    expect(result.labels.get('x')).toBe('in');
  });
```

- [ ] **Step 3: Update `src/cli.ts` to drop the "Dropped:" line**

In `src/cli.ts`, remove the block that builds and emits the `Dropped:` line:

```ts
const d = solved.dropped;
lines.push(
  `Dropped:   ${d.support} support, ${d.undercut} undercut, ${d.undermine} undermine, ` +
    `${d.concession} concession, ${d.qualification} qualification, ${d.equivalence} equivalence`,
);
```

The lines array now contains only the IN/OUT/UNDEC rows. The `Dropped:` info still appears in stderr via the existing `for (const w of solved.warnings)` loop.

- [ ] **Step 4: Update `src/cli.test.ts`**

In the existing CLI snapshot test, change:

```ts
expect(out.stdout).toContain('Dropped:');
```

to a check on the absence of that line and the presence of the warnings prefix:

```ts
expect(out.stdout).not.toContain('Dropped:');
```

- [ ] **Step 5: Build and run tests to verify they pass**

Run:
```bash
yarn build
yarn test src/solver.test.ts src/cli.test.ts
```
Expected: all tests pass.

- [ ] **Step 6: Lint and typecheck**

Run:
```bash
yarn lint
yarn typecheck
```
Expected: no errors. The TypeScript compiler will surface any test file that still references `dropped`.

- [ ] **Step 7: Commit**

```bash
git add src/solver.ts src/solver.test.ts src/cli.ts src/cli.test.ts
git commit -m "refactor(solver): unify SolveResult, drop the dropped field"
```

---

## Task 2: Scaffold `solveBipolar()` and re-export

**Files:**
- Modify: `src/solver.ts`
- Modify: `src/index.ts`
- Create: `src/solver.bipolar.test.ts`

- [ ] **Step 1: Add a stub `solveBipolar` to `src/solver.ts`**

Append to `src/solver.ts`:

```ts
export function solveBipolar(document: Document): SolveResult {
  void document;
  return { labels: new Map(), warnings: [] };
}
```

Note: same `SolveResult` type, no `dropped`.

- [ ] **Step 2: Re-export from `src/index.ts`**

Add to `src/index.ts`:

```ts
export { solve, solveBipolar } from './solver.js';
```

(Replace the existing `export { solve } from './solver.js';` line.)

- [ ] **Step 3: Create the bipolar test file with a smoke test**

Create `src/solver.bipolar.test.ts`:

```ts
// src/solver.bipolar.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solveBipolar } from './solver.js';
import { solveBipolar as publicSolveBipolar } from './index.js';

describe('solveBipolar', () => {
  it('returns empty labels for an empty document', () => {
    const result = parse('');
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.size).toBe(0);
    expect(solved.warnings).toEqual([]);
  });
});

describe('public API', () => {
  it('re-exports solveBipolar from index.ts', () => {
    expect(publicSolveBipolar).toBe(solveBipolar);
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/solver.bipolar.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Lint and typecheck**

Run:
```bash
yarn lint
yarn typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/solver.ts src/index.ts src/solver.bipolar.test.ts
git commit -m "feat(solver): scaffold solveBipolar with public API"
```

---

## Task 3: TDD — attack-graph construction in `solveBipolar`

`solveBipolar` collapses all of `--x`, `-.->`, `-.-`, `~>`, `?>` to attack edges. This task wires the attack-graph construction (no support handling yet).

**Files:**
- Modify: `src/solver.bipolar.test.ts`
- Modify: `src/solver.ts`

- [ ] **Step 1: Add failing tests for attack-only cases**

Append to `src/solver.bipolar.test.ts`:

```ts
describe('solveBipolar — attack edges', () => {
  it('labels A=in, B=out for a single attack A --x B', () => {
    const src = '[#a].\n[#b].\n[#a] --x [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('a')).toBe('in');
    expect(solved.labels.get('b')).toBe('out');
  });

  it('labels mutual attack A --x B, B --x A as undec', () => {
    const src = '[#a].\n[#b].\n[#a] --x [#b].\n[#b] --x [#a].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('a')).toBe('undec');
    expect(solved.labels.get('b')).toBe('undec');
  });

  it('collapses non-`-->` attack variants to attack', () => {
    const src = [
      '[#a].',
      '[#b].',
      '[#c].',
      '[#d].',
      '[#e].',
      '[#a] -.-> [#b].',
      '[#a] -.-  [#c].',
      '[#a] ~>   [#d].',
      '[#a] ?>   [#e].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    // Each variant hits a different fact, so a is IN and the rest are OUT.
    expect(solved.labels.get('a')).toBe('in');
    expect(solved.labels.get('b')).toBe('out');
    expect(solved.labels.get('c')).toBe('out');
    expect(solved.labels.get('d')).toBe('out');
    expect(solved.labels.get('e')).toBe('out');
    // No summary warning — bipolar has nothing to drop.
    expect(solved.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/solver.bipolar.test.ts`
Expected: 3 new tests FAIL — `solveBipolar` returns empty labels because no keying is wired yet.

- [ ] **Step 3: Implement attack-graph construction in `solveBipolar`**

Replace the stub `solveBipolar` in `src/solver.ts` with:

```ts
export function solveBipolar(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];

  // Pass 1: key addressable nodes.
  const argByNode = new Map<Argument, string>();
  const attacks = new Map<string, string[]>();
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

  // Pass 2: walk relations, attach attacks. Support edges handled in Task 4.
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    const rs = el as RelationStatement;
    for (const rel of rs.relations) {
      if (rel.arrow === 'support' || rel.arrow === 'equivalence') {
        continue; // Task 4 and Task 5
      }
      const fromKey = endpointKey(rel.from, argByNode);
      const toKey = endpointKey(rel.to, argByNode);
      if (!labels.has(toKey)) {
        warnings.push(`dangling attack edge: ${fromKey} --x ${toKey}`);
        continue;
      }
      if (!labels.has(fromKey)) {
        labels.set(fromKey, 'undec');
      }
      const list = attacks.get(toKey) ?? [];
      list.push(fromKey);
      attacks.set(toKey, list);
    }
  }

  return { labels: label(attacks), warnings };
}
```

Note: this is the same pass-1/pass-2 pattern as `solve()`. The duplication is small (and the helpers `factKey`, `argKey`, `conclusionRefKey`, `endpointKey`, `label` are already module-private and shared). If `solveBipolar` later grows past the 400-line cap with the support machinery added, the plan in §11 of the spec notes the split is by phase: extract `solver-graph.ts`, `solver-label.ts`. For this cycle, keep them in one file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/solver.bipolar.test.ts`
Expected: all 5 tests PASS (the 2 skeleton tests + 3 new attack-edge tests).

- [ ] **Step 5: Lint and typecheck**

Run:
```bash
yarn lint
yarn typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/solver.ts src/solver.bipolar.test.ts
git commit -m "feat(solver): wire attack-graph construction in solveBipolar"
```

---

## Task 4: TDD — `-->` support reduction

The deductive-support construction: each `A --> B` introduces an auxiliary `s_{A→B}` with attacks `B → s` and `s → A`. Auxiliaries are keyed `sup:<from>-><to>`.

**Files:**
- Modify: `src/solver.bipolar.test.ts`
- Modify: `src/solver.ts`

- [ ] **Step 1: Add failing tests for support reduction**

Append to `src/solver.bipolar.test.ts`:

```ts
describe('solveBipolar — support edges', () => {
  it('labels A=in, B=in for a single support A --> B', () => {
    const src = '[#a].\n[#b].\n[#a] --> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('a')).toBe('in');
    expect(solved.labels.get('b')).toBe('in');
  });

  it('labels A=undec, B=undec for A --> B with X --x A', () => {
    // 3-cycle through auxiliary traps all three as UNDEC.
    const src = '[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#a].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('x')).toBe('in');
    expect(solved.labels.get('a')).toBe('undec');
    expect(solved.labels.get('b')).toBe('undec');
  });

  it('labels A=out, B=out for A --> B with X --x B', () => {
    // B's defeat propagates to its supporter A via the auxiliary chain.
    const src = '[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('x')).toBe('in');
    expect(solved.labels.get('a')).toBe('out');
    expect(solved.labels.get('b')).toBe('out');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/solver.bipolar.test.ts`
Expected: 3 new tests FAIL — `-->` is currently skipped (the `continue` in Task 3's pass 2), so the support edges have no effect on labels.

- [ ] **Step 3: Implement support reduction in `solveBipolar`**

Replace the body of `solveBipolar` in `src/solver.ts` with:

```ts
export function solveBipolar(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];

  // Pass 1: key addressable nodes.
  const argByNode = new Map<Argument, string>();
  const attacks = new Map<string, string[]>();
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

  // Helper for support-edge reduction (B → s → A).
  function addSupport(fromKey: string, toKey: string): void {
    const auxKey = `sup:${fromKey}->${toKey}`;
    // B → s
    const sAttackers = attacks.get(auxKey) ?? [];
    sAttackers.push(toKey);
    attacks.set(auxKey, sAttackers);
    // s → A
    const aAttackers = attacks.get(fromKey) ?? [];
    aAttackers.push(auxKey);
    attacks.set(fromKey, aAttackers);
  }

  // Pass 2: walk relations, attach attacks and supports.
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    const rs = el as RelationStatement;
    for (const rel of rs.relations) {
      if (rel.arrow === 'support') {
        const fromKey = endpointKey(rel.from, argByNode);
        const toKey = endpointKey(rel.to, argByNode);
        if (!labels.has(toKey)) {
          warnings.push(`dangling support edge: ${fromKey} --> ${toKey}`);
          continue;
        }
        if (!labels.has(fromKey)) {
          labels.set(fromKey, 'undec');
        }
        addSupport(fromKey, toKey);
        continue;
      }
      if (rel.arrow === 'equivalence') {
        // Task 5
        continue;
      }
      const fromKey = endpointKey(rel.from, argByNode);
      const toKey = endpointKey(rel.to, argByNode);
      if (!labels.has(toKey)) {
        warnings.push(`dangling attack edge: ${fromKey} --x ${toKey}`);
        continue;
      }
      if (!labels.has(fromKey)) {
        labels.set(fromKey, 'undec');
      }
      const list = attacks.get(toKey) ?? [];
      list.push(fromKey);
      attacks.set(toKey, list);
    }
  }

  // Run fixpoint on the augmented graph, then strip auxiliaries from the output.
  const fullLabels = label(attacks);
  for (const key of [...fullLabels.keys()]) {
    if (key.startsWith('sup:')) fullLabels.delete(key);
  }
  return { labels: fullLabels, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/solver.bipolar.test.ts`
Expected: all 8 tests PASS (skeleton + 3 attack + 3 support + 1 public API).

- [ ] **Step 5: Lint and typecheck**

Run:
```bash
yarn lint
yarn typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/solver.ts src/solver.bipolar.test.ts
git commit -m "feat(solver): implement deductive-support reduction in solveBipolar"
```

---

## Task 5: TDD — `<->` equivalence reduction

`<->` is two support edges, so two auxiliaries.

**Files:**
- Modify: `src/solver.bipolar.test.ts`
- Modify: `src/solver.ts`

- [ ] **Step 1: Add failing tests for equivalence**

Append to `src/solver.bipolar.test.ts`:

```ts
describe('solveBipolar — equivalence', () => {
  it('labels A=undec, B=undec for mutual equivalence A <-> B', () => {
    const src = '[#a].\n[#b].\n[#a] <-> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('a')).toBe('undec');
    expect(solved.labels.get('b')).toBe('undec');
  });

  it('emits no warnings about dropped edges for equivalence', () => {
    const src = '[#a].\n[#b].\n[#a] <-> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/solver.bipolar.test.ts`
Expected: 2 new tests FAIL — `<->` is currently skipped, so A and B are unattacked (IN), not UNDEC.

- [ ] **Step 3: Implement equivalence as two supports in `solveBipolar`**

In `src/solver.ts`, replace the `if (rel.arrow === 'equivalence') { continue; }` line in `solveBipolar` with:

```ts
      if (rel.arrow === 'equivalence') {
        const fromKey = endpointKey(rel.from, argByNode);
        const toKey = endpointKey(rel.to, argByNode);
        if (!labels.has(toKey)) {
          warnings.push(`dangling equivalence edge: ${fromKey} <-> ${toKey}`);
          continue;
        }
        if (!labels.has(fromKey)) {
          labels.set(fromKey, 'undec');
        }
        addSupport(fromKey, toKey);
        addSupport(toKey, fromKey);
        continue;
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/solver.bipolar.test.ts`
Expected: all 10 tests PASS.

- [ ] **Step 5: Lint and typecheck**

Run:
```bash
yarn lint
yarn typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/solver.ts src/solver.bipolar.test.ts
git commit -m "feat(solver): treat equivalence as two support edges in solveBipolar"
```

---

## Task 6: TDD — auxiliary stripping and dangling support warnings

These behaviors already exist from Task 4 (`addSupport` warns on dangling support, the strip loop runs after `label()`). This task adds the explicit tests for them.

**Files:**
- Modify: `src/solver.bipolar.test.ts`

- [ ] **Step 1: Add tests for auxiliary stripping and dangling detection**

Append to `src/solver.bipolar.test.ts`:

```ts
describe('solveBipolar — auxiliary stripping', () => {
  it('does not surface auxiliary nodes in the labels map', () => {
    const src = '[#a].\n[#b].\n[#a] --> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    for (const key of solved.labels.keys()) {
      expect(key.startsWith('sup:')).toBe(false);
    }
  });
});

describe('solveBipolar — dangling edges', () => {
  it('emits a warning for a dangling support edge', () => {
    // Hand-build: a fact `a` plus a support edge to a non-existent `ghost`.
    const doc = {
      kind: 'Document' as const,
      elements: [
        {
          kind: 'FactStatement' as const,
          fact: {
            kind: 'Fact' as const,
            ref: {
              kind: 'FactRef' as const,
              head: {
                kind: 'IdentifierHead' as const,
                identifier: 'a',
                loc: {
                  start: { line: 1, column: 2, offset: 1 },
                  end: { line: 1, column: 4, offset: 3 },
                },
              },
              loc: {
                start: { line: 1, column: 1, offset: 0 },
                end: { line: 1, column: 5, offset: 4 },
              },
            },
            loc: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 5, offset: 4 },
            },
          },
          loc: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 5, offset: 4 },
          },
        },
        {
          kind: 'RelationStatement' as const,
          relations: [
            {
              kind: 'Relation' as const,
              from: {
                kind: 'FactRef' as const,
                head: {
                  kind: 'IdentifierHead' as const,
                  identifier: 'a',
                  loc: {
                    start: { line: 2, column: 2, offset: 7 },
                    end: { line: 2, column: 4, offset: 9 },
                  },
                },
                loc: {
                  start: { line: 2, column: 1, offset: 6 },
                  end: { line: 2, column: 5, offset: 10 },
                },
              },
              arrow: 'support' as const,
              to: {
                kind: 'FactRef' as const,
                head: {
                  kind: 'IdentifierHead' as const,
                  identifier: 'ghost',
                  loc: {
                    start: { line: 2, column: 11, offset: 16 },
                    end: { line: 2, column: 17, offset: 22 },
                  },
                },
                loc: {
                  start: { line: 2, column: 10, offset: 15 },
                  end: { line: 2, column: 18, offset: 23 },
                },
              },
              loc: {
                start: { line: 2, column: 1, offset: 6 },
                end: { line: 2, column: 18, offset: 23 },
              },
            },
          ],
          loc: {
            start: { line: 2, column: 1, offset: 6 },
            end: { line: 2, column: 18, offset: 23 },
          },
        },
      ],
      loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 2, column: 18, offset: 23 } },
    };
    const solved = solveBipolar(doc);
    expect(solved.warnings.some((w) => w.includes('dangling support edge'))).toBe(true);
    expect(solved.labels.has('ghost')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `yarn test src/solver.bipolar.test.ts`
Expected: PASS (the impl from Task 4 already strips auxiliaries and emits dangling warnings; these tests pin the behavior).

- [ ] **Step 3: Commit**

```bash
git add src/solver.bipolar.test.ts
git commit -m "test(solver): pin auxiliary stripping and dangling support warnings"
```

---

## Task 7: TDD — comprehensive bipolar cases

The implementation is already general; this task adds the remaining coverage cases from the spec.

**Files:**
- Modify: `src/solver.bipolar.test.ts`

- [ ] **Step 1: Add remaining coverage cases**

Append to `src/solver.bipolar.test.ts`:

```ts
describe('solveBipolar — edge cases', () => {
  it('labels self-support A --> A as undec', () => {
    const src = '[#a].\n[#a] --> [#a].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.get('a')).toBe('undec');
  });

  it('handles a mix of all arrow kinds without dropping any', () => {
    const src = [
      '[#a].',
      '[#b].',
      '[#c].',
      '[#d].',
      '[#e].',
      '[#f].',
      '[#g].',
      '[#a] --> [#b].',
      '[#a] --x  [#c].',
      '[#a] -.-> [#d].',
      '[#a] -.-  [#e].',
      '[#a] ~>   [#f].',
      '[#a] ?>   [#g].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    // No "dropped" warning — bipolar has nothing to drop.
    expect(solved.warnings).toEqual([]);
    // `a` is unattacked → IN. `b` is supported by a → IN.
    expect(solved.labels.get('a')).toBe('in');
    expect(solved.labels.get('b')).toBe('in');
    // `c`–`g` are attacked by `a` (IN) → OUT.
    expect(solved.labels.get('c')).toBe('out');
    expect(solved.labels.get('d')).toBe('out');
    expect(solved.labels.get('e')).toBe('out');
    expect(solved.labels.get('f')).toBe('out');
    expect(solved.labels.get('g')).toBe('out');
  });

  it('supports through an argument node', () => {
    const src = '[#a].\n([#b]) -> [#c].\n[#a] --> ([#b]) -> [#c].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    // `a` is unattacked → IN. The argument node is supported by a → IN.
    // `c` (the argument's conclusion atom) is supported via the argument → IN.
    expect(solved.labels.get('a')).toBe('in');
    expect(solved.labels.get('arg:3:1')).toBe('in');
    expect(solved.labels.get('c')).toBe('in');
  });

  it('diverges from Method 1 on a document with supports', () => {
    // `A --> B`: Method 1 treats A as supporter, B as unattacked → both IN.
    // Method 2 runs the bipolar reduction → also both IN, but via support chain.
    // They happen to agree here. Use a case where they diverge.
    // A --> B, X --x A: Method 1 has X=in, A=out, B=in (unattacked). Method 2 has
    // X=in, A=undec, B=undec (3-cycle through aux).
    const src = '[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#a].';
    const dungResult = parse(src);
    const bipolarResult = parse(src);
    if (!dungResult.ok || !bipolarResult.ok) throw new Error('parse failed');
    // Re-import solve inline to avoid the eslint no-shadow rule on this test file.
    const { solve } = await import('./solver.js');
    const dung = solve(dungResult.ast);
    const bipolar = solveBipolar(bipolarResult.ast);
    expect(dung.labels.get('a')).toBe('out');
    expect(dung.labels.get('b')).toBe('in');
    expect(bipolar.labels.get('a')).toBe('undec');
    expect(bipolar.labels.get('b')).toBe('undec');
  });
});
```

Note: the last test uses `await import` to keep the top-level imports free of a shadowing `solve` binding. If the lint complains, switch to a separate test file or rename the imported binding.

- [ ] **Step 2: Run tests to verify they pass**

Run: `yarn test src/solver.bipolar.test.ts`
Expected: PASS. The existing impl is general enough for these cases; this task is coverage.

- [ ] **Step 3: Lint and typecheck**

Run:
```bash
yarn lint
yarn typecheck
```
Expected: no errors. If the `await import` pattern trips the no-top-level-await rule, fall back to a sync `require` inside the `it` callback.

- [ ] **Step 4: Commit**

```bash
git add src/solver.bipolar.test.ts
git commit -m "test(solver): cover bipolar edge cases and sanity-check vs Method 1"
```

---

## Task 8: Add `--semantics` CLI flag

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/cli.test.ts`

- [ ] **Step 1: Update `src/cli.ts` to parse `--semantics`**

Replace the top of `main()` in `src/cli.ts` (the `argv` parsing block) with:

```ts
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const solveMode = argv.includes('--solve');
  const semanticsIdx = argv.findIndex((a) => a.startsWith('--semantics='));
  const semantics = semanticsIdx >= 0 ? argv[semanticsIdx].slice('--semantics='.length) : undefined;
  const positional = argv.filter((a) => a !== '--solve' && !a.startsWith('--semantics='));
  const filename = positional[0];

  if (semantics !== undefined && !solveMode) {
    process.stderr.write('argdown-mermaid: --semantics requires --solve\n');
    process.exit(1);
  }
  if (semantics !== undefined && semantics !== 'dung' && semantics !== 'bipolar') {
    process.stderr.write(
      `argdown-mermaid: --semantics must be one of: dung, bipolar (got "${semantics}")\n`,
    );
    process.exit(1);
  }

  const source = filename ? readFileSync(filename, 'utf8') : await readStdin();

  const result = parse(source, filename ? { filename } : {});
  if (!result.ok) {
    const label = filename ?? '<stdin>';
    for (const err of result.errors) {
      process.stderr.write(`${formatError(err, label)}\n`);
    }
    process.exit(1);
  }

  if (solveMode) {
    const { solve, solveBipolar } = await import('./solver.js');
    const solved = semantics === 'bipolar' ? solveBipolar(result.ast) : solve(result.ast);
    const groups: Record<Label, string[]> = { in: [], out: [], undec: [] };
    for (const [k, v] of solved.labels) groups[v].push(k);
    for (const v of ['in', 'out', 'undec'] as const) groups[v].sort();

    const lines: string[] = [];
    for (const v of ['in', 'out', 'undec'] as const) {
      lines.push(`${v.toUpperCase()} (${groups[v].length}): ${groups[v].join(', ')}`);
    }
    process.stdout.write(lines.join('\n') + '\n');
    for (const w of solved.warnings) {
      process.stderr.write(`warning: ${w}\n`);
    }
    return;
  }

  process.stdout.write(renderMermaid(result.ast));
}
```

Also update the top-of-file import:

```ts
import { solve, solveBipolar, type Label } from './solver.js';
```

(Replace the existing `import { solve, type Label } from './solver.js';`.)

The `await import('./solver.js')` inside the solve branch lets the runtime module stay split-loadable. If the existing TS config disallows dynamic imports in this file, hoist the imports back to the top — both `solve` and `solveBipolar` will be loaded eagerly either way; this is just to avoid re-typing the same line twice.

- [ ] **Step 2: Update `src/cli.test.ts` with new snapshots**

Replace the existing single test in `src/cli.test.ts` with:

```ts
describe('CLI --solve', () => {
  it('prints IN/OUT/UNDEC summary without Dropped line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    writeFileSync(file, '[#a].\n[#b].\n[#a] --x [#b].\n');
    const out = runCli(['--solve', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('IN');
    expect(out.stdout).toContain('OUT');
    expect(out.stdout).not.toContain('Dropped:');
    expect(out.stdout).toContain('a');
    expect(out.stdout).toContain('b');
  });

  it('runs Method 1 by default (pure Dung)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    // Support + counter-attack on supporter: Method 1 says A=out, B=in (unattacked).
    writeFileSync(file, '[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#a].\n');
    const out = runCli(['--solve', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('a');
    // Method 1 demotes A to OUT; B stays IN (unattacked after support is dropped).
    expect(out.stdout).toMatch(/OUT \(\d+\):[^]*\ba\b/);
  });

  it('runs Method 2 (bipolar) with --semantics=bipolar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    // Same doc as the previous test. Method 2 says A=undec, B=undec (3-cycle through aux).
    writeFileSync(file, '[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#a].\n');
    const out = runCli(['--solve', '--semantics=bipolar', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/UNDEC \(\d+\):[^]*\ba\b/);
    expect(out.stdout).toMatch(/UNDEC \(\d+\):[^]*\bb\b/);
  });

  it('rejects --semantics without --solve', () => {
    const out = runCli(['--semantics=bipolar']);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain('--semantics requires --solve');
  });

  it('rejects unknown --semantics values', () => {
    const out = runCli(['--solve', '--semantics=foo']);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain('--semantics must be one of: dung, bipolar');
  });
});
```

- [ ] **Step 3: Build and run tests**

Run:
```bash
yarn build
yarn test src/cli.test.ts
```
Expected: all 5 CLI tests PASS.

- [ ] **Step 4: Lint and typecheck**

Run:
```bash
yarn lint
yarn typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/cli.test.ts
git commit -m "feat(cli): add --semantics flag and bipolar dispatch"
```

---

## Task 9: Mermaid bipolar test snapshot

The Mermaid renderer is unchanged. This task adds one test that exercises the bipolar-labels → classDef rendering path.

**Files:**
- Modify: `src/mermaid.test.ts`

- [ ] **Step 1: Read the existing test file structure**

Run: `head -60 src/mermaid.test.ts`
Expected: imports for `renderMermaid` and possibly existing label-rendering tests.

- [ ] **Step 2: Add a bipolar-rendering test**

Append to `src/mermaid.test.ts`:

```ts
import { solveBipolar } from './solver.js';

describe('renderMermaid with bipolar labels', () => {
  it('classDefs nodes from solveBipolar output', () => {
    const src = '[#A].\n[#B].\n[#A] --> [#B].\n';
    const parsed = parse(src);
    if (!parsed.ok) throw new Error('parse failed');
    const labels = solveBipolar(parsed.ast).labels;
    const out = renderMermaid(parsed.ast, labels);
    expect(out).toContain('classDef in');
    expect(out).toMatch(/class\s+[A-Za-z_][\w]*\s+in/);
  });
});
```

If `src/mermaid.test.ts` already has a "labels" describe block, append the `it` inside it instead of adding a new top-level describe. The exact shape depends on the file — match the surrounding style.

- [ ] **Step 3: Run tests to verify they pass**

Run: `yarn test src/mermaid.test.ts`
Expected: PASS. The renderer is unchanged from the existing label-supporting path.

- [ ] **Step 4: Lint and typecheck**

Run:
```bash
yarn lint
yarn typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/mermaid.test.ts
git commit -m "test(mermaid): cover bipolar-label classDef rendering"
```

---

## Task 10: README updates

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the relevant section**

Run: `grep -n "solve\|Solver\|--solve" README.md`
Expected: lines referencing `solve()`, `--solve`, or the Solver API section.

- [ ] **Step 2: Add a bipolar example and update the API listing**

Find the section that documents `solve()` and `--solve` (most likely the "Quick start" example block). Add a bipolar example right after:

```md
For bipolar argumentation (deductive support reduction):

\`\`\`ts
import { solveBipolar } from '@casualtheorics/argdown-2';

const bipolar = solveBipolar(parsed.ast);
// bipolar.labels: Map<string, 'in' | 'out' | 'undec'>
// Same shape as solve() — feed directly to renderMermaid().
\`\`\`
```

And via the CLI:

```md
\`\`\`bash
echo '[#A] --> [#B]' | npx argdown-mermaid --solve --semantics=bipolar
\`\`\`
```

Update the Solver API section (or add one if it doesn't exist) to list both functions and note that `--semantics=bipolar` is the bipolar entry.

- [ ] **Step 3: Lint the markdown (if configured)**

Run:
```bash
yarn format:check
```
Expected: no errors. If oxfmt flags the new code blocks, run `yarn format` and re-commit.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document solveBipolar and --semantics=bipolar"
```

---

## Task 11: Stryker mutation pass

The project enforces 80%+ mutation score on the new code.

**Files:**
- Modify: `src/solver.ts` and/or `src/solver.bipolar.test.ts` as needed to kill surviving mutants.

- [ ] **Step 1: Run mutation tests**

Run:
```bash
yarn mutate
```
Expected: passes the 80% threshold on the modified files. The stryker config (`stryker.config.mjs`) was updated in commit `43feda8` to include `solver.ts` and `mermaid.ts`; verify that `solver.bipolar.test.ts` is also picked up by checking the config's `mutate`/`test` globs. If it isn't, add the file path to the `mutate` array.

- [ ] **Step 2: Inspect surviving mutants**

Open the Stryker HTML report (path is in the terminal output, typically `reports/mutation/index.html`). For each surviving mutant on `solver.ts` or `solver.bipolar.test.ts`, decide:

- **Legitimate survivor** → add a tighter test.
- **Equivalent mutant** → ignore (mark as such in Stryker if it persists).
- **Spec gap** → revise the test to assert more precisely.

Common mutants to expect:
- Swapped `attacks.get(fromKey)` ↔ `attacks.get(auxKey)` in `addSupport` — would break the B → s direction.
- `key.startsWith('sup:')` → `key.startsWith('s')` — would over-strip. Add a tighter strip test (e.g., a fact keyed `sick` to ensure it isn't accidentally stripped).
- Removed dangling-warning check — add explicit dangling-support and dangling-equivalence tests (Task 6 already covers support; add equivalence if missing).
- Off-by-one in `addSupport` (e.g., missing the `attacks.set(...)` reassignment) — the existing test on `A --> B` already catches this.

- [ ] **Step 3: Add a "do not over-strip" test if needed**

If a mutant survives by mutating `startsWith('sup:')` to a more permissive prefix, append to `src/solver.bipolar.test.ts`:

```ts
  it('does not strip fact keys that happen to start with `s`', () => {
    const src = '[#sea].\n[#ship].\n[#ship] --> [#sea].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveBipolar(result.ast);
    expect(solved.labels.has('sea')).toBe(true);
    expect(solved.labels.has('ship')).toBe(true);
    for (const key of solved.labels.keys()) {
      expect(key.startsWith('sup:')).toBe(false);
    }
  });
```

- [ ] **Step 4: Re-run mutation tests**

Run: `yarn mutate`
Expected: ≥ 80% mutation score. Iterate on Step 2/3 if needed.

- [ ] **Step 5: Commit any new tests or fixes**

```bash
git add src/solver.ts src/solver.bipolar.test.ts stryker.config.mjs
git commit -m "test(solver): reach 80% mutation threshold on bipolar solver"
```

---

## Acceptance verification

After all tasks complete, run the full check from the README:

```bash
yarn lint
yarn typecheck
yarn test
yarn mutate
```

Expected: all green. The acceptance criteria from the spec (`docs/snowball/specs/2026-06-25-bipolar-reduction-solver-design.md` §9) should all be satisfied:

1. `solveBipolar` exported from `src/index.ts`. ✓ (Task 2)
2. `SolveResult` type unified to `{ labels, warnings }`. ✓ (Task 1)
3. `yarn lint && yarn typecheck && yarn test` green. ✓ (each task)
4. Stryker mutation score ≥ 80%. ✓ (Task 11)
5. CLI: `--solve` (default), `--solve --semantics=dung` (explicit), `--solve --semantics=bipolar` all work. ✓ (Task 8)
6. `renderMermaid(document, solveBipolar(doc).labels)` works unchanged. ✓ (Task 9)
7. README updated. ✓ (Task 10)
8. All existing Method 1 tests updated to drop `dropped` field assertions. ✓ (Task 1)

---

## Skipped (YAGNI list — already in the spec)

- Two result types — the unified shape wins.
- Auxiliary surfacing in `labels` — internal-only.
- Evidential support — separate cycle.
- `SolveOptions` config bag — no opts.
- Solver perf bench — add when regression is measurable.
- Argument-construction layer — atomic arguments only.

These are explicit non-goals for this cycle; do not pull them in mid-implementation.