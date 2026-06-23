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
  it('renders facts, relations, and rules into flowchart TD', () => {
    const out = renderMermaid(
      parseOk(
        '[#co2] CO2 is a greenhouse gas\n' +
          '[#warming] Global temperatures are rising\n' +
          '[#co2] --> [#warming]\n' +
          '[#warming] --x [#denial]\n' +
          '[#warming] :- [#co2], [#denial].\n',
      ),
    );

    expect(out.startsWith('flowchart TD\n')).toBe(true);
    expect(out).toContain('co2["CO2 is a greenhouse gas"]');
    expect(out).toContain('warming["Global temperatures are rising"]');
    expect(out).toContain('denial["denial"]');
    expect(out).toContain('co2 -->|support| warming');
    expect(out).toContain('warming -.->|attack| denial');
    expect(out).toContain('warming ==>|rule| co2');
    expect(out).toContain('warming ==>|rule| denial');
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
});
