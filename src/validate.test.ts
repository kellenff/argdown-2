import { expect } from '@std/expect';
import { describe, it } from '@std/testing/bdd';

import { readEdn } from './edn.js';
import { decodeWire } from './schema.js';
import { validateCandidate } from './validate.js';

function candidate(source: string) {
  const read = readEdn(source);
  if (!read.ok) throw new Error('read failed');
  const decoded = decodeWire(read.value);
  if (!decoded.ok) throw new Error('decode failed');
  return decoded.document;
}

function codes(source: string): readonly string[] {
  const result = validateCandidate(candidate(source));
  return result.ok ? [] : result.errors.map((error) => error.code);
}

describe('validateCandidate', () => {
  it('accepts globally unique and fully resolved identities', () => {
    const result = validateCandidate(
      candidate(`
        #casualtheorics.argdown2.solver/grounded [
          #casualtheorics.argdown2.argdown/statement {:id :p}
          #casualtheorics.argdown2.argdown/statement {:id :c}
          #casualtheorics.argdown2.argdown/argument
            {:id :a :inferences [#casualtheorics.argdown2.argdown/inference
              {:id :i :premises [:p] :conclusion :c}]}
          #casualtheorics.argdown2.argdown/attack {:from :a :to :c}
          #casualtheorics.argdown2.argdown/undercut {:from :p :to :i}
        ]
      `),
    );
    expect(result.ok).toBe(true);
  });

  it('collects duplicate and dangling-reference errors in one pass', () => {
    const result = validateCandidate(
      candidate(`
        #casualtheorics.argdown2.solver/grounded [
          #casualtheorics.argdown2.argdown/statement {:id :same}
          #casualtheorics.argdown2.argdown/argument {:id :same}
          #casualtheorics.argdown2.argdown/attack {:from :missing-a :to :missing-b}
        ]
      `),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toEqual([
      'semantic/duplicate-id',
      'semantic/missing-reference',
      'semantic/missing-reference',
    ]);
  });

  for (const [name, relation] of [
    [
      'attack endpoint cannot be an inference',
      '#casualtheorics.argdown2.argdown/attack {:from :i :to :s}',
    ],
    [
      'undercut target must be an inference',
      '#casualtheorics.argdown2.argdown/undercut {:from :s :to :s}',
    ],
  ] as const) {
    it(`rejects ${name}`, () => {
      const source = `
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/statement {:id :s}
        #casualtheorics.argdown2.argdown/argument
          {:id :a :inferences [#casualtheorics.argdown2.argdown/inference
            {:id :i :premises [:s] :conclusion :s}]}
        ${relation}
      ]
    `;
      expect(codes(source)).toContain('semantic/invalid-endpoint');
    });
  }

  it('requires inference premises and conclusions to reference statements', () => {
    const source = `
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/argument {:id :a}
        #casualtheorics.argdown2.argdown/argument
          {:id :b :inferences [#casualtheorics.argdown2.argdown/inference
            {:id :i :premises [:a] :conclusion :a}]}
      ]
    `;
    expect(codes(source)).toEqual([
      'semantic/invalid-reference-kind',
      'semantic/invalid-reference-kind',
    ]);
  });
});
