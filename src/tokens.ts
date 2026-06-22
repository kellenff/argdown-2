// src/tokens.ts
// Chevrotain token vocabulary for Argdown Extended.

import { createToken, Lexer, type TokenType, type ILexingResult } from 'chevrotain';

// ----- Multi-character operators (longest match wins) -----

export const RuleOp: TokenType = createToken({ name: 'RuleOp', pattern: /:-/ });
export const Support: TokenType = createToken({ name: 'Support', pattern: /-->/ });
export const Attack: TokenType = createToken({ name: 'Attack', pattern: /--x/ });
export const Undercut: TokenType = createToken({ name: 'Undercut', pattern: /-\.->/ });
export const Undermine: TokenType = createToken({ name: 'Undermine', pattern: /-\.-/ });
export const Concession: TokenType = createToken({ name: 'Concession', pattern: /~>/ });
export const Qualification: TokenType = createToken({ name: 'Qualification', pattern: /\?>/ });
export const Equivalence: TokenType = createToken({ name: 'Equivalence', pattern: /<->/ });
export const FrontmatterDelim: TokenType = createToken({
  name: 'FrontmatterDelim',
  pattern: /===/,
});
export const BlockMarker: TokenType = createToken({ name: 'BlockMarker', pattern: /:::/ });

// Line comment: // followed by anything except newline (captures the whole line).
export const LineCommentTok: TokenType = createToken({
  name: 'LineComment',
  pattern: /\/\/[^\n\r]*/,
});

// Block comment: /* ... */  (non-greedy; can span lines).
export const BlockCommentTok: TokenType = createToken({
  name: 'BlockComment',
  pattern: /\/\*[\s\S]*?\*\//,
});

export const HeadingMarker: TokenType = createToken({
  name: 'HeadingMarker',
  pattern: /#{1,6}/,
  start_chars_hint: ['#'],
});

// ----- Keywords (higher priority than Identifier) -----

export const True: TokenType = createToken({ name: 'True', pattern: /true/ });
export const False: TokenType = createToken({ name: 'False', pattern: /false/ });
export const Null: TokenType = createToken({ name: 'Null', pattern: /null/ });
export const Meta: TokenType = createToken({ name: 'Meta', pattern: /meta/ });
export const Evidence: TokenType = createToken({ name: 'Evidence', pattern: /evidence/ });
// NOTE: token's Chevrotain name is 'Position' to match the BNF keyword, but the
// variable name is PositionKw to avoid colliding with the `Position` TYPE
// exported from src/ast.ts (the parser would need to import both as values and
// types). The value/type namespace is shared, so a single identifier can't
// refer to both.
export const PositionKw: TokenType = createToken({ name: 'Position', pattern: /position/ });
export const Stakeholder: TokenType = createToken({ name: 'Stakeholder', pattern: /stakeholder/ });
export const Domain: TokenType = createToken({ name: 'Domain', pattern: /domain/ });

// ----- Composite literals -----

export const Identifier: TokenType = createToken({
  name: 'Identifier',
  pattern: /[a-zA-Z0-9_-]+/,
});

export const Number: TokenType = createToken({
  name: 'Number',
  pattern: /-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/,
});

export const StringTok: TokenType = createToken({
  name: 'String',
  pattern: /"(?:[^"\\]|\\.)*"/,
});

// ----- Text runs -----

export const TitleText: TokenType = createToken({
  name: 'TitleText',
  // First char: not # [ ] LF CR. Rest: not [ ] LF CR.
  // We accept anything then post-validate in the parser.
  pattern: /[^#[\]\n\r][^[\]\n\r]*/,
  start_chars_hint: Array.from(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"\'`',
  ),
});

export const ClaimText: TokenType = createToken({
  name: 'ClaimText',
  // First char: not space/tab/LF/CR/{/}/[/]/(/)/#/:/"/-/~/?/</,/.
  // Rest: not {/}/LF/CR.
  pattern: /[^\s\n\r{}[\]()#:.~?<,-][^{}\n\r]*/,
  start_chars_hint: Array.from(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_="\'',
  ),
});

export const HeadingText: TokenType = createToken({
  name: 'HeadingText',
  // Excludes chars that delimit BNF tokens so HeadingText doesn't swallow
  // surrounding syntax: newlines, `]` (closing fact refs), `{`/`}` (attribute
  // blocks), `:` (YAML keys), `"`/`'` (strings), `.` (numbers), and the
  // arrow operators (`-`, `~`, `?`, `<`).
  pattern: /[^\s\n\r\][{}:"'.()\-~?<][^\s\n\r\][{}:"',=()\-~?<]*/,
  start_chars_hint: Array.from(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ \'"`',
  ),
});

export const PlainScalar: TokenType = createToken({
  name: 'PlainScalar',
  pattern: /[^\n\r]+/,
  start_chars_hint: Array.from(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"\'`',
  ),
});

export const FlowScalar: TokenType = createToken({
  name: 'FlowScalar',
  pattern: /[^,[\]{}\n\r]+/,
  start_chars_hint: Array.from(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"\'`',
  ),
});

// ----- Single-character punctuation -----

export const LBrack: TokenType = createToken({ name: 'LBrack', pattern: /\[/ });
export const RBrack: TokenType = createToken({ name: 'RBrack', pattern: /\]/ });
export const LBrace: TokenType = createToken({ name: 'LBrace', pattern: /\{/ });
export const RBrace: TokenType = createToken({ name: 'RBrace', pattern: /\}/ });
export const LParen: TokenType = createToken({ name: 'LParen', pattern: /\(/ });
export const RParen: TokenType = createToken({ name: 'RParen', pattern: /\)/ });
export const Colon: TokenType = createToken({ name: 'Colon', pattern: /:/ });
export const Comma: TokenType = createToken({ name: 'Comma', pattern: /,/ });
export const Period: TokenType = createToken({ name: 'Period', pattern: /\./ });
export const Minus: TokenType = createToken({ name: 'Minus', pattern: /-/ });
export const Plus: TokenType = createToken({ name: 'Plus', pattern: /\+/ });

// ----- Whitespace (skipped) -----

export const Whitespace: TokenType = createToken({
  name: 'Whitespace',
  pattern: /[ \t]+/,
  group: Lexer.SKIPPED,
});

export const Newline: TokenType = createToken({
  name: 'Newline',
  pattern: /\r\n|\r|\n/,
  group: Lexer.SKIPPED,
});

// ----- Order matters: longest match first within a start char -----
// Chevrotain uses longest match by default, but explicit ordering is clearer.

export const allTokens: TokenType[] = [
  // Multi-char operators
  RuleOp,
  Support,
  Attack,
  Undercut,
  Undermine,
  Concession,
  Qualification,
  Equivalence,
  FrontmatterDelim,
  BlockMarker,
  LineCommentTok,
  BlockCommentTok,
  HeadingMarker,
  // Keywords (must come before Identifier for these strings)
  True,
  False,
  Null,
  Meta,
  Evidence,
  PositionKw,
  Stakeholder,
  Domain,
  StringTok,
  // Numbers must come before Minus so `-3.14` lexes as Number, not Minus.
  Number,
  // Punctuation that could prefix numbers (only matches when not part of a Number)
  Minus,
  Plus,
  // Single-char punctuation must come before text runs so they aren't shadowed.
  LBrack,
  RBrack,
  LBrace,
  RBrace,
  LParen,
  RParen,
  Colon,
  Comma,
  Period,
  // Identifiers
  Identifier,
  // Text runs (catch-all-ish for long runs) come after single-char punctuation.
  TitleText,
  ClaimText,
  HeadingText,
  PlainScalar,
  FlowScalar,
  // Whitespace (always last, always skipped)
  Whitespace,
  Newline,
];

export const ArgdownLexer: Lexer = new Lexer(allTokens, {
  // Track line/column for source positions
  positionTracking: 'full',
  // With ensureOptimizations: true, Chevrotain uses longest-match semantics,
  // which means the catch-all HeadingText eats surrounding operators like
  // `-->` because it starts earlier in the input. We disable optimizations
  // so the token order in `allTokens` is the disambiguation order.
  ensureOptimizations: false,
});

export function tokenize(source: string): ILexingResult {
  return ArgdownLexer.tokenize(source);
}
