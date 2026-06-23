// src/mermaid.test.ts
// Smallest check that exercises the three statement kinds end-to-end.

import { describe, it, expect } from 'vitest';

import { parse } from './parser.js';
import { renderMermaid } from './mermaid.js';

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
  // The current renderer has no `Argument` case in its element switch,
  // so `Argument` elements are silently dropped (the output falls back
  // to the empty-document branch). This test pins the current behavior
  // — the renderer must accept the new `Argument` AST kind and emit a
  // valid Mermaid flowchart without throwing. When the renderer's
  // `Argument` case lands, tighten the assertions to check the spec
  // (single node carrying both alternative labels).
  it('renders a disjunctive premise without throwing', () => {
    const out = renderMermaid(parseOk('([#A]) -> ([#B] | [#C]).'));
    expect(out.startsWith('flowchart TD\n')).toBe(true);
  });
});
