import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { apply, emptyDocument } from './builder/apply.js';
import { softParse } from './builder/soft-parse.js';
import { writeEdn } from './edn-write.js';
import { load } from './index.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'builder/fixtures');

describe('writeEdn', () => {
  it('round-trips a builder-built attack document through load', () => {
    let doc = emptyDocument();
    doc = apply(doc, { type: 'add_statement', id: 'a', text: 'Alpha' }).document;
    doc = apply(doc, { type: 'add_statement', id: 'b', text: 'Beta' }).document;
    doc = apply(doc, {
      type: 'add_relation',
      kind: 'attack',
      from: 'a',
      to: 'b',
    }).document;
    const edn = writeEdn(doc);
    const loaded = load(edn);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.document.elements).toHaveLength(3);
  });

  it('loads the hand fixture', () => {
    const source = readFileSync(join(fixtureDir, 'two-statements-attack.edn'), 'utf8');
    expect(load(source).ok).toBe(true);
  });

  it('round-trips unresolved prose refs through softParse', () => {
    let doc = emptyDocument();
    doc = apply(doc, {
      type: 'add_argument',
      id: 'freedom',
      description: 'Freedom argument',
    }).document;
    doc = apply(doc, {
      type: 'add_inference',
      argumentId: 'freedom',
      id: 'freedom-main',
      premises: ['Absolute freedom is a right'],
      conclusion: 'Censorship is wrong',
    }).document;
    const edn = writeEdn(doc);
    const parsed = softParse(edn);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const arg = parsed.document.elements.find((e) => e.kind === 'argument');
    expect(arg?.kind).toBe('argument');
    if (arg?.kind !== 'argument') return;
    expect(arg.inferences[0]).toMatchObject({
      premises: ['absolute-freedom-is-a-right'],
      conclusion: 'censorship-is-wrong',
    });
  });

  it('round-trips an argument with inference through load', () => {
    let doc = emptyDocument();
    doc = apply(doc, { type: 'add_statement', id: 'premise-a', text: 'Premise A' }).document;
    doc = apply(doc, { type: 'add_statement', id: 'premise-b', text: 'Premise B' }).document;
    doc = apply(doc, { type: 'add_statement', id: 'conclusion', text: 'Conclusion' }).document;
    doc = apply(doc, {
      type: 'add_argument',
      id: 'main-argument',
      description: 'A simple inference chain',
      tags: ['pro'],
    }).document;
    doc = apply(doc, {
      type: 'add_inference',
      argumentId: 'main-argument',
      id: 'main-inference',
      premises: ['premise-a', 'premise-b'],
      conclusion: 'conclusion',
      rules: ['modus-ponens'],
    }).document;
    const edn = writeEdn(doc);
    const loaded = load(edn);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.document.elements).toHaveLength(4);
    const arg = loaded.document.elements.find((e) => e.kind === 'argument');
    expect(arg?.kind).toBe('argument');
    if (arg?.kind !== 'argument') return;
    expect(arg.inferences).toHaveLength(1);
    expect(arg.inferences[0]).toMatchObject({
      id: 'main-inference',
      premises: ['premise-a', 'premise-b'],
      conclusion: 'conclusion',
      rules: ['modus-ponens'],
    });
  });
});
