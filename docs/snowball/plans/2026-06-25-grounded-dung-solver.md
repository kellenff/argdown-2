# Grounded Dung Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-semantics argument solver to `argdown-2` that computes Dung's grounded extension on a pure-attack reduction, plus a CLI flag and Mermaid color rendering.

**Architecture:** New `src/solver.ts` module walks the AST, builds an attack graph (nodes = facts + argument conclusions, edges = `--x` relations), runs a Modgil/Caminada fixpoint, returns labels. Thin wrappers in `cli.ts` and `mermaid.ts` consume the result.

**Tech Stack:** TypeScript, vitest, Stryker (existing). Zero new runtime dependencies.

---

## File Structure

- `src/solver.ts` (new) — `solve()`, `SolveResult`, `Label` types, attack-graph construction, grounded-labeling fixpoint. Single file; split if it crosses 400 lines.
- `src/solver.test.ts` (new) — vitest unit tests over inline `.argdown` sources.
- `src/cli.ts` (modify) — add `--solve` flag; print summary to stdout, warnings to stderr.
- `src/cli.test.ts` (modify or create) — `--solve` snapshot test on a small fixture.
- `src/mermaid.ts` (modify) — add optional second `labels` argument to `renderMermaid`; append classDef blocks when provided.
- `src/mermaid.test.ts` (modify) — existing snapshots unchanged (byte-identical); add one new snapshot with labels.
- `src/index.ts` (modify) — re-export `solve`, `SolveResult`, `Label`.

---

## Task 1: Scaffold the solver module and test file

**Files:**
- Create: `src/solver.ts`
- Create: `src/solver.test.ts`

- [ ] **Step 1: Create `src/solver.ts` with the public types and skeleton**

```typescript
// src/solver.ts
// Dung grounded-extension solver. Pure-attack reduction: only `--x`
// becomes an attack edge; every other arrow kind is counted in `dropped`.
// Method 1 of the design; Methods 2 (bipolar) and 3 (ASPIC+) are
// future cycles.

import type { Document } from './ast.js';

export type Label = 'in' | 'out' | 'undec';

export type SolveResult = {
  labels: Map<string, Label>;
  dropped: {
    support: number;
    undercut: number;
    undermine: number;
    concession: number;
    qualification: number;
    equivalence: number;
  };
  warnings: string[];
};

export function solve(_document: Document): SolveResult {
  void _document;
  return {
    labels: new Map(),
    dropped: {
      support: 0, undercut: 0, undermine: 0,
      concession: 0, qualification: 0, equivalence: 0,
    },
    warnings: [],
  };
}
```

- [ ] **Step 2: Create `src/solver.test.ts` with a smoke test**

```typescript
// src/solver.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solve } from './solver.js';

describe('solve', () => {
  it('returns empty labels for an empty document', () => {
    const result = parse('');
    expect(result.ok).toBe(true);
    const solved = solve(result.ast!);
    expect(solved.labels.size).toBe(0);
    expect(solved.warnings).toEqual([]);
    expect(solved.dropped.support).toBe(0);
  });

  it('exports the public types', () => {
    const solved = solve({
      kind: 'Document',
      elements: [],
      loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
    });
    expect(solved.labels instanceof Map).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `yarn test src/solver.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Lint and typecheck**

Run:
```bash
yarn lint src/solver.ts src/solver.test.ts
yarn typecheck
```
Expected: no errors. The `_document` parameter and `void _document;` silence the unused-param lint and stay until Task 2 wires real logic.

- [ ] **Step 5: Commit**

```bash
git add src/solver.ts src/solver.test.ts
git commit -m "feat(solver): scaffold solver module with public API"
```

---

## Task 2: Implement fact-statement node keying

**Files:**
- Modify: `src/solver.ts:1-44`
- Modify: `src/solver.test.ts`

- [ ] **Step 1: Add failing tests for fact keying**

Append to `src/solver.test.ts`:

```typescript
  describe('node keying (facts)', () => {
    it('keys IdentifierHead facts by the bare identifier', () => {
      const src = '[#co2].\n[#impacts].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.labels.has('co2')).toBe(true);
      expect(solved.labels.has('impacts')).toBe(true);
      // Unattacked facts are IN (Task 6 will assert the value; this task only asserts presence).
    });

    it('keys TitleHead facts with the title: prefix', () => {
      const src = '[A Bracketed Title].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.labels.has('title:A Bracketed Title')).toBe(true);
    });

    it('emits a warning on duplicate IdentifierHead ids and overwrites', () => {
      const src = '[#co2] first.\n[#co2] second.';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.warnings.some(w => w.includes('duplicate fact id: co2'))).toBe(true);
      expect(solved.labels.has('co2')).toBe(true);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/solver.test.ts`
Expected: 3 new tests FAIL — `solve` returns empty labels because no keying is wired yet.

- [ ] **Step 3: Implement fact keying in `solve()`**

Replace `src/solver.ts` with:

```typescript
// src/solver.ts
// Dung grounded-extension solver. Pure-attack reduction: only `--x`
// becomes an attack edge; every other arrow kind is counted in `dropped`.
// Method 1 of the design; Methods 2 (bipolar) and 3 (ASPIC+) are future cycles.

import type { Document, FactStatement } from './ast.js';

export type Label = 'in' | 'out' | 'undec';

export type SolveResult = {
  labels: Map<string, Label>;
  dropped: {
    support: number;
    undercut: number;
    undermine: number;
    concession: number;
    qualification: number;
    equivalence: number;
  };
  warnings: string[];
};

function factKey(stmt: FactStatement): string {
  const head = stmt.fact.ref.head;
  if (head.kind === 'IdentifierHead') return head.identifier;
  return 'title:' + head.text;
}

export function solve(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];

  for (const el of document.elements) {
    if (el.kind !== 'FactStatement') continue;
    const key = factKey(el);
    if (labels.has(key)) {
      warnings.push('duplicate fact id: ' + key);
    }
    labels.set(key, 'undec');
  }

  return {
    labels,
    dropped: {
      support: 0, undercut: 0, undermine: 0,
      concession: 0, qualification: 0, equivalence: 0,
    },
    warnings,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/solver.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Lint and typecheck**

Run:
```bash
yarn lint src/solver.ts
yarn typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/solver.ts src/solver.test.ts
git commit -m "feat(solver): key FactStatements by ref head"
```

---

## Task 3: Implement argument-statement node keying

**Files:**
- Modify: `src/solver.ts:1-58`
- Modify: `src/solver.test.ts`

- [ ] **Step 1: Add failing tests for argument keying**

Append to `src/solver.test.ts`:

```typescript
  describe('node keying (arguments)', () => {
    it('keys arguments by arg:L:C using loc.start', () => {
      const src = '([#a]) -> [#b].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      // First character of `([#a]) -> [#b].` is column 1 of line 1.
      expect(solved.labels.has('arg:1:1')).toBe(true);
    });

    it('keeps two arguments with the same conclusion as distinct nodes', () => {
      const src = '([#a]) -> [#b].\n([#c]) -> [#b].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      // Both arguments appear, with distinct keys.
      const argKeys = [...solved.labels.keys()].filter(k => k.startsWith('arg:'));
      expect(argKeys.length).toBe(2);
      expect(new Set(argKeys).size).toBe(2);
    });

    it('also keys the conclusions of arguments when those conclusions are atoms', () => {
      const src = '([#a]) -> [#b].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      // The argument's conclusion is the atom `b` — keyed separately from the arg node.
      expect(solved.labels.has('b')).toBe(true);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/solver.test.ts`
Expected: 3 new tests FAIL — arguments are not yet keyed.

- [ ] **Step 3: Extend `solve()` to key arguments**

Replace `src/solver.ts` with:

```typescript
// src/solver.ts
// Dung grounded-extension solver. Pure-attack reduction: only `--x`
// becomes an attack edge; every other arrow kind is counted in `dropped`.
// Method 1 of the design; Methods 2 (bipolar) and 3 (ASPIC+) are future cycles.

import type { Argument, Document, FactStatement } from './ast.js';

export type Label = 'in' | 'out' | 'undec';

export type SolveResult = {
  labels: Map<string, Label>;
  dropped: {
    support: number;
    undercut: number;
    undermine: number;
    concession: number;
    qualification: number;
    equivalence: number;
  };
  warnings: string[];
};

function factKey(stmt: FactStatement): string {
  const head = stmt.fact.ref.head;
  if (head.kind === 'IdentifierHead') return head.identifier;
  return 'title:' + head.text;
}

function argKey(arg: Argument): string {
  return `arg:${arg.loc.start.line}:${arg.loc.start.column}`;
}

export function solve(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];

  for (const el of document.elements) {
    if (el.kind === 'FactStatement') {
      const key = factKey(el);
      if (labels.has(key)) {
        warnings.push('duplicate fact id: ' + key);
      }
      labels.set(key, 'undec');
    } else if (el.kind === 'Argument') {
      const key = argKey(el);
      if (labels.has(key)) {
        warnings.push('duplicate argument location: ' + key);
      }
      labels.set(key, 'undec');
    }
  }

  return {
    labels,
    dropped: {
      support: 0, undercut: 0, undermine: 0,
      concession: 0, qualification: 0, equivalence: 0,
    },
    warnings,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/solver.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 5: Lint and typecheck**

Run:
```bash
yarn lint src/solver.ts
yarn typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/solver.ts src/solver.test.ts
git commit -m "feat(solver): key Argument nodes by location-stable arg:L:C"
```

---

## Task 4: Implement edge extraction and dropped-arrow counts

**Files:**
- Modify: `src/solver.ts:1-75`
- Modify: `src/solver.test.ts`

- [ ] **Step 1: Add failing tests for edge extraction**

Append to `src/solver.test.ts`:

```typescript
  describe('edge extraction', () => {
    it('drops support edges and counts them', () => {
      const src = '[#a].\n[#b].\n[#a] --> [#b].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.dropped.support).toBe(1);
    });

    it('counts each non-attack arrow kind separately', () => {
      const src = [
        '[#a].',
        '[#b].',
        '[#c].',
        '[#d].',
        '[#e].',
        '[#f].',
        '[#a] --> [#b].',
        '[#a] -.-  [#c].',
        '[#a] -.-> [#d].',
        '[#a] ~>   [#e].',
        '[#a] ?>   [#f].',
      ].join('\n');
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.dropped.support).toBe(1);
      expect(solved.dropped.undermine).toBe(1);
      expect(solved.dropped.undercut).toBe(1);
      expect(solved.dropped.concession).toBe(1);
      expect(solved.dropped.qualification).toBe(1);
    });

    it('attaches attack edges between fact nodes without dropping', () => {
      const src = '[#a].\n[#b].\n[#a] --x [#b].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.dropped.support).toBe(0);
      // Both nodes still keyed.
      expect(solved.labels.has('a')).toBe(true);
      expect(solved.labels.has('b')).toBe(true);
    });

    it('unfolds multi-endpoint attacks into one edge per pair', () => {
      const src = '[#a].\n[#b].\n[#c].\n[#a], [#b] --x [#c].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      // After labeling (Task 6), `a` and `b` are IN, `c` is OUT.
      // This task only asserts that no edge is dropped.
      expect(solved.dropped.support).toBe(0);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/solver.test.ts`
Expected: the 4 new tests FAIL — `dropped.support` is always 0 because edge extraction is not wired.

- [ ] **Step 3: Implement edge extraction in `solve()`**

Replace `src/solver.ts` with:

```typescript
// src/solver.ts
// Dung grounded-extension solver. Pure-attack reduction: only `--x`
// becomes an attack edge; every other arrow kind is counted in `dropped`.
// Method 1 of the design; Methods 2 (bipolar) and 3 (ASPIC+) are future cycles.

import type { Argument, Document, FactRef, FactStatement, RelationEndpoint, RelationStatement } from './ast.js';

export type Label = 'in' | 'out' | 'undec';

export type SolveResult = {
  labels: Map<string, Label>;
  dropped: {
    support: number;
    undercut: number;
    undermine: number;
    concession: number;
    qualification: number;
    equivalence: number;
  };
  warnings: string[];
};

function factKeyFromRef(ref: FactRef): string {
  const head = ref.head;
  if (head.kind === 'IdentifierHead') return head.identifier;
  return 'title:' + head.text;
}

function factKey(stmt: FactStatement): string {
  return factKeyFromRef(stmt.fact.ref);
}

function argKey(arg: Argument): string {
  return `arg:${arg.loc.start.line}:${arg.loc.start.column}`;
}

function endpointKey(ep: RelationEndpoint, argLocations: Map<number, string>): string {
  if (ep.kind === 'FactRef') return factKeyFromRef(ep);
  return argLocations.get(ep as unknown as number) ?? argKey(ep as Argument);
}

export function solve(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];
  const dropped = {
    support: 0, undercut: 0, undermine: 0,
    concession: 0, qualification: 0, equivalence: 0,
  };

  // Pass 1: key addressable nodes and remember each Argument's location→key mapping
  // so RelationEndpoints of kind 'Argument' resolve correctly. (Endpoints of kind
  // 'Argument' appear at parse time as nested Argument nodes; we use a simple
  // structural-equal match against elements to recover their arg:L:C key.)
  const argByNode = new Map<Argument, string>();
  for (const el of document.elements) {
    if (el.kind === 'FactStatement') {
      const key = factKey(el);
      if (labels.has(key)) warnings.push('duplicate fact id: ' + key);
      labels.set(key, 'undec');
    } else if (el.kind === 'Argument') {
      const key = argKey(el);
      if (labels.has(key)) warnings.push('duplicate argument location: ' + key);
      labels.set(key, 'undec');
      argByNode.set(el, key);
    }
  }

  // Pass 2: walk relations, count drops, and (Tasks 5+) attach attacks.
  for (const el of document.elements) {
    if (el.kind !== 'RelationStatement') continue;
    const rs = el as RelationStatement;
    for (const rel of rs.relations) {
      switch (rel.arrow) {
        case 'attack': break; // wired in Task 5
        case 'support': dropped.support++; break;
        case 'undercut': dropped.undercut++; break;
        case 'undermine': dropped.undermine++; break;
        case 'concession': dropped.concession++; break;
        case 'qualification': dropped.qualification++; break;
        case 'equivalence': dropped.equivalence++; break;
      }
    }
  }

  return { labels, dropped, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/solver.test.ts`
Expected: all 12 tests PASS. (The `endpointKey` and `argByNode` helpers are referenced but unused until Task 5; remove or silence the warning in Task 5.)

- [ ] **Step 5: Lint and typecheck**

Run:
```bash
yarn lint src/solver.ts
yarn typecheck
```
Expected: no errors. The `noUnusedLocals`/`noUnusedParameters` defaults in tsconfig should be lenient; if lint complains about `endpointKey`, suppress with `// @ts-expect-error — wired in Task 5` or simply leave — TS doesn't error on unused locals by default in this repo. Verify and continue.

- [ ] **Step 6: Commit**

```bash
git add src/solver.ts src/solver.test.ts
git commit -m "feat(solver): extract edges, count dropped non-attack arrows"
```

---

## Task 5: Build the attack map and emit dangling-edge warnings

**Files:**
- Modify: `src/solver.ts:1-100`
- Modify: `src/solver.test.ts`

- [ ] **Step 1: Add failing tests for attack attachment and dangling warnings**

Append to `src/solver.test.ts`:

```typescript
  describe('attack attachment', () => {
    it('labels the attacker IN and the target OUT for a single fact→fact attack', () => {
      const src = '[#a].\n[#b].\n[#a] --x [#b].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.labels.get('a')).toBe('out'); // attacked by nothing — IN? see Task 6.
      // Task 6 will fix the unattacked case; here we only assert that `b` is OUT.
      expect(solved.labels.get('b')).toBe('out');
    });

    it('attaches attacks from fact to argument node', () => {
      const src = '[#a].\n([#b]) -> [#c].\n[#a] --x ([#b]) -> [#c].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      // The argument node (arg:1:1) is targeted by `a`. After Task 6,
      // unattacked `a` is IN, so the argument becomes OUT.
      expect(solved.labels.get('arg:1:1')).toBe('out');
    });

    it('emits a dangling-attack warning when the target is not a known node', () => {
      // Construct a relation whose target does not exist as a FactStatement
      // and is not an Argument in the document. We hand-build the AST for this
      // case to avoid parser ergonomics — parse() would have to accept a
      // dangling ref, which it doesn't.
      const doc = {
        kind: 'Document' as const,
        elements: [
          {
            kind: 'FactStatement' as const,
            fact: {
              kind: 'Fact' as const,
              ref: { kind: 'FactRef' as const, head: { kind: 'IdentifierHead' as const, identifier: 'a' }, loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 5, offset: 4 } } },
              claimText: null,
              attributes: { entries: [] },
              loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 5, offset: 4 } },
            },
            loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 5, offset: 4 } },
          },
          {
            kind: 'RelationStatement' as const,
            relations: [{
              kind: 'Relation' as const,
              from: { kind: 'FactRef' as const, head: { kind: 'IdentifierHead' as const, identifier: 'a' }, loc: { start: { line: 2, column: 1, offset: 6 }, end: { line: 2, column: 5, offset: 10 } } },
              arrow: 'attack' as const,
              to: { kind: 'FactRef' as const, head: { kind: 'IdentifierHead' as const, identifier: 'ghost' }, loc: { start: { line: 2, column: 10, offset: 15 }, end: { line: 2, column: 18, offset: 23 } } },
              attributes: undefined,
              loc: { start: { line: 2, column: 1, offset: 6 }, end: { line: 2, column: 18, offset: 23 } },
            }],
            loc: { start: { line: 2, column: 1, offset: 6 }, end: { line: 2, column: 18, offset: 23 } },
          },
        ],
        loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 2, column: 18, offset: 23 } },
      };
      const solved = solve(doc);
      expect(solved.warnings.some(w => w.includes('dangling attack edge'))).toBe(true);
      expect(solved.labels.has('ghost')).toBe(false);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/solver.test.ts`
Expected: the 3 new tests FAIL — attacks are not yet attached; dangling detection is not yet wired.

- [ ] **Step 3: Wire attack attachment and dangling detection in `solve()`**

Replace `src/solver.ts` with:

```typescript
// src/solver.ts
// Dung grounded-extension solver. Pure-attack reduction: only `--x`
// becomes an attack edge; every other arrow kind is counted in `dropped`.
// Method 1 of the design; Methods 2 (bipolar) and 3 (ASPIC+) are future cycles.

import type {
  Argument, Document, FactRef, FactStatement, RelationEndpoint, RelationStatement,
} from './ast.js';

export type Label = 'in' | 'out' | 'undec';

export type SolveResult = {
  labels: Map<string, Label>;
  dropped: {
    support: number;
    undercut: number;
    undermine: number;
    concession: number;
    qualification: number;
    equivalence: number;
  };
  warnings: string[];
};

function factKeyFromRef(ref: FactRef): string {
  const head = ref.head;
  if (head.kind === 'IdentifierHead') return head.identifier;
  return 'title:' + head.text;
}

function factKey(stmt: FactStatement): string {
  return factKeyFromRef(stmt.fact.ref);
}

function argKey(arg: Argument): string {
  return `arg:${arg.loc.start.line}:${arg.loc.start.column}`;
}

function endpointKey(ep: RelationEndpoint, argByNode: Map<Argument, string>): string {
  if (ep.kind === 'FactRef') return factKeyFromRef(ep);
  const known = argByNode.get(ep);
  if (known !== undefined) return known;
  // Fallback: synthesize a key from the endpoint's own loc (defensive — only
  // hits for endpoint Arguments not in the elements array, which the parser
  // should never produce).
  return argKey(ep as Argument);
}

export function solve(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];
  const dropped = {
    support: 0, undercut: 0, undermine: 0,
    concession: 0, qualification: 0, equivalence: 0,
  };

  // Pass 1: key addressable nodes and remember each Argument's identity.
  const argByNode = new Map<Argument, string>();
  for (const el of document.elements) {
    if (el.kind === 'FactStatement') {
      const key = factKey(el);
      if (labels.has(key)) warnings.push('duplicate fact id: ' + key);
      labels.set(key, 'undec');
    } else if (el.kind === 'Argument') {
      const key = argKey(el);
      if (labels.has(key)) warnings.push('duplicate argument location: ' + key);
      labels.set(key, 'undec');
      argByNode.set(el, key);
    }
  }

  // Pass 2: walk relations, count drops, attach attacks (labeling in Task 6).
  const attacks = new Map<string, string[]>();
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
            // Attacker not in the node set — still register it so the
            // labeling fixpoint can mark it IN (unattacked sources are IN).
            labels.set(fromKey, 'undec');
          }
          const list = attacks.get(toKey) ?? [];
          list.push(fromKey);
          attacks.set(toKey, list);
          break;
        }
        case 'support': dropped.support++; break;
        case 'undercut': dropped.undercut++; break;
        case 'undermine': dropped.undermine++; break;
        case 'concession': dropped.concession++; break;
        case 'qualification': dropped.qualification++; break;
        case 'equivalence': dropped.equivalence++; break;
      }
    }
  }

  // Tasks 6+ will replace this stub with the grounded fixpoint.
  void attacks;

  // Emit a single summary warning if any non-attack edges were dropped.
  const totalDropped =
    dropped.support + dropped.undercut + dropped.undermine +
    dropped.concession + dropped.qualification + dropped.equivalence;
  if (totalDropped > 0) {
    warnings.push(
      `Method 1 (grounded Dung) dropped ${totalDropped} non-attack edge(s): ` +
      `support=${dropped.support}, undercut=${dropped.undercut}, ` +
      `undermine=${dropped.undermine}, concession=${dropped.concession}, ` +
      `qualification=${dropped.qualification}, equivalence=${dropped.equivalence}`,
    );
  }

  return { labels, dropped, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/solver.test.ts`
Expected: all 15 tests PASS.

- [ ] **Step 5: Lint and typecheck**

Run:
```bash
yarn lint src/solver.ts
yarn typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/solver.ts src/solver.test.ts
git commit -m "feat(solver): attach attack edges and emit dangling-edge warnings"
```

---

## Task 6: Implement grounded labeling — unattacked and empty cases

**Files:**
- Modify: `src/solver.ts:1-130`
- Modify: `src/solver.test.ts`

- [ ] **Step 1: Add failing tests for the unattacked-IN initialization**

Append to `src/solver.test.ts`:

```typescript
  describe('grounded labeling — initialization', () => {
    it('labels every unattacked fact IN', () => {
      const src = '[#a].\n[#b].\n[#c].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.labels.get('a')).toBe('in');
      expect(solved.labels.get('b')).toBe('in');
      expect(solved.labels.get('c')).toBe('in');
    });

    it('labels unattacked argument nodes IN', () => {
      const src = '([#a]) -> [#b].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.labels.get('arg:1:1')).toBe('in');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/solver.test.ts`
Expected: 2 new tests FAIL — `solve` currently leaves everything `undec`.

- [ ] **Step 3: Replace `solve()` with the full grounded-labeling algorithm**

Replace `src/solver.ts` with:

```typescript
// src/solver.ts
// Dung grounded-extension solver. Pure-attack reduction: only `--x`
// becomes an attack edge; every other arrow kind is counted in `dropped`.
// Method 1 of the design; Methods 2 (bipolar) and 3 (ASPIC+) are future cycles.

import type {
  Argument, Document, FactRef, FactStatement, RelationEndpoint, RelationStatement,
} from './ast.js';

export type Label = 'in' | 'out' | 'undec';

export type SolveResult = {
  labels: Map<string, Label>;
  dropped: {
    support: number;
    undercut: number;
    undermine: number;
    concession: number;
    qualification: number;
    equivalence: number;
  };
  warnings: string[];
};

function factKeyFromRef(ref: FactRef): string {
  const head = ref.head;
  if (head.kind === 'IdentifierHead') return head.identifier;
  return 'title:' + head.text;
}

function factKey(stmt: FactStatement): string {
  return factKeyFromRef(stmt.fact.ref);
}

function argKey(arg: Argument): string {
  return `arg:${arg.loc.start.line}:${arg.loc.start.column}`;
}

function endpointKey(ep: RelationEndpoint, argByNode: Map<Argument, string>): string {
  if (ep.kind === 'FactRef') return factKeyFromRef(ep);
  const known = argByNode.get(ep);
  if (known !== undefined) return known;
  return argKey(ep as Argument);
}

function label(attacks: Map<string, string[]>): Map<string, Label> {
  const labels = new Map<string, Label>();

  // Initialize: every targeted node starts UNDEC. Untargeted nodes start IN.
  for (const [target, sources] of attacks) {
    labels.set(target, sources.length === 0 ? 'in' : 'undec');
  }
  // Sources that never appear as targets are unattacked → IN.
  const allSources = new Set<string>();
  for (const sources of attacks.values()) for (const s of sources) allSources.add(s);
  for (const s of allSources) if (!labels.has(s)) labels.set(s, 'in');

  // Fixpoint: promote UNDEC nodes to IN or OUT based on attacker labels.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [target, sources] of attacks) {
      if (labels.get(target) !== 'undec') continue;
      const allIn = sources.every(s => labels.get(s) === 'in');
      const someOut = sources.some(s => labels.get(s) === 'out');
      if (allIn) { labels.set(target, 'out'); changed = true; }
      else if (someOut) { labels.set(target, 'in'); changed = true; }
    }
  }
  return labels;
}

export function solve(document: Document): SolveResult {
  const labels = new Map<string, Label>();
  const warnings: string[] = [];
  const dropped = {
    support: 0, undercut: 0, undermine: 0,
    concession: 0, qualification: 0, equivalence: 0,
  };

  // Pass 1: key addressable nodes and remember each Argument's identity.
  const argByNode = new Map<Argument, string>();
  for (const el of document.elements) {
    if (el.kind === 'FactStatement') {
      const key = factKey(el);
      if (labels.has(key)) warnings.push('duplicate fact id: ' + key);
      labels.set(key, 'undec');
    } else if (el.kind === 'Argument') {
      const key = argKey(el);
      if (labels.has(key)) warnings.push('duplicate argument location: ' + key);
      labels.set(key, 'undec');
      argByNode.set(el, key);
    }
  }

  // Pass 2: walk relations, count drops, attach attacks.
  const attacks = new Map<string, string[]>();
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
        case 'support': dropped.support++; break;
        case 'undercut': dropped.undercut++; break;
        case 'undermine': dropped.undermine++; break;
        case 'concession': dropped.concession++; break;
        case 'qualification': dropped.qualification++; break;
        case 'equivalence': dropped.equivalence++; break;
      }
    }
  }

  const labeled = label(attacks);
  const finalLabels = new Map<string, Label>();
  for (const [k, v] of labeled) finalLabels.set(k, v);

  const totalDropped =
    dropped.support + dropped.undercut + dropped.undermine +
    dropped.concession + dropped.qualification + dropped.equivalence;
  if (totalDropped > 0) {
    warnings.push(
      `Method 1 (grounded Dung) dropped ${totalDropped} non-attack edge(s): ` +
      `support=${dropped.support}, undercut=${dropped.undercut}, ` +
      `undermine=${dropped.undermine}, concession=${dropped.concession}, ` +
      `qualification=${dropped.qualification}, equivalence=${dropped.equivalence}`,
    );
  }

  return { labels: finalLabels, dropped, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/solver.test.ts`
Expected: all 17 tests PASS.

- [ ] **Step 5: Lint and typecheck**

Run:
```bash
yarn lint src/solver.ts
yarn typecheck
```
Expected: no errors. The `label` function is now `void`-pure (no side effects) and is the canonical grounded fixpoint.

- [ ] **Step 6: Commit**

```bash
git add src/solver.ts src/solver.test.ts
git commit -m "feat(solver): implement grounded-labeling fixpoint"
```

---

## Task 7: Cover cycle and diamond cases for the labeling algorithm

**Files:**
- Modify: `src/solver.test.ts`

- [ ] **Step 1: Add tests for cycles and the diamond topology**

Append to `src/solver.test.ts`:

```typescript
  describe('grounded labeling — cycles and diamond', () => {
    it('labels self-attacks OUT', () => {
      const src = '[#a].\n[#a] --x [#a].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.labels.get('a')).toBe('out');
    });

    it('labels mutual attacks UNDEC', () => {
      const src = '[#a].\n[#b].\n[#a] --x [#b].\n[#b] --x [#a].';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.labels.get('a')).toBe('undec');
      expect(solved.labels.get('b')).toBe('undec');
    });

    it('labels three-cycle UNDEC', () => {
      const src = [
        '[#a].', '[#b].', '[#c].',
        '[#a] --x [#b].',
        '[#b] --x [#c].',
        '[#c] --x [#a].',
      ].join('\n');
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.labels.get('a')).toBe('undec');
      expect(solved.labels.get('b')).toBe('undec');
      expect(solved.labels.get('c')).toBe('undec');
    });

    it('labels the diamond topology correctly', () => {
      // a attacks b and c; d attacks b and c.
      // a is unattacked → IN. d is attacked by a → OUT.
      // b and c are attacked by a (IN) and d (OUT) → IN (some attacker OUT).
      const src = [
        '[#a].', '[#b].', '[#c].', '[#d].',
        '[#a] --x [#b].',
        '[#a] --x [#c].',
        '[#d] --x [#b].',
        '[#d] --x [#c].',
      ].join('\n');
      const result = parse(src);
      expect(result.ok).toBe(true);
      const solved = solve(result.ast!);
      expect(solved.labels.get('a')).toBe('in');
      expect(solved.labels.get('d')).toBe('out');
      expect(solved.labels.get('b')).toBe('in');
      expect(solved.labels.get('c')).toBe('in');
    });
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `yarn test src/solver.test.ts`
Expected: all 21 tests PASS. (The algorithm from Task 6 is correct on these inputs; this task adds coverage to lock the behavior.)

- [ ] **Step 3: Commit**

```bash
git add src/solver.test.ts
git commit -m "test(solver): cover self-attack, mutual, three-cycle, diamond"
```

---

## Task 8: Export `solve` from the public API

**Files:**
- Modify: `src/index.ts:1-43`

- [ ] **Step 1: Add the export**

In `src/index.ts`, append after the existing `stringify` block:

```typescript
export { solve } from './solver.js';
export type { SolveResult, Label } from './solver.js';
```

- [ ] **Step 2: Verify the typecheck sees the export**

Run:
```bash
yarn typecheck
```
Expected: no errors.

- [ ] **Step 3: Verify the public surface with a smoke test**

Append to `src/solver.test.ts`:

```typescript
import { solve as publicSolve, type SolveResult, type Label } from './index.js';

describe('public API', () => {
  it('re-exports solve from index.ts', () => {
    expect(publicSolve).toBe(solve);
  });

  it('exposes SolveResult and Label as types', () => {
    const label: Label = 'in';
    const result: SolveResult = { labels: new Map([['x', label]]), dropped: { support: 0, undercut: 0, undermine: 0, concession: 0, qualification: 0, equivalence: 0 }, warnings: [] };
    expect(result.labels.get('x')).toBe('in');
  });
});
```

- [ ] **Step 4: Run all tests**

Run: `yarn test`
Expected: PASS — including the new public-API smoke test.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/solver.test.ts
git commit -m "feat(solver): export solve, SolveResult, Label from public API"
```

---

## Task 9: Add `--solve` to the CLI

**Files:**
- Modify: `src/cli.ts:1-43`
- Create: `src/cli.test.ts`

- [ ] **Step 1: Read the existing CLI to understand its shape**

Run: `cat src/cli.ts`
Expected: a small file that parses argv, calls `parse()`, prints errors, optionally emits Mermaid. The exact structure informs how to splice in the new flag.

- [ ] **Step 2: Create `src/cli.test.ts` with a failing snapshot test**

```typescript
// src/cli.test.ts
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runCli(args: string[], stdin?: string): { stdout: string; stderr: string; status: number } {
  const result = require('node:child_process').spawnSync(
    process.execPath,
    [join(process.cwd(), 'dist', 'cli.js'), ...args],
    { input: stdin, encoding: 'utf8' },
  );
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

describe('CLI --solve', () => {
  it('prints IN/OUT/UNDEC summary and dropped counts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    writeFileSync(file, '[#a].\n[#b].\n[#a] --x [#b].\n');
    const out = runCli(['--solve', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('IN');
    expect(out.stdout).toContain('OUT');
    expect(out.stdout).toContain('Dropped:');
    expect(out.stdout).toContain('a');
    expect(out.stdout).toContain('b');
  });
});
```

- [ ] **Step 3: Build the package and run the CLI test to verify it fails**

Run:
```bash
yarn build
yarn test src/cli.test.ts
```
Expected: FAIL — `dist/cli.js` exists but does not recognize `--solve` (it would either error or print Mermaid).

- [ ] **Step 4: Add `--solve` to `src/cli.ts`**

Read `src/cli.ts` first. Then, add `--solve` handling. The patch depends on the existing structure; here is the canonical shape:

```typescript
// (patch within src/cli.ts — read the file first to splice correctly)
// After parsing argv, before invoking parse() / renderMermaid():

const solveMode = process.argv.includes('--solve');

// ...existing parse logic...

if (solveMode) {
  const solved = solve(ast!);
  const groups: Record<Label, string[]> = { in: [], out: [], undec: [] };
  for (const [k, v] of solved.labels) groups[v].push(k);
  for (const v of ['in', 'out', 'undec'] as const) groups[v].sort();

  const lines: string[] = [];
  for (const v of ['in', 'out', 'undec'] as const) {
    lines.push(`${v.toUpperCase()} (${groups[v].length}): ${groups[v].join(', ')}`);
  }
  const d = solved.dropped;
  lines.push(
    `Dropped:   ${d.support} support, ${d.undercut} undercut, ${d.undermine} undermine, ` +
    `${d.concession} concession, ${d.qualification} qualification, ${d.equivalence} equivalence`,
  );
  process.stdout.write(lines.join('\n') + '\n');
  for (const w of solved.warnings) {
    process.stderr.write(`warning: ${w}\n`);
  }
  process.exit(0);
}
```

Adjust imports to bring `solve`, `Label`, and `SolveResult` from `./solver.js` into `cli.ts`. The exact splice depends on the existing CLI shape — read the file before patching.

- [ ] **Step 5: Rebuild and run the CLI test**

Run:
```bash
yarn build
yarn test src/cli.test.ts
```
Expected: PASS.

- [ ] **Step 6: Lint and typecheck**

Run:
```bash
yarn lint src/cli.ts
yarn typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts src/cli.test.ts
git commit -m "feat(cli): add --solve flag for grounded-extension labels"
```

---

## Task 10: Add optional `labels` argument to `renderMermaid`

**Files:**
- Modify: `src/mermaid.ts:1-170`
- Modify: `src/mermaid.test.ts`

- [ ] **Step 1: Read the existing Mermaid renderer**

Run: `cat src/mermaid.ts`
Expected: a function `renderMermaid(document: Document): string`. The patch adds an optional second parameter.

- [ ] **Step 2: Add a failing test that the function still works without labels**

In `src/mermaid.test.ts`, add (the `parse` and `renderMermaid` imports are already present):

```typescript
import { solve } from './solver.js';

describe('renderMermaid with labels', () => {
  it('still produces output for documents without labels arg', () => {
    const result = parse('[#a].\n[#b].\n[#a] --> [#b].');
    expect(result.ok).toBe(true);
    const out = renderMermaid(result.ast!);
    expect(out).toContain('flowchart');
    expect(out).not.toContain('classDef');
  });
});
```

- [ ] **Step 3: Run the test to verify it passes against the current renderer**

Run: `yarn test src/mermaid.test.ts`
Expected: PASS (the renderer is unchanged at this point).

- [ ] **Step 4: Add a failing test for the labels-arg path**

Append to the same `describe` block:

```typescript
  it('appends classDef and class lines when labels are provided', () => {
    const src = '[#a].\n[#b].\n[#a] --x [#b].';
    const result = parse(src);
    expect(result.ok).toBe(true);
    const solved = solve(result.ast!);
    const out = renderMermaid(result.ast!, solved.labels);
    expect(out).toContain('classDef in');
    expect(out).toContain('classDef out');
    expect(out).toContain('classDef undec');
    expect(out).toMatch(/class\s+\S+\s+in/);
    expect(out).toMatch(/class\s+\S+\s+out/);
  });

  it('silently skips arg:L:C keys (argument labels are not rendered in v1)', () => {
    const src = '([#a]) -> [#b].\n[#c] --x ([#a]) -> [#b].';
    const result = parse(src);
    expect(result.ok).toBe(true);
    const solved = solve(result.ast!);
    const out = renderMermaid(result.ast!, solved.labels);
    expect(out).not.toContain('arg_');
  });
```

- [ ] **Step 5: Run tests to verify the new test fails**

Run: `yarn test src/mermaid.test.ts`
Expected: 1 new test FAIL — `renderMermaid` does not accept a second argument yet (or accepts but ignores it).

- [ ] **Step 6: Patch `renderMermaid` to accept and emit labels**

In `src/mermaid.ts`:

1. Add `Label` import from `./solver.js`.
2. Change the signature:

```typescript
export function renderMermaid(
  document: Document,
  labels?: Map<string, Label>,
): string {
```

3. Before patching `renderMermaid`, also align the internal `headKey` function so its keys match the solver's fact keys. Change `src/mermaid.ts`:

```typescript
function headKey(head: FactHead): string {
  return head.kind === 'IdentifierHead' ? head.identifier : `title:${head.title}`;
}
```

(The existing `id:` prefix on IdentifierHead collides with the solver's bare-identifier keys. Internal-only — emitted Mermaid ids are unchanged, so existing snapshots remain byte-identical.)

4. After the existing diagram body is built (just before the final `return` at the end of `renderMermaid`), append when `labels` is non-empty:

```typescript
  if (labels && labels.size > 0) {
    const groups: Record<Label, string[]> = { in: [], out: [], undec: [] };
    for (const [k, v] of labels) {
      // Skip argument keys for v1 — the existing renderer does not declare
      // per-argument nodes. Keys are silently dropped per spec §8.
      if (k.startsWith('arg:')) continue;
      // Skip keys that don't match a rendered node id (defensive).
      if (!headToId.has(k)) continue;
      groups[v].push(headToId.get(k)!);
    }
    for (const v of ['in', 'out', 'undec'] as const) groups[v].sort();
    nodes.push('classDef in    fill:#d4f4dd,stroke:#1a7f37,color:#1a7f37');
    nodes.push('classDef out   fill:#ffe0e0,stroke:#cf222e,color:#cf222e');
    nodes.push('classDef undec fill:#f0f0f0,stroke:#999,color:#666');
    for (const v of ['in', 'out', 'undec'] as const) {
      if (groups[v].length > 0) {
        nodes.push(`class ${groups[v].join(',')} ${v}`);
      }
    }
  }
```

The splice point: the final `return` is `return ['flowchart TD', ...nodes, ...edges, ''].join('\n');`. The classDef lines are appended to `nodes` so they're emitted between the regular node declarations and the edges in the final joined output.

5. Verify `headToId.has(k)` will now correctly resolve solver keys for IdentifierHead facts. TitleHead facts use the `title:` prefix on both sides, so they match too.

- [ ] **Step 7: Run all Mermaid tests**

Run: `yarn test src/mermaid.test.ts`
Expected: PASS, including all existing snapshots (which exercise the no-`labels` path) and the new labels path.

- [ ] **Step 8: Lint and typecheck**

Run:
```bash
yarn lint src/mermaid.ts
yarn typecheck
```
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/mermaid.ts src/mermaid.test.ts
git commit -m "feat(mermaid): accept optional labels map and emit classDef blocks"
```

---

## Task 11: Verify Mermaid backward compatibility with byte-identical snapshots

**Files:**
- Modify: `src/__snapshots__/mermaid.test.ts.snap` (only if regeneration is needed)

- [ ] **Step 1: Run the Mermaid test suite**

Run: `yarn test src/mermaid.test.ts`
Expected: PASS with no snapshot changes. If snapshots differ, the no-`labels` path was broken — revert the change in Task 10 and re-investigate. If snapshots pass unchanged, the function is byte-identical for existing callers.

- [ ] **Step 2: Add a labeled-output snapshot for documentation**

Add a `it('renders classDef-augmented diagram with labels', ...)` test that calls `renderMermaid(parse(src).ast!, solve(parse(src).ast!).labels)` and snapshots the output. Update the snapshot file with `yarn test -u src/mermaid.test.ts`.

- [ ] **Step 3: Commit the new snapshot**

```bash
git add src/mermaid.test.ts src/__snapshots__/mermaid.test.ts.snap
git commit -m "test(mermaid): add labeled-output snapshot"
```

---

## Task 12: Run Stryker mutation testing on the solver

**Files:**
- Modify: `stryker.config.mjs` (only if the solver needs to be in the mutation targets)

- [ ] **Step 1: Check the Stryker config**

Run: `cat stryker.config.mjs`
Expected: a config that targets `src/**/*.ts` (or similar). Confirm `src/solver.ts` is included; if the config uses an explicit allow-list, add it.

- [ ] **Step 2: Run Stryker**

Run: `yarn mutate`
Expected: completes with mutation score ≥ 80% on `src/solver.ts`. If below 80%, inspect the surviving mutants and add tests or simplify code to kill them. Common survivors to watch for:
- Wrong initial label (`undec` vs `in`) on unattacked nodes.
- Swapped `in` / `out` in the fixpoint.
- Off-by-one in the `totalDropped` summary.
- Wrong endpoint-key resolution (fact vs argument).

- [ ] **Step 3: Commit any new tests that kill mutants**

```bash
git add src/solver.test.ts
git commit -m "test(solver): kill surviving mutants to reach 80% threshold"
```

---

## Task 13: Final acceptance

**Files:**
- (no file changes — verification task)

- [ ] **Step 1: Run the full test suite**

Run: `yarn test`
Expected: all tests green — parser tests, mermaid tests (including new labeled snapshot), solver tests, CLI tests, fuzz tests.

- [ ] **Step 2: Run lint**

Run: `yarn lint`
Expected: no errors.

- [ ] **Step 3: Run typecheck**

Run: `yarn typecheck`
Expected: no errors.

- [ ] **Step 4: Run format check**

Run: `yarn format:check`
Expected: no diff. If there is, run `yarn format` and re-commit.

- [ ] **Step 5: Run build**

Run: `yarn build`
Expected: succeeds.

- [ ] **Step 6: Run Stryker one final time**

Run: `yarn mutate`
Expected: ≥ 80% mutation score on `src/solver.ts` and `src/mermaid.ts` (the changed files).

- [ ] **Step 7: Confirm `solver.ts` is under the 400-line lint cap**

Run: `wc -l src/solver.ts`
Expected: under 400 lines. If over, split by responsibility (`solver-graph.ts`, `solver-label.ts`, `solver.ts`) per the spec's "if it outgrows one file" clause.

- [ ] **Step 8: Commit any fixes**

```bash
git status
# If anything modified:
git add -u
git commit -m "chore(solver): fix lint/format/typecheck issues"
```

- [ ] **Step 9: Final verification**

Run:
```bash
yarn test && yarn lint && yarn typecheck && yarn format:check && yarn build
```
Expected: all green, all quiet.

Acceptance criteria (per spec Section 10) are met when:

1. `src/solver.ts` exists, under 400 lines, passes lint/format/typecheck ✓
2. `solve()`, `SolveResult`, and `Label` are exported from `src/index.ts` ✓
3. `--solve` flag works on `argdown-mermaid` and prints the documented summary format ✓
4. `renderMermaid(document, labels)` produces byte-identical output when `labels` is undefined ✓
5. `renderMermaid(document, labels)` produces a classDef-augmented diagram when `labels` is provided ✓
6. `yarn test` is green, including the new solver unit tests and CLI snapshot ✓
7. Stryker mutation score is ≥ 80% on the new code ✓
8. All existing snapshots in `src/__snapshots__/` remain committed and unchanged ✓
