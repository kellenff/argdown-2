import { expect } from '@std/expect';
import { describe, it } from '@std/testing/bdd';

import { emptyDocument } from './apply.js';
import { resolveRef } from './resolve-ref.js';
import type { CandidateDocument } from '../model.js';

function docWithStatements(): CandidateDocument {
  return {
    ...emptyDocument(),
    elements: [
      {
        kind: 'statement',
        id: 'a',
        text: 'Alpha claim',
        tags: [],
        extra: [],
      },
      {
        kind: 'statement',
        id: 'b',
        text: 'Beta claim',
        tags: [],
        extra: [],
      },
      {
        kind: 'statement',
        id: 'c',
        text: 'Alpha claim',
        tags: [],
        extra: [],
      },
      {
        kind: 'argument',
        id: 'arg1',
        description: 'Arg one',
        tags: [],
        inferences: [],
        extra: [],
      },
    ],
  };
}

describe('resolveRef', () => {
  it('resolves by id first', () => {
    const r = resolveRef(docWithStatements(), 'a');
    expect(r).toEqual({ ok: true, id: 'a', via: 'id' });
  });

  it('resolves by unique statement text', () => {
    const r = resolveRef(docWithStatements(), 'Beta claim');
    expect(r).toEqual({ ok: true, id: 'b', via: 'text' });
  });

  it('resolves by unique argument description', () => {
    const r = resolveRef(docWithStatements(), 'Arg one');
    expect(r).toEqual({ ok: true, id: 'arg1', via: 'text' });
  });

  it('returns ambiguous when text matches multiple', () => {
    const r = resolveRef(docWithStatements(), 'Alpha claim');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ambiguous');
  });

  it('returns missing when nothing matches', () => {
    const r = resolveRef(docWithStatements(), 'nope');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('missing');
  });
});
