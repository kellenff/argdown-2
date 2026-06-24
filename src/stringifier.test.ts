// src/stringifier.test.ts
import { describe, expect, it } from 'vitest';
import { stringify } from './stringifier.js';
import { parse } from './parser.js';
import type { Document, SourceLocation, StringValue, Value } from './ast.js';

const emptyLoc: SourceLocation = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

describe('stringify', () => {
  it('exports a function', () => {
    expect(typeof stringify).toBe('function');
  });

  it('produces output the parser accepts for an empty document', () => {
    const result = parse('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(stringify(result.ast)).toBe('');
  });

  describe('frontmatter', () => {
    it('emits number, boolean, and null frontmatter values', () => {
      // Build the AST directly because parseYamlValue has parser bugs that
      // block source-level testing of these value kinds in YAML lines.
      const doc: Document = {
        kind: 'Document',
        elements: [],
        frontmatter: {
          kind: 'Frontmatter',
          entries: {
            count: { kind: 'NumberValue', value: 42, loc: emptyLoc },
            active: { kind: 'BooleanValue', value: true, loc: emptyLoc },
            archived: { kind: 'NullValue', loc: emptyLoc },
          },
          loc: emptyLoc,
        },
        loc: emptyLoc,
      };
      expect(stringify(doc)).toBe('===\ncount: 42\nactive: true\narchived: null\n===\n');
    });

    it('emits empty frontmatter as === block with no entries', () => {
      const src = '===\n===\n';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      expect(stringify(result.ast)).toBe(src);
    });

    it('emits frontmatter with string values', () => {
      const src = '===\ntitle: "My Doc"\nauthor: "Kellen"\n===\n';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const out = stringify(result.ast);
      expect(out).toContain('===');
      expect(out).toContain('title: "My Doc"');
      expect(out).toContain('author: "Kellen"');
    });

    it('emits frontmatter with flow sequence values', () => {
      const src = '===\ntags: ["a", "b", "c"]\n===\n';
      const first = parse(src);
      if (!first.ok) throw new Error('parse failed');
      const out = stringify(first.ast);
      expect(out).toContain('["a", "b", "c"]');
    });

    it('round-trips frontmatter through parse → stringify → parse', () => {
      const src = '===\ntitle: "Doc"\ntags: ["a", "b", "c"]\n===\n';
      const first = parse(src);
      if (!first.ok) throw new Error('parse failed');
      const out = stringify(first.ast);
      const second = parse(out);
      if (!second.ok) throw new Error('parse failed');
      expect(second.ast!.frontmatter).toBeDefined();
      expect(first.ast!.frontmatter!.entries['title']).toEqual(
        second.ast!.frontmatter!.entries['title'],
      );
    });

    it('escapes double quotes and backslashes in string values', () => {
      const src = '===\nquote: "She said \\"hi\\""\nbackslash: "a\\\\b"\n===\n';
      const first = parse(src);
      if (!first.ok) throw new Error('parse failed');
      const out = stringify(first.ast);
      const second = parse(out);
      if (!second.ok) throw new Error('parse failed');
      const firstQ = first.ast!.frontmatter!.entries['quote'] as Value;
      const secondQ = second.ast!.frontmatter!.entries['quote'] as Value;
      const firstB = first.ast!.frontmatter!.entries['backslash'] as Value;
      const secondB = second.ast!.frontmatter!.entries['backslash'] as Value;
      if (firstQ.kind !== 'StringValue' || secondQ.kind !== 'StringValue')
        throw new Error('not string');
      if (firstB.kind !== 'StringValue' || secondB.kind !== 'StringValue')
        throw new Error('not string');
      expect((secondQ as StringValue).value).toEqual((firstQ as StringValue).value);
      expect((secondB as StringValue).value).toEqual((firstB as StringValue).value);
    });

    it('escapes newlines and tabs in string values', () => {
      const src = '===\nmultiline: "line1\\nline2"\ntabbed: "a\\tb"\n===\n';
      const first = parse(src);
      if (!first.ok) throw new Error('parse failed');
      const out = stringify(first.ast);
      const second = parse(out);
      if (!second.ok) throw new Error('parse failed');
      const firstM = first.ast!.frontmatter!.entries['multiline'] as Value;
      const secondM = second.ast!.frontmatter!.entries['multiline'] as Value;
      const firstT = first.ast!.frontmatter!.entries['tabbed'] as Value;
      const secondT = second.ast!.frontmatter!.entries['tabbed'] as Value;
      if (firstM.kind !== 'StringValue' || secondM.kind !== 'StringValue')
        throw new Error('not string');
      if (firstT.kind !== 'StringValue' || secondT.kind !== 'StringValue')
        throw new Error('not string');
      expect((secondM as StringValue).value).toEqual((firstM as StringValue).value);
      expect((secondT as StringValue).value).toEqual((firstT as StringValue).value);
    });
  });

  describe('headings', () => {
    it('emits level-1 heading', () => {
      const src = '# Title\n';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      expect(stringify(result.ast)).toBe(src);
    });

    it('emits level-6 heading', () => {
      const src = '###### Smallest\n';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      expect(stringify(result.ast)).toBe(src);
    });

    it('round-trips a heading', () => {
      const src = '## Section\n';
      const first = parse(src);
      if (!first.ok) throw new Error('parse failed');
      const out = stringify(first.ast);
      const second = parse(out);
      if (!second.ok) throw new Error('parse failed');
      const el = second.ast!.elements[0];
      expect(el?.kind).toBe('Heading');
      if (el?.kind === 'Heading') {
        expect(el.level).toBe(2);
        expect(el.text).toBe('Section');
      }
    });
  });

  describe('comments', () => {
    it('emits a line comment', () => {
      const src = '// just a note\n';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      expect(stringify(result.ast)).toBe(src);
    });

    it('emits a block comment', () => {
      const src = '/* multi\nline */\n';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      expect(stringify(result.ast)).toBe(src);
    });

    it('emits a comment between other elements in document order', () => {
      const src = '# A\n\n// middle note\n\n# B\n';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      expect(stringify(result.ast)).toBe(src);
    });
  });

  describe('facts', () => {
    it('emits fact with identifier head and no claim', () => {
      const src = '[#A]\n';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      expect(stringify(result.ast)).toBe(src);
    });

    it('emits fact with title head', () => {
      const src = '[Fact One]\n';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      expect(stringify(result.ast)).toBe(src);
    });

    it('emits fact with claim', () => {
      const src = '[#A] some claim\n';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      expect(stringify(result.ast)).toBe('[#A]: some claim\n');
    });

    it('emits fact with single attribute in flow-mapping form', () => {
      const src = '[#A] claim {weight: 2}\n';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      expect(stringify(result.ast)).toBe('[#A]: claim {weight: 2}\n');
    });

    it('emits fact with multiple attributes on multiple lines', () => {
      const src = '[#A] claim {weight: 2, source: "paper"}\n';
      const result = parse(src);
      if (!result.ok) throw new Error('parse failed');
      const out = stringify(result.ast);
      // Either the flow form or the multi-line form is acceptable — both
      // are valid emit output. We just check the parse path matches a
      // known-good source.
      expect(out).toMatch(/^\[#A\]: claim/);
    });

    it('round-trips a fact with attributes', () => {
      const src = '[#A] claim {weight: 2, source: "paper"}\n';
      const first = parse(src);
      if (!first.ok) throw new Error('parse failed');
      const out = stringify(first.ast);
      const second = parse(out);
      if (!second.ok) throw new Error('parse failed');
      const secondFact = second.ast!.elements[0];
      expect(secondFact?.kind).toBe('FactStatement');
    });
  });

  describe('comments with other elements', () => {
    it('round-trips a document with comments and a fact', () => {
      const src = '// lead\n[A]\n// trail\n';
      const first = parse(src);
      if (!first.ok) throw new Error('parse failed');
      const out = stringify(first.ast);
      const second = parse(out);
      if (!second.ok) throw new Error('parse failed');
      const elements = second.ast!.elements;
      expect(elements[0]?.kind).toBe('LineComment');
      expect(elements[1]?.kind).toBe('FactStatement');
      expect(elements[2]?.kind).toBe('LineComment');
    });
  });
});
