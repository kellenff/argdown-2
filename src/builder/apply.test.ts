import { expect } from '@std/expect';
import { describe, it } from '@std/testing/bdd';

import { apply, emptyDocument } from './apply.js';
import { GROUNDED_SOLVER_TAG } from '../model.js';

describe('emptyDocument', () => {
  it('returns a grounded candidate with no elements', () => {
    expect(emptyDocument()).toEqual({
      solver: GROUNDED_SOLVER_TAG,
      elements: [],
    });
  });
});

describe('apply statements and arguments', () => {
  it('adds a statement', () => {
    const result = apply(emptyDocument(), {
      type: 'add_statement',
      id: 'censorship',
      text: 'Censorship is not wrong in principle.',
    });
    expect(result.refused).toBeUndefined();
    expect(result.document.elements).toHaveLength(1);
    expect(result.document.elements[0]).toMatchObject({
      kind: 'statement',
      id: 'censorship',
      text: 'Censorship is not wrong in principle.',
    });
    expect(result.diff).toContainEqual({
      op: 'add',
      kind: 'statement',
      id: 'censorship',
    });
  });

  it('refuses duplicate statement id', () => {
    const once = apply(emptyDocument(), {
      type: 'add_statement',
      id: 'a',
      text: 'one',
    });
    const twice = apply(once.document, {
      type: 'add_statement',
      id: 'a',
      text: 'two',
    });
    expect(twice.refused?.code).toBe('builder/duplicate-id');
    expect(twice.document).toEqual(once.document);
    expect(twice.diff).toEqual([]);
  });

  it('updates statement text', () => {
    const base = apply(emptyDocument(), {
      type: 'add_statement',
      id: 'a',
      text: 'old',
    });
    const updated = apply(base.document, {
      type: 'update_statement',
      id: 'a',
      text: 'new',
    });
    expect(updated.refused).toBeUndefined();
    expect(updated.document.elements[0]).toMatchObject({ text: 'new' });
  });

  it('adds argument and inference; soft-warns unresolved premise text', () => {
    const withArg = apply(emptyDocument(), {
      type: 'add_argument',
      id: 'freedom',
      description: 'Freedom argument',
    });
    const withInf = apply(withArg.document, {
      type: 'add_inference',
      argumentId: 'freedom',
      id: 'freedom-main',
      premises: ['Absolute freedom is a right'],
      conclusion: 'Censorship is wrong',
    });
    expect(withInf.refused).toBeUndefined();
    expect(withInf.warnings.length).toBeGreaterThan(0);
    expect(withInf.warnings.every((w) => w.message.includes('stored as id'))).toBe(true);
    const arg = withInf.document.elements.find((e) => e.kind === 'argument');
    expect(arg && arg.kind === 'argument' && arg.inferences[0]?.premises[0]).toBe(
      'absolute-freedom-is-a-right',
    );
    expect(arg && arg.kind === 'argument' && arg.inferences[0]?.conclusion).toBe(
      'censorship-is-wrong',
    );
  });

  it('keeps already-valid keyword ids when resolution fails', () => {
    let doc = emptyDocument();
    doc = apply(doc, { type: 'add_statement', id: 'a', text: 'A' }).document;
    const result = apply(doc, {
      type: 'add_relation',
      kind: 'attack',
      from: 'a',
      to: 'missing-target',
    });
    expect(result.refused).toBeUndefined();
    const attack = result.document.elements.find((e) => e.kind === 'attack');
    expect(attack && attack.kind === 'attack' && attack.to).toBe('missing-target');
  });

  it('resolves premise refs to ids when statements exist', () => {
    let doc = emptyDocument();
    doc = apply(doc, {
      type: 'add_statement',
      id: 'p1',
      text: 'Premise one',
    }).document;
    doc = apply(doc, {
      type: 'add_statement',
      id: 'c1',
      text: 'Conclusion one',
    }).document;
    doc = apply(doc, {
      type: 'add_argument',
      id: 'arg',
      description: 'A',
    }).document;
    const result = apply(doc, {
      type: 'add_inference',
      argumentId: 'arg',
      id: 'inf1',
      premises: ['Premise one'],
      conclusion: 'Conclusion one',
    });
    expect(result.warnings).toEqual([]);
    const arg = result.document.elements.find((e) => e.kind === 'argument');
    expect(arg && arg.kind === 'argument' && arg.inferences[0]).toMatchObject({
      premises: ['p1'],
      conclusion: 'c1',
    });
  });
});

describe('apply relations and remove', () => {
  it('adds attack with resolved ids and warns on missing endpoint', () => {
    let doc = emptyDocument();
    doc = apply(doc, {
      type: 'add_statement',
      id: 'a',
      text: 'A',
    }).document;
    const withWarn = apply(doc, {
      type: 'add_relation',
      kind: 'attack',
      from: 'a',
      to: 'missing-target',
    });
    expect(withWarn.refused).toBeUndefined();
    expect(withWarn.warnings.some((w) => w.code === 'builder/unresolved-ref')).toBe(true);
    expect(withWarn.document.elements.some((e) => e.kind === 'attack')).toBe(true);
  });

  it('adds undercut to inference id', () => {
    let doc = emptyDocument();
    doc = apply(doc, { type: 'add_statement', id: 'p', text: 'P' }).document;
    doc = apply(doc, { type: 'add_statement', id: 'c', text: 'C' }).document;
    doc = apply(doc, {
      type: 'add_argument',
      id: 'arg',
      description: 'Arg',
    }).document;
    doc = apply(doc, {
      type: 'add_inference',
      argumentId: 'arg',
      id: 'inf1',
      premises: ['p'],
      conclusion: 'c',
    }).document;
    doc = apply(doc, {
      type: 'add_statement',
      id: 'attacker',
      text: 'Attacker',
    }).document;
    const result = apply(doc, {
      type: 'add_relation',
      kind: 'undercut',
      from: 'attacker',
      to: 'inf1',
    });
    expect(result.refused).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.document.elements.at(-1)).toMatchObject({
      kind: 'undercut',
      from: 'attacker',
      to: 'inf1',
    });
  });

  it('removes statement by id', () => {
    const base = apply(emptyDocument(), {
      type: 'add_statement',
      id: 'a',
      text: 'A',
    });
    const removed = apply(base.document, { type: 'remove_element', id: 'a' });
    expect(removed.document.elements).toEqual([]);
  });

  it('removes relation by kind+from+to', () => {
    let doc = emptyDocument();
    doc = apply(doc, { type: 'add_statement', id: 'a', text: 'A' }).document;
    doc = apply(doc, { type: 'add_statement', id: 'b', text: 'B' }).document;
    doc = apply(doc, {
      type: 'add_relation',
      kind: 'attack',
      from: 'a',
      to: 'b',
    }).document;
    const removed = apply(doc, {
      type: 'remove_relation',
      kind: 'attack',
      from: 'a',
      to: 'b',
    });
    expect(removed.document.elements.every((e) => e.kind !== 'attack')).toBe(true);
  });

  it('refuses remove of unknown id', () => {
    const result = apply(emptyDocument(), {
      type: 'remove_element',
      id: 'nope',
    });
    expect(result.refused?.code).toBe('builder/missing-id');
  });
});
