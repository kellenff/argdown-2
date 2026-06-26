// src/mermaid.test.ts
// Smallest check that exercises the three statement kinds end-to-end.

import { describe, it, expect } from 'vitest';

import { parse } from './parser.js';
import { renderMermaid } from './mermaid.js';
import { solve, solveBipolar } from './solver.js';

function parseOk(source: string) {
  const r = parse(source);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.ast;
}

describe('renderMermaid', () => {
  it('renders facts and relations into flowchart TD', () => {
    // Task 13: the `:-` rule line was removed — the `:-` syntax is now a
    // hard-break parse error. The cycle-2 Mermaid regression test for the
    // new `->` argument syntax lands in Task 20.
    const out = renderMermaid(
      parseOk(
        '[#co2] CO2 is a greenhouse gas\n' +
          '[#warming] Global temperatures are rising\n' +
          '[#co2] --> [#warming]\n' +
          '[#warming] --x [#denial]\n',
      ),
    );

    expect(out.startsWith('flowchart TD\n')).toBe(true);
    expect(out).toContain('co2["CO2 is a greenhouse gas"]');
    expect(out).toContain('warming["Global temperatures are rising"]');
    expect(out).toContain('denial["denial"]');
    expect(out).toContain('co2 -->|support| warming');
    expect(out).toContain('warming -.->|attack| denial');
  });

  it('dedupes the same FactHead to a single node', () => {
    const out = renderMermaid(parseOk('[#a]\n[#a] --> [#b]\n[#b] --x [#a]'));
    // exactly one declaration line for `a`
    expect(out.match(/^    a\["/gm)?.length).toBe(1);
  });

  it('handles empty documents gracefully', () => {
    const out = renderMermaid(parseOk(''));
    expect(out).toContain('(no statements)');
  });

  // Task 20: regression test for disjunction premise rendering. The spec
  // (rich-arguments-design.md, "Mermaid regression") requires the
  // disjunction `([#B] | [#C])` to render as a single node with the
  // alternative labels, distinct from a multi-premise relation.
  //
  // Task 21: the renderer now has an `Argument` case in its element
  // switch. The conclusion renders as a node, each premise renders as
  // a node (disjunctions collapse into a single node carrying both
  // alternative labels), and edges go from each premise to the
  // conclusion.
  it('renders a disjunctive premise as a single combined node', () => {
    const out = renderMermaid(parseOk('([#A]) -> ([#B] | [#C]).'));
    expect(out.startsWith('flowchart TD\n')).toBe(true);
    // Conclusion renders as its own node.
    expect(out).toContain('A["A"]');
    // Disjunction collapses into a single node carrying both labels
    // combined — no separate B or C node declarations (B and C only
    // appear inside the disjunction in the source).
    expect(out).toContain('B_or_C["B or C"]');
    // Edge from the disjunction node to the conclusion.
    expect(out).toContain('B_or_C -->|support| A');
    // Exactly one synthetic disjunction declaration (not two).
    expect(out.match(/^    B_or_C\["/gm)?.length).toBe(1);
  });

  it('renders an atom-premise argument with one edge per premise', () => {
    // Multi-premise comma form: conclusion A, premises B and C.
    const out = renderMermaid(parseOk('([#A]) -> [#B], [#C].'));
    expect(out).toContain('A["A"]');
    expect(out).toContain('B -->|support| A');
    expect(out).toContain('C -->|support| A');
  });
});

describe('renderMermaid with labels', () => {
  it('still produces output for documents without labels arg', () => {
    const result = parse('[#a].\n[#b].\n[#a] --> [#b].');
    if (!result.ok) throw new Error('parse failed');
    const out = renderMermaid(result.ast);
    expect(out).toContain('flowchart');
    expect(out).not.toContain('classDef');
  });

  it('appends classDef and class lines when labels are provided', () => {
    const src = '[#a].\n[#b].\n[#a] --x [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solve(result.ast);
    const out = renderMermaid(result.ast, solved.labels);
    expect(out).toContain('classDef in');
    expect(out).toContain('classDef out');
    expect(out).toContain('classDef undec');
    expect(out).toMatch(/class\s+\S+\s+in/);
    expect(out).toMatch(/class\s+\S+\s+out/);
  });

  it('silently skips arg:L:C keys (argument labels are not rendered in v1)', () => {
    const src = '([#a]) -> [#b].\n[#c] --x ([#a]) -> [#b].';
    const result = parse(src);
    if (!result.ok) throw new Error('parse failed');
    const solved = solve(result.ast);
    const out = renderMermaid(result.ast, solved.labels);
    expect(out).not.toContain('arg_');
  });

  it('classDefs nodes from solveBipolar output', () => {
    const src = '[#A].\n[#B].\n[#A] --> [#B].\n';
    const parsed = parse(src);
    if (!parsed.ok) throw new Error('parse failed');
    const labels = solveBipolar(parsed.ast).labels;
    const out = renderMermaid(parsed.ast, labels);
    expect(out).toContain('classDef in');
    expect(out).toMatch(/class\s+\S+\s+in/);
  });
});
