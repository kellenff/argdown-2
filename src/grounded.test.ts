import { describe, expect, it } from 'vitest';

import { groundedLabels } from './grounded.js';
import type { DungFramework, EntityId, Label } from './model.js';

const id = (value: string) => value as EntityId;

function framework(
  nodes: readonly string[],
  edges: readonly (readonly [string, string])[],
): DungFramework {
  const nodeSet = new Set(nodes.map(id));
  const attackersByTarget = new Map<EntityId, Set<EntityId>>();
  for (const node of nodeSet) attackersByTarget.set(node, new Set());
  for (const [from, to] of edges) attackersByTarget.get(id(to))?.add(id(from));
  return { nodes: nodeSet, attackersByTarget };
}

function labelsOf(
  nodes: readonly string[],
  edges: readonly (readonly [string, string])[],
): Readonly<Record<string, Label>> {
  return Object.fromEntries(groundedLabels(framework(nodes, edges)));
}

describe('groundedLabels', () => {
  it('labels an empty framework with an empty map', () => {
    expect(groundedLabels(framework([], [])).size).toBe(0);
  });

  it('labels unattacked nodes IN and their targets OUT', () => {
    expect(labelsOf(['a', 'b'], [['a', 'b']])).toEqual({ a: 'in', b: 'out' });
  });

  it('labels a lone self-attacker UNDEC', () => {
    expect(labelsOf(['a'], [['a', 'a']])).toEqual({ a: 'undec' });
  });

  it('labels mutual and odd cycles UNDEC', () => {
    expect(
      labelsOf(
        ['a', 'b'],
        [
          ['a', 'b'],
          ['b', 'a'],
        ],
      ),
    ).toEqual({
      a: 'undec',
      b: 'undec',
    });
    expect(
      labelsOf(
        ['a', 'b', 'c'],
        [
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'a'],
        ],
      ),
    ).toEqual({
      a: 'undec',
      b: 'undec',
      c: 'undec',
    });
  });

  it('labels OUT when any attacker is IN even if another attacker is OUT', () => {
    expect(
      labelsOf(
        ['a', 'b', 'c', 'd'],
        [
          ['a', 'b'],
          ['a', 'd'],
          ['a', 'c'],
          ['d', 'c'],
        ],
      ),
    ).toEqual({ a: 'in', b: 'out', c: 'out', d: 'out' });
  });

  it('labels a node IN only after all of its attackers become OUT', () => {
    expect(
      labelsOf(
        ['a', 'b', 'c'],
        [
          ['a', 'b'],
          ['b', 'c'],
        ],
      ),
    ).toEqual({
      a: 'in',
      b: 'out',
      c: 'in',
    });
  });
});
