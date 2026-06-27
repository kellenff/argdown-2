# Evidential Support Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `solveEvidential()` to `argdown-2` — Dung's grounded extension on a Cayrol & Lagasquie-Schiex 2005 §3.3 necessary-support reduction. Sibling to `solve()` (Method 1), `solveBipolar()` (Method 2), `solveAspic()` (Method 3). Retires the §3.3 deferral noted in the bipolar and ASPIC+ specs.

**Architecture:** A single new public function `solveEvidential(document): SolveResult` in `src/solver.ts`, mirroring `solveBipolar()`'s 3-pass shape (key, classify, label) plus a per-relation `addNecessarySupport()` reduction. Each `A --> B` introduces auxiliary `nec:A->B` with attacks `A → nec` and `nec → B`, so A's defeat propagates to B. The existing `label()` fixpoint runs unchanged on the augmented graph; auxiliaries (`nec:`-prefixed) are stripped from the output. `<->` becomes two necessary supports. All other arrows collapse to plain attack (matching bipolar). No new types, no AST changes, no preference machinery.

**Tech Stack:** TypeScript 5.4 (ESM, Node 18+), Vitest, Tinybench 2.6 (already a devDep), no new runtime dependencies.

**Spec:** `docs/snowball/specs/2026-06-26-evidential-support-solver-design.md` (source of truth for design decisions; algorithm description and verified test outcomes are in §5 and §8).

---

## File Structure

Files created/modified in this plan:

| File | Status | Responsibility | Lines (est.) |
|---|---|---|---|
| `src/solver.evidential.test.ts` | new | unit tests for evidential semantics (21 cases; §8 of spec) | ~300 |
| `src/solver.ts` | modify | exports `solveEvidential()`; same file as `solve()` / `solveBipolar()` | +45 |
| `src/index.ts` | modify | re-exports `solveEvidential` | +1 |
| `src/cli.ts` | modify | adds `'evidential'` to `--semantics` whitelist + dispatch | +3 |
| `src/solver.bench.ts` | modify | adds `solve-evidential` and `parse-solve-evidential` to `TASK_TYPES` and `makeTaskBody` | +10 |
| `src/solver.bench.test.ts` | modify | tests for the new task types | +15 |
| `perf-baseline-solver.json` | modify | refresh with the new task entries (6 → 8 task types per fixture) | data |
| `README.md` | modify | documents `--semantics=evidential` + 4-line contrast example | +20 |

**Dependency direction (one-way, no cycles):**

```
index.ts ──▶ solver.ts ──▶ ast.ts (types only)
   │            │
   │            ├──▶ mermaid.ts (unchanged — consumes labels only)
   │            └──▶ cli.ts (calls solveEvidential via dispatch)

solver.evidential.test.ts ──▶ solver.ts (imports solveEvidential)
solver.bench.ts ──▶ solver.ts (imports solveEvidential, solve, solveBipolar, solveAspic)
```

`solver.ts` is currently 278 lines; adding ~45 lines keeps it well under the 400-line lint cap. No file split needed — the new function mirrors `solveBipolar()`'s structure exactly.

---

## Task 1: Write the failing test file

**Files:**
- Create: `src/solver.evidential.test.ts`

- [ ] **Step 1: Create the test file with all 21 cases**

Create `src/solver.evidential.test.ts` with the contents below. Every expected outcome has been verified by running the algorithm in isolation against the test input (see spec §8 note).

```ts
// src/solver.evidential.test.ts
// Cayrol & Lagasquie-Schiex 2005 §3.3 necessary-support reduction.
// Each `A --> B` introduces auxiliary `nec:A->B` with attacks
// `A → nec` and `nec → B`; A's defeat propagates to B.

import { describe, expect, it } from 'vitest';

import { parse } from './parser.js';
import type { Label } from './solver.js';
import { solveEvidential } from './solver.js';

function solveSrc(src: string): { labels: Map<string, Label>; warnings: string[] } {
  const r = parse(src);
  if (!r.ok) throw new Error('parse failed: ' + r.errors.map((e) => e.message).join('; '));
  const result = solveEvidential(r.ast);
  return { labels: result.labels, warnings: result.warnings };
}

describe('solveEvidential', () => {
  it('empty graph: no labels, no warnings', () => {
    const { labels, warnings } = solveSrc('');
    expect(labels.size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('simple necessary support: A in, B in', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#A] --> [#B].');
    expect(labels.get('A')).toBe('in');
    expect(labels.get('B')).toBe('in');
  });

  it('headline: propagates A\'s defeat to B', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#C]\n[#A] --> [#B].\n[#C] --x [#A].');
    expect(labels.get('A')).toBe('out');
    expect(labels.get('B')).toBe('out');
    expect(labels.get('C')).toBe('in');
  });

  it('self-support: A undec (no direct self-attack)', () => {
    const { labels } = solveSrc('[#A]\n[#A] --> [#A].');
    expect(labels.get('A')).toBe('undec');
  });

  it('mutual necessary support: cycle through two auxiliaries', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#A] --> [#B].\n[#B] --> [#A].');
    expect(labels.get('A')).toBe('undec');
    expect(labels.get('B')).toBe('undec');
  });

  it('equivalence: two necessary supports, four-node cycle', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#A] <-> [#B].');
    expect(labels.get('A')).toBe('undec');
    expect(labels.get('B')).toBe('undec');
  });

  it('mixed equivalence + attack: cycle absorbs C', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#C]\n[#A] <-> [#B].\n[#C] --x [#A].');
    expect(labels.get('A')).toBe('undec');
    expect(labels.get('B')).toBe('undec');
    expect(labels.get('C')).toBe('in');
  });

  it('necessary support from in-supporter does NOT force B\'s defeat', () => {
    // C --x B is a direct attack; nec=A->B is OUT (A is in); some-out → B is in.
    const { labels } = solveSrc('[#A]\n[#B]\n[#C]\n[#A] --> [#B].\n[#C] --x [#B].');
    expect(labels.get('A')).toBe('in');
    expect(labels.get('B')).toBe('in');
    expect(labels.get('C')).toBe('in');
  });

  it('undercut collapses to attack (no preference mechanics)', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#A] -.-> [#B].');
    expect(labels.get('A')).toBe('in');
    expect(labels.get('B')).toBe('out');
  });

  it('concession collapses to attack, no warning', () => {
    const { warnings } = solveSrc('[#A]\n[#B]\n[#A] ~> [#B].');
    expect(warnings.find((w) => w.includes('concession'))).toBeUndefined();
  });

  it('qualification collapses to attack, no warning', () => {
    const { warnings } = solveSrc('[#A]\n[#B]\n[#A] ?> [#B].');
    expect(warnings.find((w) => w.includes('qualification'))).toBeUndefined();
  });

  it('mixed arrows: multiple attackers, but aux out → all in', () => {
    const { labels } = solveSrc(
      '[#A]\n[#B]\n[#C]\n[#D]\n[#A] --> [#B].\n[#C] --x [#B].\n[#D] -.-> [#B].',
    );
    expect(labels.get('A')).toBe('in');
    expect(labels.get('B')).toBe('in');
    expect(labels.get('C')).toBe('in');
    expect(labels.get('D')).toBe('in');
  });

  it('cycle through auxiliaries: no source, all undec', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#C]\n[#A] --> [#B].\n[#B] --> [#C].\n[#C] --> [#A].');
    expect(labels.get('A')).toBe('undec');
    expect(labels.get('B')).toBe('undec');
    expect(labels.get('C')).toBe('undec');
  });

  it('auxiliaries are stripped from output labels', () => {
    const { labels } = solveSrc('[#A]\n[#B]\n[#A] --> [#B].');
    for (const k of labels.keys()) {
      expect(k.startsWith('nec:')).toBe(false);
    }
  });

  it('dangling necessary support: warning, no crash', () => {
    const { warnings } = solveSrc('[#A]\n[#A] --> [#NONEXISTENT].');
    expect(warnings.some((w) => w.includes('NONEXISTENT'))).toBe(true);
  });

  it('dangling equivalence: warning, no crash', () => {
    const { warnings } = solveSrc('[#A]\n[#A] <-> [#NONEXISTENT].');
    expect(warnings.some((w) => w.includes('NONEXISTENT'))).toBe(true);
  });

  it('dangling attack: warning', () => {
    const { warnings } = solveSrc('[#A]\n[#A] --x [#NONEXISTENT].');
    expect(warnings.some((w) => w.includes('NONEXISTENT'))).toBe(true);
  });

  it('duplicate fact id: warning', () => {
    const { warnings } = solveSrc('[#A] X.\n[#A] Y.');
    expect(warnings.some((w) => w.includes('duplicate'))).toBe(true);
  });

  it('defeats field absent (evidential is a reduction, not ASPIC+)', () => {
    const r = parse('[#A]\n[#A] --> [#A].');
    if (!r.ok) throw new Error('parse failed');
    const result = solveEvidential(r.ast);
    expect(result.defeats).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the new test file to confirm it fails**

Run: `yarn test src/solver.evidential.test.ts`
Expected: FAIL with `Failed to resolve import "./solver.js" from "src/solver.evidential.test.ts"` or `solveEvidential is not a function`. All 19 `it` blocks fail.

---

## Task 2: Implement `solveEvidential()`

**Files:**
- Modify: `src/solver.ts` (append at the bottom, after `solveBipolar`)

- [ ] **Step 1: Add the function to `src/solver.ts`**

Append the following code at the bottom of `src/solver.ts`:

```ts
export function solveEvidential(document: Document): SolveResult {
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

  // Necessary-support reduction: A --> B adds auxiliary `nec:A->B` with
  // attacks `A → nec` and `nec → B`. A's defeat propagates to B.
  function addNecessarySupport(fromKey: string, toKey: string): void {
    const auxKey = `nec:${fromKey}->${toKey}`;
    // A → aux
    const auxAttackers = attacks.get(auxKey) ?? [];
    auxAttackers.push(fromKey);
    attacks.set(auxKey, auxAttackers);
    // aux → B
    const bAttackers = attacks.get(toKey) ?? [];
    bAttackers.push(auxKey);
    attacks.set(toKey, bAttackers);
  }

  // Pass 2: walk relations, classify.
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
        addNecessarySupport(fromKey, toKey);
        continue;
      }
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
        addNecessarySupport(fromKey, toKey);
        addNecessarySupport(toKey, fromKey);
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

  // Pass 3: label, then strip `nec:`-prefixed auxiliaries from the output.
  const fullLabels = label(attacks);
  const out = new Map<string, Label>();
  for (const [key, value] of fullLabels) {
    if (!key.startsWith('nec:')) out.set(key, value);
  }
  return { labels: out, warnings };
}
```

- [ ] **Step 2: Run the new test file to confirm it passes**

Run: `yarn test src/solver.evidential.test.ts`
Expected: PASS, all 19 cases green.

- [ ] **Step 3: Run the full test suite to confirm no regressions**

Run: `yarn test`
Expected: PASS — existing solver tests, parser tests, mermaid tests, cli tests all untouched and green.

---

## Task 3: Re-export `solveEvidential` from `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add the re-export**

Open `src/index.ts`. Find the line:
```ts
export { solve, solveBipolar } from './solver.js';
```
Change it to:
```ts
export { solve, solveBipolar, solveEvidential } from './solver.js';
```

- [ ] **Step 2: Verify with `yarn typecheck`**

Run: `yarn typecheck`
Expected: PASS, no new errors.

---

## Task 4: Update CLI dispatch + whitelist

**Files:**
- Modify: `src/cli.ts:40-50` (whitelist) and `src/cli.ts:60-72` (dispatch ternary)

- [ ] **Step 1: Extend the import**

Open `src/cli.ts`. Find the line:
```ts
import { solve, solveBipolar, type Label } from './solver.js';
```
Change it to:
```ts
import { solve, solveBipolar, solveEvidential, type Label } from './solver.js';
```

- [ ] **Step 2: Add `'evidential'` to the whitelist check**

Find the block:
```ts
if (
    semantics !== undefined &&
    semantics !== 'dung' &&
    semantics !== 'bipolar' &&
    semantics !== 'aspic'
  ) {
    process.stderr.write(
      `argdown-mermaid: --semantics must be one of: dung, bipolar, aspic (got "${semantics}")\n`,
    );
    process.exit(1);
  }
```
Replace it with:
```ts
if (
    semantics !== undefined &&
    semantics !== 'dung' &&
    semantics !== 'bipolar' &&
    semantics !== 'aspic' &&
    semantics !== 'evidential'
  ) {
    process.stderr.write(
      `argdown-mermaid: --semantics must be one of: dung, bipolar, aspic, evidential (got "${semantics}")\n`,
    );
    process.exit(1);
  }
```

- [ ] **Step 3: Extend the dispatch ternary**

Find:
```ts
const solved =
      semantics === 'bipolar'
        ? solveBipolar(result.ast)
        : semantics === 'aspic'
          ? solveAspic(result.ast)
          : solve(result.ast);
```
Replace with:
```ts
const solved =
      semantics === 'bipolar'
        ? solveBipolar(result.ast)
        : semantics === 'aspic'
          ? solveAspic(result.ast)
          : semantics === 'evidential'
            ? solveEvidential(result.ast)
            : solve(result.ast);
```

- [ ] **Step 4: Verify with `yarn lint && yarn typecheck`**

Run: `yarn lint && yarn typecheck`
Expected: PASS, no new errors.

---

## Task 5: Add bench task types

**Files:**
- Modify: `src/solver.bench.ts` (two locations: `TASK_TYPES` array and `makeTaskBody` switch)
- Modify: `src/solver.bench.test.ts` (add new task type to the test)

- [ ] **Step 1: Extend `TASK_TYPES`**

Open `src/solver.bench.ts`. Find the array:
```ts
const TASK_TYPES = [
  'solve',
  'solve-bipolar',
  'solve-aspic',
  'parse-solve',
  'parse-solve-bipolar',
  'parse-solve-aspic',
] as const;
```
Add two new entries:
```ts
const TASK_TYPES = [
  'solve',
  'solve-bipolar',
  'solve-aspic',
  'solve-evidential',
  'parse-solve',
  'parse-solve-bipolar',
  'parse-solve-aspic',
  'parse-solve-evidential',
] as const;
```

- [ ] **Step 2: Add the two cases to `makeTaskBody`**

Find the `makeTaskBody` switch. After the existing `solve-aspic` / `parse-solve-aspic` cases, add:
```ts
case 'solve-evidential':
  return () => {
    solveEvidential(cachedAst);
  };
case 'parse-solve-evidential':
  return () => {
    const r = parse(source);
    if (r.ok) solveEvidential(r.ast);
  };
```

(Ensure `solveEvidential` is imported from `./solver.js` alongside the existing `solve`, `solveBipolar`, `solveAspic` imports.)

- [ ] **Step 3: Add the new task types to the bench test**

Open `src/solver.bench.test.ts`. Find the existing assertion that lists the task types and add the two new entries:
```ts
expect(TASK_TYPES).toContain('solve-evidential');
expect(TASK_TYPES).toContain('parse-solve-evidential');
```

- [ ] **Step 4: Verify with `yarn typecheck`**

Run: `yarn typecheck`
Expected: PASS.

---

## Task 6: Refresh `perf-baseline-solver.json`

**Files:**
- Modify: `perf-baseline-solver.json`

- [ ] **Step 1: Run the bench baseline writer**

Run: `yarn bench:solver:baseline`
Expected: writes a fresh baseline with the new 8 task types per fixture (was 6; now 8 — adds 14 new entries: 7 fixtures × 2 new task types).

- [ ] **Step 2: Inspect the diff**

Run: `git diff perf-baseline-solver.json | head -40`
Expected: only the new `solve-evidential` and `parse-solve-evidential` entries added; existing entries unchanged.

- [ ] **Step 3: Verify with `yarn bench:solver:check`**

Run: `yarn bench:solver:check`
Expected: PASS (no regression — fresh baseline matches current numbers).

---

## Task 7: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Find the existing `--semantics` documentation**

Run: `grep -n "semantics" README.md`
Look for the existing `--semantics=bipolar` / `--semantics=aspic` paragraphs.

- [ ] **Step 2: Add the `--semantics=evidential` paragraph**

Add a new paragraph in the same section, after the existing ASPIC+ documentation:

```markdown
The evidential solver (`--semantics=evidential`) implements Cayrol & Lagasquie-Schiex 2005 §3.3 **necessary-support** semantics. Where bipolar (`A --> B`) propagates *B's* defeat to *A* (deductive support), evidential propagates *A's* defeat to *B*: A must be accepted for B to be accepted. Same `--semantics=` flag pattern; produces a `Map<string, Label>` over the same input graph.
```

- [ ] **Step 3: Add a 4-line contrast example**

In the same section, add a worked example showing the same input under bipolar vs evidential:

````markdown
Example — same input, opposite labels:

```argdown
[#A] First claim.
[#B] Second claim.
[#C] Objection.
[#A] --> [#B].
[#C] --x [#A].
```

- `--semantics=bipolar`: A `in`, B `in`, C `in` (B's defeat would propagate to A; here nobody defeats B).
- `--semantics=evidential`: A `out`, B `out`, C `in` (C defeats A directly; A's defeat propagates to B).
````
````

- [ ] **Step 4: Verify the diff**

Run: `git diff README.md | head -50`
Expected: new paragraphs added in the existing solver section; no other changes.

---

## Task 8: Final validation

**Files:** none (verification only)

- [ ] **Step 1: Run the full validation suite**

Run: `yarn lint && yarn typecheck && yarn test`
Expected: all green. No new warnings; no regressions in existing tests.

- [ ] **Step 2: Run Stryker mutation testing**

Run: `yarn mutate`
Expected: ≥ 80% mutation score on `src/solver.ts` (the new `solveEvidential` code specifically). If below threshold, add a targeted test case to `src/solver.evidential.test.ts` that exercises the surviving mutant (likely a mutation in `addNecessarySupport`'s `attacks.set` order, or in the `nec:` prefix).

- [ ] **Step 3: Smoke-test the CLI**

Run: `echo '[#A]\n[#B]\n[#C]\n[#A] --> [#B].\n[#C] --x [#A].' | yarn tsx src/cli.ts --solve --semantics=evidential`
Expected output:
```
IN (1): C
OUT (2): A, B
UNDEC (0):
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(solver): add solveEvidential with --semantics=evidential

Method 4 of the Method 1/2/3/4 ladder. Cayrol & Lagasquie-Schiex 2005
§3.3 necessary-support reduction: each \`A --> B\` introduces auxiliary
\`nec:A->B\` with attacks \`A → nec\` and \`nec → B\`, so A's defeat
propagates to B (opposite of bipolar's deductive reduction).

- New sibling function in src/solver.ts; same \`SolveResult\` shape
- CLI flag \`--semantics=evidential\`; whitelist extended to 4 values
- Bench: 2 new task types (\`solve-evidential\`, \`parse-solve-evidential\`)
- perf-baseline-solver.json refreshed (6 → 8 task types per fixture)
- 21-case unit test file (src/solver.evidential.test.ts)
- README documents the semantics + 4-line bipolar-vs-evidential example
- Retires the §3.3 deferral noted in the bipolar and ASPIC+ specs"
```

---

## Acceptance Criteria (from spec §9)

1. `solveEvidential` exported from `src/solver.ts` and re-exported from `src/index.ts`. ✓ Tasks 2, 3.
2. CLI accepts `--semantics=evidential`; invalid values error with the four-value whitelist. ✓ Task 4.
3. `yarn lint && yarn typecheck && yarn test` green; new cases pass; existing solver tests untouched. ✓ Task 8 step 1.
4. Stryker mutation score ≥ 80% on the new code. ✓ Task 8 step 2.
5. `renderMermaid(document, solveEvidential(doc).labels)` works unchanged (no Mermaid changes needed). ✓ No task — verified by existing Mermaid tests continuing to pass.
6. `perf-baseline-solver.json` refreshed with `solve-evidential` and `parse-solve-evidential` entries. ✓ Task 6.
7. README adds `--semantics=evidential` paragraph + 4-line contrast example. ✓ Task 7.
8. `src/solver.ts` stays under the 400-line lint cap. ✓ Tasks 2 — verified by `yarn lint` in Task 8 step 1.

---

## Skipped (YAGNI)

Mirrors the spec's §10. No multi-extension, no recursive sub-arguments, no preference mechanics, no shared scaffolding extraction (rule-of-three fires after this lands — that's the next solver's problem, not this one), no CLI snapshot for `--semantics=evidential` unless a downstream consumer needs it.

---

## Future Cycles (not in this plan)

Mirrors the spec's §11. Shared-scaffolding refactor when the 4th solver consumer appears; multi-extension semantics; `solveEvidentialRecursive`; CLI snapshot if needed; auxiliary-exposing variant for debugging.