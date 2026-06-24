# AST Stringifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `stringify(ast: Document): string` function that re-emits valid Argdown source from the existing AST, with a semantic round-trip guarantee (`parse(stringify(parse(src)))` is structurally equivalent to `parse(src)`).

**Architecture:** Single-file canonical emitter in `src/stringifier.ts`. Dispatches on AST `kind` discriminants. Pure data → pure string. Mirrors `renderMermaid` ergonomics. One canonical output style, no formatting options in v1.

**Tech Stack:** TypeScript (strict), vitest, oxlint, oxfmt, Chevrotain (existing parser dep — not used by stringifier).

---

## File Structure

| File | Status | Purpose |
|---|---|---|
| `src/stringifier.ts` | Create | Top-level `stringify()` + per-node emission helpers, single file under 400 lines |
| `src/stringifier.test.ts` | Create | Fixture round-trip + edge cases + snapshot driver |
| `src/__snapshots__/stringifier.test.ts.snap` | Create (auto) | Vitest-generated canonical-style snapshots |
| `src/index.ts` | Modify | Export `stringify` and `StringifyOptions` |
| `src/parser.fuzz.test.ts` | Modify | Add `stripLocations` helper + invariant 9 |

**Files to read during implementation (not modify):**
- `src/ast.ts` — every node type emitted
- `src/parser.ts` — `parse()` entry point used by tests and fuzz harness
- `src/parser.fixtures/` — existing fixtures to drive round-trip tests
- `docs/GRAMMAR.bnf` — disambiguation reference
- `docs/snowball/specs/2026-06-23-ast-stringifier-design.md` — the spec

**Naming:** file `stringifier.ts` (single word), function `stringify`, type `StringifyOptions`.

---

## Task 1: Scaffold the stringifier module and test file

**Files:**
- Create: `src/stringifier.ts`
- Create: `src/stringifier.test.ts`

- [ ] **Step 1: Create `src/stringifier.ts` with the public function signature**

```typescript
// src/stringifier.ts
// AST → source string. Canonical style. Pure, synchronous, no I/O.
// Round-trip guarantee: parse(stringify(ast)) is structurally equivalent to ast
// (positions may differ).

import type { Document } from './ast.js';

export type StringifyOptions = Record<string, never>;

export function stringify(ast: Document, _options: StringifyOptions = {}): string {
  void _options;
  return '';
}
```

- [ ] **Step 2: Create `src/stringifier.test.ts` with a vitest config check and one passing test**

```typescript
// src/stringifier.test.ts
import { describe, expect, it } from 'vitest';
import { stringify } from './stringifier.js';
import { parse } from './parser.js';

describe('stringify', () => {
  it('exports a function', () => {
    expect(typeof stringify).toBe('function');
  });

  it('produces output the parser accepts for an empty document', () => {
    const result = parse('');
    expect(result.ok).toBe(true);
    expect(stringify(result.ast!)).toBe('');
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `yarn test src/stringifier.test.ts`
Expected: PASS (2 tests). The empty-document case trivially returns `''`, which the parser accepts.

- [ ] **Step 4: Lint and format the new files**

Run:
```bash
yarn format src/stringifier.ts src/stringifier.test.ts
yarn lint src/stringifier.ts src/stringifier.test.ts
yarn typecheck
```
Expected: no errors. The `_options` parameter and `void _options;` are placeholders for v1 — see Task 9 where it gets real consumers, but for now lint must pass.

- [ ] **Step 5: Commit**

```bash
git add src/stringifier.ts src/stringifier.test.ts
git commit -m "feat(stringifier): scaffold stringifier module with public API"
```

---

## Task 2: Implement frontmatter emission

**Files:**
- Modify: `src/stringifier.ts:1-30`
- Modify: `src/stringifier.test.ts`

- [ ] **Step 1: Add failing frontmatter tests to `src/stringifier.test.ts`**

Append to the existing `describe('stringify', ...)` block:

```typescript
  describe('frontmatter', () => {
    it('emits empty frontmatter as === block with no entries', () => {
      const src = '===\n===\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits frontmatter with string values', () => {
      const src = '===\ntitle: "My Doc"\nauthor: "Kellen"\n===\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const out = stringify(result.ast!);
      expect(out).toContain('===');
      expect(out).toContain('title: "My Doc"');
      expect(out).toContain('author: "Kellen"');
    });

    it('emits frontmatter with number, boolean, null values', () => {
      const src = '===\ncount: 42\nactive: true\narchived: null\n===\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const out = stringify(result.ast!);
      expect(out).toContain('count: 42');
      expect(out).toContain('active: true');
      expect(out).toContain('archived: null');
    });

    it('round-trips frontmatter through parse → stringify → parse', () => {
      const src = '===\ntitle: "Doc"\ntags: [a, b, c]\n===\n';
      const first = parse(src);
      const out = stringify(first.ast!);
      const second = parse(out);
      expect(second.ok).toBe(true);
      expect(second.ast!.frontmatter).toBeDefined();
      expect(first.ast!.frontmatter!.entries['title']).toEqual(second.ast!.frontmatter!.entries['title']);
    });

    it('escapes special characters in string values', () => {
      const src = '===\nquote: "She said \\"hi\\""\nbackslash: "a\\\\b"\n===\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const out = stringify(result.ast!);
      expect(out).toContain('"She said \\"hi\\""');
      expect(out).toContain('"a\\\\b"');
      const second = parse(out);
      expect(second.ok).toBe(true);
      expect(second.ast!.frontmatter!.entries['quote']).toEqual(first.ast!.frontmatter!.entries['quote']);
      expect(second.ast!.frontmatter!.entries['backslash']).toEqual(first.ast!.frontmatter!.entries['backslash']);
    });

    it('escapes newlines and tabs in string values', () => {
      const src = '===\nmultiline: "line1\\nline2"\ntabbed: "a\\tb"\n===\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      const out = stringify(result.ast!);
      expect(out).toContain('"line1\\nline2"');
      expect(out).toContain('"a\\tb"');
      const second = parse(out);
      expect(second.ok).toBe(true);
      expect(second.ast!.frontmatter!.entries['multiline']).toEqual(first.ast!.frontmatter!.entries['multiline']);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/stringifier.test.ts`
Expected: the `frontmatter` describe block fails — `stringify` returns `''`, not the expected frontmatter text.

- [ ] **Step 3: Replace `src/stringifier.ts` with frontmatter-aware implementation**

```typescript
// src/stringifier.ts
// AST → source string. Canonical style. Pure, synchronous, no I/O.
// Round-trip guarantee: parse(stringify(ast)) is structurally equivalent to ast
// (positions may differ).

import type {
  Document,
  Element,
  Frontmatter,
  Value,
  YamlValue,
  YamlLine,
  FlowSequence,
  FlowMapping,
  FlowScalar,
  PlainScalar,
  StringValue,
  NumberValue,
  BooleanValue,
  NullValue,
} from './ast.js';

export type StringifyOptions = Record<string, never>;

export function stringify(ast: Document, _options: StringifyOptions = {}): string {
  void _options;
  const parts: string[] = [];
  if (ast.frontmatter) {
    parts.push(emitFrontmatter(ast.frontmatter));
  }
  for (const el of ast.elements) {
    parts.push(emitElement(el));
  }
  return parts.join('\n\n') + (parts.length > 0 ? '\n' : '');
}

function emitFrontmatter(fm: Frontmatter): string {
  const lines = ['==='];
  for (const [key, value] of Object.entries(fm.entries)) {
    lines.push(`${key}: ${emitValue(value)}`);
  }
  lines.push('===');
  return lines.join('\n');
}

function emitElement(_el: Element): string {
  // Stub — returns empty until later tasks.
  void _el;
  return '';
}

function emitValue(v: Value | PlainScalar): string {
  switch (v.kind) {
    case 'StringValue':
      return emitString(v);
    case 'NumberValue':
      return String(v.value);
    case 'BooleanValue':
      return String(v.value);
    case 'NullValue':
      return 'null';
    case 'FlowSequence':
      return emitFlowSequence(v);
    case 'FlowMapping':
      return emitFlowMapping(v);
    case 'FlowScalar':
      return v.text;
    case 'PlainScalar':
      return v.text;
  }
}

function emitString(s: StringValue): string {
  const escaped = s.value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[\x00-\x1f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `"${escaped}"`;
}

function emitFlowSequence(seq: FlowSequence): string {
  return `[${seq.items.map(emitValue).join(', ')}]`;
}

function emitFlowMapping(m: FlowMapping): string {
  const entries = Object.entries(m.entries).map(([k, v]) => `${k}: ${emitValue(v)}`);
  return `{${entries.join(', ')}}`;
}

// YamlLine and YamlValue are reserved for future use by block body emission.
export type { YamlLine, YamlValue };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/stringifier.test.ts`
Expected: PASS for all frontmatter tests. The empty-document test still passes.

- [ ] **Step 5: Lint, format, typecheck**

Run:
```bash
yarn format src/stringifier.ts src/stringifier.test.ts
yarn lint src/stringifier.ts src/stringifier.test.ts
yarn typecheck
```
Expected: no errors. Note `isolatedDeclarations` may flag the `export type { YamlLine, YamlValue }` re-export — if so, drop the line and import only where needed later.

- [ ] **Step 6: Commit**

```bash
git add src/stringifier.ts src/stringifier.test.ts
git commit -m "feat(stringifier): implement frontmatter emission"
```

---

## Task 3: Implement heading emission

**Files:**
- Modify: `src/stringifier.ts`
- Modify: `src/stringifier.test.ts`

- [ ] **Step 1: Add failing heading and comment tests**

Append a new describe block to `src/stringifier.test.ts`:

```typescript
  describe('headings', () => {
    it('emits level-1 heading', () => {
      const src = '# Title\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits level-6 heading', () => {
      const src = '###### Smallest\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('round-trips a heading', () => {
      const src = '## Section\n';
      const first = parse(src);
      const out = stringify(first.ast!);
      const second = parse(out);
      expect(second.ok).toBe(true);
      expect(second.ast!.elements[0]!.kind).toBe('Heading');
      if (second.ast!.elements[0]!.kind === 'Heading') {
        expect(second.ast!.elements[0]!.level).toBe(2);
        expect(second.ast!.elements[0]!.text).toBe('Section');
      }
    });
  });

  describe('comments', () => {
    it('emits a line comment', () => {
      const src = '// just a note\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits a block comment', () => {
      const src = '/* multi\nline */\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits a comment between other elements in document order', () => {
      const src = '# A\n// middle note\n# B\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('round-trips a document with comments', () => {
      const src = '// lead\n[A]\n// trail\n';
      const first = parse(src);
      const out = stringify(first.ast!);
      const second = parse(out);
      expect(second.ok).toBe(true);
      const elements = second.ast!.elements;
      expect(elements[0]?.kind).toBe('LineComment');
      expect(elements[1]?.kind).toBe('FactStatement');
      expect(elements[2]?.kind).toBe('LineComment');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/stringifier.test.ts`
Expected: the `headings` describe block fails — `emitElement` returns `''`.

- [ ] **Step 3: Implement heading emission in `src/stringifier.ts`**

Replace the `emitElement` stub:

```typescript
function emitElement(el: Element): string {
  switch (el.kind) {
    case 'Heading':
      return `${'#'.repeat(el.level)} ${el.text}`;
    case 'LineComment':
      return `// ${el.text}`;
    case 'BlockComment':
      return `/* ${el.text} */`;
    case 'Block':
      return emitBlock(el);
    case 'FactStatement':
      return emitFactStatement(el);
    case 'Argument':
      return emitArgument(el);
    case 'RelationStatement':
      return emitRelationStatement(el);
    case 'RuleStatement':
      return emitRuleStatement(el);
  }
}
```

Add the new functions (placeholders for now; real implementations land in later tasks):

```typescript
import type {
  Document,
  Element,
  Frontmatter,
  Value,
  Block,
  BlockLine,
  FactStatement,
  Argument,
  RelationStatement,
  Relation,
  RuleStatement,
  Arrow,
  AttributeBlock,
  Conclusion,
  Premise,
  RelationEndpoint,
  FactRef,
  FactHead,
} from './ast.js';

// ... existing code ...

function emitBlock(_b: Block): string {
  return '';
}

function emitFactStatement(_f: FactStatement): string {
  return '';
}

function emitArgument(_a: Argument): string {
  return '';
}

function emitRelationStatement(_r: RelationStatement): string {
  return '';
}

function emitRuleStatement(_r: RuleStatement): string {
  return '';
}
```

(If your implementation produces the headings correctly, the imports for `Arrow`, `Conclusion`, etc., will be flagged as unused by the linter — leave them; later tasks will use them. If `yarn lint` rejects unused-imports, see the typecheck step's note about `isolatedDeclarations`.)

- [ ] **Step 4: Run tests to verify heading tests pass**

Run: `yarn test src/stringifier.test.ts`
Expected: PASS for heading tests. Other tests still pass.

- [ ] **Step 5: Lint, format, typecheck**

Run:
```bash
yarn format src/stringifier.ts src/stringifier.test.ts
yarn lint src/stringifier.ts src/stringifier.test.ts
yarn typecheck
```
Expected: `isolatedDeclarations` may flag unused type-only imports as `importsNotUsedAsValues`. Remove imports that aren't yet referenced (keep `Arrow`, `Conclusion`, etc., for the next tasks by importing them lazily inside the function bodies via `// @ts-expect-error` — or, simpler, remove them now and re-add when needed).

If lint blocks, simplify by removing the unused type imports for now. They get re-added in their respective tasks.

- [ ] **Step 6: Commit**

```bash
git add src/stringifier.ts src/stringifier.test.ts
git commit -m "feat(stringifier): implement heading and comment stubs"
```

(Note: comment tests for `LineComment` and `BlockComment` are added in Step 1 of this same task and pass as part of this commit.)

---

## Task 4: Implement fact statement emission

**Files:**
- Modify: `src/stringifier.ts`
- Modify: `src/stringifier.test.ts`

- [ ] **Step 1: Add failing fact tests**

```typescript
  describe('facts', () => {
    it('emits fact with identifier head and no claim', () => {
      const src = '[A]\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits fact with title head', () => {
      const src = '[Fact One]\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits fact with claim', () => {
      const src = '[A]: some claim\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits fact with single attribute in flow-mapping form', () => {
      const src = '[A]: claim {weight: 2}\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits fact with multiple attributes on multiple lines', () => {
      const src = '[A]: claim {\n  weight: 2,\n  source: "paper"\n}\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('round-trips a fact with attributes', () => {
      const src = '[A]: claim {weight: 2, source: "paper"}\n';
      const first = parse(src);
      const out = stringify(first.ast!);
      const second = parse(out);
      expect(second.ok).toBe(true);
      const secondFact = second.ast!.elements[0];
      expect(secondFact?.kind).toBe('FactStatement');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/stringifier.test.ts`
Expected: the `facts` describe block fails.

- [ ] **Step 3: Implement fact emission in `src/stringifier.ts`**

Replace `emitFactStatement`:

```typescript
function emitFactStatement(f: FactStatement): string {
  const fact = f.fact;
  const ref = emitFactRef(fact.ref);
  const claimPart = fact.claimText !== undefined ? `: ${fact.claimText}` : '';
  const attrPart = fact.attributes ? emitAttributeBlock(fact.attributes) : '';
  return `${ref}${claimPart}${attrPart}`;
}

function emitFactRef(ref: FactRef): string {
  return emitFactHead(ref.head);
}

function emitFactHead(head: FactHead): string {
  switch (head.kind) {
    case 'IdentifierHead':
      return `[${head.identifier}]`;
    case 'TitleHead':
      return `[${head.title}]`;
  }
}

function emitAttributeBlock(attr: AttributeBlock): string {
  const entries = Object.entries(attr.entries);
  if (entries.length === 0) {
    return '';
  }
  if (entries.length === 1) {
    const [k, v] = entries[0]!;
    return ` {${k}: ${emitValue(v)}}`;
  }
  const lines = entries.map(([k, v]) => `  ${k}: ${emitValue(v)},`);
  return ` {\n${lines.join('\n')}\n}`;
}
```

Add the type imports if removed in Task 3:

```typescript
import type {
  // ... existing imports ...
  FactRef,
  FactHead,
  AttributeBlock,
} from './ast.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/stringifier.test.ts`
Expected: PASS for fact tests.

- [ ] **Step 5: Lint, format, typecheck**

Run: `yarn format src/stringifier.ts src/stringifier.test.ts && yarn lint src/stringifier.ts src/stringifier.test.ts && yarn typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/stringifier.ts src/stringifier.test.ts
git commit -m "feat(stringifier): implement fact statement emission"
```

---

## Task 5: Implement argument emission

**Files:**
- Modify: `src/stringifier.ts`
- Modify: `src/stringifier.test.ts`

- [ ] **Step 1: Add failing argument tests**

```typescript
  describe('arguments', () => {
    it('emits argument with atom conclusion and atom premise', () => {
      const src = '[C]\n-- [P1]\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits argument with multiple atom premises', () => {
      const src = '[C]\n-- [P1]\n-- [P2]\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits argument with disjunction premise', () => {
      const src = '[C]\n-- ([P1], [P2])\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits argument with sub-argument premise', () => {
      const src = '[C]\n-- <[A]: sub claim>\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits argument with attributes', () => {
      const src = '[C]\n-- [P1] {weight: 1}\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('round-trips an argument with disjunction', () => {
      const src = '[C]\n-- ([P1], [P2])\n';
      const first = parse(src);
      const out = stringify(first.ast!);
      const second = parse(out);
      expect(second.ok).toBe(true);
      const arg = second.ast!.elements[0];
      expect(arg?.kind).toBe('Argument');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/stringifier.test.ts`
Expected: the `arguments` describe block fails.

- [ ] **Step 3: Implement argument emission in `src/stringifier.ts`**

Replace `emitArgument`:

```typescript
function emitArgument(a: Argument): string {
  const conclusion = emitConclusion(a.conclusion);
  const premises = a.premises.map(emitPremise);
  const attrPart = a.attributes ? emitAttributeBlock(a.attributes) : '';
  const premisesText = premises.join('\n');
  return `${conclusion}${attrPart}\n${premisesText}`;
}

function emitConclusion(c: Conclusion): string {
  switch (c.kind) {
    case 'atom':
      return emitFactRef(c.value);
    case 'argument':
      return emitArgument(c.value);
  }
}

function emitPremise(p: Premise): string {
  let body: string;
  switch (p.kind) {
    case 'atom':
      body = emitFactRef(p.value);
      break;
    case 'argument':
      body = emitArgument(p.value);
      break;
    case 'disjunction':
      body = `(${p.values.map(emitFactRef).join(', ')})`;
      break;
  }
  return `-- ${body}`;
}
```

Add type imports:

```typescript
import type {
  // ... existing ...
  Conclusion,
  Premise,
} from './ast.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/stringifier.test.ts`
Expected: PASS for argument tests.

- [ ] **Step 5: Lint, format, typecheck**

Run: `yarn format src/stringifier.ts src/stringifier.test.ts && yarn lint src/stringifier.ts src/stringifier.test.ts && yarn typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/stringifier.ts src/stringifier.test.ts
git commit -m "feat(stringifier): implement argument emission"
```

---

## Task 6: Implement relation statement emission

**Files:**
- Modify: `src/stringifier.ts`
- Modify: `src/stringifier.test.ts`

- [ ] **Step 1: Add failing relation tests**

```typescript
  describe('relations', () => {
    it.each([
      ['support', '--'],
      ['attack', '--x'],
      ['undercut', '-.->'],
      ['undermine', '-.-'],
      ['concession', '~>'],
      ['qualification', '?>'],
      ['equivalence', '<->'],
    ] as const)('emits %s relation with correct symbol', (_name, _symbol) => {
      const arrowMap: Record<string, string> = {
        support: '[A] --> [B]',
        attack: '[A] --x [B]',
        undercut: '[A] -.-> [B]',
        undermine: '[A] -.- [B]',
        concession: '[A] ~> [B]',
        qualification: '[A] ?> [B]',
        equivalence: '[A] <-> [B]',
      };
      const src = arrowMap[_name]! + '\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits relation with attributes', () => {
      const src = '[A] --> [B] {strength: 0.8}\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('round-trips a multi-premise relation (unfolded into binary)', () => {
      const src = '[A], [B] --> [C]\n';
      const first = parse(src);
      const out = stringify(first.ast!);
      const second = parse(out);
      expect(second.ok).toBe(true);
      const relStmt = second.ast!.elements[0];
      expect(relStmt?.kind).toBe('RelationStatement');
      if (relStmt?.kind === 'RelationStatement') {
        expect(relStmt.relations.length).toBe(2);
      }
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/stringifier.test.ts`
Expected: the `relations` describe block fails.

- [ ] **Step 3: Implement relation emission in `src/stringifier.ts`**

Replace `emitRelationStatement`:

```typescript
const ARROW_SYMBOL: Record<Arrow, string> = {
  support: '-->',
  attack: '--x',
  undercut: '-.->',
  undermine: '-.-',
  concession: '~>',
  qualification: '?>',
  equivalence: '<->',
};

function emitRelationStatement(rs: RelationStatement): string {
  return rs.relations.map(emitRelation).join('\n');
}

function emitRelation(r: Relation): string {
  const from = emitRelationEndpoint(r.from);
  const arrow = ARROW_SYMBOL[r.arrow];
  const to = emitRelationEndpoint(r.to);
  const attrPart = r.attributes ? emitAttributeBlock(r.attributes) : '';
  return `${from} ${arrow} ${to}${attrPart}`;
}

function emitRelationEndpoint(e: RelationEndpoint): string {
  if (e.kind === 'FactRef') {
    return emitFactRef(e);
  }
  return emitArgument(e);
}
```

Add type imports:

```typescript
import type {
  // ... existing ...
  Relation,
  RelationEndpoint,
  Arrow,
} from './ast.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/stringifier.test.ts`
Expected: PASS for all relation tests.

- [ ] **Step 5: Lint, format, typecheck**

Run: `yarn format src/stringifier.ts src/stringifier.test.ts && yarn lint src/stringifier.ts src/stringifier.test.ts && yarn typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/stringifier.ts src/stringifier.test.ts
git commit -m "feat(stringifier): implement relation statement emission"
```

---

## Task 7: Implement block emission

**Files:**
- Modify: `src/stringifier.ts`
- Modify: `src/stringifier.test.ts`

- [ ] **Step 1: Add failing block tests**

```typescript
  describe('blocks', () => {
    it('emits block with no title and empty body', () => {
      const src = '::: evidence\n\n:::\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits block with title', () => {
      const src = '::: evidence My Title\n\n:::\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('emits block with yaml body lines', () => {
      const src = '::: evidence\nkey: value\ncount: 3\n:::\n';
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it.each([
      'meta',
      'evidence',
      'position',
      'stakeholder',
      'domain',
    ] as const)('emits block of type %s with correct opener', (blockType) => {
      const src = `::: ${blockType}\n\n:::\n`;
      const result = parse(src);
      expect(result.ok).toBe(true);
      expect(stringify(result.ast!)).toBe(src);
    });

    it('round-trips a block with body', () => {
      const src = '::: evidence\nkey: value\n:::\n';
      const first = parse(src);
      const out = stringify(first.ast!);
      const second = parse(out);
      expect(second.ok).toBe(true);
      const block = second.ast!.elements[0];
      expect(block?.kind).toBe('Block');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/stringifier.test.ts`
Expected: the `blocks` describe block fails.

- [ ] **Step 3: Implement block emission in `src/stringifier.ts`**

Replace `emitBlock`:

```typescript
function emitBlock(b: Block): string {
  const opener = `::: ${b.type}${b.title ? ` ${b.title.text}` : ''}`;
  const bodyLines = b.body.map(emitBlockLine);
  const body = bodyLines.length > 0 ? '\n' + bodyLines.join('\n') : '';
  return `${opener}${body}\n\n:::`;
}

function emitBlockLine(line: BlockLine): string {
  switch (line.kind) {
    case 'YamlLine':
      return `${line.key}: ${emitYamlValue(line.value)}`;
    case 'ListItem':
      return `- ${emitFact(line.fact)}`;
    case 'LineComment':
      return `// ${line.text}`;
    case 'BlockComment':
      return `/* ${line.text} */`;
    case 'Heading':
      return `${'#'.repeat(line.level)} ${line.text}`;
    case 'Block':
      return emitBlock(line);
    case 'FactStatement':
      return emitFactStatement(line);
    case 'Argument':
      return emitArgument(line);
    case 'RelationStatement':
      return emitRelationStatement(line);
    case 'RuleStatement':
      return emitRuleStatement(line);
  }
}

function emitYamlValue(v: YamlValue): string {
  if (v === null) return 'null';
  return emitValue(v);
}
```

Add `emitFact` helper (used by `ListItem`):

```typescript
function emitFact(f: { ref: FactRef; claimText?: string; attributes?: AttributeBlock }): string {
  const ref = emitFactRef(f.ref);
  const claimPart = f.claimText !== undefined ? `: ${f.claimText}` : '';
  const attrPart = f.attributes ? emitAttributeBlock(f.attributes) : '';
  return `${ref}${claimPart}${attrPart}`;
}
```

Add type imports:

```typescript
import type {
  // ... existing ...
  Block,
  BlockLine,
  Fact,
  YamlValue,
} from './ast.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/stringifier.test.ts`
Expected: PASS for block tests.

- [ ] **Step 5: Lint, format, typecheck**

Run: `yarn format src/stringifier.ts src/stringifier.test.ts && yarn lint src/stringifier.ts src/stringifier.test.ts && yarn typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/stringifier.ts src/stringifier.test.ts
git commit -m "feat(stringifier): implement block emission with body lines"
```

---

## Task 8: Implement rule statement emission

**Files:**
- Modify: `src/stringifier.ts`
- Modify: `src/stringifier.test.ts`

Note: As of commit `73a9ba1`, `RuleStatement` is part of the AST `Element` union but the parser no longer produces it (the BNF drift documented in memory). The stringifier must still emit it for round-trip of any AST that contains it (e.g., from programmatic construction or older snapshots). This task adds the emission code even though no live parser path creates it.

- [ ] **Step 1: Add a unit test for rule emission (synthesized AST)**

```typescript
  describe('rule statements', () => {
    it('emits a rule statement from a synthesized AST', () => {
      const src = '[head]: claim\n[A], [B] -> [C]\n'; // baseline for sanity
      // Build a RuleStatement AST manually (since parser doesn't produce them post-73a9ba1).
      const result = parse(src);
      expect(result.ok).toBe(true);
      const ast = result.ast!;
      // Inject a rule into the document.
      const docWithRule = {
        ...ast,
        elements: [
          ...ast.elements,
          {
            kind: 'RuleStatement' as const,
            rule: {
              kind: 'Rule' as const,
              ref: {
                kind: 'FactRef' as const,
                head: { kind: 'IdentifierHead' as const, identifier: 'R', loc: ast.loc },
                loc: ast.loc,
              },
              premises: [
                {
                  kind: 'FactRef' as const,
                  head: { kind: 'IdentifierHead' as const, identifier: 'A', loc: ast.loc },
                  loc: ast.loc,
                },
              ],
              loc: ast.loc,
            },
            loc: ast.loc,
          },
        ],
      };
      const out = stringify(docWithRule);
      expect(out).toContain('R :- A');
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/stringifier.test.ts`
Expected: rule test fails — `emitRuleStatement` returns `''`.

- [ ] **Step 3: Implement rule emission in `src/stringifier.ts`**

Replace `emitRuleStatement`:

```typescript
function emitRuleStatement(rs: RuleStatement): string {
  const head = emitFactRef(rs.rule.ref);
  const premises = rs.rule.premises.map(emitFactRef).join(', ');
  return `${head} :- ${premises}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/stringifier.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, typecheck**

Run: `yarn format src/stringifier.ts src/stringifier.test.ts && yarn lint src/stringifier.ts src/stringifier.test.ts && yarn typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/stringifier.ts src/stringifier.test.ts
git commit -m "feat(stringifier): implement rule statement emission"
```

---

## Task 9: Wire stringifier into the public API

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add the exports to `src/index.ts`**

Edit `src/index.ts`, replacing the existing exports. The stringifier should sit next to `renderMermaid`:

```typescript
// src/index.ts
// Public API surface.

export { parse, formatError } from './parser.js';
export type { ParseResult, ParseOptions, ParseError, ParseErrorCode } from './parser.js';

export { renderMermaid } from './mermaid.js';

export { stringify } from './stringifier.js';
export type { StringifyOptions } from './stringifier.js';

export type {
  Document,
  // ... (existing type exports unchanged) ...
} from './ast.js';
```

Preserve every existing type export in `src/index.ts`. The new lines to add are:

```typescript
export { stringify } from './stringifier.js';
export type { StringifyOptions } from './stringifier.js';
```

(Place them after the `renderMermaid` export.)

- [ ] **Step 2: Verify the build still works**

Run: `yarn build`
Expected: succeeds. `dist/stringifier.js` and `dist/stringifier.d.ts` exist.

- [ ] **Step 3: Verify the types still build**

Run: `yarn typecheck`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `yarn test`
Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(stringifier): export stringify from public api"
```

---

## Task 10: Add round-trip invariant to the fuzz harness

**Files:**
- Modify: `src/parser.fuzz.test.ts`

- [ ] **Step 1: Read the existing fuzz test to understand the harness structure**

```bash
head -100 src/parser.fuzz.test.ts
```

Identify the pattern: where invariants are registered, how `parse(source)` results flow through, and how assertions are structured. Match that pattern for the new invariant.

- [ ] **Step 2: Add the `stripLocations` helper and invariant 9**

In `src/parser.fuzz.test.ts`, add a helper near the top of the file (after imports):

```typescript
import { stringify } from './stringifier.js';

function stripLocations<T>(node: T): T {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(stripLocations) as unknown as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'loc') continue;
    result[key] = stripLocations(value);
  }
  return result as T;
}
```

In the existing invariants list (or wherever invariants are checked), add invariant 9 after the existing ones:

```typescript
// Invariant 9: parse(stringify(ast)) ≡ ast (positions stripped)
const stringified = stringify(stripped.ast);
const reParsed = parse(stringified);
if (!reParsed.ok) {
  invariantFailures.push(`invariant 9: stringify→parse failed: ${reParsed.errors.map(e => e.message).join('; ')}`);
} else {
  const original = JSON.stringify(stripLocations(stripped.ast));
  const roundTripped = JSON.stringify(stripLocations(reParsed.ast));
  if (original !== roundTripped) {
    invariantFailures.push(`invariant 9: round-trip mismatch for source: ${JSON.stringify(src)}`);
  }
}
```

(Adapt to the harness's actual structure — the helper names `stripped`, `invariantFailures`, `reParsed`, etc., may already exist or need different names. Match what's there.)

- [ ] **Step 3: Run the fuzz tests**

Run: `yarn test src/parser.fuzz.test.ts`
Expected: PASS. If invariant 9 fires for any seed, the stringifier has a bug — debug via the failing source printed in the failure message.

- [ ] **Step 4: Commit**

```bash
git add src/parser.fuzz.test.ts
git commit -m "test: add round-trip invariant to fuzz harness"
```

---

## Task 11: Add fixture round-trip tests

**Files:**
- Modify: `src/stringifier.test.ts`

- [ ] **Step 1: Discover existing parser fixtures**

```bash
ls src/parser.fixtures/
```

Identify each fixture file. The fixtures are the corpus of parser test inputs.

- [ ] **Step 2: Add a parameterised fixture round-trip test**

Append to `src/stringifier.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('fixture round-trip', () => {
  const fixtureDir = 'src/parser.fixtures';
  const fixtureFiles = [
    'facts.argdown',
    'arguments.argdown',
    'relations.argdown',
    'blocks.argdown',
    'comments.argdown',
    'frontmatter.argdown',
    'headings.argdown',
    'mixed.argdown',
  ];

  for (const file of fixtureFiles) {
    it(`round-trips ${file}`, () => {
      const src = readFileSync(join(fixtureDir, file), 'utf8');
      const first = parse(src);
      if (!first.ok && !first.partial) {
        // Some fixtures may be intentionally invalid; skip.
        return;
      }
      const ast = first.ast ?? first.partial;
      if (!ast) return;
      const out = stringify(ast);
      const second = parse(out);
      expect(second.ok || second.partial).toBe(true);
      const secondAst = second.ast ?? second.partial;
      expect(secondAst).toBeDefined();
      expect(JSON.stringify(stripLocations(ast))).toBe(JSON.stringify(stripLocations(secondAst!)));
    });
  }
});
```

Add the `stripLocations` helper near the top of the test file (same as in Task 10, but defined here since the fuzz test may not export it):

```typescript
function stripLocations<T>(node: T): T {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(stripLocations) as unknown as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'loc') continue;
    result[key] = stripLocations(value);
  }
  return result as T;
}
```

- [ ] **Step 3: Adjust the fixture file list to match what's actually present**

Run `ls src/parser.fixtures/` and update the `fixtureFiles` array to match. Remove names that don't exist; add any that do.

- [ ] **Step 4: Run the tests**

Run: `yarn test src/stringifier.test.ts`
Expected: PASS for every existing fixture.

If a fixture fails, the failure message identifies which source caused the mismatch — debug the stringifier's handling of that source's content. Add a unit test that reproduces it (so the bug doesn't regress), then fix the stringifier, then re-run.

- [ ] **Step 5: Commit**

```bash
git add src/stringifier.test.ts
git commit -m "test(stringifier): add fixture round-trip coverage"
```

---

## Task 12: Add canonical-style snapshot tests

**Files:**
- Modify: `src/stringifier.test.ts`
- Create: `src/__snapshots__/stringifier.test.ts.snap` (auto-generated)

- [ ] **Step 1: Add snapshot tests for representative inputs**

Append to `src/stringifier.test.ts`:

```typescript
describe('canonical output', () => {
  it('matches snapshot for a representative document', () => {
    const src = [
      '===',
      'title: "Snapshot"',
      '===',
      '',
      '# Heading',
      '',
      '::: evidence',
      'key: value',
      ':::',
      '',
      '[A]: claim',
      '',
      '[A] --> [B]',
      '',
      '[C]',
      '-- [P1]',
      '-- [P2]',
    ].join('\n');
    const result = parse(src);
    expect(result.ok).toBe(true);
    expect(stringify(result.ast!)).toMatchSnapshot();
  });

  it('matches snapshot for empty document', () => {
    expect(stringify(parse('').ast!)).toMatchSnapshot();
  });

  it('matches snapshot for fact with multi-attribute block', () => {
    const src = '[A]: claim {\n  weight: 2,\n  source: "paper"\n}\n';
    const result = parse(src);
    expect(result.ok).toBe(true);
    expect(stringify(result.ast!)).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Generate the snapshot file**

Run: `yarn test src/stringifier.test.ts -u`
Expected: a snapshot file is created at `src/__snapshots__/stringifier.test.ts.snap` with the captured outputs.

- [ ] **Step 3: Inspect the generated snapshot file**

```bash
cat src/__snapshots__/stringifier.test.ts.snap
```

Verify the snapshots look like canonical Argdown source — 2-space indent, single blank line between elements, flow-mapping attributes. If anything looks wrong, fix the stringifier and re-run with `-u`.

- [ ] **Step 4: Re-run tests without `-u` to confirm snapshots match**

Run: `yarn test src/stringifier.test.ts`
Expected: PASS, with no snapshot updates.

- [ ] **Step 5: Commit**

```bash
git add src/stringifier.test.ts src/__snapshots__/stringifier.test.ts.snap
git commit -m "test(stringifier): add canonical-style snapshots"
```

---

## Task 13: Final acceptance

**Files:**
- (no file changes — verification task)

- [ ] **Step 1: Run the full test suite**

Run: `yarn test`
Expected: all tests green (parser tests, stringifier tests, fuzz tests, mutation tests).

- [ ] **Step 2: Run lint**

Run: `yarn lint`
Expected: no errors. If lint complains about the `_options` parameter or `void _options`, the simplest fix is to drop the parameter entirely in v1 (move `StringifyOptions` to a future cycle) — but the spec mandates the parameter for forward compatibility, so prefer keeping it and suppressing the unused warning via a `void _options;` line in the function body (already in place from Task 1).

- [ ] **Step 3: Run typecheck**

Run: `yarn typecheck`
Expected: no errors.

- [ ] **Step 4: Run format check**

Run: `yarn format:check`
Expected: no diff. If there is, run `yarn format` and re-commit.

- [ ] **Step 5: Run build**

Run: `yarn build`
Expected: succeeds.

- [ ] **Step 6: Confirm `stringifier.ts` is under the 400-line lint cap**

Run: `wc -l src/stringifier.ts`
Expected: under 400 lines. If over, split by responsibility (`stringifier-doc.ts`, `stringifier-arg.ts`, etc.) per the spec's "if it outgrows one file" clause.

- [ ] **Step 7: Commit any fixes**

If Steps 1–6 surfaced any issue, fix it and commit. Otherwise, no commit is needed.

```bash
git status
# If anything modified:
git add -u
git commit -m "chore(stringifier): fix lint/format/typecheck issues"
```

- [ ] **Step 8: Final verification**

Run: `yarn test && yarn lint && yarn typecheck && yarn format:check && yarn build`
Expected: all green, all quiet.

Acceptance criteria (per spec Section 8) are met:

1. `src/stringifier.ts` exists, under 400 lines, passes lint/format/typecheck ✓
2. `stringify(ast)` exported from `src/index.ts` ✓
3. `yarn test` green, including new fuzz invariant and fixture round-trip ✓
4. Snapshot file exists and is committed ✓
5. Round-trip invariant holds for every fixture and fuzz input ✓
