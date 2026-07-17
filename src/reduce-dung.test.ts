import { describe, expect, it } from 'vitest';

import type { EntityId, GroundedDocument, InferenceId, TheoryElement } from './model.js';
import { GROUNDED_SOLVER_TAG } from './model.js';
import { reduceToDung } from './reduce-dung.js';

const id = (value: string) => value as EntityId;
const inferenceId = (value: string) => value as InferenceId;
const statement = (value: string): TheoryElement => ({
  extra: [],
  id: id(value),
  kind: 'statement',
  tags: [],
});

function document(...elements: readonly TheoryElement[]): GroundedDocument {
  return { solver: GROUNDED_SOLVER_TAG, elements };
}

describe('reduceToDung', () => {
  it('includes statements and arguments but not inference ids as nodes', () => {
    const result = reduceToDung(
      document(statement('p'), statement('c'), {
        extra: [],
        id: id('a'),
        inferences: [
          {
            conclusion: id('c'),
            extra: [],
            id: inferenceId('i'),
            kind: 'inference',
            premises: [id('p')],
            rules: [],
          },
        ],
        kind: 'argument',
        tags: [],
      }),
    );
    expect([...result.framework.nodes]).toEqual([id('p'), id('c'), id('a')]);
  });

  it('adds directed attacks and mutual contradiction attacks', () => {
    const result = reduceToDung(
      document(
        statement('a'),
        statement('b'),
        statement('c'),
        { extra: [], from: id('a'), kind: 'attack', to: id('b') },
        { extra: [], from: id('b'), kind: 'contradiction', to: id('c') },
      ),
    );
    expect(result.framework.attackersByTarget.get(id('b'))).toEqual(new Set([id('a'), id('c')]));
    expect(result.framework.attackersByTarget.get(id('c'))).toEqual(new Set([id('b')]));
  });

  it('omits support and undercut with one warning each', () => {
    const result = reduceToDung(
      document(
        statement('a'),
        statement('b'),
        { extra: [], from: id('a'), kind: 'support', to: id('b') },
        { extra: [], from: id('a'), kind: 'undercut', to: inferenceId('i') },
      ),
    );
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'reduce/support-omitted',
      'reduce/undercut-omitted',
    ]);
    expect(result.framework.attackersByTarget.get(id('b'))).toEqual(new Set());
  });

  it('is independent of theory element order', () => {
    const attack: TheoryElement = {
      extra: [],
      from: id('a'),
      kind: 'attack',
      to: id('b'),
    };
    const first = reduceToDung(document(statement('a'), statement('b'), attack));
    const second = reduceToDung(document(attack, statement('b'), statement('a')));
    expect(first.framework.nodes).toEqual(second.framework.nodes);
    expect(first.framework.attackersByTarget).toEqual(second.framework.attackersByTarget);
  });
});
