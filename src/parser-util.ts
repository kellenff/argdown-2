// src/parser-util.ts
// Shared infrastructure for the parser: the token-stream wrapper used by all
// recursive-descent rules, plus the small helpers (token wrapping, arrow
// detection, image-non-empty checks, fact-ref lookahead) that the various
// `parseX` rules call.

import type { IToken } from 'chevrotain';

import type { CstChildren, CstNode, ParseError, ParseErrorCode } from './ast.js';

// =========================================================================
// EOF constant (tokens.ts doesn't export it directly; we synthesize one)
// =========================================================================

const EOF_TOKEN: IToken = {
  image: '',
  tokenType: { name: 'EOF' } as IToken['tokenType'],
  tokenTypeIdx: -1,
  startOffset: 0,
  endOffset: 0,
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 1,
};

// =========================================================================
// TokenStream — wraps the flat token list with lookahead/backtracking/error
// =========================================================================

export class TokenStream {
  public tokens: IToken[];
  public pos: number;
  public errors: ParseError[];

  constructor(tokens: IToken[]) {
    this.tokens = tokens;
    this.pos = 0;
    this.errors = [];
  }

  current(): IToken {
    const t = this.tokens[this.pos];
    return t ?? EOF_TOKEN;
  }

  peek(offset = 0): IToken {
    const t = this.tokens[this.pos + offset];
    return t ?? EOF_TOKEN;
  }

  check(...names: string[]): boolean {
    return names.includes(this.current().tokenType.name);
  }

  // Consume the current token if it matches the given name. On mismatch,
  // record an error and return undefined. On success, advance and return.
  consume(name?: string): IToken | undefined {
    const tok = this.current();
    if (tok.tokenType.name === 'EOF') {
      if (name) {
        this.recordError(`expected ${name}`, tok, 'parse.mismatchedToken');
      }
      return undefined;
    }
    if (name && tok.tokenType.name !== name) {
      this.recordError(`expected ${name}`, tok, 'parse.mismatchedToken');
      return undefined;
    }
    this.pos++;
    return tok;
  }

  save(): number {
    return this.pos;
  }

  restore(p: number): void {
    this.pos = p;
  }

  eof(): boolean {
    return this.current().tokenType.name === 'EOF';
  }

  // Skip whitespace-only text tokens (HeadingText/TitleText/etc. that the
  // lexer may emit between other tokens). Doesn't record errors.
  skipEmptyTextTokens(): void {
    while (!this.eof()) {
      const tok = this.current();
      const isTextRun =
        tok.tokenType.name === 'HeadingText' ||
        tok.tokenType.name === 'TitleText' ||
        tok.tokenType.name === 'ClaimText' ||
        tok.tokenType.name === 'PlainScalar' ||
        tok.tokenType.name === 'FlowScalar';
      if (isTextRun && (tok.image ?? '').trim().length === 0) {
        this.pos++;
      } else {
        break;
      }
    }
  }

  recordError(message: string, tok?: IToken, code: ParseErrorCode = 'parse.mismatchedToken'): void {
    const t = tok ?? this.current();
    this.errors.push({
      code,
      message,
      severity: 'error',
      loc: {
        line: t.startLine ?? 1,
        column: t.startColumn ?? 1,
        offset: t.startOffset ?? 0,
      },
      found: t.tokenType.name,
    });
  }
}

// =========================================================================
// Helpers
// =========================================================================

export function tokenNode(tok: IToken): CstNode {
  return {
    image: tok.image,
    tokenType: { name: tok.tokenType.name },
    startLine: tok.startLine,
    startColumn: tok.startColumn,
    startOffset: tok.startOffset,
    endLine: tok.endLine,
    endColumn: tok.endColumn,
    endOffset: tok.endOffset,
  };
}

// Single-token rule: match the named token, wrap it as a CST node.
// Failure is silent — caller's `??` chain absorbs it. Errors are reported
// only by callers using `s.consume()` directly.
export function tokenRule(s: TokenStream, tokenName: string): CstNode | undefined {
  const tok = s.peek();
  if (tok.tokenType.name !== tokenName) return undefined;
  s.pos++;
  return tokenNode(tok);
}

const ARROW_TOKEN_NAMES: ReadonlySet<string> = new Set([
  'Support',
  'Attack',
  'Undercut',
  'Undermine',
  'Concession',
  'Qualification',
  'Equivalence',
]);

export function isArrowToken(name: string): boolean {
  return ARROW_TOKEN_NAMES.has(name);
}

// Reject whitespace-only tokens (the lexer can match a single space).
export function isNonEmptyImage(tok: IToken): boolean {
  return (tok.image ?? '').trim().length > 0;
}

// Scan ahead past the matching `]` of the fact ref to find the next token
// after the bracketed head. The fact head has variable width:
//   IdentifierHead: HeadingMarker + Identifier (2 tokens)
//   TitleHead: TitleText (1 token)
//   Then: `]` (1 token)
// So we step forward until we hit `]` and peek one beyond it.
export function peekPastFactRef(s: TokenStream): string {
  // Start one past the current `[`.
  let i = s.pos + 1;
  // Skip the factHead: HeadingMarker+Identifier, or a single TitleText/
  // Identifier/ClaimText/HeadingText token.
  const headName = s.tokens[i]?.tokenType.name;
  if (headName === 'HeadingMarker') {
    i += 2; // HeadingMarker + Identifier
  } else if (
    headName === 'TitleText' ||
    headName === 'Identifier' ||
    headName === 'ClaimText' ||
    headName === 'HeadingText'
  ) {
    i += 1; // single text token (the lexer may split into multiple, but
    // for the lookahead a single token is enough — we only need
    // to find the position past the closing `]`).
  } else {
    return '';
  }
  // `i` should now point at the closing `]`. Peek one beyond it.
  return s.tokens[i + 1]?.tokenType.name ?? '';
}
