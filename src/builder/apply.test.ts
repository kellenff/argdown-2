import { describe, expect, it } from 'vitest';

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
    const arg = withInf.document.elements.find((e) => e.kind === 'argument');
    expect(arg && arg.kind === 'argument' && arg.inferences[0]?.premises[0]).toBe(
      'Absolute freedom is a right',
    );
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
