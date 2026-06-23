// src/tokens.test.ts
// One assertion per token: lex a short input, verify the token type and image.

import { describe, it, expect } from 'vitest';

import { ArgdownLexer } from './tokens.js';

const lexOne = (source: string) => {
  const result = ArgdownLexer.tokenize(source);
  expect(result.errors).toEqual([]);
  const first = result.tokens[0];
  if (!first) throw new Error(`no tokens for input: ${JSON.stringify(source)}`);
  return first;
};

describe('token vocabulary', () => {
  // ----- Multi-character operators -----

  it('lexes RuleOp (":-")', () => {
    expect(lexOne(':-').tokenType.name).toBe('RuleOp');
  });

  it('lexes Support ("-->")', () => {
    expect(lexOne('-->').tokenType.name).toBe('Support');
  });

  it('lexes Arrow ("->")', () => {
    expect(lexOne('->').tokenType.name).toBe('Arrow');
  });

  it('prefers Arrow ("->") over Support prefix', () => {
    // Sanity: `->` lexes as a single Arrow token, not as the start of `-->`.
    const result = ArgdownLexer.tokenize('->');
    expect(result.errors).toEqual([]);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]!.tokenType.name).toBe('Arrow');
    expect(result.tokens[0]!.image).toBe('->');
  });

  it('lexes Attack ("--x")', () => {
    expect(lexOne('--x').tokenType.name).toBe('Attack');
  });

  it('lexes Undercut ("-.->")', () => {
    expect(lexOne('-.->').tokenType.name).toBe('Undercut');
  });

  it('lexes Undermine ("-.-")', () => {
    expect(lexOne('-.-').tokenType.name).toBe('Undermine');
  });

  it('lexes Concession ("~>")', () => {
    expect(lexOne('~>').tokenType.name).toBe('Concession');
  });

  it('lexes Qualification ("?>")', () => {
    expect(lexOne('?>').tokenType.name).toBe('Qualification');
  });

  it('lexes Equivalence ("<->")', () => {
    expect(lexOne('<->').tokenType.name).toBe('Equivalence');
  });

  it('lexes FrontmatterDelim ("===")', () => {
    expect(lexOne('===').tokenType.name).toBe('FrontmatterDelim');
  });

  it('lexes BlockMarker (":::")', () => {
    expect(lexOne(':::').tokenType.name).toBe('BlockMarker');
  });

  it('lexes LineComment ("//..." capturing body)', () => {
    const t = lexOne('// foo bar');
    expect(t.tokenType.name).toBe('LineComment');
    expect(t.image).toBe('// foo bar');
  });

  it('lexes BlockComment ("/* ... */" capturing body, can span lines)', () => {
    const t = lexOne('/* hi\nthere */');
    expect(t.tokenType.name).toBe('BlockComment');
    expect(t.image).toBe('/* hi\nthere */');
  });

  it('lexes HeadingMarker with 1-6 hashes', () => {
    expect(lexOne('#').tokenType.name).toBe('HeadingMarker');
    expect(lexOne('######').tokenType.name).toBe('HeadingMarker');
  });

  // ----- Keywords -----

  it.each(['true', 'false', 'null', 'meta', 'evidence', 'position', 'stakeholder', 'domain'])(
    'lexes keyword "%s"',
    (kw) => {
      expect(lexOne(kw).tokenType.name).toBe(kw[0]!.toUpperCase() + kw.slice(1));
    },
  );

  // ----- Composite literals -----

  it('lexes Identifier', () => {
    const t = lexOne('foo_bar-123');
    expect(t.tokenType.name).toBe('Identifier');
    expect(t.image).toBe('foo_bar-123');
  });

  it('lexes integer Number', () => {
    expect(lexOne('42').tokenType.name).toBe('Number');
  });

  it('lexes negative Number', () => {
    expect(lexOne('-3.14').tokenType.name).toBe('Number');
  });

  it('lexes Number with exponent', () => {
    expect(lexOne('1.5e-3').tokenType.name).toBe('Number');
  });

  it('lexes String with escapes', () => {
    const t = lexOne('"hello \\"world\\""');
    expect(t.tokenType.name).toBe('String');
    expect(t.image).toBe('"hello \\"world\\""');
  });

  // ----- Single-character punctuation -----

  it.each(['[', ']', '{', '}', '(', ')', ':', ',', '.', '-'])('lexes punctuation "%s"', (ch) => {
    expect(lexOne(ch).tokenType.name).toBe(
      ch === ':'
        ? 'Colon'
        : ch === ','
          ? 'Comma'
          : ch === '.'
            ? 'Period'
            : ch === '-'
              ? 'Minus'
              : ch === '['
                ? 'LBrack'
                : ch === ']'
                  ? 'RBrack'
                  : ch === '{'
                    ? 'LBrace'
                    : ch === '}'
                      ? 'RBrace'
                      : ch === '('
                        ? 'LParen'
                        : 'RParen',
    );
  });

  it('lexes Pipe ("|")', () => {
    const lexResult = ArgdownLexer.tokenize('|');
    expect(lexResult.tokens).toHaveLength(1);
    expect(lexResult.tokens[0]?.tokenType?.name).toBe('Pipe');
  });

  // ----- Whitespace is skipped -----

  it('skips whitespace', () => {
    const result = ArgdownLexer.tokenize('   \t  ');
    expect(result.tokens).toHaveLength(0);
  });

  it('skips newlines', () => {
    const result = ArgdownLexer.tokenize('\n\r\n');
    expect(result.tokens).toHaveLength(0);
  });

  // ----- Longest-match precedence -----

  it('prefers ":::" over "::"', () => {
    expect(lexOne(':::').tokenType.name).toBe('BlockMarker');
  });

  it('prefers ":-" over ":"', () => {
    expect(lexOne(':-').tokenType.name).toBe('RuleOp');
  });

  it('prefers "===" over "=="', () => {
    expect(lexOne('===').tokenType.name).toBe('FrontmatterDelim');
  });
});
