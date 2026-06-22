# Argdown-2 — Fuzz Test Suite Design

**Date:** 2026-06-22
**Status:** Approved (pending user review of written spec)
**Scope:** Add a Vitest-based fuzz test suite that mutates the existing fixtures and asserts core invariants on every mutated input.

---

## 1. Context and goals

The parser shipped with v1 correctness coverage via Vitest snapshots and a performance baseline via Tinybench. What's missing is a **robustness layer**: random-ish inputs that exercise grammar edge cases, recovery paths, and AST-builder branches the hand-written test cases don't reach.

**Goals:**
- A repeatable, automated fuzz test that runs as part of `yarn test`
- Mutations derived from the existing 7 fixtures (maximizes valid-ish input; no synthetic generator)
- Four invariants checked on every mutation:
  1. Parse never throws
  2. `ok` is consistent with `errors` and `ast.elements`
  3. Every AST node has a valid `kind` and a valid `loc`
  4. Sub-parsing each element's source slice doesn't throw and doesn't disagree on syntactic validity
- Determinism via per-test seeds so failures reproduce
- Co-located with the parser, consistent with v1 layout

**Non-goals (deferred):**
- Property-based testing framework (fast-check). Hand-rolled mutator is enough.
- Corpus persistence / minimization across runs. Reproducibility comes from the seed.
- Mutation of AST round-trips (no serializer yet).
- Snapshot comparison. Invariants are property-based, not output-based.
- Coverage-guided fuzzing (libFuzzer / afl). Vitest + JS is enough for v1.
- Performance fuzzing. That's a separate concern (see `2026-06-22-performance-tests-design.md`).

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Fuzz style | Structure-aware mutator (chosen by user) |
| Mutation source | The 7 existing hand-crafted fixtures |
| Mutator | Hand-rolled, no new dep |
| Test runner | Vitest (existing) |
| Seed | Per-test, fixed at module load (deterministic) |
| Iteration count | 200/fixture default; `FUZZ_ITER` env override for stress |
| Invariants | No-throw, result-shape consistency, AST shape sanity, idempotence |
| Failure output | Seed + mutation index + mutated source (truncated 4 KB) + offending AST |
| File layout | Co-located under `src/`, mutator exported as a library |

---

## 3. Architecture and module structure

**Two new files, no changes to existing files, no new dependencies:**

```
argdown-2/
  src/
    parser.ts                       # existing
    parser.mutate.ts                # NEW: pure mutator, exported
    parser.fuzz.test.ts             # NEW: Vitest suite
    parser.fixtures/                # existing 7 fixtures, reused
```

**Dependency direction (one-way, no cycles):**

```
parser.fuzz.test.ts  ──▶  parser.mutate.ts  ──▶  (nothing — pure functions over strings)
              │
              └──▶  parser.ts  ──▶  tokens.ts
              └──▶  ast.ts (for kind-set constants)
```

The mutator is **pure**: takes a string + seed, returns a string. No I/O, no parser dependency. This keeps it cheap to test in isolation and reusable from a future bench-fuzz mode.

---

## 4. The mutator (`src/parser.mutate.ts`)

### 4.1 Core function

```ts
const OPS: Array<[number, Op]> = [
  [30, insertLine],
  [15, deleteLine],
  [10, swapLines],
  [10, duplicateRange],
  [15, spliceGarbage],
  [20, replaceLine],
];

export function mutate(source: string, rng: () => number): string {
  const total = OPS.reduce((s, [w]) => s + w, 0);
  let pick = rng() * total;
  for (const [w, op] of OPS) {
    pick -= w;
    if (pick <= 0) return op(source, rng);
  }
  return OPS[OPS.length - 1][1](source, rng);
}
```

Weighted choice via cumulative distribution — `ops[i]` is picked with probability `weights[i] / total`. Weights live in the `OPS` table so they can be tuned without touching logic.

One mutation per call. The test loop calls `mutate` `N` times in sequence — each call sees the result of the previous — which produces a much wider distribution than calling a different random op on the original each time.

### 4.2 Operations

Each op takes `(source, rng)` and returns a new string. All ops are line-aware (split on `\n`, mutate, rejoin) so they preserve column structure for `loc` invariants.

| Op | Description | Weight |
|---|---|---|
| `insertLine` | Inject a random plausible line (heading, fact, rule, relation, comment, blank, or garbage) at a random offset | 30% |
| `deleteLine` | Remove a random line | 15% |
| `swapLines` | Swap two adjacent lines | 10% |
| `duplicateRange` | Repeat a contiguous line range | 10% |
| `spliceGarbage` | Insert 1–16 random ASCII bytes mid-line at a random column | 15% |
| `replaceLine` | Overwrite a random line with another random line | 20% |

### 4.3 Random line generator

A small helper generates "plausible" random lines from a fixed pool:

```
[
  '',                                          // blank
  '# Heading',                                 // heading
  '## Subheading',
  '<Some Claim>',                              // fact
  'Some claim text.',                          // bare claim sentence
  '[Some Reason]: Some text.',                 // rule
  '[A]: w. [B]: x.',                           // rule with two premises
  '<A> -> <B>',                                // relation
  '<A> -- <B>',                                // undercut
  '<A> +- <B>',                                // contrary
  '<A> ++ <B>',                                // support
  '::: evidence',                              // block opener
  '::: position',
  '  - bullet',                                // block body
  '  * star bullet',
  '  key: value',                              // yaml line
  '// comment',                                // line comment
]
```

Each generation picks one template and substitutes `<X>` / `[X]` placeholders with a small pool of identifiers (`A`, `B`, `C`, `Some Claim`, `My Fact`).

### 4.4 Random byte generator

`randomBytes(rng, n)` returns a string of `n` ASCII characters from the pool `a-zA-Z0-9 \t-+*/[]{}<>=#@!?,.;:'"`. Tuned to stay within the lexer's "interesting" character set without producing control bytes that confuse position tracking.

### 4.5 RNG

A tiny seeded RNG so test runs are reproducible:

```ts
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

This is a 32-bit mulberry-style LCG. Quality matters only for test reproducibility, not for cryptographic use.

### 4.6 Idempotence guard

To prevent infinite loops when `deleteLine` is called on a 1-line source, every op checks its precondition and returns the source unchanged if it can't apply. The `replaceLine` and `spliceGarbage` ops can always apply (even to a single-line source).

---

## 5. The fuzz test (`src/parser.fuzz.test.ts`)

### 5.1 Test structure

```ts
describe('parse() fuzz', () => {
  for (const [name, source] of FIXTURES) {
    it(`${name} survives 200 mutations with no invariant violation`, () => {
      const rng = makeRng(seedFromName(name));
      let current = source;
      for (let i = 0; i < ITERATIONS; i++) {
        current = mutate(current, rng);
        checkInvariants(current, { fixture: name, iter: i, seed: seedFromName(name) });
      }
    });
  }
});
```

Each fixture gets its own seed (deterministic, derived from the name), so a regression in one fixture's grammar is isolated from the others.

### 5.2 Iteration count

```ts
const ITERATIONS = Number(process.env.FUZZ_ITER ?? 200);
```

- Default: 200 mutations × 7 fixtures = 1 400 parse calls
- Stress: `FUZZ_ITER=5000 yarn test` for nightly

### 5.3 Invariant checks

A single helper `checkInvariants(source, ctx)` runs all four checks and throws a descriptive `FuzzFailure` on the first violation.

**Invariant 1 — No throw:**

```ts
let result: ParseResult;
try {
  result = parse(source);
} catch (e) {
  throw new FuzzFailure(`parse() threw`, { ...ctx, source, error: e });
}
```

**Invariant 2 — Result-shape consistency:**

Codifies the decision tree in `parse()` (`parser.ts:1240-1255`):
- `ok === true` ⇒ no errors AND `ast` defined (regardless of `elements.length` — empty source parses to ok=true with no elements)
- `ok === false` ⇒ at least one of: `errors.length > 0`, `ast` undefined

```ts
const hasErrors = result.errors.length > 0;
const hasAst = result.ast !== undefined;

if (result.ok && (hasErrors || !hasAst)) {
  throw new FuzzFailure(`ok=true but ${hasErrors ? 'has errors' : 'no ast'}`, ...);
}
if (!result.ok && !hasErrors && hasAst) {
  throw new FuzzFailure(`ok=false but no errors and ast present`, ...);
}
```

If a future refactor of `parse()` breaks the decision tree, the fuzz test catches it on the next run.

**Invariant 3 — AST shape sanity:**

```ts
if (result.ast) {
  walkAst(result.ast, (node) => {
    if (!VALID_KINDS.has(node.kind)) {
      throw new FuzzFailure(`unknown kind ${node.kind}`, ...);
    }
    if (!isValidLoc(node.loc, source)) {
      throw new FuzzFailure(`invalid loc on ${node.kind}`, ...);
    }
    if ('level' in node && (node.level < 1 || node.level > 6)) {
      throw new FuzzFailure(`invalid heading level ${node.level}`, ...);
    }
    // ... similar narrow checks for Block.type, etc.
  });
}
```

`VALID_KINDS` is a frozen `Set<string>` derived from `ast.ts`'s discriminated union — populated at module load from a hand-written list, since reading the AST types at runtime isn't possible. The list lives in the fuzz file with a comment pointing at `ast.ts` so it stays in sync.

`isValidLoc` checks `loc.start.offset >= 0` (integer) and `loc.end.offset >= loc.start.offset` (integer). The spec deliberately does not bound offsets by `source.length` — loc may have offsets past source length in error-recovery cases, and `isValidLoc` has no access to the source string.

**Invariant 4 — Idempotence (sub-parse):**

```ts
if (result.ast) {
  for (const el of result.ast.elements) {
    const sub = source.slice(el.loc.start.offset, el.loc.end.offset);
    if (sub.length === 0) continue; // degenerate, skip
    let subResult: ParseResult;
    try {
      subResult = parse(sub);
    } catch (e) {
      throw new FuzzFailure(`sub-parse of ${el.kind} threw`, { ...ctx, sub, error: e });
    }
    // A sub-parse that's syntactically clean while the parent has parse errors at
    // this element's location is suspicious — log but don't fail. (Parent context
    // can legitimately change parsing decisions.)
    // Conversely, a sub-parse that succeeds but the parent flagged this element's
    // span as erroneous IS a bug — fail.
    const parentHasErrorAtOffset = result.errors.some(e =>
      e.loc && e.loc.offset === el.loc.start.offset
    );
    if (!parentHasErrorAtOffset && !subResult.ok && subResult.errors.length > 0) {
      throw new FuzzFailure(`parent accepts but sub-parse rejects ${el.kind}`, ...);
    }
  }
}
```

Note: `ParseError.loc` is a `Position` (single offset), not a `SourceLocation`. The check is `e.loc.offset === el.loc.start.offset`.

This is the deepest invariant — it catches grammar bugs where a rule's behavior depends on surrounding context in a way that disagrees with the rule's own scope.

### 5.4 Failure reporting

```ts
class FuzzFailure extends Error {
  constructor(msg: string, public ctx: { seed: number; iter: number; fixture: string; source: string; ... }) {
    super(format(msg, ctx));
  }
}

function format(msg, ctx): string {
  return `${msg}\n  fixture: ${ctx.fixture}\n  seed: ${ctx.seed}\n  iter: ${ctx.iter}\n  source (first 4 KB):\n${ctx.source.slice(0, 4096)}`;
}
```

Vitest shows the message verbatim. To reproduce: set the seed and `iter` and re-run `mutate(source, rng)` manually.

---

## 6. File-by-file summary

**`src/parser.mutate.ts` (~100 lines):**
- Exports: `mutate(source, rng)`, `makeRng(seed)`
- Pure functions, no imports beyond local helpers
- One-line op table at the top

**`src/parser.fuzz.test.ts` (~120 lines):**
- Imports: `parse`, `ParseResult` from `parser.ts`, `mutate`, `makeRng` from `parser.mutate.ts`
- One `describe` with one `it` per fixture (7 cases)
- Helper: `checkInvariants`, `walkAst`, `isValidLoc`, `FuzzFailure`
- Constants: `VALID_KINDS` (Set), `ITERATIONS` (env-driven)

---

## 7. Error handling

The parser is designed best-effort: it never throws on input. The fuzz test confirms this (Invariant 1). The other invariants check the *shape* of the result, not the absence of errors.

If the parser *does* throw on some mutated input:
- `checkInvariants` catches it and raises a `FuzzFailure` with the full source and error
- The test fails immediately at that mutation index — no further mutations are run on the same fixture
- The user can copy the seed + iter from the error message to reproduce

If a Vitest worker OOMs (extremely unlikely with this corpus, but possible with `FUZZ_ITER=1000000`): that's a config error, not a fuzz bug. The default 200 is safe.

---

## 8. Build, scripts, and CI

### 8.1 No `package.json` changes

The fuzz test runs under the existing `yarn test` (Vitest) workflow. No new scripts, no new deps.

### 8.2 Local workflow

- **Default:** `yarn test` runs the fuzz suite alongside `parser.test.ts` and `parser.bench.test.ts`
- **Stress:** `FUZZ_ITER=5000 yarn test` for deeper coverage
- **Reproducing a failure:** read the `seed` and `iter` from the test output, run `mutate` manually with that seed

### 8.3 CI integration

No new CI steps. The fuzz test runs in the existing `yarn test` job. If CI runtime becomes a concern, the default can be lowered from 200 to 100 without losing meaningful coverage — but 200 is well under 10 s on a developer laptop, so CI is unlikely to notice.

---

## 9. Risks and known limitations

- **`VALID_KINDS` list is hand-maintained.** Drift from `ast.ts` would let buggy kinds slip through. Mitigation: a single `// keep in sync with src/ast.ts` comment, and the list is short (≤ 15 kinds). A future cycle could codegen it from the AST types.
- **Seed-based reproducibility is local to a run.** Vitest doesn't pin the seed across runs by default. If a developer runs the test, sees a failure, and reruns, the failure may not reproduce unless they explicitly pin the seed. Mitigation: `seedFromName(name)` is deterministic, so any single failure reproduces by running only that fixture with `it.only`.
- **`spliceGarbage` can produce invalid UTF-16 surrogate pairs.** The parser uses UTF-16 offsets, and an unpaired surrogate can throw off `loc` arithmetic. Mitigation: `randomBytes` restricts to ASCII.
- **The mutator is biased toward input close to valid.** It will never produce a 10 000-line random-byte document. That's by design — the test's value is in the space just outside valid Argdown, not deep in the noise.
- **Idempotence check skips degenerate elements** (empty `loc.start.offset === loc.end.offset`). These are rare but legal; skipping is safer than a false positive.
- **`FUZZ_ITER` env var is read once per file load.** A running Vitest worker doesn't react to mid-run changes. Acceptable; the env is read at module init.

---

## 10. Skipped (YAGNI list)

- fast-check dependency
- Corpus persistence / minimization
- AST round-trip (no serializer)
- Snapshot comparison
- Coverage-guided fuzzing (libFuzzer / afl / jazzer.js)
- Custom op weights per fixture
- Parallel mutation (each fixture already gets its own `it`)
- Fuzz-driven grammar repair (auto-suggest fixes)
- Mutation of partial ASTs (we mutate source, not AST)
- Wire-format fuzzing (no wire format)
- Tokenizer-only fuzz (separate concern)
- Pure property tests (no source mutation, just generators)
- Multi-process fuzz workers
- Coverage reports from the fuzz run

---

## 11. Next steps

1. **User review** of this spec (current gate).
2. **`writing-plans` skill invocation** to produce a step-by-step implementation plan.
3. **Implementation** in execution order from the plan.
4. **Verification:**
   - `yarn test` passes (including new fuzz cases)
   - `yarn typecheck` passes
   - `FUZZ_ITER=500 yarn test` finishes in under 30 s
   - A deliberate `throw new Error('test')` injected into the parser causes a clean fuzz failure with the expected error message