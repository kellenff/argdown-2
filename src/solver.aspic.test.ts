// src/solver.aspic.test.ts
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { solveAspic } from './solver-aspic.js';
import { solveAspic as publicSolveAspic } from './index.js';
import { solveBipolar } from './solver.js';

describe('solveAspic', () => {
  it('is re-exported from index.ts', () => {
    expect(publicSolveAspic).toBe(solveAspic);
  });

  it('returns empty labels and warnings for an empty document', () => {
    const result = parse('');
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels).toBeInstanceOf(Map);
    expect(solved.labels.size).toBe(0);
    expect(solved.warnings).toEqual([]);
    expect(solved.defeats).toBeDefined();
    expect(solved.defeats!.size).toBe(0);
  });

  it('keys FactStatement nodes by their fact ref', () => {
    const src = '[#alpha] First fact.\n[#beta] Second fact.';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.has('alpha')).toBe(true);
    expect(solved.labels.has('beta')).toBe(true);
  });

  it('keys Argument nodes by arg:L:C', () => {
    const src = '([#thesis]) -> [#a].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
    expect(argKeys.length).toBeGreaterThan(0);
  });

  it('returns empty labels for a document with facts and no relations', () => {
    const src = '[#a] A fact.\n[#b] B fact.';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.get('a')).toBe('in');
    expect(solved.labels.get('b')).toBe('in');
  });
});

// ponytail: rebut/undercut target the conclusion ref (the `arg:L:C` argument
// node is only ever defeated by undermine, which expands via the premise index).
// Asserting on `argKeys[0]` would always read `in` for these cases — the
// defeat lives on the conclusion ref. This matches Method 1 (`solve()`) where
// the same conclusion-keyed targeting is documented in solver.test.ts.
describe('solveAspic — rebut (--x)', () => {
  it('rebut with strict preference: attacker defeats target (conclusion ref OUT)', () => {
    const src = [
      '[#a] A fact { preference: 1 }',
      '[#b] B fact { preference: 0.5 }',
      '([#thesis]) -> [#a], [#b]. { preference: 0.5 }',
      '[#a] --x [#thesis].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.get('thesis')).toBe('out');
  });

  it('rebut with equal preference (both 0): not a defeat (conclusion ref UNDEC)', () => {
    const src = '([#thesis]) -> [#a].\n[#a] --x [#thesis].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.get('thesis')).toBe('undec');
  });

  it('rebut with attacker preferred: defeats map contains the attacker under the conclusion ref', () => {
    const src = [
      '[#a] A fact { preference: 1 }',
      '[#b] B fact { preference: 0.5 }',
      '([#thesis]) -> [#a], [#b]. { preference: 0.5 }',
      '[#a] --x [#thesis].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.defeats).toBeDefined();
    expect(solved.defeats!.get('thesis')).toContain('a');
  });
});

describe('solveAspic — undercut (-.->)', () => {
  it('undercut always wins regardless of preferences (conclusion ref OUT)', () => {
    const src = [
      '[#a] A fact { preference: 0 }',
      '([#thesis]) -> [#a]. { preference: 1 }', // higher preference than attacker
      '[#a] -.-> [#thesis].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.get('thesis')).toBe('out');
  });

  it('undercut with attacker having 0 preference still defeats (conclusion ref OUT)', () => {
    const src = '([#thesis]) -> [#a].\n[#a] -.-> [#thesis].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.get('thesis')).toBe('out');
  });
});

describe('solveAspic — undermine (-.-)', () => {
  it('undermine with strict preference on the targeted premise: defeat propagates to containing arg', () => {
    const src = [
      '[#p] A premise { preference: 0.5 }',
      '[#a] An attacker { preference: 1 }',
      '([#thesis]) -> [#p].',
      '[#a] -.- [#p].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
    expect(solved.labels.get(argKeys[0]!)).toBe('out');
  });

  it('undermine with equal preference on premise: not a defeat', () => {
    const src = [
      '[#p] A premise { preference: 0 }',
      '[#a] An attacker { preference: 0 }',
      '([#thesis]) -> [#p].',
      '[#a] -.- [#p].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
    expect(solved.labels.get(argKeys[0]!)).toBe('undec');
  });

  it('undermine uses the premise preference, not the containing argument preference', () => {
    // premise has low preference, attacker has high, but the containing
    // argument has higher than attacker. The undermine should still succeed
    // because the *premise* is what is attacked.
    const src = [
      '[#p] A premise { preference: 0.1 }',
      '[#a] An attacker { preference: 0.5 }',
      '([#thesis]) -> [#p]. { preference: 1 }', // containing arg pref > attacker pref
      '[#a] -.- [#p].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
    expect(solved.labels.get(argKeys[0]!)).toBe('out');
  });
});

describe('solveAspic — non-attack arrows', () => {
  it('drops support edges with a warning', () => {
    const src = '[#a] A fact.\n[#b] B fact.\n[#a] --> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.warnings.some((w) => w.includes('dropped support'))).toBe(true);
    // a, b are unattacked → in
    expect(solved.labels.get('a')).toBe('in');
    expect(solved.labels.get('b')).toBe('in');
  });

  it('drops equivalence edges with a warning', () => {
    const src = '[#a] A fact.\n[#b] B fact.\n[#a] <-> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.warnings.some((w) => w.includes('dropped equivalence'))).toBe(true);
  });

  it('drops concession edges with a warning', () => {
    const src = '[#a] A fact.\n[#b] B fact.\n[#a] ~> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.warnings.some((w) => w.includes('dropped concession'))).toBe(true);
  });

  it('drops qualification edges with a warning', () => {
    const src = '[#a] A fact.\n[#b] B fact.\n[#a] ?> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.warnings.some((w) => w.includes('dropped qualification'))).toBe(true);
  });
});

describe('solveAspic — untuned warning', () => {
  it('emits the untuned warning when non-attack arrows exist and no preferences are declared', () => {
    const src = '[#a] A fact.\n[#b] B fact.\n[#a] --> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(
      solved.warnings.some((w) =>
        w.includes('non-attack edge(s) dropped and 0 preference values declared'),
      ),
    ).toBe(true);
  });

  it('does NOT emit the untuned warning when at least one preference is declared', () => {
    // Corrected: facts use no period before `{ preference: ... }`. The parser
    // terminates the claim at the period, so `[#a] A fact. { ... }` would
    // attach the attribute block to nothing.
    const src = '[#a] A fact { preference: 0.5 }\n[#b] B fact.\n[#a] --> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(
      solved.warnings.some((w) =>
        w.includes('non-attack edge(s) dropped and 0 preference values declared'),
      ),
    ).toBe(false);
  });
});

describe('solveAspic — edge cases', () => {
  it('two top-level arguments are both keyed (sub-arg premise nesting does not round-trip via the public parser)', () => {
    // The plan's source `'([#thesis]) -> ([#inner]).'` does not parse: nested-
    // argument premises require their own arrow (`([#A]) -> ([#B]) -> [#C]`),
    // which only the unit-level `parseArgument` produces. The public `parse()`
    // rejects the bare `([#inner])` premise with "Argument requires at least
    // one premise". What we can pin here is the count of arg-keyed nodes when
    // two top-level Arguments are present — the load-bearing property of the
    // `keyNodes` pass.
    const src = '([#inner]) -> [#y].\n([#thesis]) -> [#z].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
    expect(argKeys.length).toBe(2);
  });

  it('disjunction in premise position is treated as opaque (first atom only)', () => {
    const src = '([#thesis]) -> ([#a] | [#b]).';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    // No crash, the argument is keyed under one arg:L:C key.
    const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
    expect(argKeys.length).toBeGreaterThanOrEqual(1);
  });

  it('dangling edge emits a warning and does not crash', () => {
    const src = '[#a] A fact.\n[#a] --x [#nonexistent].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    expect(() => solveAspic(result.ast)).not.toThrow();
    const solved = solveAspic(result.ast);
    expect(solved.warnings.some((w) => w.includes('dangling'))).toBe(true);
  });

  it('self-defeat-shape: an arg whose premise is rebutted by a less-preferred fact is keyed but undecided', () => {
    // Corrected: argument attribute blocks need `.` before `{` (the parser
    // would otherwise require the period right after the premise list).
    // attacker `a` (pref 0 default) < target `thesis` (pref 0.5) → no defeat,
    // so the argument is in `rawAttacks.target` but not in `defeats` → UNDEC.
    // This is the only thing we can pin here; a true self-defeat (`A --x A`
    // with equal preference) needs the public parser to accept argument-
    // endpoint relations, which it doesn't.
    const src = '([#thesis]) -> [#a]. { preference: 0.5 }\n[#a] --x [#thesis].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
    expect(argKeys.length).toBe(1);
    expect(solved.labels.get('thesis')).toBe('undec');
  });

  it('three-cycle of rebuttals on conclusion refs (all preference 0) leaves the cycle UNDEC', () => {
    // The argument head (in parens) is the conclusion; the bare factRef
    // after `->` is the premise. So `([#a]) -> [#x]` has conclusion `a`
    // and premise `x`. Public-parser relations only accept FactRef
    // endpoints (`[#X]`), not Argument endpoints (`([#X])`), so the cycle
    // targets conclusion refs (`a`, `b`, `c`) rather than argument
    // locations (`arg:L:C`). With all preferences 0, no rebuts succeed
    // → the attacked conclusion refs are UNDEC; the argument locations
    // are not targeted, so they fall through to IN.
    const src = [
      '([#a]) -> [#x].',
      '([#b]) -> [#y].',
      '([#c]) -> [#z].',
      '[#a] --x [#b].',
      '[#b] --x [#c].',
      '[#c] --x [#a].',
    ].join('\n');
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solveAspic(result.ast);
    expect(solved.labels.get('a')).toBe('undec');
    expect(solved.labels.get('b')).toBe('undec');
    expect(solved.labels.get('c')).toBe('undec');
    const argKeys = [...solved.labels.keys()].filter((k) => k.startsWith('arg:'));
    expect(argKeys.length).toBe(3);
    for (const k of argKeys) {
      expect(solved.labels.get(k)).toBe('in');
    }
  });

  it('M2 vs M3 sanity: bipolar labels A,B as in; ASPIC+ also labels A,B as in (support is dropped)', () => {
    // Sanity check that the two solvers behave consistently on this minimal
    // case. The more interesting divergence — bipolar propagating support
    // through a non-trivial graph while ASPIC+ drops it — is covered in
    // the bipolar and non-attack test blocks.
    const src = '[#a] A fact.\n[#b] B fact.\n[#a] --> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const bipolar = solveBipolar(result.ast);
    expect(bipolar.labels.get('a')).toBe('in');
    expect(bipolar.labels.get('b')).toBe('in');
    const aspic = solveAspic(result.ast);
    // ASPIC+ drops support, so no defeats — A and B are unattacked.
    expect(aspic.labels.get('a')).toBe('in');
    expect(aspic.labels.get('b')).toBe('in');
  });
});
