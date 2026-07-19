import { expect } from '@std/expect';
import { describe, it } from '@std/testing/bdd';

import { readEdn } from './edn.js';
import { decodeWire } from './schema.js';

function readOne(source: string): unknown {
  const result = readEdn(source);
  if (!result.ok) throw new Error(result.errors[0]?.message ?? 'read failed');
  return result.value;
}

describe('decodeWire', () => {
  it('decodes statements, arguments, nested inferences, and relations', () => {
    const root = readOne('#casualtheorics.argdown2.solver/grounded []');
    if (
      typeof root !== 'object' ||
      root === null ||
      !('tag' in root) ||
      !('value' in root) ||
      !Array.isArray(root.value)
    ) {
      throw new Error('unexpected solver root');
    }
    const value = {
      ...root,
      value: [
        readOne('#casualtheorics.argdown2.argdown/statement {:id :p :text "Premise" :custom 7}'),
        readOne('#casualtheorics.argdown2.argdown/statement {:id :c}'),
        readOne(
          '#casualtheorics.argdown2.argdown/argument {:id :a :tags #{:pro} :inferences [#casualtheorics.argdown2.argdown/inference {:id :i :premises [:p] :conclusion :c :rules [:modus-ponens]}]}',
        ),
        readOne('#casualtheorics.argdown2.argdown/attack {:from :a :to :c}'),
      ],
    };
    const result = decodeWire(value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.elements.map((element) => element.kind)).toEqual([
      'statement',
      'statement',
      'argument',
      'attack',
    ]);
    expect(result.document.elements[0]).toMatchObject({
      id: 'p',
      kind: 'statement',
      text: 'Premise',
    });
    expect(result.document.elements[0]?.extra).toHaveLength(1);
  });

  for (const [name, source, code] of [
    ['wrong root tag', '#other.solver/grounded []', 'edn/unsupported-tag'],
    ['bare root vector', '[]', 'schema/missing-root-tag'],
    [
      'unknown child tag',
      '#casualtheorics.argdown2.solver/grounded [#other/statement {:id :a}]',
      'edn/unsupported-tag',
    ],
    [
      'statement without id',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:text "x"}]',
      'schema/missing-required',
    ],
    [
      'empty inference premises',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/argument {:id :a :inferences [#casualtheorics.argdown2.argdown/inference {:id :i :premises [] :conclusion :c}]}]',
      'schema/invalid-field',
    ],
    [
      'relation without to',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/attack {:from :a}]',
      'schema/missing-required',
    ],
    [
      'statement text with the wrong type',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:id :a :text 1}]',
      'schema/invalid-field',
    ],
    [
      'tags encoded as a vector instead of a set',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:id :a :tags [:pro]}]',
      'schema/invalid-field',
    ],
  ] as const) {
    it(`rejects ${name} with a stable code`, () => {
      const result = decodeWire(readOne(source));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.some((error) => error.code === code)).toBe(true);
    });
  }

  it('preserves arbitrary EDN metadata and unknown entries', () => {
    const value = readOne(`
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/statement
          {:id :a :metadata {:nested [1 #{:x}]}
           [:rich :key] #custom/value {:x 1}}
      ]
    `);
    const result = decodeWire(value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.elements[0]?.extra).toHaveLength(1);
  });

  for (const [name, source, code] of [
    [
      'duplicate field',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:id :a :id :b}]',
      'schema/duplicate-map-key',
    ],
    [
      'duplicate nested metadata key',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:id :a :metadata {:x 1 :x 2}}]',
      'schema/duplicate-map-key',
    ],
    [
      'duplicate set value',
      '#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:id :a :tags #{:pro :pro}}]',
      'schema/duplicate-set-value',
    ],
  ] as const) {
    it(`rejects ${name} retained by the EDN reader`, () => {
      const result = decodeWire(readOne(source));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.some((error) => error.code === code)).toBe(true);
    });
  }
});
